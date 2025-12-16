
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
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

// Inicializar API do WhatsApp
const whatsapp = new WhatsAppAPI({
    access_token: WHATSAPP_ACCESS_TOKEN || '',
    phone_number_id: WHATSAPP_PHONE_NUMBER_ID || '',
    webhook_verify_token: WHATSAPP_VERIFY_TOKEN || '',
    is_active: true,
    webhook_url: ''
});

// =========================================================================
// DETECTORES INTELIGENTES
// =========================================================================
// =========================================================================
// DETECTORES INTELIGENTES
// =========================================================================
// Mantenha apenas saudações curtas/diretas que exigem menu imediato.
// "tudo bem", "como vai" devem passar para o Gemini.
const SAUDACOES = ['olá', 'ola', 'oi', 'hey', 'hello', 'hi', 'eae', 'opa', 'menu', 'inicio', 'início'];

function ehSaudacao(mensagem: string): boolean {
    const msgLimpa = mensagem.toLowerCase().replace(/[?!.,]/g, '').trim();
    return SAUDACOES.includes(msgLimpa);
}

function ehPerguntaMedicaOuMedicamento(mensagem: string): boolean {
    const msgMin = mensagem.toLowerCase();
    const palavrasChaveMedicas = [
        'posologia', 'dosagem', 'dose', 'quantos comprimidos', 'para que serve', 'serve para', 'uso do', 'uso da',
        'efeito colateral', 'efeitos colaterais', 'contraindicação', 'interação medicamentosa', 'reação',
        'posso tomar', 'como tomar', 'horário de tomar', 'grávida pode', 'gravida pode', 'criança pode', 'idoso pode',
        'com álcool', 'com alcool', 'antes ou depois da comida', 'tempo de uso', 'durante quanto tempo'
    ];
    return palavrasChaveMedicas.some(p => msgMin.includes(p));
}

function extrairTermoBuscaInteligente(mensagem: string): { buscar: boolean, termo: string } {
    let msgMin = mensagem.toLowerCase().trim();

    // Stopwords para remover
    const stopWords = ['tem', 'gostaria', 'quero', 'preciso', 'você tem', 'voce tem', 'buscar', 'preço', 'valor', 'quanto custa', 'o', 'a', 'do', 'da', 'de'];

    // Remove pontuação final
    msgMin = msgMin.replace(/[?!.,]*$/, '');

    // Verifica se começa com alguma stopword e limpa
    for (const word of stopWords) {
        if (msgMin.startsWith(word + ' ')) {
            msgMin = msgMin.substring(word.length).trim();
        }
    }

    if (ehSaudacao(msgMin) || ehPerguntaMedicaOuMedicamento(msgMin)) return { buscar: false, termo: '' };

    const palavras = msgMin.split(' ');
    // Se sobrou algo curto (1-4 palavras), assume que é busca de produto
    if (palavras.length > 0 && palavras.length < 5) {
        return { buscar: true, termo: msgMin };
    }
    return { buscar: false, termo: '' };
}

// =========================================================================
// FUNÇÕES AUXILIARES
// =========================================================================
async function enviarComFormatosCorretos(to: string, text: string) {
    try {
        await whatsapp.sendTextMessage(to, text);
    } catch (error: any) {
        console.error('Erro ao enviar mensagem:', error);
    }
}

async function buscaGoogleFallback(consulta: string): Promise<string> {
    if (!GOOGLE_CSE_KEY || !GOOGLE_CSE_CX) return '⚠️ Busca de backup indisponível no momento.';

    try {
        const url = new URL('https://www.googleapis.com/customsearch/v1');
        url.searchParams.set('key', GOOGLE_CSE_KEY);
        url.searchParams.set('cx', GOOGLE_CSE_CX);
        url.searchParams.set('q', consulta);

        const res = await fetch(url.toString());
        const data = await res.json();

        if (!data.items?.length) return '🔍 Não encontrei informações específicas.';

        let resposta = `🔍 *Informações sobre "${consulta}":*\n\n`;
        data.items.slice(0, 2).forEach((item: any) => {
            resposta += `• *${item.title}*\n${item.snippet}\n\n`;
        });

        return resposta + '⚠️ Informações da web. Consulte um profissional.';
    } catch (e) {
        console.error('Erro Google CSE:', e);
        return '⚠️ Erro na busca.';
    }
}

