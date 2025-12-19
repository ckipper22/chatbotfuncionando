import { NextRequest, NextResponse } from 'next/server';

// =========================================================================
// VARIÁVEIS DE AMBIENTE
// =========================================================================
const {
    WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    GEMINI_API_KEY,
    CUSTOM_SEARCH_API_KEY,
    CUSTOM_SEARCH_CX
} = process.env;

// =========================================================================
// TRATAMENTO DE TELEFONE E MENSAGEM (SUA LÓGICA MASTER)
// =========================================================================
const SAUDACOES = ['olá', 'ola', 'oi', 'hey', 'hello', 'hi', 'menu', 'inicio', 'início'];

function ehSaudacao(mensagem: string): boolean {
    const msgLimpa = mensagem.toLowerCase().replace(/[?!.,]/g, '').trim();
    return SAUDACOES.includes(msgLimpa);
}

function ehPerguntaTecnica(mensagem: string): boolean {
    const msgMin = mensagem.toLowerCase();
    const termos = ['posologia', 'dose', 'para que serve', 'como tomar', 'efeito', 'contraindicação'];
    return termos.some(t => msgMin.includes(t));
}

// =========================================================================
// FUNÇÃO DE ENVIO (COM LOG DE PAYLOAD PARA DEBUG)
// =========================================================================
async function enviarWhatsApp(to: string, texto: string, phoneId: string) {
    console.log(`[WHATSAPP] 📤 Preparando envio para: ${to}`);
    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to, // O número já vem com o 55 no "msg.from"
        type: "text",
        text: { body: texto }
    };

    try {
        const res = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
            console.error(`[WHATSAPP ERROR] Detalhes:`, JSON.stringify(data.error));
        } else {
            console.log(`[WHATSAPP] ✅ Mensagem enviada com sucesso!`);
        }
    } catch (e) { console.error("[WHATSAPP FATAL]", e); }
}

// =========================================================================
// GEMINI REST (SUA VERSÃO FUNCIONAL)
// =========================================================================
async function chamarGemini(mensagem: string): Promise<string> {
    console.log(`[GEMINI] 🤖 Processando...`);
    try {
        const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `Você é um assistente de farmácia útil. Responda brevemente: ${mensagem}` }] }]
            })
        });
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "Como posso ajudar?";
    } catch (e) { return "Estou processando sua dúvida..."; }
}

// =========================================================================
// ROUTE HANDLER (POST)
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
        
        console.log(`\n--- INÍCIO PROCESSAMENTO ---`);
        console.log(`[LOG] 📥 Mensagem de ${from}: "${textoOriginal}"`);

        // 1. BUSCA FARMÁCIA (MULTITENANT)
        const resDB = await fetch(`${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/client_connections?whatsapp_phone_id=eq.${phoneId}&select=*`, {
            headers: { 'apikey': NEXT_PUBLIC_SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${NEXT_PUBLIC_SUPABASE_ANON_KEY}` }
        });
        const farmacias = await resDB.json();
        const farmacia = farmacias?.[0];

        // LOG DE SEGURANÇA PARA O NOME
        const nomeFarmacia = farmacia?.name || "Nossa Farmácia";
        console.log(`[DB] ✅ Farmácia Localizada: ${nomeFarmacia}`);

        // 2. FLUXO DE DECISÃO (SUA MASTER)
        
        // A. SAUDAÇÃO
        if (ehSaudacao(textoOriginal)) {
            await enviarWhatsApp(from, `Olá! Bem-vindo à ${nomeFarmacia}. Como posso ajudar hoje?`, phoneId);
            return NextResponse.json({ status: 'ok' });
        }

        // B. PERGUNTA TÉCNICA (GOOGLE CSE - Se quiser ativar)
        if (ehPerguntaTecnica(textoOriginal)) {
            // Aqui você pode inserir a busca do Google que fizemos antes
            console.log(`[FLUXO] 🔍 Pergunta técnica detectada.`);
        }

        // C. BUSCA DE PRODUTO (Se for 1 palavra)
        if (textoOriginal.trim().split(' ').length === 1 && textoOriginal.length > 2) {
            console.log(`[FLUXO] 📦 Busca de estoque para: ${textoOriginal}`);
            // Chamada Flask aqui...
        }

        // D. FALLBACK GEMINI (O que aconteceu no seu log)
        const respostaIA = await chamarGemini(textoOriginal);
        await enviarWhatsApp(from, respostaIA, phoneId);

        return NextResponse.json({ status: 'ok' });

    } catch (e) {
        console.error("[CRITICAL]", e);
        return NextResponse.json({ status: 'error' }, { status: 500 });
    }
}

// WEBHOOK GET IGUAL
export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    if (searchParams.get('hub.verify_token') === WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
        return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
    }
    return new NextResponse('Erro', { status: 403 });
}
