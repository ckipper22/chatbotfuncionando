import { NextRequest, NextResponse } from 'next/server';

// =========================================================================
// CONFIGURAÇÃO DAS VARIÁVEIS (Lendo do Vercel)
// =========================================================================
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GOOGLE_CSE_KEY = process.env.CUSTOM_SEARCH_API_KEY;
const GOOGLE_CSE_CX = process.env.CUSTOM_SEARCH_CX;

// =========================================================================
// DETECTORES INTELIGENTES (SUA LÓGICA MASTER)
// =========================================================================
const SAUDACOES = ['olá', 'ola', 'oi', 'hey', 'hello', 'hi', 'menu', 'inicio', 'início'];

function ehSaudacao(mensagem: string): boolean {
    const msgLimpa = mensagem.toLowerCase().replace(/[?!.,]/g, '').trim();
    return SAUDACOES.includes(msgLimpa);
}

function ehPerguntaMedica(mensagem: string): boolean {
    const msgMin = mensagem.toLowerCase();
    const termos = ['posologia', 'dose', 'para que serve', 'efeito', 'como tomar', 'contraindicação'];
    return termos.some(p => msgMin.includes(p));
}

function extrairTermoBusca(mensagem: string): { buscar: boolean, termo: string } {
    const msgMin = mensagem.toLowerCase().trim();
    if (ehSaudacao(msgMin) || ehPerguntaMedica(msgMin) || msgMin.includes(' ')) return { buscar: false, termo: '' };
    if (msgMin.length > 2 && msgMin.length < 30) return { buscar: true, termo: msgMin };
    return { buscar: false, termo: '' };
}

// =========================================================================
// FUNÇÕES DE COMUNICAÇÃO EXTERNA
// =========================================================================

async function enviarWhatsApp(to: string, payload: any, phoneId: string) {
    console.log(`[WHATSAPP] 📤 Enviando para ${to}...`);
    await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: "whatsapp", to, ...payload })
    });
}

async function chamarGemini(mensagem: string): Promise<string> {
    console.log(`[GEMINI] 🤖 Processando...`);
    try {
        const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `Você é um assistente de farmácia amigável. Responda: ${mensagem}` }] }]
            })
        });
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "Como posso ajudar?";
    } catch (e) { return "Estou processando sua solicitação, um momento."; }
}

async function buscarNoEstoque(termo: string, urlBase: string): Promise<any> {
    console.log(`[FLASK] 📦 Buscando "${termo}" em ${urlBase}`);
    try {
        const res = await fetch(`${urlBase}/api/products/search?q=${encodeURIComponent(termo)}`, {
            signal: AbortSignal.timeout(5000)
        });
        return await res.json();
    } catch (e) {
        console.error("[FLASK] ❌ Erro de conexão com servidor da farmácia.");
        return null;
    }
}

// =========================================================================
// NÚCLEO PROCESSADOR (A ROTA)
// =========================================================================

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const value = body.entry?.[0]?.changes?.[0]?.value;
        const message = value?.messages?.[0];
        const phoneId = value?.metadata?.phone_number_id;

        if (!message || !phoneId) return NextResponse.json({ status: 'ok' });

        const from = message.from;
        const text = message.text?.body || "";
        console.log(`[LOG] 📥 Mensagem de ${from}: "${text}" (ID: ${phoneId})`);

        // 1. BUSCA FARMÁCIA NO SUPABASE
        const resSupabase = await fetch(`${SUPABASE_URL}/rest/v1/client_connections?whatsapp_phone_id=eq.${phoneId}&select=*`, {
            headers: { 'apikey': SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
        });
        const farmacias = await resSupabase.json();
        const farmacia = farmacias?.[0];

        if (!farmacia) {
            console.error(`[LOG] ❌ Farmácia não cadastrada para o ID: ${phoneId}`);
            return NextResponse.json({ status: 'error' });
        }

        // 2. LÓGICA DE RESPOSTA
        if (ehSaudacao(text)) {
            await enviarWhatsApp(from, { type: "text", text: { body: `Olá! Bem-vindo à ${farmacia.name}. Como posso ajudar?` } }, phoneId);
        } 
        else {
            const { buscar, termo } = extrairTermoBusca(text);
            
            if (buscar) {
                const estoque = await buscarNoEstoque(termo, farmacia.api_base_url);
                if (estoque?.data?.length > 0) {
                    const p = estoque.data[0];
                    const msgEstoque = {
                        type: "text",
                        text: { body: `✅ Encontrei: *${p.nome_produto}*\n💰 Valor: R$ ${p.preco_final_venda}\n📦 Estoque: ${p.qtd_estoque}\n\nPara comprar, digite o código: *COMPRAR ${p.cod_reduzido}*` }
                    };
                    await enviarWhatsApp(from, msgEstoque, phoneId);
                } else {
                    await enviarWhatsApp(from, { type: "text", text: { body: `Não encontrei "${termo}" no estoque agora.` } }, phoneId);
                }
            } else {
                // Gemini ou Outros
                const respostaIA = await chamarGemini(text);
                await enviarWhatsApp(from, { type: "text", text: { body: respostaIA } }, phoneId);
            }
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
