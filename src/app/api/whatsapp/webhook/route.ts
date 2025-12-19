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
// AUXILIARES
// =========================================================================
const SAUDACOES = ['olá', 'ola', 'oi', 'hey', 'bom dia', 'boa tarde', 'boa noite', 'tudo bem', 'como vai', 'menu'];
const TERMOS_TECNICOS = ['posologia', 'dosagem', 'como tomar', 'interação', 'interacao', 'efeito', 'contraindicação', 'serve para'];

async function salvarHistorico(phoneId: string, from: string, msg: string, dir: 'IN' | 'OUT') {
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ whatsapp_phone_id: phoneId, from_number: from, message_body: msg, direction: dir })
        });
    } catch (e) { console.error("[DB ERROR]", e); }
}

function extrairTermoBusca(msg: string) {
    let t = msg.toLowerCase().trim().replace(/[?!.,]/g, '');
    const stopWords = ['tem', 'quero', 'preço', 'estoque', 'valor', 'buscar', 'vocês têm'];
    for (const w of stopWords) { if (t.startsWith(w + ' ')) t = t.substring(w.length).trim(); }
    return t;
}

// =========================================================================
// FLUXO DE RESPOSTA (ORDEM DE PRECEDÊNCIA: 1. GEMINI | 2. GOOGLE | 3. FLASK)
// =========================================================================
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const value = body.entry?.[0]?.changes?.[0]?.value;
        const msg = value?.messages?.[0];
        const phoneId = value?.metadata?.phone_number_id;

        if (!msg) return NextResponse.json({ status: 'ok' });

        const from = msg.from;
        const textoOriginal = msg.text?.body || "";
        const msgMin = textoOriginal.toLowerCase();

        console.log(`\n🚀 [RECEBIDO] De: ${from} | Texto: ${textoOriginal}`);
        await salvarHistorico(phoneId, from, textoOriginal, 'IN');

        // BUSCA DADOS DA FARMÁCIA (MULTITENANT)
        const resDB = await fetch(`${SUPABASE_URL}/rest/v1/client_connections?whatsapp_phone_id=eq.${phoneId}&select=*,clients(name)`, {
            headers: { 'apikey': SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
        });
        const conn = (await resDB.json())?.[0];
        if (!conn) return NextResponse.json({ status: 'not_found' });
        const nomeFarmacia = conn.clients?.name || "Nossa Farmácia";

        let respostaAcumulada = "";

        // 1. SEMPRE O PRIMEIRO A RESPONDER: GEMINI
        console.log(`[IA] 🤖 Gemini processando...`);
        try {
            const prompt = `Você é o assistente virtual amigável da ${nomeFarmacia}. 
            Responda de forma prestativa ao cliente: "${textoOriginal}". 
            Não dê diagnósticos médicos, apenas orientações gerais de farmácia.`;

            const resG = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const dataG = await resG.json();
            respostaAcumulada = dataG.candidates?.[0]?.content?.parts?.[0]?.text || "";
        } catch (e) { console.error("Falha Gemini"); }

        // 2. SE PEDIREM POSOLOGIA OU INTERAÇÃO: GOOGLE SEARCH
        if (TERMOS_TECNICOS.some(t => msgMin.includes(t))) {
            console.log(`[GOOGLE] 🔍 Buscando dados técnicos de bula...`);
            try {
                const resS = await fetch(`https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_KEY}&cx=${GOOGLE_CSE_CX}&q=${encodeURIComponent(textoOriginal)}`);
                const dataS = await resS.json();
                if (dataS.items?.[0]) {
                    respostaAcumulada += `\n\n📖 *Informação Técnica (Bula):*\n${dataS.items[0].snippet}`;
                }
            } catch (e) { console.error("Falha Google"); }
        }

        // 3. ESTOQUE E PREÇO: API FLASK
        const termo = extrairTermoBusca(textoOriginal);
        const ehSaudacao = SAUDACOES.some(s => msgMin.includes(s));
        
        if (termo.length > 2 && !ehSaudacao && !TERMOS_TECNICOS.some(t => msgMin.includes(t))) {
            console.log(`[FLASK] 📡 Consultando estoque para: ${termo}`);
            try {
                const resEst = await fetch(`${conn.api_base_url}/api/products/search?q=${encodeURIComponent(termo)}`);
                const estData = await resEst.json();
                if (estData?.data?.length > 0) {
                    const p = estData.data[0];
                    const infoEstoque = `\n\n📦 *Consulta de Estoque na ${nomeFarmacia}:*\nProduto: ${p.nome_produto}\nPreço: R$ ${p.preco_final_venda}\nDisponibilidade: ${p.qtd_estoque} unidades.`;
                    respostaAcumulada += infoEstoque;
                }
            } catch (e) { console.warn("Flask Offline"); }
        }

        // ENVIO FINAL
        const msgFinal = respostaAcumulada || "Como posso ajudar você hoje?";
        await whatsapp.sendTextMessage(from, msgFinal);
        await salvarHistorico(phoneId, from, msgFinal, 'OUT');

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
