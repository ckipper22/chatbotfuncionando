import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// =========================================================================
// CONFIGURAÇÃO
// =========================================================================
const {
    WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: WHATSAPP_VERIFY_TOKEN,
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
    GEMINI_API_KEY,
    GOOGLE_SEARCH_API_KEY,
    GOOGLE_SEARCH_CX
} = process.env;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!);

// =========================================================================
// 1. UTILITÁRIOS: SUPABASE & MULTITENANT
// =========================================================================

async function findFarmacyAPI(whatsappPhoneId: string) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/client_connections?whatsapp_phone_id=eq.${whatsappPhoneId}&select=*`, {
        headers: { 'apikey': SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    const data = await res.json();
    return data?.[0] || null;
}

async function salvarHistorico(phoneId: string, from: string, body: string, direction: 'IN' | 'OUT') {
    await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsapp_phone_id: phoneId, from_number: from, message_body: body, direction: direction })
    }).catch(e => console.error("Erro histórico:", e));
}

// =========================================================================
// 2. BUSCA E IA (GOOGLE & GEMINI)
// =========================================================================

async function buscarBulaGoogle(texto: string): Promise<string> {
    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_API_KEY}&cx=${GOOGLE_SEARCH_CX}&q=${encodeURIComponent(texto)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.items?.[0]) {
        return `💊 *Informação técnica:* \n\n${data.items[0].snippet}\n\n🔗 *Fonte:* ${data.items[0].link}`;
    }
    return "Não encontrei bulas específicas para este termo.";
}

async function chamarGemini(texto: string): Promise<string> {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(`Você é um assistente de farmácia. Responda brevemente: ${texto}`);
    return result.response.text();
}

// =========================================================================
// 3. ENVIO DE MENSAGENS (TEXTO E BOTÕES)
// =========================================================================

async function enviarWhatsApp(to: string, payload: any, phoneId: string) {
    await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: "whatsapp", to, ...payload })
    });
}

// Envia mensagem com botão de compra
async function enviarBotaoCompra(to: string, produtoNome: string, produtoId: string, phoneId: string) {
    const payload = {
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: `Encontrei: *${produtoNome}*. Deseja adicionar ao carrinho?` },
            action: {
                buttons: [
                    { type: "reply", reply: { id: `buy_${produtoId}`, title: "🛒 Comprar" } },
                    { type: "reply", reply: { id: "ver_carrinho", title: "🛍️ Ver Carrinho" } }
                ]
            }
        }
    };
    await enviarWhatsApp(to, payload, phoneId);
}

// =========================================================================
// 4. FLUXO PRINCIPAL
// =========================================================================

async function processarMensagemCompleta(from: string, texto: string, phoneId: string, buttonReplyId?: string) {
    await salvarHistorico(phoneId, from, texto, 'IN');
    const farmacia = await findFarmacyAPI(phoneId);
    if (!farmacia) return;

    let respostaTexto = "";
    const msgLower = texto.toLowerCase();

    // LÓGICA DE BOTÕES (REPLY)
    if (buttonReplyId) {
        if (buttonReplyId.startsWith('buy_')) {
            const prodId = buttonReplyId.split('_')[1];
            // Aqui entra sua função addItemToCart(from, prodId)
            respostaTexto = `✅ Produto ${prodId} adicionado ao carrinho!`;
        } else if (buttonReplyId === 'ver_carrinho') {
            respostaTexto = "Aqui está o seu carrinho: [Lista de Itens]";
        }
    } 
    // LÓGICA DE TEXTO
    else if (msgLower.includes('bula') || msgLower.includes('serve')) {
        respostaTexto = await buscarBulaGoogle(texto);
    } else if (msgLower.length > 3 && !msgLower.includes(' ')) {
        // Se for uma palavra única (provável busca de produto)
        await enviarBotaoCompra(from, texto.toUpperCase(), "ID123", phoneId);
        return;
    } else {
        respostaTexto = await chamarGemini(texto);
    }

    if (respostaTexto) {
        await enviarWhatsApp(from, { type: "text", text: { body: respostaTexto } }, phoneId);
        await salvarHistorico(phoneId, from, respostaTexto, 'OUT');
    }
}

// =========================================================================
// HANDLERS (NEXT.JS)
// =========================================================================

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const msg = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        const phoneId = body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

        if (msg) {
            const texto = msg.text?.body || msg.interactive?.button_reply?.title || "";
            const buttonId = msg.interactive?.button_reply?.id;
            await processarMensagemCompleta(msg.from, texto, phoneId, buttonId);
        }
        return NextResponse.json({ status: 'ok' });
    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    if (searchParams.get('hub.verify_token') === WHATSAPP_VERIFY_TOKEN) {
        return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
    }
    return new NextResponse('Erro', { status: 403 });
}
