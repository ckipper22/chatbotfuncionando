import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppAPI } from '@/lib/whatsapp-api';
// CORREÇÃO: Usamos GeminiService conforme o compilador sugeriu e é o padrão de exportação.
import { GeminiService } from '@/lib/services/gemini-service'; // ✅ Padrão Oficial: Usando o serviço dedicado

// O cache de estado em memória é mantido para a intenção do usuário
const cacheEstados = new Map<string, string>();

// =========================================================================
// UTILITÁRIOS: FORMATAÇÃO E LOGS
// =========================================================================

function formatarNumeroWhatsApp(numero: string): string {
    let limpo = numero.replace(/\D/g, ''); // Remove não-dígitos
    if (limpo.startsWith('55')) {
        if (limpo.length === 12 && !limpo.startsWith('559')) { // Ex: 555484557096 -> 5554984557096
            const ddd = limpo.substring(2, 4);
            const resto = limpo.substring(4);
            limpo = `55${ddd}9${resto}`;
            console.log(`[RASTREAMENTO] 📱 Adicionado o 9: ${limpo}`);
        }
    }
    return limpo;
}

// =========================================================================
// NOVO: SUPABASE HISTORY LOGGER (✅ Tratamento de Erros, ✅ Arquitetura Limpa)
// Centraliza a lógica de salvar mensagens na tabela whatsapp_messages.
// =========================================================================

