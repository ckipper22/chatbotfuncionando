import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppAPI } from '@/lib/whatsapp-api';

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const FLASK_API_URL = process.env.FLASK_API_URL;
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
// AUXILIARES
// =========================================================================

function limparNumero(remoteJid: string): string {
    return remoteJid.replace(/\D/g, '');
}

async function buscarProdutoNaApi(termo: string): Promise<string> {
    if (!FLASK_API_URL) return '⚠️ Sistema de estoque offline.';
    try {
        const res = await fetch(`${FLASK_API_URL}/api/products/search?q=${encodeURIComponent(termo)}`);
        const data = await res.json();
        if (!data.data?.length) return `🔍 Nenhum produto encontrado para "*${termo}*".`;
        let resposta = `🔍 *Resultados para "${termo}":*\n\n`;
        data.data.slice(0, 3).forEach((p: any) => {
            resposta += `▪️ *${p.nome_produto}*\n   💰 ${p.preco_final_venda || 'R$ 0,00'}\n   📦 Estoque: ${p.qtd_estoque}\n   📋 Código: ${p.cod_reduzido}\n\n`;
        });
        return resposta;
    } catch (e) { return '⚠️ Erro ao buscar produtos.'; }
}

async function buscaGoogleFallback(consulta: string): Promise<string> {
    if (!GOOGLE_CSE_KEY || !GOOGLE_CSE_CX) return '⚠️ Busca técnica indisponível.';
    try {
        const url = new URL('https://www.googleapis.com/customsearch/v1');
        url.searchParams.set('key', GOOGLE_CSE_KEY);
        url.searchParams.set('cx', GOOGLE_CSE_CX);
        url.searchParams.set('q', consulta);
        const res = await fetch(url.toString());
        const data = await res.json();
        if (!data.items?.length) return '🔍 Não encontrei informações técnicas.';
        let resposta = `📖 *Informações Técnicas:* \n\n`;
        data.items.slice(0, 2).forEach((item: any) => {
            resposta += `• *${item.title}*\n${item.snippet}\n\n`;
        });
        return resposta + '⚠️ Consulte sempre um médico.';
    } catch (e) { return '⚠️ Erro na busca técnica.'; }
}

// =========================================================================
// GEMINI COM FILTROS DE SEGURANÇA DESATIVADOS
// =========================================================================

async function interpretarComGemini(mensagem: string): Promise<{ resposta: string, intencao: 'CONVERSA' | 'PRODUTO' | 'MEDICA', termo?: string }> {
    console.log(`🤖 [GEMINI] Analisando: "${mensagem}"`);
    if (!GEMINI_API_KEY) return { resposta: 'Olá! Como posso ajudar?', intencao: 'CONVERSA' };

    const prompt = `Você é um assistente de farmácia amigável. Analise a mensagem do cliente e classifique.
    
    DIRETRIZES:
    - Se o cliente quer saber PREÇO, ESTOQUE ou DISPONIBILIDADE de um produto: responda apenas [ACAO:PRODUTO:nome_do_produto].
    - Se o cliente tem dúvidas sobre POSOLOGIA, COMO USAR ou INTERAÇÃO: responda apenas [ACAO:MEDICA:pergunta_completa].
    - Caso contrário, responda como um humano amigável.
    - Regra absoluta: NUNCA fale sobre Rosácea.
    
    Mensagem do cliente: "${mensagem}"`;

    const modelName = 'gemini-1.5-flash';
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                // DESATIVANDO FILTROS DE SEGURANÇA PARA EVITAR RESPOSTA VAZIA
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                ],
                generationConfig: { temperature: 0.4, maxOutputTokens: 500 }
            })
        });

        const data = await response.json();

        // LOG DE DIAGNÓSTICO CASO CONTINUE FALHANDO
        if (data.promptFeedback?.blockReason) {
            console.error(`🚫 [GEMINI BLOCK] Bloqueado por: ${data.promptFeedback.blockReason}`);
        }

        const textoIA = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (!textoIA) {
            console.warn(`⚠️ [GEMINI EMPTY] Resposta sem texto. Payload:`, JSON.stringify(data));
            return { resposta: 'Olá! Sou seu assistente de farmácia. Como posso te ajudar?', intencao: 'CONVERSA' };
        }

        console.log(`✅ [GEMINI SUCCESS] Texto: ${textoIA}`);

        if (textoIA.includes('[ACAO:PRODUTO:')) {
            const termo = textoIA.match(/\[ACAO:PRODUTO:(.*?)\]/)?.[1];
            return { resposta: '', intencao: 'PRODUTO', termo: termo || mensagem };
        }
        if (textoIA.includes('[ACAO:MEDICA:')) {
            const pergunta = textoIA.match(/\[ACAO:MEDICA:(.*?)\]/)?.[1];
            return { resposta: '', intencao: 'MEDICA', termo: pergunta || mensagem };
        }

        return { resposta: textoIA, intencao: 'CONVERSA' };

    } catch (e: any) {
        console.error(`❌ [GEMINI ERROR]`, e.message);
        return { resposta: 'Olá! Como posso ajudar?', intencao: 'CONVERSA' };
    }
}

// =========================================================================
// FLUXO PRINCIPAL
// =========================================================================

async function processarMensagemCompleta(deRaw: string, texto: string) {
    const de = limparNumero(deRaw);
    const analise = await interpretarComGemini(texto);

    if (analise.intencao === 'PRODUTO' && analise.termo) {
        const res = await buscarProdutoNaApi(analise.termo);
        await whatsapp.sendTextMessage(de, res);
    } else if (analise.intencao === 'MEDICA' && analise.termo) {
        const res = await buscaGoogleFallback(analise.termo);
        await whatsapp.sendTextMessage(de, res);
    } else {
        await whatsapp.sendTextMessage(de, analise.resposta);
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (msg?.type === 'text') {
            await processarMensagemCompleta(msg.from, msg.text.body);
        }
        return new NextResponse('OK', { status: 200 });
    } catch (e) { return new NextResponse('OK', { status: 200 }); }
}

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    if (searchParams.get('hub.mode') === 'subscribe' &&
        searchParams.get('hub.verify_token') === WHATSAPP_VERIFY_TOKEN) {
        return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
    }
    return new NextResponse('Erro token', { status: 403 });
}
