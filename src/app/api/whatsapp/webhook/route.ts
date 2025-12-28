import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppAPI } from '@/lib/whatsapp-api';
import { GoogleGenerativeAI } from "@google/generative-ai";

// =========================================================================
// 1. CONFIGURAÇÕES E INICIALIZAÇÃO
// =========================================================================
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GOOGLE_CSE_KEY = process.env.CUSTOM_SEARCH_API_KEY; 
const GOOGLE_CSE_CX = process.env.CUSTOM_SEARCH_CX;
const FLASK_API_URL = process.env.FLASK_API_URL;

// CORREÇÃO: Inicialização robusta do Gemini
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || "");
// Usando 'gemini-1.5-flash' ou 'gemini-pro' conforme disponibilidade da sua chave
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const whatsapp = new WhatsAppAPI({
    access_token: WHATSAPP_ACCESS_TOKEN || '',
    phone_number_id: WHATSAPP_PHONE_NUMBER_ID || '',
    webhook_verify_token: WHATSAPP_VERIFY_TOKEN || '',
    is_active: true,
    webhook_url: ''
});

// =========================================================================
// 2. FUNÇÕES DE SUPORTE (APIs Externas)
// =========================================================================

async function buscarNoGoogle(query: string): Promise<string> {
    if (!GOOGLE_CSE_KEY || !GOOGLE_CSE_CX) return "Busca técnica não configurada.";
    try {
        console.log(`[GOOGLE] Buscando: ${query}`);
        const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_KEY}&cx=${GOOGLE_CSE_CX}&q=${encodeURIComponent(query + " posologia bula")}`;
        const res = await fetch(url);
        const data = await res.json();
        return data.items?.slice(0, 2).map((i: any) => i.snippet).join(" | ") || "Sem dados adicionais.";
    } catch (e) {
        return "Erro ao acessar bula online.";
    }
}

async function buscarNoFlask(termo: string): Promise<string> {
    if (!FLASK_API_URL) return "Estoque não configurado.";
    try {
        console.log(`[FLASK] Buscando: ${termo}`);
        const res = await fetch(`${FLASK_API_URL}/api/chatbot/buscar-produto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ termo })
        });
        const data = await res.json();
        if (data.produtos && data.produtos.length > 0) {
            return `ESTOQUE: ${JSON.stringify(data.produtos)}`;
        }
        return "Produto não encontrado no sistema.";
    } catch (e) {
        return "Erro ao consultar sistema da farmácia.";
    }
}

// =========================================================================
// 3. FLUXO PRINCIPAL (Orquestrador)
// =========================================================================

async function processarFluxoPrincipal(from: string, msg: any) {
    const textoUsuario = msg.text?.body || "";
    console.log(`[FLUXO] Início para ${from}: "${textoUsuario}"`);

    let contextoExtra = "";

    try {
        // Detecção de Intenção
        const ehTecnico = /como tomar|posologia|efeito|interação|serve para|grávida|criança/i.test(textoUsuario);
        const ehEstoque = /tem|valor|preço|quanto custa|chegou|estoque/i.test(textoUsuario);

        const promessas = [];
        if (ehTecnico) promessas.push(buscarNoGoogle(textoUsuario).then(r => contextoExtra += `\n[GOOGLE]: ${r}`));
        if (ehEstoque) promessas.push(buscarNoFlask(textoUsuario).then(r => contextoExtra += `\n[FLASK]: ${r}`));
        
        if (promessas.length > 0) await Promise.all(promessas);

        const promptSistema = `
            Você é a atendente humana da Agafarma Arco Íris. 
            Estilo: Amigável, usa "Oiii", "Booom dia", "Tudo bem com você?".
            Use as informações das APIs abaixo para responder, mas fale de forma natural no WhatsApp.
            Se for posologia, avise para consultar o médico.
            Se não tiver a informação, diga que vai confirmar no balcão em 1 minuto.

            DADOS DAS APIS:
            ${contextoExtra}
        `;

        console.log("[GEMINI] Solicitando resposta...");
        const result = await model.generateContent(promptSistema + "\n\nCliente disse: " + textoUsuario);
        const response = await result.response;
        const respostaFinal = response.text();

        console.log("[WHATSAPP] Enviando resposta...");
        await whatsapp.sendTextMessage(from, respostaFinal);

    } catch (error: any) {
        console.error("[ERRO CRÍTICO]", error.message);
        // Resposta de segurança para o cliente
        await whatsapp.sendTextMessage(from, "Oiii! Tudo bem? Só um minutinho que estou verificando aqui no sistema e já te respondo, tá? Viu!");
    }
}

// =========================================================================
// 4. HANDLERS NEXT.JS
// =========================================================================

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const value = body.entry?.[0]?.changes?.[0]?.value;
        const msg = value?.messages?.[0];

        if (msg && msg.from) {
            // Await garantindo que o Vercel processe antes de fechar a conexão
            await processarFluxoPrincipal(msg.from, msg);
        }
        return new NextResponse('OK', { status: 200 });
    } catch (e) {
        return new NextResponse('OK', { status: 200 });
    }
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    if (searchParams.get('hub.mode') === 'subscribe' && searchParams.get('hub.verify_token') === WHATSAPP_VERIFY_TOKEN) {
        return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
    }
    return new NextResponse('Forbidden', { status: 403 });
}
