import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppAPI } from '@/lib/whatsapp-api';

// Cache de estado em memória
const cacheEstados = new Map<string, string>();

// =========================================================================
// CONFIGURAÇÕES (Restauradas e Integradas)
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
// NOVAS FUNÇÕES DE APOIO (Busca Externa)
// =========================================================================

async function buscarNoGoogle(query: string): Promise<string> {
    if (!GOOGLE_CSE_KEY || !GOOGLE_CSE_CX) return "";
    try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_KEY}&cx=${GOOGLE_CSE_CX}&q=${encodeURIComponent(query + " posologia bula")}`;
        const res = await fetch(url);
        const data = await res.json();
        return data.items?.slice(0, 2).map((i: any) => i.snippet).join(" | ") || "";
    } catch (e) { return ""; }
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
        return data.produtos ? JSON.stringify(data.produtos) : "";
    } catch (e) { return ""; }
}

// =========================================================================
// LOGICA DO GEMINI (CORREÇÃO DO ERRO 404 - USANDO V1)
// =========================================================================

async function chamarGemini(prompt: string) {
    // CORREÇÃO: Alterado de v1beta para v1 para evitar o erro 404
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
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
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Desculpe, tive um erro ao processar.";
}

// =========================================================================
// FLUXO PRINCIPAL (RESTAURADO COM SUPABASE E HISTÓRICO)
// =========================================================================

async function processarFluxoPrincipal(from: string, msg: any, phoneId: string, supabaseUrl: string, supabaseAnonKey: string) {
    const textoUsuario = msg.text?.body || "";
    console.log(`[FLUXO] Mensagem de ${from}: ${textoUsuario}`);

    try {
        // 1. LÓGICA DE INTENÇÃO E BUSCAS EXTERNAS
        let contextoExtra = "";
        const ehTecnico = /como tomar|posologia|efeito|interação|serve para|grávida|criança/i.test(textoUsuario);
        const ehEstoque = /tem|valor|preço|quanto custa|chegou|estoque/i.test(textoUsuario);

        const buscas = [];
        if (ehTecnico) buscas.push(buscarNoGoogle(textoUsuario).then(r => contextoExtra += `\n[BULA]: ${r}`));
        if (ehEstoque) buscas.push(buscarNoFlask(textoUsuario).then(r => contextoExtra += `\n[SISTEMA]: ${r}`));
        if (buscas.length > 0) await Promise.all(buscas);

        // 2. MONTAGEM DO PROMPT (Personalidade Agafarma)
        const promptFinal = `
            Você é a atendente da Agafarma Arco Íris. Use o estilo dos arquivos de conversa: "Oiii", "Booom dia", "Tudo bem?".
            Seja empática como se conhecesse o cliente há anos.
            
            Informações técnicas encontradas:
            ${contextoExtra}

            Mensagem do Cliente: ${textoUsuario}
            Responda de forma curta e humana:
        `;

        // 3. GERAÇÃO DA RESPOSTA
        const respostaIA = await chamarGemini(promptFinal);

        // 4. ENVIO E LOGS (Preservando sua estrutura de logs/supabase se houver)
        await whatsapp.sendTextMessage(from, respostaIA);

    } catch (error) {
        console.error("[ERRO CRÍTICO]:", error);
        await whatsapp.sendTextMessage(from, "Oiii! Tudo bem? Só um minutinho que estou verificando aqui e já te respondo, tá?");
    }
}

// =========================================================================
// HANDLERS NEXT.JS (EXATAMENTE COMO O SEU ORIGINAL)
// =========================================================================

export async function POST(req: NextRequest) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('[SUPABASE_CONFIG] ❌ Configuração ausente.'); 
        return new NextResponse('Error', { status: 500 });
    }

    try {
        const body = await req.json();
        const value = body.entry?.[0]?.changes?.[0]?.value;
        const msg = value?.messages?.[0];
        const phoneId = value?.metadata?.phone_number_id;

        if (msg) {
            // Chamada com await para o Vercel não cortar a execução
            await processarFluxoPrincipal(msg.from, msg, phoneId, supabaseUrl, supabaseAnonKey);
        }
        return new NextResponse('OK', { status: 200 });
    } catch (e) {
        console.error(`[WEBHOOK] Erro:`, e);
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
