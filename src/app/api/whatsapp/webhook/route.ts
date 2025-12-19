import { NextRequest, NextResponse } from 'next/server';

// =========================================================================
// CONFIGURAÇÃO (VARIÁVEIS VERCEL)
// =========================================================================
const {
    WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: WHATSAPP_VERIFY_TOKEN,
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
    GEMINI_API_KEY,
    CUSTOM_SEARCH_API_KEY: GOOGLE_CSE_KEY,
    CUSTOM_SEARCH_CX: GOOGLE_CSE_CX
} = process.env;

// =========================================================================
// 1. NÚCLEO MULTITENANT & HISTÓRICO (PERSISTÊNCIA)
// =========================================================================

async function findFarmacyAPI(whatsappPhoneId: string) {
    console.log(`[LOG] Buscando farmácia para ID: ${whatsappPhoneId}`);
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
// 2. DETECTORES (SUA LÓGICA ORIGINAL)
// =========================================================================

const SAUDACOES = ['olá', 'ola', 'oi', 'hey', 'hello', 'hi', 'menu', 'inicio'];
const ehSaudacao = (msg: string) => SAUDACOES.includes(msg.toLowerCase().trim());

function ehPerguntaMedica(msg: string): boolean {
    const termos = ['posologia', 'dose', 'para que serve', 'efeito', 'contraindicação', 'como tomar'];
    return termos.some(t => msg.toLowerCase().includes(t));
}

// =========================================================================
// 3. BUSCA DE PRODUTOS COM BOTÃO (NOVO)
// =========================================================================

async function buscarEEnviarProdutos(to: string, termo: string, farmacia: any, phoneId: string) {
    console.log(`[LOG] Buscando "${termo}" na API: ${farmacia.api_base_url}`);
    try {
        const res = await fetch(`${farmacia.api_base_url}/api/products/search?q=${encodeURIComponent(termo)}`);
        const data = await res.json();

        if (!data.data?.length) {
            await enviarWhatsApp(to, { type: "text", text: { body: `🔍 Não encontrei "${termo}" no estoque.` } }, phoneId);
            return;
        }

        const p = data.data[0]; // Pegamos o primeiro resultado para oferecer o botão
        const payload = {
            type: "interactive",
            interactive: {
                type: "button",
                body: { text: `✅ Encontrei: *${p.nome_produto}*\n💰 Preço: ${p.preco_final_venda || 'Sob consulta'}\n📦 Estoque: ${p.qtd_estoque} un.` },
                action: {
                    buttons: [
                        { type: "reply", reply: { id: `buy_${p.cod_reduzido || p.codigo}`, title: "🛒 Adicionar ao Carrinho" } },
                        { type: "reply", reply: { id: "ver_carrinho", title: "🛍️ Ver Carrinho" } }
                    ]
                }
            }
        };
        await enviarWhatsApp(to, payload, phoneId);
    } catch (e) {
        console.error("Erro busca API Flask:", e);
    }
}

// =========================================================================
// 4. FLUXO PRINCIPAL (UNIFICADO)
// =========================================================================

async function processarMensagemCompleta(from: string, texto: string, phoneId: string, buttonId?: string) {
    await salvarHistorico(phoneId, from, texto, 'IN');
    const farmacia = await findFarmacyAPI(phoneId);
    if (!farmacia) return;

    let resposta = "";

    // A. LÓGICA DE BOTÕES
    if (buttonId) {
        if (buttonId.startsWith('buy_')) {
            const cod = buttonId.split('_')[1];
            // Aqui você chama sua lógica de Supabase: addItemToCart(from, cod)
            resposta = `✅ Código ${cod} adicionado ao carrinho! Deseja mais algo?`;
        } else if (buttonId === 'ver_carrinho') {
            resposta = "🛒 Seu carrinho atual: \n- Item 1...\n\nPara finalizar, digite *FINALIZAR*.";
        }
    }
    // B. SAUDAÇÃO
    else if (ehSaudacao(texto)) {
        resposta = "Olá! Como posso ajudar hoje? Você pode buscar um produto ou tirar dúvidas sobre medicamentos.";
    }
    // C. PERGUNTA MÉDICA (SUA MASTER GOOGLE CSE)
    else if (ehPerguntaMedica(texto)) {
        resposta = await buscaGoogleFallback(texto);
    }
    // D. BUSCA DE PRODUTO (MULTITENANT + BOTÃO)
    else if (texto.length > 2 && texto.length < 25) {
        await buscarEEnviarProdutos(from, texto, farmacia, phoneId);
        return;
    }
    // E. FALLBACK GEMINI
    else {
        resposta = await chamarGemini(texto);
    }

    if (resposta) {
        await enviarWhatsApp(from, { type: "text", text: { body: resposta } }, phoneId);
        await salvarHistorico(phoneId, from, resposta, 'OUT');
    }
}

// =========================================================================
// ENVIO E WEBHOOK
// =========================================================================

async function enviarWhatsApp(to: string, payload: any, phoneId: string) {
    await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: "whatsapp", to, ...payload })
    });
}

export async function POST(req: NextRequest) {
    const body = await req.json();
    const msg = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const phoneId = body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

    if (msg && phoneId) {
        const texto = msg.text?.body || msg.interactive?.button_reply?.title || "";
        const buttonId = msg.interactive?.button_reply?.id;
        await processarMensagemCompleta(msg.from, texto, phoneId, buttonId);
    }
    return NextResponse.json({ status: 'ok' });
}

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    if (searchParams.get('hub.verify_token') === WHATSAPP_VERIFY_TOKEN) {
        return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
    }
    return NextResponse.json({ error: "Erro token" }, { status: 403 });
}

// --- FUNÇÕES DE APOIO (GEMINI E GOOGLE) ---
async function buscaGoogleFallback(q: string) { /* ...sua lógica original... */ return "Resultado Google"; }
async function chamarGemini(q: string) { /* ...sua lógica original... */ return "Resposta Gemini"; }
