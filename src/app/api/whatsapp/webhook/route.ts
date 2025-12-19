import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppAPI } from '@/lib/whatsapp-api';

// =========================================================================
// CONFIGURAÇÃO DE AMBIENTE
// =========================================================================
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GOOGLE_CSE_KEY = process.env.CUSTOM_SEARCH_API_KEY;
const GOOGLE_CSE_CX = process.env.CUSTOM_SEARCH_CX;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const whatsapp = new WhatsAppAPI({
    access_token: WHATSAPP_ACCESS_TOKEN || '',
    phone_number_id: WHATSAPP_PHONE_NUMBER_ID || '',
    webhook_verify_token: WHATSAPP_VERIFY_TOKEN || '',
    is_active: true,
    webhook_url: ''
});

// =========================================================================
// DETECTORES DE INTENÇÃO
// =========================================================================
const SAUDACOES = ['olá', 'ola', 'oi', 'hey', 'hello', 'hi', 'eae', 'opa', 'menu', 'inicio', 'início'];

function ehSaudacao(mensagem: string): boolean {
    const msgLimpa = mensagem.toLowerCase().replace(/[?!.,]/g, '').trim();
    return SAUDACOES.includes(msgLimpa);
}

function ehPerguntaMedica(mensagem: string): boolean {
    const msgMin = mensagem.toLowerCase();
    const termos = ['posologia', 'dosagem', 'dose', 'para que serve', 'efeito colateral', 'como tomar', 'contraindicação', 'indicação'];
    return termos.some(t => msgMin.includes(t));
}

function extrairTermoBusca(mensagem: string): { buscar: boolean, termo: string } {
    let msgMin = mensagem.toLowerCase().trim().replace(/[?!.,]*$/, '');
    const stopWords = ['tem', 'gostaria', 'quero', 'preciso', 'buscar', 'preço', 'valor', 'estoque'];
    
    let termo = msgMin;
    for (const word of stopWords) {
        if (termo.startsWith(word + ' ')) {
            termo = termo.substring(word.length).trim();
        }
    }

    if (ehSaudacao(msgMin) || ehPerguntaMedica(msgMin)) return { buscar: false, termo: '' };
    
    // Se a mensagem for curta (1 a 4 palavras), assume que é busca de produto
    const palavras = termo.split(' ');
    if (palavras.length > 0 && palavras.length < 5) return { buscar: true, termo };
    
    return { buscar: false, termo: '' };
}

// =========================================================================
// INTEGRAÇÕES EXTERNAS (GEMINI, GOOGLE, FLASK)
// =========================================================================

async function interpretarComGemini(mensagem: string): Promise<{ resposta: string, usarCSE: boolean }> {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `Você é um assistente de farmácia amigável. Responda: ${mensagem}` }] }],
                safetySettings: [{ category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }]
            })
        });
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        return { resposta: text || '', usarCSE: !text };
    } catch (e) {
        return { resposta: '', usarCSE: true };
    }
}

async function buscaGoogleFallback(consulta: string): Promise<string> {
    try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_KEY}&cx=${GOOGLE_CSE_CX}&q=${encodeURIComponent(consulta)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.items?.length) return '🔍 Não encontrei informações específicas no momento.';
        return `💊 *Informação Técnica:* \n\n${data.items[0].snippet}\n\n_Consulte sempre um médico._`;
    } catch (e) {
        return '⚠️ Serviço de busca técnica temporariamente indisponível.';
    }
}

async function buscarProdutoNaApi(termo: string, apiBase: string): Promise<string> {
    try {
        const baseLimpa = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
        const res = await fetch(`${baseLimpa}/api/products/search?q=${encodeURIComponent(termo)}`, { 
            signal: AbortSignal.timeout(8000) 
        });
        const data = await res.json();
        const produtos = data.data || [];

        if (produtos.length === 0) return `🔍 Não encontramos "*${termo}*" em estoque.`;

        let resposta = `🔍 *Resultados:* \n\n`;
        produtos.slice(0, 3).forEach((p: any) => {
            resposta += `▪️ *${p.nome_produto}*\n💰 R$ ${p.preco_final_venda}\n📦 Estoque: ${p.qtd_estoque}\n📋 Cód: ${p.cod_reduzido}\n\n`;
        });
        return resposta;
    } catch (e) {
        return '⚠️ Erro ao acessar o estoque da loja.';
    }
}

// =========================================================================
// FLUXO PRINCIPAL
// =========================================================================

async function processarMensagemCompleta(de: string, texto: string, phoneId: string) {
    console.log(`[LOG] Mensagem de ${de}: ${texto}`);

    // 1. Identificar Farmácia (Multi-tenant)
    let apiFlask = process.env.FLASK_API_URL || '';
    let nomeFarmacia = 'Farmácia';

    try {
        const resDB = await fetch(`${SUPABASE_URL}/rest/v1/client_connections?whatsapp_phone_id=eq.${phoneId}&select=*`, {
            headers: { 'apikey': SUPABASE_KEY!, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        const farmacias = await resDB.json();
        if (farmacias?.[0]) {
            apiFlask = farmacias[0].api_base_url;
            nomeFarmacia = farmacias[0].name || nomeFarmacia;
        }
    } catch (e) { console.error("Erro Supabase:", e); }

    // 2. Orquestração de Resposta
    if (ehSaudacao(texto)) {
        return await whatsapp.sendTextMessage(de, `Olá! Bem-vindo à *${nomeFarmacia}*. Como posso ajudar?`);
    }

    // 3. Busca de Produto
    const busca = extrairTermoBusca(texto);
    if (busca.buscar && apiFlask) {
        const estoque = await buscarProdutoNaApi(busca.termo, apiFlask);
        return await whatsapp.sendTextMessage(de, estoque);
    }

    // 4. Pergunta Médica Direta
    if (ehPerguntaMedica(texto)) {
        const info = await buscaGoogleFallback(texto);
        return await whatsapp.sendTextMessage(de, info);
    }

    // 5. Conversa Geral (Gemini) com Fallback
    const ai = await interpretarComGemini(texto);
    if (ai.usarCSE || !ai.resposta) {
        const fallback = await buscaGoogleFallback(texto);
        await whatsapp.sendTextMessage(de, fallback);
    } else {
        await whatsapp.sendTextMessage(de, ai.resposta);
    }
}

// =========================================================================
// HANDLERS
// =========================================================================

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const value = body.entry?.[0]?.changes?.[0]?.value;
        const msg = value?.messages?.[0];
        const phoneId = value?.metadata?.phone_number_id;

        if (msg?.type === 'text' && phoneId) {
            await processarMensagemCompleta(msg.from, msg.text.body, phoneId);
        }
        return new NextResponse('OK', { status: 200 });
    } catch (e) {
        return new NextResponse('OK', { status: 200 }); // Evita que o Meta reenvie a mesma msg em caso de erro
    }
}

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    if (searchParams.get('hub.verify_token') === WHATSAPP_VERIFY_TOKEN) {
        return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
    }
    return new NextResponse('Erro', { status: 403 });
}
