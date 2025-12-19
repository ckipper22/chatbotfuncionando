import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppAPI } from '@/lib/whatsapp-api';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

// =========================================================================
// 1. TELEMETRIA E LOGS (DEBUG TOTAL)
// =========================================================================

async function salvarHistorico(phoneId: string, from: string, msg: string, dir: 'IN' | 'OUT') {
    console.log(`[SUPABASE] 💾 Tentando registrar histórico (${dir})...`);
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ whatsapp_phone_id: phoneId, from_number: from, message_body: msg, direction: dir })
        });
        if (res.ok) console.log(`[SUPABASE] ✅ Histórico ${dir} salvo com sucesso.`);
        else console.error(`[SUPABASE] ❌ Erro ao salvar histórico: ${res.statusText}`);
    } catch (e) { console.error("[SUPABASE] ❌ Falha crítica no log:", e); }
}

async function buscarComGoogle(query: string): Promise<string | null> {
    console.log(`[GOOGLE SEARCH] 🔍 Buscando na web: ${query}`);
    try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_KEY}&cx=${GOOGLE_CSE_CX}&q=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.items?.[0]) {
            console.log(`[GOOGLE SEARCH] ✅ Resultado encontrado.`);
            return `*Info Adicional:* ${data.items[0].snippet}`;
        }
        return null;
    } catch (e) {
        console.error("[GOOGLE SEARCH] ❌ Erro na busca:", e);
        return null;
    }
}

// =========================================================================
// 2. DETECTORES INTELIGENTES (A SUA LÓGICA)
// =========================================================================

const SAUDACOES = ['olá', 'ola', 'oi', 'hey', 'menu', 'início', 'inicio'];
const TERMOS_MEDICOS = ['posologia', 'dosagem', 'como tomar', 'efeito', 'indicação', 'para que serve'];

function extrairTermoBusca(msg: string) {
    let t = msg.toLowerCase().trim().replace(/[?!.,]/g, '');
    const stopWords = ['tem', 'quero', 'preço', 'estoque', 'valor', 'buscar'];
    for (const w of stopWords) { if (t.startsWith(w + ' ')) t = t.substring(w.length).trim(); }
    return t;
}

// =========================================================================
// 3. FLUXO PRINCIPAL
// =========================================================================

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const value = body.entry?.[0]?.changes?.[0]?.value;
        const msg = value?.messages?.[0];
        const phoneId = value?.metadata?.phone_number_id;

        if (!msg) return NextResponse.json({ status: 'ok' });

        const from = msg.from;
        const textoOriginal = msg.text?.body || msg.interactive?.button_reply?.title || "";
        const buttonId = msg.interactive?.button_reply?.id;

        console.log(`\n🚀 [NOVA MENSAGEM] De: ${from} | Texto: ${textoOriginal}`);
        await salvarHistorico(phoneId, from, textoOriginal, 'IN');

        // BUSCA FARMÁCIA
        console.log(`[SUPABASE] 🔍 Consultando client_connections para ID: ${phoneId}`);
        const resDB = await fetch(`${SUPABASE_URL}/rest/v1/client_connections?whatsapp_phone_id=eq.${phoneId}&select=*`, {
            headers: { 'apikey': SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
        });
        const farmacia = (await resDB.json())?.[0];

        if (!farmacia) {
            console.error("[SUPABASE] ❌ Farmácia não configurada.");
            return NextResponse.json({ status: 'not_found' });
        }
        console.log(`[TENANT] ✅ Farmácia: ${farmacia.name}`);

        // LOGICA DE DECISÃO
        const msgMin = textoOriginal.toLowerCase();
        
        // A) Botão "Comprar"
        if (buttonId?.startsWith('buy_')) {
            const resp = `🛒 Perfeito! Produto #${buttonId.replace('buy_', '')} reservado na ${farmacia.name}. Como deseja receber?`;
            await whatsapp.sendTextMessage(from, resp);
            await salvarHistorico(phoneId, from, resp, 'OUT');
            return NextResponse.json({ status: 'ok' });
        }

        // B) Saudação
        if (SAUDACOES.some(s => msgMin.includes(s))) {
            const resp = `Olá! Sou o assistente da ${farmacia.name}. Posso buscar um produto ou tirar dúvidas de saúde (Rosácea/Ácido Úrico).`;
            await whatsapp.sendTextMessage(from, resp);
            await salvarHistorico(phoneId, from, resp, 'OUT');
            return NextResponse.json({ status: 'ok' });
        }

        // C) Consulta Flask (Estoque/Preço)
        const termo = extrairTermoBusca(textoOriginal);
        if (termo.length > 2 && termo.split(' ').length <= 2 && !TERMOS_MEDICOS.some(tm => msgMin.includes(tm))) {
            console.log(`[FLASK] 📡 Consultando estoque em: ${farmacia.api_base_url}`);
            try {
                const resEst = await fetch(`${farmacia.api_base_url}/api/products/search?q=${encodeURIComponent(termo)}`, { signal: AbortSignal.timeout(5000) });
                const estData = await resEst.json();

                if (estData?.data?.length > 0) {
                    const p = estData.data[0];
                    const info = `📦 *${p.nome_produto}*\n💰 R$ ${p.preco_final_venda}\n✅ Estoque: ${p.qtd_estoque}`;
                    await whatsapp.sendInteractiveButtons(from, info, [
                        { id: `buy_${p.cod_reduzido}`, title: "🛒 Comprar" },
                        { id: `menu`, title: "🏠 Menu" }
                    ]);
                    await salvarHistorico(phoneId, from, `Oferta: ${p.nome_produto}`, 'OUT');
                    return NextResponse.json({ status: 'ok' });
                }
            } catch (e) { console.error("[FLASK] ❌ Offline ou IP Privado."); }
        }

        // D) Gemini + Google Fallback (Saúde/Rosácea)
        console.log(`[GEMINI] 🤖 Processando consulta de saúde...`);
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const prompt = `Você é o assistente da farmácia ${farmacia.name}.
        REGRAS ANCESTRAIS (Rosácea): Sim: carne gorda, fígado, arroz branco, abacate, limão. Não: grãos, leite, café.
        Ácido Úrico: Evite frutose.
        Pergunta: ${textoOriginal}`;

        let respostaIA = "";
        try {
            const result = await model.generateContent(prompt);
            respostaIA = result.response.text();
        } catch (e) {
            console.warn("[GEMINI] ⚠️ Falha/Restrição. Usando Google Fallback...");
            const googleInfo = await buscarComGoogle(textoOriginal);
            respostaIA = googleInfo || "Desculpe, não consegui processar sua dúvida agora.";
        }

        await whatsapp.sendTextMessage(from, respostaIA);
        await salvarHistorico(phoneId, from, respostaIA, 'OUT');

        return NextResponse.json({ status: 'ok' });

    } catch (e) {
        console.error("[CRITICAL]", e);
        return NextResponse.json({ status: 'error' }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    if (searchParams.get('hub.verify_token') === WHATSAPP_VERIFY_TOKEN) return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
    return new NextResponse('Erro', { status: 403 });
}
