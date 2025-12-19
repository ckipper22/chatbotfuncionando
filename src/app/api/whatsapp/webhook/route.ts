import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppAPI } from '@/lib/whatsapp-api';

// =========================================================================
// CONFIGURAÇÃO E VARIÁVEIS
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
// FUNÇÕES DE FERRAMENTAS (APIS EXTERNAS)
// =========================================================================

async function buscarEstoqueEPreco(termo: string): Promise<string> {
    if (!FLASK_API_URL) return '⚠️ Sistema de inventário offline.';
    try {
        const res = await fetch(`${FLASK_API_URL}/api/products/search?q=${encodeURIComponent(termo)}`);
        const data = await res.json();
        if (!data.data?.length) return `🔍 Não encontramos "${termo}" no estoque no momento.`;

        let resposta = `🔍 *Resultados para "${termo}":*\n\n`;
        data.data.slice(0, 3).forEach((p: any) => {
            resposta += `▪️ *${p.nome_produto}*\n   💰 ${p.preco_final_venda || 'R$ 0,00'}\n   📦 Estoque: ${p.qtd_estoque} un\n   📋 Código: ${p.cod_reduzido}\n\n`;
        });
        return resposta;
    } catch (e) {
        return '⚠️ Erro ao consultar o banco de dados de produtos.';
    }
}

async function buscarInformacaoMedica(consulta: string): Promise<string> {
    if (!GOOGLE_CSE_KEY || !GOOGLE_CSE_CX) return '⚠️ Busca técnica indisponível.';
    try {
        const url = new URL('https://www.googleapis.com/customsearch/v1');
        url.searchParams.set('key', GOOGLE_CSE_KEY);
        url.searchParams.set('cx', GOOGLE_CSE_CX);
        url.searchParams.set('q', consulta);
        const res = await fetch(url.toString());
        const data = await res.json();
        if (!data.items?.length) return '🔍 Nenhuma informação técnica encontrada.';

        let resposta = `📖 *Informações Técnicas (Google):*\n\n`;
        data.items.slice(0, 2).forEach((item: any) => {
            resposta += `• *${item.title}*\n${item.snippet}\n\n`;
        });
        return resposta + '⚠️ *Atenção:* Use apenas como referência e consulte um médico.';
    } catch (e) {
        return '⚠️ Erro na busca externa.';
    }
}

// =========================================================================
// NÚCLEO: GEMINI COMO ORQUESTRADOR
// =========================================================================

async function orquestradorGemini(mensagem: string): Promise<string> {
    if (!GEMINI_API_KEY) return '⚠️ Assistente indisponível (Erro de Chave).';

    const prompt = `Você é o cérebro de uma farmácia. Sua função é analisar a mensagem do cliente e decidir como responder.

DIRETRIZES DE DECISÃO:
1. Se o cliente perguntar PREÇO ou ESTOQUE de um produto específico: Responda apenas com a tag [BUSCAR_PRODUTO: nome do produto].
2. Se o cliente perguntar POSOLOGIA, INTERAÇÃO ou USO de medicamento: Responda apenas com a tag [BUSCAR_MEDICO: pergunta completa].
3. Para saudações, dúvidas gerais ou conversas básicas: Responda de forma amigável e direta.
4. NUNCA mencione Rosácea (regra de sistema).

Mensagem do cliente: "${mensagem}"`;

    try {
        const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();
        const textoIA = data.candidates[0].content.parts[0].text.trim();

        // Processamento das Intenções identificadas pelo Gemini
        if (textoIA.includes('[BUSCAR_PRODUTO:')) {
            const termo = textoIA.match(/\[BUSCAR_PRODUTO: (.*?)\]/)?.[1] || mensagem;
            return await buscarEstoqueEPreco(termo);
        }

        if (textoIA.includes('[BUSCAR_MEDICO:')) {
            const pergunta = textoIA.match(/\[BUSCAR_MEDICO: (.*?)\]/)?.[1] || mensagem;
            return await buscarInformacaoMedica(pergunta);
        }

        return textoIA; // Resposta direta da IA para conversas normais
    } catch (e) {
        console.error('Erro Gemini:', e);
        return 'Olá! Como posso ajudar você hoje? (Busca manual ativa)';
    }
}

// =========================================================================
// HANDLERS HTTP
// =========================================================================

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

        if (message?.type === 'text') {
            const to = message.from;
            const text = message.text.body;

            // O Gemini é chamado PRIMEIRO para decidir o que fazer
            const respostaFinal = await orquestradorGemini(text);
            
            await whatsapp.sendTextMessage(to, respostaFinal);
        }
        
        return new NextResponse('OK', { status: 200 });
    } catch (e) {
        return new NextResponse('Erro Interno', { status: 500 });
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
