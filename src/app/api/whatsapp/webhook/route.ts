import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppAPI } from '@/lib/whatsapp-api';
import { GoogleGenerativeAI } from "@google/generative-ai";

// =========================================================================
// 1. CONFIGURAÇÕES E INICIALIZAÇÃO (Revisado)
// =========================================================================
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GOOGLE_CSE_KEY = process.env.CUSTOM_SEARCH_API_KEY; 
const GOOGLE_CSE_CX = process.env.CUSTOM_SEARCH_CX;
const FLASK_API_URL = process.env.FLASK_API_URL;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const whatsapp = new WhatsAppAPI({
    access_token: WHATSAPP_ACCESS_TOKEN || '',
    phone_number_id: WHATSAPP_PHONE_NUMBER_ID || '',
    webhook_verify_token: WHATSAPP_VERIFY_TOKEN || '',
    is_active: true,
    webhook_url: ''
});

// Cache de estado em memória (Mantido do seu original)
const cacheEstados = new Map<string, string>();

// =========================================================================
// 2. FUNÇÕES DE SUPORTE (Com tratamento de erro granulado)
// =========================================================================

async function buscarNoGoogle(query: string): Promise<string> {
    if (!GOOGLE_CSE_KEY || !GOOGLE_CSE_CX) return "Configuração Google ausente.";
    try {
        console.log(`[GOOGLE] Buscando: ${query}`);
        const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_KEY}&cx=${GOOGLE_CSE_CX}&q=${encodeURIComponent(query + " posologia bula")}`;
        const res = await fetch(url);
        const data = await res.json();
        const snippet = data.items?.slice(0, 2).map((i: any) => i.snippet).join(" | ");
        return snippet || "Informação não encontrada.";
    } catch (e) {
        console.error("[GOOGLE] Erro:", e);
        return "Erro na busca Google.";
    }
}

async function buscarNoFlask(termo: string): Promise<string> {
    if (!FLASK_API_URL) return "URL Flask não configurada.";
    try {
        console.log(`[FLASK] Consultando produto: ${termo}`);
        const res = await fetch(`${FLASK_API_URL}/api/chatbot/buscar-produto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ termo })
        });
        const data = await res.json();
        if (data.produtos && data.produtos.length > 0) {
            return `Resultados no estoque: ${JSON.stringify(data.produtos)}`;
        }
        return "Produto não localizado no estoque.";
    } catch (e) {
        console.error("[FLASK] Erro:", e);
        return "Erro na consulta Flask.";
    }
}

// =========================================================================
// 3. FLUXO PRINCIPAL (Orquestrador)
// =========================================================================

async function processarFluxoPrincipal(from: string, msg: any) {
    const textoUsuario = msg.text?.body || "";
    console.log(`[FLUXO] Iniciando para ${from}: "${textoUsuario}"`);

    let contextoExtra = "";

    try {
        // Detecção de Intenção (Foco Humano)
        const ehDuvidaTecnica = /como tomar|posologia|efeito|interação|serve para|grávida|criança/i.test(textoUsuario);
        const ehDuvidaEstoque = /tem|valor|preço|quanto custa|chegou|estoque/i.test(textoUsuario);

        // Execução paralela (Zero Trust/Performance)
        const promessas = [];
        if (ehDuvidaTecnica) promessas.push(buscarNoGoogle(textoUsuario).then(r => contextoExtra += `\n[GOOGLE]: ${r}`));
        if (ehDuvidaEstoque) promessas.push(buscarNoFlask(textoUsuario).then(r => contextoExtra += `\n[FLASK]: ${r}`));
        
        if (promessas.length > 0) await Promise.all(promessas);

        // Prompt de Personalidade baseado nos seus arquivos TXT
        const promptSistema = `
            Você é a atendente da Agafarma Arco Íris. Use um tom caloroso (Oiii, Booom dia, Tudo bem?).
            Responda de forma curta e prática para WhatsApp.
            
            DIRETRIZES:
            - Use os dados de [FLASK] para preços e estoque.
            - Use os dados de [GOOGLE] para posologia, mas sempre diga para seguir o médico.
            - Se não tiver dados, diga que vai confirmar no balcão e já avisa.
            - Estilo de escrita: "Oiii!", "Viu,", "Tá bem?".

            CONTEXTO RECENTE:
            ${contextoExtra}
        `;

        // Chamada Gemini
        console.log("[GEMINI] Gerando resposta...");
        const result = await model.generateContent([promptSistema, textoUsuario]);
        const respostaIA = result.response.text();

        // Envio WhatsApp
        console.log("[WHATSAPP] Enviando mensagem...");
        await whatsapp.sendTextMessage(from, respostaIA);
        console.log("[SUCESSO] Fluxo concluído.");

    } catch (error) {
        console.error("[FLUXO] Erro crítico:", error);
        // Fallback para não deixar o cliente no vácuo
        await whatsapp.sendTextMessage(from, "Oii! Tive um probleminha no sistema, mas já estou verificando para você, só um minutinho! 🙏");
    }
}

// =========================================================================
// 4. HANDLERS NEXT.JS (Sua estrutura original preservada)
// =========================================================================

export async function POST(req: NextRequest) {
    console.log("[WEBHOOK] Recebido POST");
    try {
        const body = await req.json();
        
        // Validação básica do corpo do WhatsApp
        const value = body.entry?.[0]?.changes?.[0]?.value;
        const msg = value?.messages?.[0];

        if (msg && msg.from) {
            // Importante: await aqui para garantir que o Vercel não mate a execução
            await processarFluxoPrincipal(msg.from, msg);
        }

        return new NextResponse('OK', { status: 200 });
    } catch (e) {
        console.error(`[WEBHOOK] Erro no processamento:`, e);
        return new NextResponse('OK', { status: 200 });
    }
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
        console.log("[WEBHOOK] Verificação de Token OK");
        return new NextResponse(challenge, { status: 200 });
    }
    return new NextResponse('Forbidden', { status: 403 });
}
