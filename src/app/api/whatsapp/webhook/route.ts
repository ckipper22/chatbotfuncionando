import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppAPI } from '@/lib/whatsapp-api';

// =========================================================================
// CONFIGURAÇÃO DAS VARIÁVEIS DE AMBIENTE
// =========================================================================
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
// UTILITÁRIOS
// =========================================================================

// Limpa o número para garantir que tenha apenas dígitos (ex: remove @s.whatsapp.net)
function limparNumero(remoteJid: string): string {
    const limpo = remoteJid.replace(/\D/g, '');
    console.log(`[WHATSAPP] Número original: ${remoteJid} -> Limpo: ${limpo}`);
    return limpo;
}

// =========================================================================
// FUNÇÕES DE APOIO (FLASK E GOOGLE)
// =========================================================================

async function buscarProdutoNaApi(termo: string): Promise<string> {
    console.log(`[FLASK] Buscando produto: "${termo}"`);
    if (!FLASK_API_URL) return '⚠️ Sistema de estoque offline.';
    try {
        const res = await fetch(`${FLASK_API_URL}/api/products/search?q=${encodeURIComponent(termo)}`);
        const data = await res.json();
        if (!data.data?.length) {
            console.log(`[FLASK] Nenhum resultado para "${termo}"`);
            return `🔍 Nenhum produto encontrado para "*${termo}*".`;
        }

        let resposta = `🔍 *Resultados para "${termo}":*\n\n`;
        data.data.slice(0, 3).forEach((p: any) => {
            resposta += `▪️ *${p.nome_produto}*\n   💰 ${p.preco_final_venda || 'R$ 0,00'}\n   📦 Estoque: ${p.qtd_estoque}\n   📋 Código: ${p.cod_reduzido}\n\n`;
        });
        return resposta;
    } catch (e) {
        console.error('[FLASK ERROR]', e);
        return '⚠️ Erro ao buscar produtos.';
    }
}

async function buscaGoogleFallback(consulta: string): Promise<string> {
    console.log(`[GOOGLE CSE] Buscando informação médica: "${consulta}"`);
    if (!GOOGLE_CSE_KEY || !GOOGLE_CSE_CX) return '⚠️ Busca técnica indisponível.';
    try {
        const url = new URL('https://www.googleapis.com/customsearch/v1');
        url.searchParams.set('key', GOOGLE_CSE_KEY);
        url.searchParams.set('cx', GOOGLE_CSE_CX);
        url.searchParams.set('q', consulta);
        const res = await fetch(url.toString());
        const data = await res.json();
        if (!data.items?.length) return '🔍 Não encontrei informações específicas.';

        let resposta = `📖 *Informações Técnicas:* \n\n`;
        data.items.slice(0, 2).forEach((item: any) => {
            resposta += `• *${item.title}*\n${item.snippet}\n\n`;
        });
        return resposta + '⚠️ Consulte sempre um profissional.';
    } catch (e) {
        console.error('[GOOGLE ERROR]', e);
        return '⚠️ Erro na busca técnica.';
    }
}

// =========================================================================
// NÚCLEO: GEMINI ORQUESTRADOR
// =========================================================================

async function interpretarComGemini(mensagem: string): Promise<{ resposta: string, intencao: 'CONVERSA' | 'PRODUTO' | 'MEDICA', termo?: string }> {
    console.log(`[GEMINI] Analisando: "${mensagem}"`);
    
    if (!GEMINI_API_KEY) {
        console.error('[GEMINI ERROR] API KEY não configurada!');
        return { resposta: 'Erro de configuração.', intencao: 'CONVERSA' };
    }

    const modelsToTest = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];
    
    const prompt = `Você é um assistente de farmácia amigável. Analise a mensagem: "${mensagem}"
    REGRAS:
    1. Se o cliente quer saber PREÇO, ESTOQUE ou DISPONIBILIDADE, responda apenas: [ACAO:PRODUTO:nome_produto]
    2. Se o cliente quer saber POSOLOGIA, INTERAÇÃO ou COMO USAR, responda apenas: [ACAO:MEDICA:pergunta]
    3. Para saudações ou conversas comuns, responda amigavelmente.
    4. JAMAIS mencione Rosácea.`;

    for (const modelName of modelsToTest) {
        try {
            console.log(`[GEMINI] Tentando chamada API - Modelo: ${modelName}`);
            const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
            
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });

            if (!res.ok) {
                const errText = await res.text();
                console.warn(`[GEMINI] Erro na resposta (${modelName}): ${res.status} - ${errText}`);
                continue;
            }

            const data = await res.json();
            const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

            if (!texto) {
                console.warn(`[GEMINI] Payload vazio para ${modelName}`);
                continue;
            }

            console.log(`[GEMINI SUCCESS] Resposta final: "${texto}"`);

            if (texto.includes('[ACAO:PRODUTO:')) {
                const termo = texto.match(/\[ACAO:PRODUTO:(.*?)\]/)?.[1];
                return { resposta: '', intencao: 'PRODUTO', termo: termo || mensagem };
            }
            if (texto.includes('[ACAO:MEDICA:')) {
                const pergunta = texto.match(/\[ACAO:MEDICA:(.*?)\]/)?.[1];
                return { resposta: '', intencao: 'MEDICA', termo: pergunta || mensagem };
            }

            return { resposta: texto, intencao: 'CONVERSA' };
        } catch (e: any) {
            console.error(`[GEMINI FATAL ERROR] Loop ${modelName}:`, e.message);
        }
    }
    
    return { resposta: 'Olá! Sou seu assistente de farmácia. Como posso ajudar?', intencao: 'CONVERSA' };
}

// =========================================================================
// PROCESSAMENTO FINAL
// =========================================================================

async function processarMensagemCompleta(deRaw: string, texto: string) {
    const de = limparNumero(deRaw);
    console.log(`[FLOW] Iniciando processamento para ${de}`);

    try {
        const analise = await interpretarComGemini(texto);
        let respostaFinal = '';

        if (analise.intencao === 'PRODUTO' && analise.termo) {
            respostaFinal = await buscarProdutoNaApi(analise.termo);
        } else if (analise.intencao === 'MEDICA' && analise.termo) {
            respostaFinal = await buscaGoogleFallback(analise.termo);
        } else {
            respostaFinal = analise.resposta;
        }

        console.log(`[FLOW] Enviando mensagem final para ${de}`);
        await whatsapp.sendTextMessage(de, respostaFinal);
    } catch (err) {
        console.error('[FLOW ERROR]', err);
        await whatsapp.sendTextMessage(de, 'Tive um problema ao processar sua mensagem. Pode repetir?');
    }
}

// =========================================================================
// HANDLERS HTTP
// =========================================================================

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

        if (msg?.type === 'text') {
            await processarMensagemCompleta(msg.from, msg.text.body);
        }
        return new NextResponse('OK', { status: 200 });
    } catch (e: any) {
        console.error('[POST ERROR]', e.message);
        return new NextResponse('OK', { status: 200 });
    }
}

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    if (searchParams.get('hub.mode') === 'subscribe' &&
        searchParams.get('hub.verify_token') === WHATSAPP_VERIFY_TOKEN) {
        return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
    }
    return new NextResponse('Erro token', { status: 403 });
}