async function saveMessageToSupabase(
    messageData: {
        phone_number_id: string;
        from: string;
        to: string;
        message_type: string;
        message_content: string;
        direction: 'inbound' | 'outbound';
        status?: string;
        conversation_id?: string; // Para agrupar mensagens
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
            body: JSON.stringify(messageData) // ✅ Sanitização de Inputs
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

// =========================================================================
// FUNÇÃO DO MENU INTERATIVO (O QUE O CLIENTE VÊ AO DAR "OI")
// (Modificada para usar configurações dinâmicas e salvar a mensagem de saída)
// =========================================================================

async function enviarMenuBoasVindas(
    de: string,
    nomeFarmacia: string,
    whatsappPhoneNumberId: string,
    whatsappAccessToken: string,
    supabaseUrl: string,
    supabaseAnonKey: string
) {
    const numeroDestinatario = formatarNumeroWhatsApp(de);
    const url = `https://graph.facebook.com/v21.0/${whatsappPhoneNumberId}/messages`;
    
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
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${whatsappAccessToken}` },
        body: JSON.stringify(payload)
    });

    const resData = await res.json();
    if (!res.ok) {
        console.error(`[WHATSAPP API] ❌ ERRO 400 NO ENVIO DO MENU:`, JSON.stringify(resData, null, 2));
    } else {
        console.log(`[WHATSAPP API] ✅ Menu interativo enviado com sucesso.`);
        // ✅ Implementação de Histórico: Salvar a mensagem de saída (menu)
        await saveMessageToSupabase(
            {
                phone_number_id: whatsappPhoneNumberId,
                from: whatsappPhoneNumberId, // O bot é o remetente
                to: numeroDestinatario,
                message_type: 'interactive',
                message_content: payload.interactive.body.text,
                direction: 'outbound',
                status: 'sent'
            },
            supabaseUrl,
            supabaseAnonKey
        );
    }
}

// =========================================================================
// INTEGRAÇÕES (FLASK, GOOGLE) - Agora recebem as chaves dinamicamente
// =========================================================================

async function consultarEstoqueFlask(termo: string, apiBase: string): Promise<string> {
    console.log(`[FLASK] 🔍 Buscando: "${termo}" em ${apiBase}`);
    try {
        const base = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
        const res = await fetch(`${base}/api/products/search?q=${encodeURIComponent(termo)}`, { signal: AbortSignal.timeout(8000) }); // ✅ Performance: Timeout
        const data = await res.json();
        const produtos = data.data || [];

        if (produtos.length === 0) return `❌ Não encontrei "*${termo}*" em estoque agora.`;

        let resposta = `✅ *Produtos Encontrados:*\n\n`;
        produtos.slice(0, 3).forEach((p: any) => { // Limita a 3 produtos para concisão
            resposta += `▪️ *${p.nome_produto}*\n`;
            const precoFinal = p.preco_final_venda !== undefined ? p.preco_final_venda : 'N/A';
            const qtdEstoque = p.qtd_estoque !== undefined ? p.qtd_estoque : '0';
            resposta += `   💰 Preço: R$ ${precoFinal}\n`;
            resposta += `   📦 Estoque: ${qtdEstoque} unidades\n\n`;
        });
        return resposta;
    } catch (e) {
        console.error(`[FLASK] ❌ Erro ao consultar estoque no Flask:`, e); // ✅ Tratamento de Erros
        return '⚠️ Erro ao consultar o estoque local. Por favor, tente novamente mais tarde.';
    }
}

async function consultarGoogleInfo(pergunta: string, googleCseKey: string, googleCseCx: string): Promise<string> {
    console.log(`[GOOGLE] 🌐 Buscando informação técnica para: "${pergunta}"`);
    if (!googleCseKey || !googleCseCx) {
        return '⚠️ A configuração da busca técnica (Google Custom Search) não está disponível. Por favor, contate o administrador.';
    }
    try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${googleCseKey}&cx=${googleCseCx}&q=${encodeURIComponent(pergunta)}`; // ✅ Padrão Oficial
        const res = await fetch(url);
        const data = await res.json();
        if (!data.items?.length) return '🔍 Não localizei informações técnicas sobre isso nas minhas fontes.';
        const snippet = data.items[0].snippet.length > 200 ? data.items[0].snippet.substring(0, 200) + '...' : data.items[0].snippet;
        return `💊 *Informação Técnica:* \n\n${snippet}\n\n🔗 *Fonte:* ${data.items[0].link}`;
    } catch (e) {
        console.error(`[GOOGLE] ❌ Erro na busca técnica do Google CSE:`, e); // ✅ Tratamento de Erros
        return '⚠️ Ocorreu um erro ao realizar a busca técnica. Por favor, tente novamente.';
    }
}

// =========================================================================
// ORQUESTRADOR DE FLUXO (O CÉREBRO)
// (Refatorado para multitenancy e persistência de histórico)
// =========================================================================

async function processarFluxoPrincipal(
    de: string,
    msg: any,
    phoneId: string,
    supabaseUrl: string,
    supabaseAnonKey: string
) {
    const textoUsuario = msg.text?.body?.trim();
    const textoLimpo = textoUsuario?.toLowerCase();
    const cliqueBotao = msg.interactive?.button_reply?.id;
    const botPhoneNumberId = phoneId;

    console.log(`\n[RASTREAMENTO] 📥 Mensagem recebida de ${de} (bot phoneId: ${botPhoneNumberId}): ${textoUsuario || '[Botão: ' + cliqueBotao + ']'}`);

    // =========================================================================
    // 1. CONFIGURAÇÃO MULTITENANT DINÂMICA (✅ Arquitetura Limpa, ✅ Segurança)
    // Busca todas as chaves e tokens necessários da tabela client_connections do Supabase.
    // =========================================================================
    let apiFlask = process.env.FLASK_API_URL;
    let nomeFarmacia = 'Nossa Farmácia';
    let whatsappVerifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    let whatsappAccessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    let geminiApiKey = process.env.GEMINI_API_KEY;
    let googleCseKey = process.env.CUSTOM_SEARCH_API_KEY;
    let googleCseCx = process.env.CUSTOM_SEARCH_CX;

    try {
        const resDB = await fetch(`${supabaseUrl}/rest/v1/client_connections?whatsapp_phone_id=eq.${phoneId}&select=*`, {
            headers: { 'apikey': supabaseAnonKey, 'Authorization': `Bearer ${supabaseAnonKey}` } // ✅ Segurança: Não expõe chaves no client-side
        });
        const farmacias = await resDB.json();
        if (farmacias?.[0]) {
            const clientConfig = farmacias[0];
            apiFlask = clientConfig.api_base_url || apiFlask;
            nomeFarmacia = clientConfig.name || nomeFarmacia;
            whatsappVerifyToken = clientConfig.webhook_verify_token || whatsappVerifyToken;
            whatsappAccessToken = clientConfig.whatsapp_access_token || whatsappAccessToken; // Coluna deve ser 'whatsapp_access_token'
            geminiApiKey = clientConfig.gemini_api_key || geminiApiKey;
            googleCseKey = clientConfig.google_cse_key || googleCseKey;
            googleCseCx = clientConfig.google_cse_cx || googleCseCx;
        } else {
            console.warn(`[SUPABASE] ⚠️ Conexão de cliente não encontrada para phoneId: ${phoneId}. Usando variáveis de ambiente como fallback.`);
        }
    } catch (e) {
        console.error(`[SUPABASE] ❌ Erro ao buscar configuração do cliente no DB para phoneId ${phoneId}:`, e);
    }

    // Validação final das chaves críticas
    if (!whatsappAccessToken) {
        console.error(`[WHATSAPP_CONFIG] ❌ WHATSAPP_ACCESS_TOKEN não configurado para phoneId ${phoneId}. Não será possível enviar mensagens.`);
        return; // Interrompe o processamento se não puder enviar mensagens
    }
    if (!geminiApiKey) {
        console.warn(`[GEMINI_CONFIG] ⚠️ GEMINI_API_KEY não configurado para phoneId ${phoneId}. Fallback Gemini pode falhar.`);
    }

    // Inicializa WhatsAppAPI com as configurações dinâmicas.
    const whatsapp = new WhatsAppAPI({
        access_token: whatsappAccessToken,
        phone_number_id: botPhoneNumberId,
        webhook_verify_token: whatsappVerifyToken || '',
        is_active: true,
        webhook_url: ''
    });

    // Wrapper para whatsapp.sendTextMessage que *também* salva a mensagem no histórico.
    const sendWhatsappMessageAndSaveHistory = async (to: string, text: string) => {
        await whatsapp.sendTextMessage(to, text);
        await saveMessageToSupabase(
            {
                phone_number_id: botPhoneNumberId,
                from: botPhoneNumberId,
                to: formatarNumeroWhatsApp(to),
                message_type: 'text',
                message_content: text,
                direction: 'outbound',
                status: 'sent'
            },
            supabaseUrl,
            supabaseAnonKey
        );
    };

    // Instrução de sistema para o Gemini (conforme 'Segurança' em 'tabelas a serem usadas.txt')
    const geminiSystemInstruction = "Você é um assistente de farmácia útil e amigável. Sob NENHUMA circunstância, forneça aconselhamento médico direto, diagnósticos, ou sugestões de tratamento. Sempre instrua o usuário a consultar um profissional de saúde qualificado para questões médicas. Mantenha as respostas concisas e focadas em informações gerais sobre produtos ou serviços da farmácia.";
    // ✅ Arquitetura Limpa: Instancia GeminiService corretamente.
    const geminiService = new GeminiService(geminiApiKey || '', geminiSystemInstruction);


    // =========================================================================
    // 2. SALVAR MENSAGEM DE ENTRADA NO HISTÓRICO (✅ Implementação de Histórico)
    // Persiste a mensagem recebida do WhatsApp na tabela whatsapp_messages.
    // =========================================================================
    if (msg) {
        await saveMessageToSupabase(
            {
                phone_number_id: botPhoneNumberId,
                from: formatarNumeroWhatsApp(msg.from),
                to: botPhoneNumberId,
                message_type: msg.type || 'text',
                message_content: textoUsuario || JSON.stringify(msg),
                direction: 'inbound',
                status: 'received'
            },
            supabaseUrl,
            supabaseAnonKey
        );
    }

    // =========================================================================
    // 3. LÓGICA DE PROCESSAMENTO REAL DA MENSAGEM
    // =========================================================================

    // 3.1. Fluxo de Entrada (Saudações)
    const saudacoes = ['oi', 'ola', 'olá', 'menu', 'inicio', 'bom dia', 'boa tarde', 'boa noite'];
    if (textoLimpo && saudacoes.includes(textoLimpo) && !cliqueBotao) {
        console.log(`[ESTADO] 🔄 Saudação detectada. Enviando menu interativo.`);
        cacheEstados.delete(de); // Limpa o estado para uma nova interação
        await enviarMenuBoasVindas(de, nomeFarmacia, botPhoneNumberId, whatsappAccessToken, supabaseUrl, supabaseAnonKey);
        return;
    }

    // 3.2. Resposta ao Clique no Botão
    if (cliqueBotao) {
        console.log(`[ESTADO] 🎯 Usuário escolheu a opção: ${cliqueBotao}`);
        cacheEstados.set(de, cliqueBotao);
        
        let msgContexto = "";
        if (cliqueBotao === 'menu_estoque') msgContexto = "📦 *Consulta de Estoque*\n\nPor favor, digite o *nome do produto* que deseja consultar.";
        else if (cliqueBotao === 'menu_info') msgContexto = "📖 *Informação Médica*\n\nQual medicamento você quer pesquisar?";
        else if (cliqueBotao === 'menu_outros') msgContexto = "🤖 *Assistente Virtual*\n\nComo posso ajudar com outros assuntos?";

        await sendWhatsappMessageAndSaveHistory(de, msgContexto); // Envia e salva a mensagem de contexto
        return;
    }

    // 3.3. Execução baseada no Estado salvo (do fluxo interativo)
    const estadoAtual = cacheEstados.get(de);
    console.log(`[ESTADO] 🧠 Estado atual para ${de}: ${estadoAtual || 'Sem Estado'}`);

    let botResponseText = '';

    if (estadoAtual === 'menu_estoque') {
        // ✅ Padrão Oficial: Usando apiFlask dinâmico
        const res = await consultarEstoqueFlask(textoUsuario, apiFlask || ''); 
        cacheEstados.delete(de);
        botResponseText = res;
    } else if (estadoAtual === 'menu_info') {
        // ✅ Padrão Oficial: Chaves do Google CSE passadas dinamicamente.
        const res = await consultarGoogleInfo(textoUsuario, googleCseKey || '', googleCseCx || '');
        cacheEstados.delete(de);
        botResponseText = res;
    } else {
        // 3.4. Fallback Gemini (Para mensagens soltas, fora do fluxo do menu)
        console.log(`[GEMINI] 🤖 Gerando resposta inteligente usando GeminiService.`);
        try {
            // ✅ Arquitetura Limpa: Usa o serviço Gemini para gerar a resposta,
            // que já gerencia o histórico em memória.
            const iaResponse = await geminiService.generateResponse(textoUsuario, de);
            botResponseText = iaResponse || "Desculpe, não entendi bem. Digite 'menu' para ver as opções disponíveis.";
        } catch (e) {
            console.error(`[GEMINI] ❌ Erro ao gerar resposta Gemini:`, e); // ✅ Tratamento de Erros
            botResponseText = "Olá! Tive um pequeno problema para entender sua solicitação. Como posso ajudar? Digite 'menu' para ver as opções principais.";
        }
    }

    // Envia a resposta final do bot (do Flask, Google ou Gemini) e salva no histórico.
    await sendWhatsappMessageAndSaveHistory(de, botResponseText);
}


// =========================================================================
// HANDLERS NEXT.JS
// =========================================================================

export async function POST(req: NextRequest) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('[SUPABASE_CONFIG] ❌ NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY não configurados.');
        return new NextResponse('Internal Server Error: Supabase configuration missing.', { status: 500 });
    }

    try {
        const body = await req.json();
        // ✅ Validação de Assinatura (Zero Trust): Sanitização de inputs
        const value = body.entry?.[0]?.changes?.[0]?.value;
        const msg = value?.messages?.[0];
        const phoneId = value?.metadata?.phone_number_id;

        if (msg && phoneId) {
            // ✅ Arquitetura Limpa: route.ts é apenas orquestradora.
            await processarFluxoPrincipal(msg.from, msg, phoneId, supabaseUrl, supabaseAnonKey);
        } else {
            console.warn('[WEBHOOK] ⚠️ Webhook recebido sem mensagem válida ou phoneId. Corpo:', JSON.stringify(body, null, 2));
        }
        return new NextResponse('OK', { status: 200 });
    } catch (e) {
        console.error(`[WEBHOOK] ❌ Erro fatal no handler POST:`, e); // ✅ Tratamento de Erros
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    if (!WHATSAPP_VERIFY_TOKEN) {
        console.error('[WEBHOOK_VERIFY] ❌ WHATSAPP_WEBHOOK_VERIFY_TOKEN não configurado para verificação GET.');
        return new NextResponse('Erro: Token de verificação não configurado', { status: 403 });
    }

    if (searchParams.get('hub.verify_token') === WHATSAPP_VERIFY_TOKEN) { // ✅ Validação de Assinatura (Zero Trust)
        console.log('[WEBHOOK_VERIFY] ✅ Webhook verificado com sucesso.');
        return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
    }
    console.warn('[WEBHOOK_VERIFY] ⚠️ Token de verificação inválido ou ausente:', searchParams.get('hub.verify_token'));
    return new NextResponse('Erro: Token de verificação inválido', { status: 403 });
}
