import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppAPI } from '@/lib/whatsapp-api';

// =========================================================================
// 1. CONFIGURAÇÕES
// =========================================================================
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GOOGLE_CSE_KEY = process.env.CUSTOM_SEARCH_API_KEY; 
const GOOGLE_CSE_CX = process.env.CUSTOM_SEARCH_CX;
const FLASK_API_URL = process.env.FLASK_API_URL;

const whatsapp = new WhatsAppAPI({
    access_token: WHATSAPP_ACCESS_TOKEN || '',
    phone_number_id: WHATSAPP_PHONE_NUMBER_ID || '',
    webhook_verify_token: WHATSAPP_VERIFY_TOKEN || '',
    is_active: true,
    webhook_url: ''
});

// =========================================================================
// 2. FUNÇÕES DE BUSCA (API GOOGLE E FLASK)
// =========================================================================

async function buscarNoGoogle(query: string): Promise<string> {
    if (!GOOGLE_CSE_KEY || !GOOGLE_CSE_CX) return "";
    try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_KEY}&cx=${GOOGLE_CSE_CX}&q=${encodeURIComponent(query + " posologia bula")}`;
        const res = await fetch(url);
        const data = await res.json();
        return data.items?.slice(0, 2).map((i: any) => i.snippet).join(" | ") || "";
    } catch (e) {
        return "";
    }
}

async function buscarNoFlask(termo: string): Promise<string> {
    if (!FLASK_API_URL) return "";
    try {
        const res = await fetch(`${FLASK_API_URL}/api/chatbot/buscar-produto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ termo })
        });
        const data = await res.json();
        if (data.produtos && data.produtos.length > 0) {
            return `ESTOQUE DISPONÍVEL: ${JSON.stringify(data.produtos)}`;
        }
        return "Produto não encontrado no estoque.";
    } catch (e) {
        return "";
    }
}

// =========================================================================
// 3. LOGICA DO GEMINI (USANDO SUA FORMA QUE FUNCIONA)
// =========================================================================

async function chamarGemini(prompt: string) {
    // Usando a URL direta conforme seu arquivo original que funcionava
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Erro Gemini: ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Desculpe, não consegui processar.";
}

// =========================================================================
// 4. FLUXO PRINCIPAL
// =========================================================================

async function processarFluxoPrincipal(from: string, msg: any) {
    const textoUsuario = msg.text?.body || "";
    console.log(`[FLUXO] Mensagem de ${from}: ${textoUsuario}`);

    let contextoExtra = "";

    try {
        // Detecção de Intenção
        const ehTecnico = /como tomar|posologia|efeito|interação|serve para|grávida|criança/i.test(textoUsuario);
        const ehEstoque = /tem|valor|preço|quanto custa|chegou|estoque/i.test(textoUsuario);

        // Busca de dados em paralelo
        const buscas = [];
        if (ehTecnico) buscas.push(buscarNoGoogle(textoUsuario).then(r => r && (contextoExtra += `\n[INFO BULA]: ${r}`)));
        if (ehEstoque) buscas.push(buscarNoFlask(textoUsuario).then(r => r && (contextoExtra += `\n[SISTEMA FARMÁCIA]: ${r}`)));
        
        if (buscas.length > 0) await Promise.all(buscas);

        // Prompt Humanizado (Agafarma)
        const promptFinal = `
            Você é a atendente da Agafarma Arco Íris. Seja muito amigável (Oiii, Tudo bem?).
            Responda de forma curta para WhatsApp.
            
            Contexto importante das nossas APIs:
            ${contextoExtra}

            Pergunta do cliente: ${textoUsuario}
            
            Responda agora de forma humana:
        `;

        const respostaIA = await chamarGemini(promptFinal);
        await whatsapp.sendTextMessage(from, respostaIA);

    } catch (error) {
        console.error("[ERRO FLUXO]:", error);
        // Fallback simples
        await whatsapp.sendTextMessage(from, "Oiii! Tudo bem? Só um minutinho que já vou te responder, estamos com uma pequena instabilidade no sistema. Viu!");
    }
}

// =========================================================================
// 5. HANDLERS (NEXT.JS)
// =========================================================================

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const value = body.entry?.[0]?.changes?.[0]?.value;
        const msg = value?.messages?.[0];

        if (msg && msg.from) {
            await processarFluxoPrincipal(msg.from, msg);
        }
        return new NextResponse('OK', { status: 200 });
    } catch (e) {
        console.error("Erro POST:", e);
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
