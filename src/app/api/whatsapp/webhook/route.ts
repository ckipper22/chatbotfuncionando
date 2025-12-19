import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppAPI } from '@/lib/whatsapp-api';

// Cache de estado em memória para persistir a intenção do usuário
const cacheEstados = new Map<string, string>();

// =========================================================================
// CONFIGURAÇÕES
// =========================================================================
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
// UTILITÁRIOS: FORMATAÇÃO E LOGS
// =========================================================================

function formatarNumeroWhatsApp(numero: string): string {
    // Remove espaços, traços e símbolos. Deixa apenas números.
    let limpo = numero.replace(/\D/g, '');
    
    // Tratamento para números do Brasil (55)
    if (limpo.startsWith('55')) {
        // Se tiver 12 dígitos (Ex: 55 54 84557096), adiciona o 9 após o DDD
        if (limpo.length === 12) {
            const ddd = limpo.substring(2, 4);
            const resto = limpo.substring(4);
            limpo = `55${ddd}9${resto}`;
            console.log(`[RASTREAMENTO] 📱 Adicionado o 9: ${limpo}`);
        }
    }
    return limpo;
}

// =========================================================================
// FUNÇÃO DO MENU INTERATIVO (O QUE O CLIENTE VÊ AO DAR "OI")
// =========================================================================

