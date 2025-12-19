import { NextRequest, NextResponse } from 'next/server';

// =========================================================================
// CONFIGURAÇÕES DE AMBIENTE
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
// DETECTORES E UTILITÁRIOS
// =========================================================================
const termosMedicos = ['posologia', 'dose', 'para que serve', 'efeito', 'como tomar', 'contraindicação', 'bula', 'indicação'];

function extrairTermoBusca(mensagem: string): { buscar: boolean, termo: string } {
    const msg = mensagem.toLowerCase().trim();
    // Se for uma palavra única e não for saudação nem termo médico, tratamos como busca de produto
    if (msg.split(' ').length === 1 && msg.length > 2 && !['oi', 'olá', 'ola', 'menu'].includes(msg)) {
        return { buscar: true, termo: msg };
    }
    return { buscar: false, termo: '' };
}

// =========================================================================
// FUNÇÕES DE SERVIÇO (APIs EXTERNAS)
// =========================================================================

async function enviarWhatsApp(to: string, payload: any, phoneId: string) {
    console.log(`[WHATSAPP] 📤 Enviando para ${to}...`);
    try {
        const res = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messaging_product: "whatsapp", to, ...payload })
        });
        const data = await res.json();
        console.log(`[WHATSAPP] ✅ Status: ${res.ok ? 'Enviado' : 'Erro na Meta'}`);
        if (!res.ok) console.error("[WHATSAPP ERROR]", data);
    } catch (e) { console.error("[WHATSAPP FATAL]", e); }
}

async function buscarEstoqueLocal(termo: string, urlBase: string) {
    console.log(`[ESTOQUE] 🔍 Buscando "${termo}" na API: ${urlBase}`);
    try {
        const res = await fetch(`${urlBase}/api/products/search?q=${encodeURIComponent(termo)}`, {
            signal: AbortSignal.timeout(6000) // Timeout para não travar a Vercel
        });
        const data = await res.json();
        console.log(`[ESTOQUE] ✅ Resultados encontrados: ${data?.data?.length || 0}`);
        return data;
    } catch (e) {
        console.error(`[ESTOQUE] ❌ Erro ao conectar na API da Farmácia:`, e);
        return null;
    }
}

async function buscarGoogleTecnico(pergunta: string) {
    console.log(`[GOOGLE] 🔍 Buscando informação técnica para: "${pergunta}"`);
    try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${CUSTOM_SEARCH_API_KEY}&cx=${CUSTOM_SEARCH_CX}&q=${encodeURIComponent(pergunta)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.items && data.items.length > 0) {
            console.log(`[GOOGLE] ✅ Informação localizada.`);
            return `💊 *Informação Técnica:* \n\n${data.items[0].snippet}\n\n🔗 *Fonte:* ${data.items[0].link}`;
        }
        return null;
    } catch (e) {
        console.error("[GOOGLE ERROR]", e);
        return null;
    }
}

async function chamarGemini(mensagem: string) {
    console.log(`[GEMINI] 🤖 Processando resposta via IA...`);
    try {
        const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `Você é um assistente da farmácia. Responda de forma curta e profissional: ${mensagem}` }] }]
            })
        });
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "Como posso ajudar?";
    } catch (e) { return "Estou à disposição, como posso ajudar?"; }
}

// =========================================================================
// ROUTE HANDLER (POST)
// =========================================================================

export async function POST(req: NextRequest) {
    const start = Date.now();
    try {
        const body = await req.json();
        const value = body.entry?.[0]?.changes?.[0]?.value;
        const msg = value?.messages?.[0];
        const phoneId = value?.metadata?.phone_number_id;

        if (!msg) return NextResponse.json({ status: 'ok' });

        const from = msg.from;
        const text = msg.text?.body || "";
        const msgBaixa = text.toLowerCase();

        console.log(`\n--- INÍCIO PROCESSAMENTO ---`);
        console.log(`[LOG] 📥 Mensagem: "${text}" | ID: ${phoneId}`);

        // 1. BUSCA CONFIGURAÇÃO DA FARMÁCIA (MULTITENANT)
        const resDB = await fetch(`${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/client_connections?whatsapp_phone_id=eq.${phoneId}&select=*`, {
            headers: { 'apikey': NEXT_PUBLIC_SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${NEXT_PUBLIC_SUPABASE_ANON_KEY}` }
        });
        const farmacias = await resDB.json();
        const farmacia = farmacias?.[0];

        if (!farmacia) {
            console.error(`[DB] ❌ Farmácia não cadastrada para o ID: ${phoneId}`);
            return NextResponse.json({ status: 'not_found' });
        }
        console.log(`[DB] ✅ Conectado à: ${farmacia.name}`);

        // 2. DECISÃO DE FLUXO
        
        // A. É BUSCA DE PREÇO/ESTOQUE? (Palavra única)
        const busca = extrairTermoBusca(text);
        if (busca.buscar) {
            const estoque = await buscarEstoqueLocal(busca.termo, farmacia.api_base_url);
            if (estoque?.data && estoque.data.length > 0) {
                const p = estoque.data[0];
                const msgEstoque = `📦 *${p.nome_produto}*\n💰 Preço: R$ ${p.preco_final_venda}\n✅ Estoque: ${p.qtd_estoque} unidades.\n\n_Para reservar, digite COMPRAR ${p.cod_reduzido}_`;
                await enviarWhatsApp(from, { type: "text", text: { body: msgEstoque } }, phoneId);
                return NextResponse.json({ status: 'ok' });
            }
            console.log(`[ESTOQUE] ⚠️ Produto não encontrado, seguindo para IA.`);
        }

        // B. É PERGUNTA TÉCNICA/MÉDICA?
        if (termosMedicos.some(t => msgBaixa.includes(t))) {
            const infoTecnica = await buscarGoogleTecnico(text);
            if (infoTecnica) {
                await enviarWhatsApp(from, { type: "text", text: { body: infoTecnica } }, phoneId);
                return NextResponse.json({ status: 'ok' });
            }
        }

        // C. É SAUDAÇÃO OU OUTROS? (GEMINI)
        const respostaIA = await chamarGemini(text);
        await enviarWhatsApp(from, { type: "text", text: { body: respostaIA } }, phoneId);

        console.log(`[LOG] ✨ Fim do fluxo em ${Date.now() - start}ms\n`);
        return NextResponse.json({ status: 'ok' });

    } catch (e) {
        console.error("[ERRO CRÍTICO]", e);
        return NextResponse.json({ status: 'error' }, { status: 500 });
    }
}

// =========================================================================
// VERIFICAÇÃO WEBHOOK (GET)
// =========================================================================
export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    if (searchParams.get('hub.verify_token') === WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
        return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
    }
    return new NextResponse('Token Inválido', { status: 403 });
}