async function buscarProdutoNaApi(termo: string): Promise<string> {
    if (!FLASK_API_URL) return '⚠️ Sistema de produtos indisponível.';

    try {
        const res = await fetch(`${FLASK_API_URL}/api/products/search?q=${encodeURIComponent(termo)}`);
        const data = await res.json();

        if (!data.data?.length) return `🔍 Nenhum produto encontrado para "*${termo}*".`;

        let resposta = `🔍 *Resultados da busca por "${termo}":*\n\n`;
        data.data.slice(0, 5).forEach((p: any) => {
            const preco = p.preco_final_venda || 'R$ 0,00';
            const estoque = p.qtd_estoque || 0;
            const codigo = p.cod_reduzido || p.codigo || '000000';
            const laboratorio = p.nom_laboratorio || p.laboratorio || '';

            resposta += `▪️ *${p.nome_produto}*\n`;
            if (laboratorio) resposta += `   💊 ${laboratorio}\n`;
            resposta += `   💰 ${preco}\n`;
            resposta += `   📦 Estoque: ${estoque} unidades\n`;
            resposta += `   📋 Código: ${codigo}\n`;
            resposta += `   Para adicionar ao carrinho, digite: *COMPRAR ${codigo}*\n\n`;
        });

        return resposta;
    } catch (e) {
        console.error('Erro Flask API:', e);
        return '⚠️ Erro ao buscar produtos.';
    }
}

async function interpretarComGemini(mensagem: string): Promise<{ resposta: string, usarCSE: boolean }> {
    if (!GEMINI_API_KEY) return { resposta: '', usarCSE: true };

    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `Você é um assistente de farmácia útil e amigável.
        Responda à mensagem: "${mensagem}".
        Não dê conselhos médicos perigosos. Se não souber, diga que não sabe.`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        // Verifica recusas simples
        if (text.toLowerCase().includes('não posso') && text.toLowerCase().includes('médico')) {
            return { resposta: '', usarCSE: true };
        }

        return { resposta: text, usarCSE: false };
    } catch (e) {
        console.error('Erro Gemini:', e);
        return { resposta: '', usarCSE: true };
    }
}

const CONVERSA_BASICA = [
    'tudo bem', 'tudo bom', 'como vai', 'como est', 'e ai', 'e aí', 'beleza',
    'obrigado', 'obrigada', 'valeu', 'tchau', 'ate logo', 'até logo'
];

function ehConversaBasica(mensagem: string): boolean {
    const msgLimpa = mensagem.toLowerCase().replace(/[?!.,]/g, '').trim();
    return CONVERSA_BASICA.some(frase => msgLimpa.includes(frase));
}

async function processarMensagemCompleta(de: string, texto: string) {
    // 1. Saudação Estrita (Menu)
    if (ehSaudacao(texto)) {
        await enviarComFormatosCorretos(de, 'Olá! Sou seu assistente virtual. Como posso ajudar?');
        return;
    }

    // 2. Conversa Básica (Tenta Gemini, mas com fallback seguro)
    if (ehConversaBasica(texto)) {
        const { resposta } = await interpretarComGemini(texto);
        if (resposta) {
            await enviarComFormatosCorretos(de, resposta);
        } else {
            // Fallback amigável se Gemini falhar/não estiver configurado
            await enviarComFormatosCorretos(de, 'Tudo ótimo por aqui! Como posso ajudar você hoje?');
        }
        return;
    }

    // 3. Busca de Produto (via Flask)
    const { buscar, termo } = extrairTermoBuscaInteligente(texto);
    if (buscar) {
        const produtos = await buscarProdutoNaApi(termo);
        // Se a busca retornou resultados, envia. Se não (erro ou vazio), tenta conversa.
        if (!produtos.startsWith('🔍 Nenhum')) {
            await enviarComFormatosCorretos(de, produtos);
            return;
        }
        // Se não achou produto, continua para tentar Gemini (talvez seja conversa complexa)
    }

    // 4. Pergunta Médica (Google CSE)
    if (ehPerguntaMedicaOuMedicamento(texto)) {
        const res = await buscaGoogleFallback(texto);
        await enviarComFormatosCorretos(de, res);
        return;
    }

    // 5. Gemini Geral (para outras coisas não capturadas)
    const { resposta, usarCSE } = await interpretarComGemini(texto);
    if (usarCSE) {
        // Só faz fallback para Google se NÃO parecia ser conversa básica e NÃO era produto
        const fallback = await buscaGoogleFallback(texto);
        await enviarComFormatosCorretos(de, fallback);
        return;
    }

    if (resposta) {
        await enviarComFormatosCorretos(de, resposta);
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

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        if (body.object === 'whatsapp_business_account') {
            for (const entry of body.entry || []) {
                for (const change of entry.changes || []) {
                    if (change.value?.messages) {
                        for (const msg of change.value.messages) {
                            if (msg.type === 'text') {
                                await processarMensagemCompleta(msg.from, msg.text.body);
                            }
                        }
                    }
                }
            }
        }
        return new NextResponse('OK', { status: 200 });
    } catch (e) {
        console.error(e);
        return new NextResponse('Erro', { status: 500 });
    }
}
