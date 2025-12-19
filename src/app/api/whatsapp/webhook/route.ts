import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppAPI } from '@/lib/whatsapp-api';

// =========================================================================
// CONFIGURAÇÃO (MANTENDO SUAS VARIÁVEIS ORIGINAIS)
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
// SEUS DETECTORES ORIGINAIS (SEM NENHUMA ALTERAÇÃO)
// =========================================================================
const SAUDACOES = ['olá', 'ola', 'oi', 'hey', 'hello', 'hi', 'eae', 'opa', 'menu', 'inicio', 'início'];
const CONVERSA_BASICA = ['tudo bem', 'tudo bom', 'como vai', 'e aí', 'beleza', 'obrigado', 'tchau'];

function ehSaudacao(mensagem: string): boolean {
    const msgLimpa = mensagem.toLowerCase().replace(/[?!.,]/g, '').trim();
    return SAUDACOES.includes(msgLimpa);
}

function ehPerguntaMedicaOuMedicamento(mensagem: string): boolean {
    const msgMin = mensagem.toLowerCase();
    const palavrasChaveMedicas = ['posologia', 'dosagem', 'dose', 'para que serve', 'efeito colateral', 'como tomar', 'contraindicação'];
    return palavrasChaveMedicas.some(p => msgMin.includes(p));
}

function extrairTermoBuscaInteligente(mensagem: string): { buscar: boolean, termo: string } {
    let msgMin = mensagem.toLowerCase().trim();
    const stopWords = ['tem', 'gostaria', 'quero', 'preciso', 'buscar', 'preço', 'valor'];
    msgMin = msgMin.replace(/[?!.,]*$/, '');
    for (const word of stopWords) {
        if (msgMin.startsWith(word + ' ')) msgMin = msgMin.substring(word.length).trim();
    }
    if (ehSaudacao(msgMin) || ehPerguntaMedicaOuMedicamento(msgMin)) return { buscar: false, termo: '' };
    const palavras = msgMin.split(' ');
    if (palavras.length > 0 && palavras.length < 5) return { buscar: true, termo: msgMin };
    return { buscar: false, termo: '' };
}

// =========================================================================
// FUNÇÕES DE APOIO (MANTENDO SEU GEMINI REST E GOOGLE)
// =========================================================================

async function buscaGoogleFallback(consulta: string): Promise<string> {
    try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_KEY}&cx=${GOOGLE_CSE_CX}&q=${encodeURIComponent(consulta)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.items?.length) return '🔍 Não encontrei informações específicas.';
        return `💊 *Informação Técnica:* \n\n${data.items[0].snippet}\n\n🔗 *Fonte:* ${data.items[0].link}`;
    } catch (e) { return '⚠️ Erro na busca técnica.'; }
}

async function interpretarComGemini(mensagem: string): Promise<{ resposta: string, usarCSE: boolean }> {
    try {
        const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: `Você é um assistente de farmácia. Responda: ${mensagem}` }] }] })
        });
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        return { resposta: text || '', usarCSE: !text };
    } catch (e) { return { resposta: '', usarCSE: true }; }
}

// =========================================================================
// PROCESSO MULTITENANT E ESTOQUE (AS NOVIDADES)
// =========================================================================

async function buscarProdutoNaApi(termo: string, apiBase: string): Promise<string> {
    try {
        console.log(`[ESTOQUE] 🔍 Buscando "${termo}" em: ${apiBase}`);
        const res = await fetch(`${apiBase}/api/products/search?q=${encodeURIComponent(termo)}`, { signal: AbortSignal.timeout(5000) });
        const data = await res.json();
        if (!data.data?.length) return `🔍 Nenhum produto encontrado para "*${termo}*".`;
        
        let resposta = `🔍 *Resultados na Farmácia:*\n\n`;
        data.data.slice(0, 3).forEach((p: any) => {
            resposta += `▪️ *${p.nome_produto}*\n💰 R$ ${p.preco_final_venda}\n📦 Estoque: ${p.qtd_estoque}\n📋 Código: ${p.cod_reduzido}\n\n`;
        });
        return resposta;
    } catch (e) { return '⚠️ Erro ao consultar o estoque local.'; }
}

// =========================================================================
// FLUXO PRINCIPAL (RESTAURADO)
// =========================================================================

async function processarMensagemCompleta(de: string, texto: string, phoneId: string) {
    console.log(`\n--- PROCESSANDO: ${texto} ---`);
    
    // 1. Identifica a farmácia no Supabase para pegar a api_base_url
    const resDB = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/client_connections?whatsapp_phone_id=eq.${phoneId}&select=*`, {
        headers: { 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` }
    });
    const farmacias = await resDB.json();
    const farmacia = farmacias?.[0];
    const API_FLASK = farmacia?.api_base_url || process.env.FLASK_API_URL;

    // 2. Lógica Original
    if (ehSaudacao(texto)) {
        await whatsapp.sendTextMessage(de, `Olá! Bem-vindo à ${farmacia?.name || 'Farmácia'}. Como posso ajudar?`);
        return;
    }

    const { buscar, termo } = extrairTermoBuscaInteligente(texto);
    if (buscar) {
        const respostaEstoque = await buscarProdutoNaApi(termo, API_FLASK);
        await whatsapp.sendTextMessage(de, respostaEstoque);
        return;
    }

    if (ehPerguntaMedicaOuMedicamento(texto)) {
        const resGoogle = await buscaGoogleFallback(texto);
        await whatsapp.sendTextMessage(de, resGoogle);
        return;
    }

    const { resposta, usarCSE } = await interpretarComGemini(texto);
    if (usarCSE) {
        const fallback = await buscaGoogleFallback(texto);
        await whatsapp.sendTextMessage(de, fallback);
    } else {
        await whatsapp.sendTextMessage(de, resposta);
    }
}

// =========================================================================
// WEBHOOK HANDLERS (RESTAURADOS)
// =========================================================================

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const value = body.entry?.[0]?.changes?.[0]?.value;
        const msg = value?.messages?.[0];
        const phoneId = value?.metadata?.phone_number_id;

        if (msg && msg.type === 'text') {
            // USANDO O msg.from ORIGINAL QUE VOCÊ TRATAVA
            await processarMensagemCompleta(msg.from, msg.text.body, phoneId);
        }
        return new NextResponse('OK', { status: 200 });
    } catch (e) { return new NextResponse('Erro', { status: 500 }); }
}

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    if (searchParams.get('hub.verify_token') === WHATSAPP_VERIFY_TOKEN) {
        return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
    }
    return new NextResponse('Erro', { status: 403 });
}
