import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppAPI } from '@/lib/whatsapp-api';

// --- CONFIGURAÇÃO DE AMBIENTE ---
const {
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: WHATSAPP_VERIFY_TOKEN,
    WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID,
    GEMINI_API_KEY,
    CUSTOM_SEARCH_API_KEY: GOOGLE_CSE_KEY,
    CUSTOM_SEARCH_CX: GOOGLE_CSE_CX,
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY
} = process.env;

const whatsapp = new WhatsAppAPI({
    access_token: WHATSAPP_ACCESS_TOKEN || '',
    phone_number_id: WHATSAPP_PHONE_NUMBER_ID || '',
    webhook_verify_token: WHATSAPP_VERIFY_TOKEN || '',
    is_active: true,
    webhook_url: '' 
});

const TERMOS_TECNICOS = ['posologia', 'dosagem', 'como tomar', 'interação', 'interacao', 'efeito', 'contraindicação', 'serve para'];
const SAUDACOES = ['olá', 'ola', 'oi', 'bom dia', 'boa tarde', 'boa noite', 'tudo bem', 'menu'];

// --- TELEMETRIA SUPABASE ---
async function logger(phoneId: string, from: string, msg: string, dir: 'IN' | 'OUT') {
    console.log(`[SUPABASE] 💾 Registrando histórico (${dir})...`);
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ whatsapp_phone_id: phoneId, from_number: from, message_body: msg, direction: dir })
        });
        console.log(`[SUPABASE] ✅ Log ${dir} salvo.`);
    } catch (e) { console.error("[SUPABASE ERROR]", e); }
}

// --- LOGICA PRINCIPAL ---
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const val = body.entry?.[0]?.changes?.[0]?.value;
        const msg = val?.messages?.[0];
        const phoneId = val?.metadata?.phone_number_id;

        if (!msg) return NextResponse.json({ status: 'ok' });

        const from = msg.from;
        const textoOriginal = msg.text?.body || msg.interactive?.button_reply?.title || "";
        const buttonId = msg.interactive?.button_reply?.id;
        const msgMin = textoOriginal.toLowerCase();

        console.log(`\n🚀 [NOVA MENSAGEM] De: ${from} | Texto: ${textoOriginal}`);
        await logger(phoneId, from, textoOriginal, 'IN');

        // 1. BUSCA TENANT (SUPABASE)
        const resDB = await fetch(`${SUPABASE_URL}/rest/v1/client_connections?whatsapp_phone_id=eq.${phoneId}&select=*,clients(name)`, {
            headers: { 'apikey': SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
        });
        const conn = (await resDB.json())?.[0];
        if (!conn) {
            console.error("[TENANT] ❌ Farmácia não encontrada.");
            return NextResponse.json({ status: 'not_found' });
        }
        const nomeFarmacia = conn.clients?.name || "Nossa Farmácia";
        console.log(`[TENANT] ✅ Atendendo por: ${nomeFarmacia}`);

        // 2. CAPTURA DE CLIQUE NO CARRINHO
        if (buttonId?.startsWith('buy_')) {
            const cod = buttonId.replace('buy_', '');
            const confirmacao = `🛒 Excelente! O item #${cod} foi adicionado ao seu carrinho na ${nomeFarmacia}. Como deseja finalizar?`;
            await whatsapp.sendTextMessage(from, confirmacao);
            await logger(phoneId, from, confirmacao, 'OUT');
            return NextResponse.json({ status: 'ok' });
        }

        let respostaIA = "";

        // --- 3. PRIORIDADE 1: GEMINI (SEMPRE PRIMEIRO) ---
        console.log(`[GEMINI] 🤖 Consultando IA...`);
        try {
            const resG = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: `Você é o atendente da ${nomeFarmacia}. Responda: ${textoOriginal}` }] }] })
            });
            const dataG = await resG.json();
            respostaIA = dataG.candidates?.[0]?.content?.parts?.[0]?.text || "";
        } catch (e) { console.error("[GEMINI] Falha na IA."); }

        // --- 4. PRIORIDADE 2: GOOGLE (POSOLOGIA / INTERAÇÃO) ---
        if (TERMOS_TECNICOS.some(t => msgMin.includes(t))) {
            console.log(`[GOOGLE] 🔍 Buscando dados técnicos...`);
            try {
                const resS = await fetch(`https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_KEY}&cx=${GOOGLE_CSE_CX}&q=${encodeURIComponent(textoOriginal)}`);
                const dataS = await resS.json();
                if (dataS.items?.[0]) {
                    respostaIA += `\n\n📌 *Bula/Informação Técnica:*\n${dataS.items[0].snippet}`;
                }
            } catch (e) { console.error("[GOOGLE] Erro na busca."); }
        }

        // --- 5. PRIORIDADE 3: FLASK (ESTOQUE E PREÇO + CARRINHO) ---
        const ehSaudacao = SAUDACOES.some(s => msgMin.includes(s));
        // Se a mensagem for curta (1-3 palavras) e não for saudação, busca produto
        if (textoOriginal.split(' ').length <= 3 && !ehSaudacao && !TERMOS_TECNICOS.some(t => msgMin.includes(t))) {
            console.log(`[FLASK] 📡 Consultando estoque...`);
            try {
                const resF = await fetch(`${conn.api_base_url}/api/products/search?q=${encodeURIComponent(textoOriginal)}`);
                const dataF = await resF.json();
                
                if (dataF.data?.[0]) {
                    const p = dataF.data[0];
                    const infoEstoque = `\n\n📦 *Estoque e Preço na ${nomeFarmacia}:*\nProduto: ${p.nome_produto}\nValor: R$ ${p.preco_final_venda}\nStatus: ${p.qtd_estoque} em estoque.`;
                    
                    const msgFinalComBotao = (respostaIA || "Encontrei o produto que você procurava:") + infoEstoque;
                    
                    await whatsapp.sendInteractiveButtons(from, msgFinalComBotao, [
                        { id: `buy_${p.cod_reduzido}`, title: "🛒 Adicionar ao Carrinho" },
                        { id: `menu`, title: "🏠 Menu Principal" }
                    ]);
                    await logger(phoneId, from, `Oferta: ${p.nome_produto}`, 'OUT');
                    return NextResponse.json({ status: 'ok' });
                }
            } catch (e) { console.warn("[FLASK] Offline ou erro na API."); }
        }

        // ENVIO FINAL (Caso não tenha disparado botões de estoque)
        const msgFinal = respostaIA || "Olá! Como posso ajudar você hoje?";
        await whatsapp.sendTextMessage(from, msgFinal);
        await logger(phoneId, from, msgFinal, 'OUT');

        return NextResponse.json({ status: 'ok' });

    } catch (e) {
        console.error("[CRITICAL]", e);
        return NextResponse.json({ status: 'error' }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    if (searchParams.get('hub.verify_token') === WHATSAPP_VERIFY_TOKEN) {
        return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
    }
    return new NextResponse('Erro de Token', { status: 403 });
}
