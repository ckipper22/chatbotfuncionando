import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppAPI } from '@/lib/whatsapp-api';

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GOOGLE_CSE_KEY = process.env.CUSTOM_SEARCH_API_KEY;
const GOOGLE_CSE_CX = process.env.CUSTOM_SEARCH_CX;

const whatsapp = new WhatsAppAPI({
    access_token: WHATSAPP_ACCESS_TOKEN || '',
    phone_number_id: WHATSAPP_PHONE_NUMBER_ID || '',
    webhook_verify_token: WHATSAPP_VERIFY_TOKEN || '',
    is_active: true,
    webhook_url: ''
});

// =========================================================================
// FUNÇÃO PARA ENVIAR MENU DE BOTÕES (MENSAGEM INTERATIVA)
// =========================================================================
async function enviarMenuPrincipal(de: string, nomeFarmacia: string) {
    const url = `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: de,
        type: "interactive",
        interactive: {
            type: "button",
            header: { type: "text", text: `Bem-vindo à ${nomeFarmacia}` },
            body: { text: "Como posso ajudar você hoje? Escolha uma das opções abaixo para agilizar seu atendimento:" },
            footer: { text: "Assistente Virtual Farmacêutico" },
            action: {
                buttons: [
                    {照type: "reply", reply: { id: "btn_estoque", title: "Preço ou Estoque" } },
                    { type: "reply", reply: { id: "btn_bula", title: "Informação Médica" } },
                    { type: "reply", reply: { id: "btn_ia", title: "Outro Assunto" } }
                ]
            }
        }
    };

    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
        body: JSON.stringify(payload)
    });
}

// =========================================================================
// INTEGRAÇÕES (BUSCADORA, GEMINI, FLASK)
// =========================================================================

async function buscaGoogleFallback(consulta: string): Promise<string> {
    try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_KEY}&cx=${GOOGLE_CSE_CX}&q=${encodeURIComponent(consulta)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.items?.length) return '🔍 Não encontrei detalhes específicos sobre esse termo.';
        return `📖 *Informação Técnica:* \n\n${data.items[0].snippet}\n\n⚠️ _Esta informação é informativa. Consulte sempre um profissional._`;
    } catch (e) { return '⚠️ Erro na busca técnica.'; }
}

async function buscarProdutoNaApi(termo: string, apiBase: string): Promise<string> {
    try {
        const baseLimpa = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
        const res = await fetch(`${baseLimpa}/api/products/search?q=${encodeURIComponent(termo)}`);
        const data = await res.json();
        const produtos = data.data || [];
        if (produtos.length === 0) return `🔍 Não encontramos "*${termo}*" em estoque agora.`;
        
        let resposta = `✅ *Produtos Encontrados:* \n\n`;
        produtos.slice(0, 3).forEach((p: any) => {
            resposta += `▪️ *${p.nome_produto}*\n💰 R$ ${p.preco_final_venda}\n📦 Estoque: ${p.qtd_estoque}\n\n`;
        });
        return resposta;
    } catch (e) { return '⚠️ Erro ao consultar o sistema da loja.'; }
}

async function interpretarComGemini(mensagem: string): Promise<string> {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `Você é um assistente de farmácia. Ajude o cliente: ${mensagem}` }] }]
            })
        });
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "Como posso ajudar?";
    } catch (e) { return "Olá! Como posso ajudar?"; }
}

// =========================================================================
// PROCESSO PRINCIPAL (ORQUESTRADOR DE ESTADOS)
// =========================================================================

async function processarMensagemCompleta(de: string, msgObject: any, phoneId: string) {
    // 1. Identificar Farmácia (Multi-tenant)
    let apiFlask = process.env.FLASK_API_URL || '';
    let nomeFarmacia = 'Nossa Farmácia';
    try {
        const resDB = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/client_connections?whatsapp_phone_id=eq.${phoneId}&select=*`, {
            headers: { 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` }
        });
        const farmacias = await resDB.json();
        if (farmacias?.[0]) {
            apiFlask = farmacias[0].api_base_url;
            nomeFarmacia = farmacias[0].name || nomeFarmacia;
        }
    } catch (e) { console.error("Erro DB"); }

    const texto = msgObject.text?.body?.toLowerCase().trim();
    const interativo = msgObject.interactive?.button_reply;

    // A. SE FOR UM CLIQUE EM BOTÃO
    if (interativo) {
        if (interativo.id === 'btn_estoque') {
            await whatsapp.sendTextMessage(de, "📦 *CONSULTA DE ESTOQUE*\n\nPor favor, digite apenas o *nome do produto* que você procura.");
        } else if (interativo.id === 'btn_bula') {
            await whatsapp.sendTextMessage(de, "📖 *INFORMAÇÃO TÉCNICA*\n\nQual medicamento você quer pesquisar? (Ex: 'Para que serve o Ibuprofeno' ou 'Dose da Dipirona').");
        } else if (interativo.id === 'btn_ia') {
            await whatsapp.sendTextMessage(de, "🤖 *ASSISTENTE VIRTUAL*\n\nPode digitar sua dúvida, estou ouvindo!");
        }
        return;
    }

    // B. SE FOR RESPOSTA ÀS SOLICITAÇÕES DO MENU (Lógica Simples de Contexto)
    // Aqui fazemos uma heurística: se o texto for curto, tentamos estoque. Se tiver termos médicos, usamos a buscadora.
    const termosMedicos = ['para que serve', 'dose', 'posologia', 'como tomar', 'efeito', 'contraindica'];
    
    if (termosMedicos.some(t => texto?.includes(t))) {
        const info = await buscaGoogleFallback(texto);
        await whatsapp.sendTextMessage(de, info);
    } else if (texto && texto.split(' ').length <= 3 && !['oi', 'ola', 'menu'].includes(texto)) {
        const resEstoque = await buscarProdutoNaApi(texto, apiFlask);
        await whatsapp.sendTextMessage(de, resEstoque);
    } else {
        // C. MENSAGEM PADRÃO OU MENU
        if (['oi', 'ola', 'ola!', 'oi!', 'menu', 'inicio'].includes(texto)) {
            await enviarMenuPrincipal(de, nomeFarmacia);
        } else {
            const respostaIA = await interpretarComGemini(texto);
            await whatsapp.sendTextMessage(de, respostaIA);
        }
    }
}

// =========================================================================
// HANDLERS
// =========================================================================

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const value = body.entry?.[0]?.changes?.[0]?.value;
        const msg = value?.messages?.[0];
        const phoneId = value?.metadata?.phone_number_id;

        if (msg) {
            await processarMensagemCompleta(msg.from, msg, phoneId);
        }
        return new NextResponse('OK', { status: 200 });
    } catch (e) { return new NextResponse('OK', { status: 200 }); }
}

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    if (searchParams.get('hub.verify_token') === WHATSAPP_VERIFY_TOKEN) {
        return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
    }
    return new NextResponse('Erro', { status: 403 });
}
