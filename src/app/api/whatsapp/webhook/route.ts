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
// 1. AUXILIARES E DETECTORES (LÓGICA RESTAURADA E AMPLIADA)
// =========================================================================

const SAUDACOES = ['olá', 'ola', 'oi', 'hey', 'bom dia', 'boa tarde', 'boa noite', 'tudo bem', 'tudobem', 'como vai', 'menu', 'inicio'];
const TERMOS_MEDICOS = ['posologia', 'dosagem', 'como tomar', 'efeito', 'indicação', 'para que serve', 'bula'];

async function salvarHistorico(phoneId: string, from: string, msg: string, dir: 'IN' | 'OUT') {
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ whatsapp_phone_id: phoneId, from_number: from, message_body: msg, direction: dir })
        });
        console.log(`[DB LOG] ✅ Mensagem ${dir} registrada.`);
    } catch (e) { console.error("[DB ERROR] Falha no log:", e); }
}

function extrairTermoBusca(msg: string) {
    let t = msg.toLowerCase().trim().replace(/[?!.,]/g, '');
    const stopWords = ['tem', 'quero', 'preço', 'estoque', 'valor', 'buscar', 'comprar'];
    for (const w of stopWords) { if (t.startsWith(w + ' ')) t = t.substring(w.length).trim(); }
    return t;
}

// =========================================================================
// 2. HANDLER PRINCIPAL
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
        const msgMin = textoOriginal.toLowerCase().trim();

        console.log(`\n🚀 [RECEBIDO] De: ${from} | Texto: "${textoOriginal}"`);
        await salvarHistorico(phoneId, from, textoOriginal, 'IN');

        // BUSCA FARMÁCIA COM JOIN (Conforme seu SQL: client_connections -> clients)
        const resDB = await fetch(`${SUPABASE_URL}/rest/v1/client_connections?whatsapp_phone_id=eq.${phoneId}&select=*,clients(name)`, {
            headers: { 'apikey': SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
        });
        const connData = (await resDB.json())?.[0];

        if (!connData) {
            console.error(`[TENANT ERROR] Sem conexão para o PhoneID: ${phoneId}`);
            return NextResponse.json({ status: 'not_found' });
        }

        const nomeFarmacia = connData.clients?.name || "Nossa Farmácia";
        console.log(`[TENANT] ✅ Atendendo por: ${nomeFarmacia}`);

        // A) TRATAMENTO DE BOTÕES
        if (buttonId?.startsWith('buy_')) {
            const resp = `🛒 Perfeito! O item #${buttonId.replace('buy_', '')} foi selecionado. Como você prefere finalizar seu pedido na ${nomeFarmacia}?`;
            await whatsapp.sendTextMessage(from, resp);
            await salvarHistorico(phoneId, from, resp, 'OUT');
            return NextResponse.json({ status: 'ok' });
        }

        // B) VERIFICAÇÃO DE SAUDAÇÃO (Evita busca inútil no estoque)
        const ehSaudacao = SAUDACOES.some(s => msgMin.includes(s));
        if (ehSaudacao && !TERMOS_MEDICOS.some(tm => msgMin.includes(tm))) {
            const boasVindas = `Olá! Bem-vindo à ${nomeFarmacia}. Como posso te ajudar hoje? Você pode perguntar sobre um medicamento ou tirar dúvidas de saúde.`;
            await whatsapp.sendTextMessage(from, boasVindas);
            await salvarHistorico(phoneId, from, boasVindas, 'OUT');
            return NextResponse.json({ status: 'ok' });
        }

        // C) CONSULTA API FLASK (ESTOQUE)
        const termo = extrairTermoBusca(textoOriginal);
        // Só busca no estoque se: não for pergunta(?), for curto, e não for termo médico puro
        if (termo.length > 2 && !msgMin.includes('?') && termo.split(' ').length <= 3) {
            console.log(`[FLASK] 📡 Consultando estoque para: "${termo}"`);
            try {
                const resEst = await fetch(`${connData.api_base_url}/api/products/search?q=${encodeURIComponent(termo)}`, { signal: AbortSignal.timeout(5000) });
                const estData = await resEst.json();

                if (estData?.data?.length > 0) {
                    const p = estData.data[0];
                    const infoEstoque = `📦 *${p.nome_produto}*\n💰 R$ ${p.preco_final_venda}\n✅ Disponível: ${p.qtd_estoque}`;
                    await whatsapp.sendInteractiveButtons(from, infoEstoque, [
                        { id: `buy_${p.cod_reduzido}`, title: "🛒 Comprar" },
                        { id: `menu`, title: "🏠 Menu Principal" }
                    ]);
                    await salvarHistorico(phoneId, from, `Oferta: ${p.nome_produto}`, 'OUT');
                    return NextResponse.json({ status: 'ok' });
                }
            } catch (e) { console.error("[FLASK] ❌ API Local indisponível."); }
        }

        // D) IA GEMINI + REGRAS ANCESTRAIS (Rosácea e Ácido Úrico)
        console.log(`[GEMINI] 🤖 Processando inteligência de saúde...`);
        try {
            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            
            const prompt = `Você é o assistente virtual da ${nomeFarmacia}. 
            REGRAS DE SAÚDE (Baseadas na Dieta de Foco Ancestral):
            - Para Rosácea: Recomende carne vermelha gordurosa, fígado, caldo de osso, arroz branco, tapioca, abacate e limão. Diga para EVITAR grãos, feijão, vegetais/saladas, castanhas, leite e café.
            - Para Ácido Úrico: Cuidado com alta carga de frutose.
            Pergunta do cliente: "${textoOriginal}"`;

            const result = await model.generateContent(prompt);
            const respostaIA = result.response.text();
            
            await whatsapp.sendTextMessage(from, respostaIA);
            await salvarHistorico(phoneId, from, respostaIA, 'OUT');
        } catch (e) {
            console.warn("[GEMINI ERROR] Indo para busca Google...");
            // Fallback para Google Search se Gemini falhar
            const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_KEY}&cx=${GOOGLE_CSE_CX}&q=${encodeURIComponent(textoOriginal)}`;
            const resG = await fetch(searchUrl);
            const dataG = await resG.json();
            const fallbackMsg = dataG.items?.[0] 
                ? `Encontrei essa informação que pode ajudar: ${dataG.items[0].snippet}`
                : "Desculpe, não consegui processar sua dúvida agora. Gostaria de falar com um atendente humano?";
            
            await whatsapp.sendTextMessage(from, fallbackMsg);
            await salvarHistorico(phoneId, from, fallbackMsg, 'OUT');
        }

        return NextResponse.json({ status: 'ok' });

    } catch (error) {
        console.error("[CRITICAL ERROR]", error);
        return NextResponse.json({ status: 'error' }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    if (searchParams.get('hub.verify_token') === WHATSAPP_VERIFY_TOKEN) {
        return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
    }
    return new NextResponse('Erro', { status: 403 });
}
