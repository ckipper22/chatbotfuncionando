import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppAPI } from '@/lib/whatsapp-api';

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
// 1. DETECTORES INTELIGENTES (RESTAURADOS)
// =========================================================================
const SAUDACOES = ['olá', 'ola', 'oi', 'hey', 'bom dia', 'boa tarde', 'boa noite', 'menu', 'inicio'];
const TERMOS_MEDICOS = ['posologia', 'dosagem', 'como tomar', 'efeito', 'indicação', 'para que serve', 'bula'];

function extrairTermoBusca(msg: string) {
    let t = msg.toLowerCase().trim().replace(/[?!.,]/g, '');
    const stopWords = ['tem', 'vcs tem', 'vcs têm', 'vocês tem', 'quero', 'preço', 'estoque', 'valor', 'buscar'];
    for (const w of stopWords) { if (t.startsWith(w + ' ')) t = t.substring(w.length).trim(); }
    return t;
}

// =========================================================================
// 2. TELEMETRIA E HISTÓRICO SUPABASE
// =========================================================================
async function salvarHistorico(phoneId: string, from: string, msg: string, dir: 'IN' | 'OUT') {
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ whatsapp_phone_id: phoneId, from_number: from, message_body: msg, direction: dir })
        });
        console.log(`[DB LOG] ✅ ${dir} salvo.`);
    } catch (e) { console.error("[DB ERROR]", e); }
}

// =========================================================================
// 3. FLUXO PRINCIPAL (HÍBRIDO)
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
        const msgMin = textoOriginal.toLowerCase();

        console.log(`\n🚀 [RECEBIDO] De: ${from} | Msg: ${textoOriginal}`);
        await salvarHistorico(phoneId, from, textoOriginal, 'IN');

        // BUSCA FARMÁCIA (MULTITENANT)
        const resDB = await fetch(`${SUPABASE_URL}/rest/v1/client_connections?whatsapp_phone_id=eq.${phoneId}&select=*,clients(name)`, {
            headers: { 'apikey': SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
        });
        const conn = (await resDB.json())?.[0];
        if (!conn) return NextResponse.json({ status: 'not_found' });
        const nomeFarmacia = conn.clients?.name || "Nossa Farmácia";

        // A) TRATAMENTO DE BOTÃO COMPRAR
        if (buttonId?.startsWith('buy_')) {
            const resp = `🛒 Ótima escolha! O produto #${buttonId.replace('buy_', '')} foi reservado na ${nomeFarmacia}. Como prefere receber?`;
            await whatsapp.sendTextMessage(from, resp);
            await salvarHistorico(phoneId, from, resp, 'OUT');
            return NextResponse.json({ status: 'ok' });
        }

        // B) CONSULTA FLASK (PREÇO/ESTOQUE)
        const termo = extrairTermoBusca(textoOriginal);
        const ehPergunta = textoOriginal.includes('?');
        const ehMedica = TERMOS_MEDICOS.some(tm => msgMin.includes(tm));

        if (termo.length > 2 && !ehMedica && termo.split(' ').length <= 3) {
            console.log(`[FLASK] 📡 Buscando: ${termo}`);
            try {
                const resEst = await fetch(`${conn.api_base_url}/api/products/search?q=${encodeURIComponent(termo)}`);
                const estData = await resEst.json();
                if (estData?.data?.length > 0) {
                    const p = estData.data[0];
                    const info = `📦 *${p.nome_produto}*\n💰 R$ ${p.preco_final_venda}\n✅ Estoque: ${p.qtd_estoque}`;
                    await whatsapp.sendInteractiveButtons(from, info, [{ id: `buy_${p.cod_reduzido}`, title: "🛒 Comprar" }, { id: `menu`, title: "🏠 Menu" }]);
                    await salvarHistorico(phoneId, from, `Oferta: ${p.nome_produto}`, 'OUT');
                    return NextResponse.json({ status: 'ok' });
                }
            } catch (e) { console.warn("API Flask offline"); }
        }

        // C) GEMINI + REGRAS ANCESTRAIS + FALLBACK GOOGLE
        console.log(`[IA] 🤖 Processando...`);
        let respostaFinal = "";
        try {
            const prompt = `Atue como assistente da ${nomeFarmacia}. 
            REGRAS ANCESTRAIS: Rosácea (Sim: carne gorda, fígado, arroz branco, abacate. Não: grãos, leite, café). Ácido Úrico: Sem frutose.
            Pergunta: ${textoOriginal}`;

            const resG = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const dataG = await resG.json();
            respostaFinal = dataG.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!respostaFinal) throw new Error("IA vazia");

        } catch (e) {
            console.warn("[FALLBACK] 🔍 Google CSE ativado.");
            const resS = await fetch(`https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_KEY}&cx=${GOOGLE_CSE_CX}&q=${encodeURIComponent(textoOriginal)}`);
            const dataS = await resS.json();
            respostaFinal = dataS.items?.[0] ? `🔍 Encontrei isso: ${dataS.items[0].snippet}` : "Como posso ajudar?";
        }

        await whatsapp.sendTextMessage(from, respostaFinal);
        await salvarHistorico(phoneId, from, respostaFinal, 'OUT');

        return NextResponse.json({ status: 'ok' });

    } catch (e) {
        return NextResponse.json({ status: 'error' }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    if (searchParams.get('hub.verify_token') === WHATSAPP_VERIFY_TOKEN) return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
    return new NextResponse('Erro', { status: 403 });
}
