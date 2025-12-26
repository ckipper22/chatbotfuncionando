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
    webhook_verify_token: WHATSAPP_VERIFY_TOKEN || '', // Usando WHATSAPP_VERIFY_TOKEN global
    is_active: true,
    webhook_url: ''
});

// =========================================================================
// UTILITÁRIOS: FORMATAÇÃO E LOGS
// =========================================================================

function formatarNumeroWhatsAppParaEnvio(numero: string): string {
    // Esta função é para FORMATAR o número para envio à API do WhatsApp Meta.
    // O número original do cliente DEVE ser mantido no histórico sem essa formatação.
    let limpo = numero.replace(/\D/g, ''); // Remove não-dígitos
    
    // Tratamento para números do Brasil (55)
    if (limpo.startsWith('55')) {
        // Se tiver 12 dígitos (Ex: 555484557096), adiciona o 9 após o DDD
        // Garante que o 9º dígito seja adicionado para números de celular brasileiros
        if (limpo.length === 12 && !limpo.startsWith('559', 2)) { // Verifica se já não tem o 9 no DDD
            const ddd = limpo.substring(2, 4);
            const resto = limpo.substring(4);
            limpo = `55${ddd}9${resto}`;
            console.log(`[RASTREAMENTO] 📱 Adicionado o 9 para envio: ${limpo}`);
        }
    }
    return limpo;
}

// =========================================================================
// NOVO: SUPABASE HISTORY LOGGER (AJUSTADO PARA SEU SCHEMA)
// =========================================================================

async function saveMessageToSupabase(
    messageData: {
        whatsapp_phone_id: string; // ID do telefone do bot (identifica o tenant)
        from_number: string;       // NÚMERO ORIGINAL DO REMETENTE
        message_body: string;      // Conteúdo da mensagem
        direction: 'inbound' | 'outbound'; // Direção da mensagem
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
            console.log(`[SUPABASE] ✅ Mensagem salva: ${messageData.direction} de ${messageData.from_number}`);
        }
    } catch (error) {
        console.error(`[SUPABASE] ❌ Erro ao salvar mensagem no DB:`, error);
    }
}

