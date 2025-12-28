import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppAPI } from '@/lib/whatsapp-api';
import { GoogleGenerativeAI } from "@google/generative-ai";

// =========================================================================
// CONFIGURAÇÕES E INICIALIZAÇÃO
// =========================================================================
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GOOGLE_CSE_KEY = process.env.CUSTOM_SEARCH_API_KEY; 
const GOOGLE_CSE_CX = process.env.CUSTOM_SEARCH_CX;
const FLASK_API_URL = process.env.FLASK_API_URL; // Ex: http://seu-ip:5000

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const whatsapp = new WhatsAppAPI({
    access_token: WHATSAPP_ACCESS_TOKEN || '',
    phone_number_id: WHATSAPP_PHONE_NUMBER_ID || '',
    webhook_verify_token: WHATSAPP_VERIFY_TOKEN || '',
    is_active: true,
    webhook_url: ''
});

// Cache de estado (conforme seu original)
const cacheEstados = new Map<string, string>();

// =========================================================================
// FUNÇÕES DE APOIO (INTEGRAÇÃO COM APIS)
// =========================================================================

async function buscarNoGoogle(query: string): Promise<string> {
    try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_KEY}&cx=${GOOGLE_CSE_CX}&q=${encodeURIComponent(query + " posologia bula")}`;
        const res = await fetch(url);
        const data = await res.json();
        return data.items?.slice(0, 2).map((i: any) => i.snippet).join(" | ") || "Informação técnica não encontrada.";
    } catch (e) {
        console.error("Erro Google Search:", e);
        return "Busca técnica indisponível.";
    }
}

async function buscarNoFlask(termo: string): Promise<string> {
    try {
        const res = await fetch(`${FLASK_API_URL}/api/chatbot/buscar-produto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ termo })
        });
        const data = await res.json();
        if (data.produtos && data.produtos.length > 0) {
            return `Resultados no estoque: ${JSON.stringify(data.produtos)}`;
        }
        return "Produto não encontrado no estoque atual.";
    } catch (e) {
        console.error("Erro API Flask:", e);
        return "Erro ao consultar estoque.";
    }
}

// =========================================================================
// LÓGICA DO AGENTE HUMANIZADO
// =========================================================================

async function processarFluxoPrincipal(from: string, msg: any) {
    const textoUsuario = msg.text?.body || "";
    let contextoExtra = "";

    // 1. Identificação de Intenção e Busca de Dados
    const ehDuvidaTecnica = /como tomar|posologia|efeito|interação|serve para|grávida|criança/i.test(textoUsuario);
    const ehDuvidaEstoque = /tem|valor|preço|quanto custa|chegou|estoque/i.test(textoUsuario);

    // Execução paralela para performance (Promise.all)
    const buscas = [];
    if (ehDuvidaTecnica) buscas.push(buscarNoGoogle(textoUsuario).then(res => contextoExtra += `\n[BULA/GOOGLE]: ${res}`));
    if (ehDuvidaEstoque) buscas.push(buscarNoFlask(textoUsuario).then(res => contextoExtra += `\n[ESTOQUE/FLASK]: ${res}`));
    
    await Promise.all(buscas);

    // 2. Prompt com Personalidade Agafarma (Baseado nos seus TXTs)
    const promptSistema = `
        Você é a atendente da Agafarma Arco Íris. Responda de forma humana, empática e prestativa.
        Use saudações como "Oiii", "Booom dia", "Tudo bem?".
        
        REGRAS DE OURO:
        - Se houver dados de [ESTOQUE], informe o preço e disponibilidade.
        - Se houver dados de [BULA], resuma de forma simples e adicione: "Lembrando que é importante seguir a orientação do seu médico, viu?".
        - Se o produto não for encontrado, diga que vai verificar com a distribuidora.
        - Se o cliente for recorrente (como Sr. Janes, Marli, Paulo), seja ainda mais próximo.
        - Mantenha a resposta curta e amigável (estilo WhatsApp).

        CONTEXTO DAS APIS:
        ${contextoExtra}
    `;

    // 3. Geração de Resposta com Gemini
    try {
        const result = await model.generateContent([promptSistema, textoUsuario]);
        const respostaIA = result.response.text();

        // 4. Envio via WhatsApp
        await whatsapp.sendTextMessage(from, respostaIA);
    } catch (error) {
        console.error("Erro Gemini/WhatsApp:", error);
    }
}

// =========================================================================
// HANDLERS DA ROTA (NEXT.JS)
// =========================================================================

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const value = body.entry?.[0]?.changes?.[0]?.value;
        const msg = value?.messages?.[0];

        if (msg && msg.from) {
            // Chamada do fluxo (sem travar a resposta do webhook)
            processarFluxoPrincipal(msg.from, msg);
        }

        return new NextResponse('OK', { status: 200 });
    } catch (e) {
        console.error(`[WEBHOOK] Erro:`, e);
        return new NextResponse('OK', { status: 200 });
    }
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
        return new NextResponse(challenge, { status: 200 });
    }
    return new NextResponse('Forbidden', { status: 403 });
}
