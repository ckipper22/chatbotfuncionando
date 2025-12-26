import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppAPI } from '@/lib/whatsapp-api';

// Cache de estado em memória para persistir a intenção do usuário
const cacheEstados = new Map<string, string>();

// =========================================================================
// CONFIGURAÇÕES (Mantidas exatamente como estavam)
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
// NOVO: SUPABASE HISTORY LOGGER (Adicionado para histórico)
// =========================================================================

async function saveMessageToSupabase(
    messageData: {
        phone_number_id: string; // ID do telefone do bot (identifica o tenant)
        from: string;            // Número do remetente (cliente para inbound, bot para outbound)
        to: string;              // Número do destinatário (bot para inbound, cliente para outbound)
        message_type: string;    // Tipo de mensagem (e.g., 'text', 'interactive')
        message_content: string; // Conteúdo da mensagem
        direction: 'inbound' | 'outbound'; // Direção da mensagem
        status?: string;         // Status da mensagem (e.g., 'sent', 'received', 'delivered', 'read')
        conversation_id?: string; // Opcional: para agrupar mensagens em uma conversa lógica
    },
    supabaseUrl: string,
    supabaseAnonKey: string
) {
    try {
        const res = await fetch(`${supabaseUrl}/rest/v1/whatsapp_messages`, {
            method: 'POST',
            headers: {
                'apikey': supabaseAnonKey,
                'Authorization': `Bearer ${supabaseAnonKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation' 
            },
            body: JSON.stringify(messageData)
        });

        if (!res.ok) {
            const errorData = await res.json();
            console.error(`[SUPABASE] ❌ Falha ao salvar mensagem na tabela whatsapp_messages:`, JSON.stringify(errorData, null, 2));
        } else {
            console.log(`[SUPABASE] ✅ Mensagem salva: ${messageData.direction} de ${messageData.from} para ${messageData.to}`);
        }
    } catch (error) {
        console.error(`[SUPABASE] ❌ Erro ao salvar mensagem no DB:`, error);
    }
}

// Wrapper para whatsapp.sendTextMessage que *também* salva a mensagem no histórico.
// Todas as chamadas de sendTextMessage serão substituídas por esta função.
async function sendWhatsappMessageAndSaveHistory(
    to: string,
    text: string,
    supabaseUrl: string,
    supabaseAnonKey: string
) {
    // Primeiro, envia a mensagem pelo WhatsApp API
    await whatsapp.sendTextMessage(to, text);

    // Em seguida, salva a mensagem no Supabase
    await saveMessageToSupabase(
        {
            phone_number_id: WHATSAPP_PHONE_NUMBER_ID || '', // Usa o global WHATSAPP_PHONE_NUMBER_ID
            from: WHATSAPP_PHONE_NUMBER_ID || '', // O bot é o remetente
            to: formatarNumeroWhatsApp(to),
            message_type: 'text',
            message_content: text,
            direction: 'outbound',
            status: 'sent'
        },
        supabaseUrl,
        supabaseAnonKey
    );
}

// =========================================================================
// FUNÇÃO DO MENU INTERATIVO (O QUE O CLIENTE VÊ AO DAR "OI")
// (Modificada apenas para salvar a mensagem no histórico)
// =========================================================================

async function enviarMenuBoasVindas(
    de: string,
    nomeFarmacia: string,
    supabaseUrl: string,
    supabaseAnonKey: string // Adicionado
) {
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
        // NOVO: Salvar a mensagem de saída (menu) na tabela whatsapp_messages
        await saveMessageToSupabase(
            {
                phone_number_id: WHATSAPP_PHONE_NUMBER_ID || '', // Usa o global WHATSAPP_PHONE_NUMBER_ID
                from: WHATSAPP_PHONE_NUMBER_ID || '', // O bot é o remetente
                to: numeroDestinatario,
                message_type: 'interactive',
                message_content: payload.interactive.body.text, // Conteúdo principal do menu
                direction: 'outbound',
                status: 'sent'
            },
            supabaseUrl,
            supabaseAnonKey
        );
    }
}

// =========================================================================
// INTEGRAÇÕES (FLASK, GOOGLE, GEMINI) (Mantidas exatamente como estavam)
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
// ORQUESTRADOR DE FLUXO (O CÉREBRO) (Modificado para histórico)
// =========================================================================

async function processarFluxoPrincipal(
    de: string,
    msg: any,
    phoneId: string,
    supabaseUrl: string,
    supabaseAnonKey: string // Adicionado
) {
    const textoUsuario = msg.text?.body?.trim();
    const textoLimpo = textoUsuario?.toLowerCase();
    const cliqueBotao = msg.interactive?.button_reply?.id;

    console.log(`\n[RASTREAMENTO] 📥 Msg de ${de}: ${textoUsuario || '[Botão: ' + cliqueBotao + ']'}`);

    // NOVO: Salvar mensagem de entrada na tabela whatsapp_messages
    if (msg) {
        await saveMessageToSupabase(
            {
                phone_number_id: phoneId,
                from: formatarNumeroWhatsApp(msg.from),
                to: phoneId, // O bot é o destinatário
                message_type: msg.type || 'text',
                message_content: textoUsuario || JSON.stringify(msg),
                direction: 'inbound',
                status: 'received'
            },
            supabaseUrl,
            supabaseAnonKey
        );
    }

    // 1. Identificação Multitenant via Supabase (Mantida exatamente como estava)
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
        // NOVO: Passando chaves do Supabase para enviarMenuBoasVindas
        await enviarMenuBoasVindas(de, nomeFarmacia, supabaseUrl, supabaseAnonKey);
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

        // NOVO: Usando o wrapper que salva no histórico
        await sendWhatsappMessageAndSaveHistory(de, msgContexto, supabaseUrl, supabaseAnonKey);
        return;
    }

    // 4. Execução baseada no Estado salvo
    const estadoAtual = cacheEstados.get(de);
    console.log(`[ESTADO] 🧠 Estado de ${de}: ${estadoAtual || 'Sem Estado'}`);

    if (estadoAtual === 'menu_estoque') {
        const res = await consultarEstoqueFlask(textoUsuario, apiFlask);
        cacheEstados.delete(de); // Limpa para a próxima interação ser livre
        // NOVO: Usando o wrapper que salva no histórico
        await sendWhatsappMessageAndSaveHistory(de, res, supabaseUrl, supabaseAnonKey);
        return;
    }

    if (estadoAtual === 'menu_info') {
        const res = await consultarGoogleInfo(textoUsuario);
        cacheEstados.delete(de);
        // NOVO: Usando o wrapper que salva no histórico
        await sendWhatsappMessageAndSaveHistory(de, res, supabaseUrl, supabaseAnonKey);
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
        // NOVO: Usando o wrapper que salva no histórico
        await sendWhatsappMessageAndSaveHistory(de, textoIA || "Desculpe, não entendi. Digite 'menu' para ver as opções.", supabaseUrl, supabaseAnonKey);
    } catch (e) {
        // NOVO: Usando o wrapper que salva no histórico
        await sendWhatsappMessageAndSaveHistory(de, "Olá! Como posso ajudar? Digite 'menu' para ver as opções principais.", supabaseUrl, supabaseAnonKey);
    }
}

// =========================================================================
// HANDLERS NEXT.JS (Modificado para histórico)
// =========================================================================

export async function POST(req: NextRequest) {
    // NOVO: Obter URL e Anon Key do Supabase aqui
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // Verificação básica das chaves do Supabase
    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('[SUPABASE_CONFIG] ❌ NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY não configurados. Verifique suas variáveis de ambiente.');
        // Retorna 500 para indicar que o servidor não está configurado corretamente
        return new NextResponse('Internal Server Error: Supabase configuration missing.', { status: 500 });
    }

    try {
        const body = await req.json();
        const value = body.entry?.[0]?.changes?.[0]?.value;
        const msg = value?.messages?.[0];
        const phoneId = value?.metadata?.phone_number_id;

        if (msg) {
            // NOVO: Passar chaves do Supabase para processarFluxoPrincipal
            await processarFluxoPrincipal(msg.from, msg, phoneId, supabaseUrl, supabaseAnonKey);
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
