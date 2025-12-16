
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
    // DEBUG: Verificar se a chave existe
    if (!GEMINI_API_KEY) {
        console.error('❌ [GEMINI DEBUG] API Key não encontrada nas variáveis de ambiente!');
        return { resposta: '', usarCSE: true };
    }

    try {
        console.log(`🤖 [GEMINI DEBUG] Iniciando chamada para: "${mensagem}"`);
        console.log(`🔑 [GEMINI DEBUG] API Key presente: ${GEMINI_API_KEY.substring(0, 5)}...`);

        // Modelos para tentar (da versão mais nova/rápida para a mais estável)
        // Usando versões específicas (001/002) para evitar erros de alias (404)
        const modelsToTest = [
            'gemini-1.5-flash',
            'gemini-1.5-flash-001',
            'gemini-1.5-flash-002',
            'gemini-1.5-flash-latest',
            'gemini-1.5-pro',
            'gemini-1.5-pro-001',
            'gemini-1.5-pro-002',
            'gemini-pro',
            'gemini-1.0-pro'
        ];
        let lastError: any;

        for (const modelName of modelsToTest) {
            try {
                console.log(`🤖 [GEMINI DEBUG] Tentando modelo: "${modelName}"...`);

                const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
                const model = genAI.getGenerativeModel({ model: modelName });

                const prompt = `Você é um assistente de farmácia útil e amigável.
            Responda à mensagem do cliente: "${mensagem}".

            DIRETRIZES:
            1. Responda SEMPRE em Português do Brasil.
            2. Seja cordial e direto.
            3. Não dê conselhos médicos perigosos ou prescrições. Se não souber, diga que não sabe.
            4. Se perguntarem sobre preço ou estoque, diga que não tem acesso em tempo real e peça para digitar o nome do produto para busca.

            Responda agora:`;

                const result = await model.generateContent(prompt);
                const text = result.response.text();

                console.log(`✅ [GEMINI DEBUG] Sucesso com modelo ${modelName}! Resposta: "${text.substring(0, 50)}..."`);

                // Verifica recusas simples
                if (text.toLowerCase().includes('não posso') && text.toLowerCase().includes('médico')) {
                    console.warn('⚠️ [GEMINI DEBUG] Gemini recusou responder (filtro médico).');
                    return { resposta: '', usarCSE: true };
                }

                return { resposta: text, usarCSE: false };

            } catch (e: any) {
                console.warn(`⚠️ [GEMINI DEBUG] Falha no modelo ${modelName}: ${e.message}`);
                lastError = e;
                // Se o erro for de API Key inválida ou cota, não adianta tentar outros modelos
                if (e.toString().includes('API key not valid') || e.toString().includes('429')) {
                    break;
                }
                continue; // Tenta o próximo
            }
        }

        // Se chegou aqui, todos falharam
        console.error('❌ [GEMINI DEBUG] Todos os modelos falharam.');
        if (lastError) {
            console.error('Último erro:', lastError);
        }
        return { resposta: '', usarCSE: true };
    } catch (e: any) {
        console.error('❌ [GEMINI DEBUG] Erro GRAVE ao chamar Gemini:');
        console.error(e);
        console.error('Detalhes do erro:', JSON.stringify(e, null, 2));

        // Se o erro for de API Key inválida ou cota excedida, avisa no log
        if (e.toString().includes('API key not valid')) console.error('🔴 [GEMINI DEBUG] A Chave de API é inválida!');
        if (e.toString().includes('429')) console.error('🔴 [GEMINI DEBUG] Cota de requisições excedida (Erro 429)!');

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

// ... (existing code)

const INTENCAO_COMPRA = [
    'comprar', 'encomendar', 'pedido', 'adicionar', 'levar', 'carrinho', 'quero comprar'
];

function ehIntencaoCompra(mensagem: string): boolean {
    const msgLimpa = mensagem.toLowerCase();
    return INTENCAO_COMPRA.some(termo => msgLimpa.includes(termo));
}

async function processarMensagemCompleta(de: string, texto: string) {
    // 1. Saudação Estrita
    if (ehSaudacao(texto)) {
        await enviarComFormatosCorretos(de, 'Olá! Sou seu assistente virtual. Como posso ajudar?');
        return;
    }

    // 2. Conversa Básica
    if (ehConversaBasica(texto)) {
        const { resposta } = await interpretarComGemini(texto);
        if (resposta) {
            await enviarComFormatosCorretos(de, resposta);
        } else {
            await enviarComFormatosCorretos(de, 'Tudo ótimo por aqui! Como posso ajudar você hoje?');
        }
        return;
    }

    // 3. Intenção de Compra Genérica (NOVO)
    // Se o usuário diz "gostaria de encomendar" sem um produto claro, orientamos ele.
    if (ehIntencaoCompra(texto)) {
        await enviarComFormatosCorretos(de, 'Para fazer um pedido, por favor digite o *nome do produto* ou medicamento que você procura (ex: "Dipirona" ou "Tem Dorflex?").');
        return;
    }

    // 4. Busca de Produto (via Flask)
    const { buscar, termo } = extrairTermoBuscaInteligente(texto);
    if (buscar) {
        const produtos = await buscarProdutoNaApi(termo);
        if (!produtos.startsWith('🔍 Nenhum')) {
            await enviarComFormatosCorretos(de, produtos);
            return;
        }
    }

    // 5. Pergunta Médica (Google CSE)
    if (ehPerguntaMedicaOuMedicamento(texto)) {
        const res = await buscaGoogleFallback(texto);
        await enviarComFormatosCorretos(de, res);
        return;
    }

    // 6. Gemini Geral / Fallback
    const { resposta, usarCSE } = await interpretarComGemini(texto);

    if (usarCSE) {
        // Se o Gemini falhou/não configurado, só buscamos no Google se PARECER uma pergunta.
        // Evita buscar frases soltas como "gostaria de encomendar".
        const parecePergunta = texto.includes('?') ||
            ['como', 'o que', 'qual', 'onde', 'porque', 'por que'].some(p => texto.toLowerCase().startsWith(p));

        if (parecePergunta) {
            const fallback = await buscaGoogleFallback(texto);
            await enviarComFormatosCorretos(de, fallback);
        } else {
            // Fallback final Seguro -> Menu/Ajuda
            await enviarComFormatosCorretos(de, 'Desculpe, não entendi. 😕\n\nVocê pode:\n1. Digitar o nome de um produto para buscar.\n2. Fazer uma pergunta sobre saúde.\n3. Dizer "Menu" para ver opções.');
        }
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