// Wrapper para whatsapp.sendTextMessage que *também* salva a mensagem no histórico.
async function sendWhatsappMessageAndSaveHistory(
    customerPhoneNumber: string, // NÚMERO ORIGINAL DO CLIENTE
    text: string,
    supabaseUrl: string,
    supabaseAnonKey: string
) {
    // Formata o número SOMENTE PARA O ENVIO ao WhatsApp Meta API
    const formattedCustomerNumber = formatarNumeroWhatsAppParaEnvio(customerPhoneNumber);

    // Primeiro, envia a mensagem pelo WhatsApp API
    await whatsapp.sendTextMessage(formattedCustomerNumber, text);

    // Em seguida, salva a mensagem no Supabase, usando o NÚMERO ORIGINAL DO CLIENTE
    await saveMessageToSupabase(
        {
            whatsapp_phone_id: WHATSAPP_PHONE_NUMBER_ID || '', 
            from_number: WHATSAPP_PHONE_NUMBER_ID || '',     // O bot é o remetente
            message_body: text,                             
            direction: 'outbound',
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
    customerPhoneNumber: string, // NÚMERO ORIGINAL DO CLIENTE
    nomeFarmacia: string,
    supabaseUrl: string,
    supabaseAnonKey: string
) {
    // Formata o número SOMENTE PARA O ENVIO ao WhatsApp Meta API
    const formattedCustomerNumber = formatarNumeroWhatsAppParaEnvio(customerPhoneNumber);
    const url = `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
    
    console.log(`[MENU] 📱 Preparando menu para: ${formattedCustomerNumber}`);

    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formattedCustomerNumber, // Usa o número formatado para envio
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
        // Salvar a mensagem de saída (menu) na tabela whatsapp_messages, usando o NÚMERO ORIGINAL DO CLIENTE
        await saveMessageToSupabase(
            {
                whatsapp_phone_id: WHATSAPP_PHONE_NUMBER_ID || '', 
                from_number: WHATSAPP_PHONE_NUMBER_ID || '',     // O bot é o remetente
                message_body: payload.interactive.body.text,     
                direction: 'outbound',
            },
            supabaseUrl,
            supabaseAnonKey
        );
    }
}

// =========================================================================
// INTEGRAÇÕES (FLASK, GOOGLE, GEMINI)
// (Modificado consultarEstoqueFlask para mostrar laboratório, preço bruto e desconto)
// =========================================================================

async function consultarEstoqueFlask(termo: string, apiBase: string): Promise<string> {
    console.log(`[FLASK] 🔍 Buscando: "${termo}" em ${apiBase}`);
    try {
        const base = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
        if (!apiBase) {
            console.warn(`[FLASK] ⚠️ apiBase está vazia ou inválida, pulando consulta Flask.`);
            return '⚠️ Serviço de consulta de estoque indisponível. Por favor, contate o administrador.';
        }
        const res = await fetch(`${base}/api/products/search?q=${encodeURIComponent(termo)}`, { signal: AbortSignal.timeout(8000) });
        const data = await res.json();
        const produtos = data.data || [];

        if (produtos.length === 0) return `❌ Não encontrei "*${termo}*" em estoque agora.`;

        let resposta = `✅ *Produtos Encontrados:*\n\n`;
        produtos.slice(0, 3).forEach((p: any) => {
            const nomeProduto = p.nome_produto || 'Produto sem nome';
            const nomLaboratorio = p.nom_laboratorio || 'Laboratório não informado';
            const precoBruto = parseFloat(p.preco_bruto) || 0;
            const precoFinalVenda = parseFloat(p.preco_final_venda) || 0;
            const qtdEstoque = p.qtd_estoque !== undefined ? p.qtd_estoque : '0';

            resposta += `▪️ *${nomeProduto}*\n`;
            resposta += `   💊 ${nomLaboratorio}\n`;
            
            if (precoBruto > precoFinalVenda && precoBruto > 0) {
                const descontoPercentual = ((precoBruto - precoFinalVenda) / precoBruto) * 100;
                resposta += `   💰 De R$ ${precoBruto.toFixed(2).replace('.', ',')} por *R$ ${precoFinalVenda.toFixed(2).replace('.', ',')}* (🔻${descontoPercentual.toFixed(1).replace('.', ',')}% OFF)\n`;
            } else {
                resposta += `   💰 Preço: R$ ${precoFinalVenda.toFixed(2).replace('.', ',')}\n`;
            }
            resposta += `   📦 Estoque: ${qtdEstoque} unidades\n\n`;
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

async function processarFluxoPrincipal(
    originalCustomerPhoneNumber: string, // NOVO: Captura o número original aqui
    msg: any,
    phoneId: string,
    supabaseUrl: string,
    supabaseAnonKey: string
) {
    const textoUsuario = msg.text?.body?.trim();
    const textoLimpo = textoUsuario?.toLowerCase();
    const cliqueBotao = msg.interactive?.button_reply?.id;

    console.log(`\n[RASTREAMENTO] 📥 Msg de ${originalCustomerPhoneNumber}: ${textoUsuario || '[Botão: ' + cliqueBotao + ']'}`);

    // NOVO: Salvar mensagem de entrada na tabela whatsapp_messages (AGORA USANDO O NÚMERO ORIGINAL)
    if (msg) {
        await saveMessageToSupabase(
            {
                whatsapp_phone_id: phoneId,
                from_number: originalCustomerPhoneNumber, // CORREÇÃO AQUI: USA O NÚMERO ORIGINAL DO CLIENTE
                message_body: textoUsuario || JSON.stringify(msg), 
                direction: 'inbound',
            },
            supabaseUrl,
            supabaseAnonKey
        );
    }

    // 1. Identificação Multitenant via Supabase (AJUSTADO para API Flask mais robusta)
    let apiFlask: string = process.env.FLASK_API_URL || '';
    let nomeFarmacia = 'Nossa Farmácia';

    try {
        const resDB = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/client_connections?whatsapp_phone_id=eq.${phoneId}&select=*`, {
            headers: { 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` }
        });
        const farmacias = await resDB.json();
        if (farmacias?.[0]) {
            apiFlask = farmacias[0].api_base_url || apiFlask; 
            nomeFarmacia = farmacias[0].name || nomeFarmacia;
        }
    } catch (e) { 
        console.error("[SUPABASE] ❌ Erro de conexão ao buscar client_connections:", e);
    }

    // 2. Fluxo de Entrada (Saudações)
    const saudacoes = ['oi', 'ola', 'olá', 'menu', 'inicio', 'bom dia', 'boa tarde', 'boa noite'];
    if (textoLimpo && saudacoes.includes(textoLimpo) && !cliqueBotao) {
        console.log(`[ESTADO] 🔄 Saudação. Enviando menu.`);
        cacheEstados.delete(originalCustomerPhoneNumber); // Usa o número original para o cache
        await enviarMenuBoasVindas(originalCustomerPhoneNumber, nomeFarmacia, supabaseUrl, supabaseAnonKey);
        return;
    }

    // 3. Resposta ao Clique no Botão
    if (cliqueBotao) {
        console.log(`[ESTADO] 🎯 Usuário escolheu: ${cliqueBotao}`);
        cacheEstados.set(originalCustomerPhoneNumber, cliqueBotao); // Usa o número original para o cache
        
        let msgContexto = "";
        if (cliqueBotao === 'menu_estoque') msgContexto = "📦 *Consulta de Estoque*\n\nPor favor, digite o *nome do produto* que deseja consultar.";
        else if (cliqueBotao === 'menu_info') msgContexto = "📖 *Informação Médica*\n\nQual medicamento você quer pesquisar?";
        else if (cliqueBotao === 'menu_outros') msgContexto = "🤖 *Assistente Virtual*\n\nComo posso ajudar com outros assuntos?";

        await sendWhatsappMessageAndSaveHistory(originalCustomerPhoneNumber, msgContexto, supabaseUrl, supabaseAnonKey);
        return;
    }

    // 4. Execução baseada no Estado salvo
    const estadoAtual = cacheEstados.get(originalCustomerPhoneNumber); // Usa o número original para o cache
    console.log(`[ESTADO] 🧠 Estado de ${originalCustomerPhoneNumber}: ${estadoAtual || 'Sem Estado'}`);

    if (estadoAtual === 'menu_estoque') {
        const res = await consultarEstoqueFlask(textoUsuario, apiFlask); 
        cacheEstados.delete(originalCustomerPhoneNumber); // Limpa para a próxima interação ser livre
        await sendWhatsappMessageAndSaveHistory(originalCustomerPhoneNumber, res, supabaseUrl, supabaseAnonKey);
        return;
    }

    if (estadoAtual === 'menu_info') {
        const res = await consultarGoogleInfo(textoUsuario);
        cacheEstados.delete(originalCustomerPhoneNumber);
        await sendWhatsappMessageAndSaveHistory(originalCustomerPhoneNumber, res, supabaseUrl, supabaseAnonKey);
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
        await sendWhatsappMessageAndSaveHistory(originalCustomerPhoneNumber, textoIA || "Desculpe, não entendi. Digite 'menu' para ver as opções.", supabaseUrl, supabaseAnonKey);
    } catch (e) {
        await sendWhatsappMessageAndSaveHistory(originalCustomerPhoneNumber, "Olá! Como posso ajudar? Digite 'menu' para ver as opções principais.", supabaseUrl, supabaseAnonKey);
    }
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
        const value = body.entry?.[0]?.changes?.[0]?.value;
        const msg = value?.messages?.[0];
        const phoneId = value?.metadata?.phone_number_id;

        if (msg) {
            // CORREÇÃO: Passa o número original do remetente (msg.from)
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