async function enviarMenuBoasVindas(de: string, nomeFarmacia: string) {
    const numeroDestinatario = formatarNumeroWhatsApp(de);
    const url = `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
    
    console.log(`[MENU] 📱 Preparando menu para: ${numeroDestinatario}`);

    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: numeroDestinatario,
        type: "interactive",
        interactive: {
            type: "button",
            header: { type: "text", text: nomeFarmacia.substring(0, 60) },
            body: { text: "Olá! Como posso ajudar você hoje?\nEscolha uma das opções abaixo para começar:" },
            footer: { text: "Assistente Virtual Farmacêutico" },
            action: {
                buttons: [
                    { type: "reply", reply: { id: "menu_estoque", title: "Preço ou Estoque" } },
                    { type: "reply", reply: { id: "menu_info", title: "Informação Médica" } },
                    { type: "reply", reply: { id: "menu_outros", title: "Outro Assunto" } }
                ]
            }
        }
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
        body: JSON.stringify(payload)
    });

    const resData = await res.json();
    if (!res.ok) {
        console.error(`[WHATSAPP API] ❌ ERRO 400 NO MENU:`, JSON.stringify(resData, null, 2));
    } else {
        console.log(`[WHATSAPP API] ✅ Menu enviado com sucesso.`);
    }
}

// =========================================================================
// INTEGRAÇÕES (FLASK, GOOGLE, GEMINI)
// =========================================================================

async function consultarEstoqueFlask(termo: string, apiBase: string): Promise<string> {
    console.log(`[FLASK] 🔍 Buscando: "${termo}" em ${apiBase}`);
    try {
        const base = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
        const res = await fetch(`${base}/api/products/search?q=${encodeURIComponent(termo)}`, { signal: AbortSignal.timeout(8000) });
        const data = await res.json();
        const produtos = data.data || [];

        if (produtos.length === 0) return `❌ Não encontrei "*${termo}*" em estoque agora.`;

        let resposta = `✅ *Produtos Encontrados:*\n\n`;
        produtos.slice(0, 3).forEach((p: any) => {
            resposta += `▪️ *${p.nome_produto}*\n💰 Preço: R$ ${p.preco_final_venda}\n📦 Estoque: ${p.qtd_estoque}\n\n`;
        });
        return resposta;
    } catch (e) {
        console.error(`[FLASK] ❌ Erro:`, e);
        return '⚠️ Erro ao consultar o estoque local.';
    }
}

async function consultarGoogleInfo(pergunta: string): Promise<string> {
    console.log(`[GOOGLE] 🌐 Buscando info para: "${pergunta}"`);
    try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_KEY}&cx=${GOOGLE_CSE_CX}&q=${encodeURIComponent(pergunta)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.items?.length) return '🔍 Não localizei informações técnicas sobre isso.';
        return `💊 *Informação Técnica:* \n\n${data.items[0].snippet}\n\n🔗 *Fonte:* ${data.items[0].link}`;
    } catch (e) { return '⚠️ Erro na busca técnica.'; }
}

// =========================================================================
// ORQUESTRADOR DE FLUXO (O CÉREBRO)
// =========================================================================

async function processarFluxoPrincipal(de: string, msg: any, phoneId: string) {
    const textoUsuario = msg.text?.body?.trim();
    const textoLimpo = textoUsuario?.toLowerCase();
    const cliqueBotao = msg.interactive?.button_reply?.id;

    console.log(`\n[RASTREAMENTO] 📥 Msg de ${de}: ${textoUsuario || '[Botão: ' + cliqueBotao + ']'}`);

    // 1. Identificação Multitenant via Supabase
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
    } catch (e) { console.error("[SUPABASE] ❌ Erro de conexão."); }

    // 2. Fluxo de Entrada (Saudações)
    const saudacoes = ['oi', 'ola', 'olá', 'menu', 'inicio', 'bom dia', 'boa tarde', 'boa noite'];
    if (textoLimpo && saudacoes.includes(textoLimpo) && !cliqueBotao) {
        console.log(`[ESTADO] 🔄 Saudação. Enviando menu.`);
        cacheEstados.delete(de);
        await enviarMenuBoasVindas(de, nomeFarmacia);
        return;
    }

    // 3. Resposta ao Clique no Botão
    if (cliqueBotao) {
        console.log(`[ESTADO] 🎯 Usuário escolheu: ${cliqueBotao}`);
        cacheEstados.set(de, cliqueBotao);
        
        let msgContexto = "";
        if (cliqueBotao === 'menu_estoque') msgContexto = "📦 *Consulta de Estoque*\n\nPor favor, digite o *nome do produto* que deseja consultar.";
        else if (cliqueBotao === 'menu_info') msgContexto = "📖 *Informação Médica*\n\nQual medicamento você quer pesquisar?";
        else if (cliqueBotao === 'menu_outros') msgContexto = "🤖 *Assistente Virtual*\n\nComo posso ajudar com outros assuntos?";

        await whatsapp.sendTextMessage(de, msgContexto);
        return;
    }

    // 4. Execução baseada no Estado salvo
    const estadoAtual = cacheEstados.get(de);
    console.log(`[ESTADO] 🧠 Estado de ${de}: ${estadoAtual || 'Sem Estado'}`);

    if (estadoAtual === 'menu_estoque') {
        const res = await consultarEstoqueFlask(textoUsuario, apiFlask);
        cacheEstados.delete(de); // Limpa para a próxima interação ser livre
        await whatsapp.sendTextMessage(de, res);
        return;
    }

    if (estadoAtual === 'menu_info') {
        const res = await consultarGoogleInfo(textoUsuario);
        cacheEstados.delete(de);
        await whatsapp.sendTextMessage(de, res);
        return;
    }

    // 5. Fallback Gemini (Para mensagens soltas fora do menu)
    console.log(`[GEMINI] 🤖 Gerando resposta inteligente.`);
    try {
        const urlGemini = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const resGemini = await fetch(urlGemini, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: `Aja como atendente de farmácia: ${textoUsuario}` }] }] })
        });
        const dataGemini = await resGemini.json();
        const textoIA = dataGemini.candidates?.[0]?.content?.parts?.[0]?.text;
        await whatsapp.sendTextMessage(de, textoIA || "Desculpe, não entendi. Digite 'menu' para ver as opções.");
    } catch (e) {
        await whatsapp.sendTextMessage(de, "Olá! Como posso ajudar? Digite 'menu' para ver as opções principais.");
    }
}

// =========================================================================
// HANDLERS NEXT.JS
// =========================================================================

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const value = body.entry?.[0]?.changes?.[0]?.value;
        const msg = value?.messages?.[0];
        const phoneId = value?.metadata?.phone_number_id;

        if (msg) {
            await processarFluxoPrincipal(msg.from, msg, phoneId);
        }
        return new NextResponse('OK', { status: 200 });
    } catch (e) {
        console.error(`[WEBHOOK] ❌ Erro fatal:`, e);
        return new NextResponse('OK', { status: 200 });
    }
}

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    if (searchParams.get('hub.verify_token') === WHATSAPP_VERIFY_TOKEN) {
        return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
    }
    return new NextResponse('Erro', { status: 403 });
}
