import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppAPI } from '@/lib/whatsapp-api';

// Cache de estado para persistir a intenção do usuário
const cacheEstados = new Map<string, string>();

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
// FUNÇÕES DE LOG E MENU
// =========================================================================

async function enviarMenuBoasVindas(de: string, nomeFarmacia: string) {
    console.log(`[MENU] 📱 Enviando menu de botões para: ${de}`);
    const url = `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const payload = {
        messaging_product: "whatsapp",
        to: de,
        type: "interactive",
        interactive: {
            type: "button",
            header: { type: "text", text: `Atendimento ${nomeFarmacia}` },
            body: { text: "Olá! Como posso ajudar você hoje?\nEscolha uma opção para começar:" },
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
    console.log(`[MENU] 📡 Status da resposta do Menu: ${res.status}`);
}

// =========================================================================
// INTEGRAÇÕES COM LOGS DETALHADOS
// =========================================================================

async function consultarEstoqueFlask(termo: string, apiBase: string): Promise<string> {
    console.log(`[FLASK] 🔍 Iniciando busca de produto: "${termo}" em ${apiBase}`);
    try {
        const base = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
        const url = `${base}/api/products/search?q=${encodeURIComponent(termo)}`;
        
        const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
        console.log(`[FLASK] 📡 API retornou status: ${res.status}`);
        
        const data = await res.json();
        const produtos = data.data || [];
        console.log(`[FLASK] 📦 Encontrados ${produtos.length} produtos.`);

        if (produtos.length === 0) return `❌ Não encontrei "*${termo}*" em estoque.`;

        let resposta = `✅ *Produtos Disponíveis:*\n\n`;
        produtos.slice(0, 3).forEach((p: any) => {
            resposta += `▪️ *${p.nome_produto}*\n💰 Preço: R$ ${p.preco_final_venda}\n📦 Estoque: ${p.qtd_estoque}\n\n`;
        });
        return resposta;
    } catch (e) {
        console.error(`[FLASK] ❌ Erro na consulta Flask:`, e);
        return '⚠️ Erro técnico ao consultar estoque.';
    }
}

async function consultarGoogle(pergunta: string): Promise<string> {
    console.log(`[GOOGLE] 🌐 Buscando informação médica para: "${pergunta}"`);
    try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_KEY}&cx=${GOOGLE_CSE_CX}&q=${encodeURIComponent(pergunta)}`;
        const res = await fetch(url);
        const data = await res.json();
        console.log(`[GOOGLE] ✅ Busca concluída. Itens retornados: ${data.items?.length || 0}`);
        
        if (!data.items?.length) return '🔍 Nenhuma informação técnica encontrada.';
        return `💊 *Informação Técnica:* \n\n${data.items[0].snippet}`;
    } catch (e) {
        console.error(`[GOOGLE] ❌ Erro Google CSE:`, e);
        return '⚠️ Erro na busca técnica.';
    }
}

// =========================================================================
// ORQUESTRADOR DE FLUXO COM RASTREAMENTO
// =========================================================================

async function processarFluxo(de: string, msg: any, phoneId: string) {
    const textoUsuario = msg.text?.body?.trim();
    const textoLimpo = textoUsuario?.toLowerCase();
    const cliqueBotao = msg.interactive?.button_reply?.id;

    console.log(`\n[RASTREAMENTO] 📥 Nova mensagem de: ${de}`);
    console.log(`[RASTREAMENTO] 📞 PhoneID Receptor: ${phoneId}`);
    console.log(`[RASTREAMENTO] 💬 Conteúdo: ${textoUsuario || '[Botão: ' + cliqueBotao + ']'}`);

    // 1. Log de Conexão Supabase
    let apiFlask = process.env.FLASK_API_URL || '';
    let nomeFarmacia = 'Nossa Farmácia';
    try {
        console.log(`[SUPABASE] 📡 Identificando cliente para PhoneID: ${phoneId}`);
        const resDB = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/client_connections?whatsapp_phone_id=eq.${phoneId}&select=*`, {
            headers: { 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` }
        });
        const farmacias = await resDB.json();
        if (farmacias?.[0]) {
            apiFlask = farmacias[0].api_base_url;
            nomeFarmacia = farmacias[0].name || nomeFarmacia;
            console.log(`[SUPABASE] ✅ Farmácia Identificada: ${nomeFarmacia} | API: ${apiFlask}`);
        } else {
            console.warn(`[SUPABASE] ⚠️ Nenhuma farmácia mapeada para este ID. Usando padrão.`);
        }
    } catch (e) { console.error("[SUPABASE] ❌ Erro ao conectar:", e); }

    // 2. Identificação de Saudação
    const saudacoes = ['oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'menu', 'inicio'];
    if (textoLimpo && saudacoes.includes(textoLimpo) && !cliqueBotao) {
        console.log(`[ESTADO] 🔄 Saudação detectada. Resetando cache e enviando menu.`);
        cacheEstados.delete(de);
        await enviarMenuBoasVindas(de, nomeFarmacia);
        return;
    }

    // 3. Processamento de Cliques (Botões)
    if (cliqueBotao) {
        console.log(`[ESTADO] 🎯 Usuário clicou no botão: ${cliqueBotao}`);
        cacheEstados.set(de, cliqueBotao);
        
        let msgResposta = "";
        if (cliqueBotao === 'menu_estoque') msgResposta = "📦 *Consulta de Estoque*\n\nDigite o nome do produto:";
        else if (cliqueBotao === 'menu_info') msgResposta = "📖 *Informação Médica*\n\nSobre qual medicamento quer saber?";
        else if (cliqueBotao === 'menu_outros') msgResposta = "🤖 *Assistente Virtual*\n\nComo posso ajudar?";

        await whatsapp.sendTextMessage(de, msgResposta);
        return;
    }

    // 4. Lógica Baseada no Estado Anterior
    const estado = cacheEstados.get(de);
    console.log(`[ESTADO] 🧠 Estado atual do usuário ${de}: ${estado || 'NENHUM'}`);

    if (estado === 'menu_estoque') {
        const res = await consultarEstoqueFlask(textoUsuario, apiFlask);
        cacheEstados.delete(de); // Limpa para não travar no loop
        await whatsapp.sendTextMessage(de, res);
        return;
    }

    if (estado === 'menu_info') {
        const res = await consultarGoogle(textoUsuario);
        cacheEstados.delete(de);
        await whatsapp.sendTextMessage(de, res);
        return;
    }

    // 5. Fallback para Gemini (Conversa fiada)
    console.log(`[GEMINI] 🤖 Encaminhando para IA...`);
    try {
        const resGemini = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: `Responda como atendente: ${textoUsuario}` }] }] })
        });
        const data = await resGemini.json();
        const textoIA = data.candidates?.[0]?.content?.parts?.[0]?.text;
        await whatsapp.sendTextMessage(de, textoIA || "Pode repetir? Ou mande 'menu'.");
    } catch (e) {
        console.error(`[GEMINI] ❌ Erro:`, e);
        await whatsapp.sendTextMessage(de, "Tive um erro na IA. Tente digitar 'menu'.");
    }
}

// =========================================================================
// WEBHOOK HANDLER
// =========================================================================

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        console.log(`[WEBHOOK] 📦 Payload recebido.`);
        
        const value = body.entry?.[0]?.changes?.[0]?.value;
        const msg = value?.messages?.[0];
        const phoneId = value?.metadata?.phone_number_id;

        if (msg) {
            await processarFluxo(msg.from, msg, phoneId);
        } else {
            console.log(`[WEBHOOK] ℹ️ Notificação recebida (status/read), ignorando.`);
        }
        
        return new NextResponse('OK', { status: 200 });
    } catch (e) {
        console.error(`[WEBHOOK] ❌ Erro Crítico:`, e);
        return new NextResponse('OK', { status: 200 });
    }
}

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    console.log(`[VERIFY] 🔐 Tentativa de verificação do Webhook.`);
    if (searchParams.get('hub.verify_token') === WHATSAPP_VERIFY_TOKEN) {
        console.log(`[VERIFY] ✅ Verificado com sucesso!`);
        return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
    }
    return new NextResponse('Erro', { status: 403 });
}
