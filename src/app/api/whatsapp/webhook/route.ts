// src/app/api/whatsapp/webhook/route.ts
// ====================================================================================
// WEBHOOK FINAL - COM TODAS AS MELHORIAS
// ====================================================================================
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// =========================================================================
// CONFIGURAÇÃO DAS VARIÁVEIS DE AMBIENTE
// =========================================================================
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const FLASK_API_URL = process.env.FLASK_API_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GOOGLE_CSE_KEY = process.env.CUSTOM_SEARCH_API_KEY;
const GOOGLE_CSE_CX = process.env.CUSTOM_SEARCH_CX;

const temConfigWhatsApp = !!(WHATSAPP_VERIFY_TOKEN && WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID);
const temConfigSupabase = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
const temConfigFlask = !!FLASK_API_URL;
const temConfigGemini = !!GEMINI_API_KEY;
const temGoogleCSE = !!(GOOGLE_CSE_KEY && GOOGLE_CSE_CX);

if (!temConfigWhatsApp) console.warn('⚠️ WhatsApp não configurado');
if (!temConfigSupabase) console.warn('⚠️ Supabase não configurado');
if (!temConfigFlask) console.warn('⚠️ Flask API não configurada');
if (!temConfigGemini) console.warn('⚠️ Gemini API não configurada');
if (!temGoogleCSE) console.warn('⚠️ Google CSE não configurado');

// =========================================================================
// DETECTORES INTELIGENTES
// =========================================================================

// 1. DETECTOR DE SAUDAÇÕES
const SAUDACOES = ['olá', 'ola', 'oi', 'tudo bem', 'bom dia', 'boa tarde', 'boa noite', 'hey', 'hello', 'hi', 'eae', 'opa'];

function ehSaudacao(mensagem: string): boolean {
    const msgLimpa = mensagem.toLowerCase().replace(/[?!.,]/g, '').trim();
    return SAUDACOES.includes(msgLimpa);
}

// 2. DETECTOR DE PERGUNTAS MÉDICAS/MEDICAMENTOS (APERFEIÇOADO)
function ehPerguntaMedicaOuMedicamento(mensagem: string): boolean {
    const msgMin = mensagem.toLowerCase();
    
    const palavrasChaveMedicas = [
        'posologia', 'dosagem', 'dose', 'quantos comprimidos',
        'para que serve', 'serve para', 'uso do', 'uso da',
        'efeito colateral', 'efeitos colaterais', 'contraindicação',
        'contra indicação', 'interação medicamentosa', 'reação',
        'posso tomar', 'como tomar', 'horário de tomar',
        'grávida pode', 'gravida pode', 'criança pode', 'idoso pode',
        'com álcool', 'com alcool', 'antes ou depois da comida',
        'tempo de uso', 'durante quanto tempo'
    ];

    const medicamentosComuns = [
        'resfenol', 'paracetamol', 'dipirona', 'ibuprofeno', 'dorflex',
        'torsilax', 'novalgina', 'neosaldina', 'loratadina', 'allegra',
        'dexametasona', 'omeprazol', 'ranitidina', 'losartana', 'captopril',
        'metformina', 'glifage', 'sinvastatina', 'atorvastatina',
        'amoxicilina', 'azitromicina', 'ciprofloxacino', 'sorina', 'sorinan'
    ];

    const temPalavraChaveMedica = palavrasChaveMedicas.some(palavra => 
        msgMin.includes(palavra)
    );

    const temNomeMedicamento = medicamentosComuns.some(medicamento => 
        msgMin.includes(medicamento)
    );

    // Padrões mais específicos para perguntas médicas
    const padroesMedicamento = [
        /(posologia|dosagem|dose) (do|da|de) [\w\s]+/i,
        /(para que serve|serve para) (o|a)?\s*[\w\s]+/i,
        /(pode tomar|tomar) [\w\s]+ (com|junto)/i,
        /(qual|quais) (remédio|medicamento) (para|pra) [\w\s]+/i,
        /(quanto tempo|por quanto tempo) (pode|devo) tomar/i,
        /(criança|grávida|gestante|idoso) pode tomar/i
    ];

    const temPadraoMedicamento = padroesMedicamento.some(padrao => 
        padrao.test(mensagem)
    );

    return temPalavraChaveMedica || temNomeMedicamento || temPadraoMedicamento;
}

// 3. DETECTOR DE BUSCA DE PRODUTO (MAIS AGRESSIVO)
function extrairTermoBuscaInteligente(mensagem: string): { buscar: boolean, termo: string } {
    const msgMin = mensagem.toLowerCase().trim();
    
    // Ignorar saudações
    if (ehSaudacao(msgMin)) {
        return { buscar: false, termo: '' };
    }
    
    // Ignorar perguntas médicas
    if (ehPerguntaMedicaOuMedicamento(msgMin)) {
        return { buscar: false, termo: '' };
    }
    
    // Remover pontuação
    const msgSemPontuacao = msgMin.replace(/[?!.,]/g, '').trim();
    
    // Palavras para ignorar
    const palavrasIgnorar = [
        'qual', 'quais', 'o', 'a', 'os', 'as', 'de', 'do', 'da', 'dos', 'das',
        'em', 'para', 'por', 'com', 'sem', 'sobre', 'entre', 'quanto', 'custa',
        'preço', 'valor', 'tem', 'onde', 'como', 'quando', 'ver', 'me', 'minha',
        'meu', 'gostaria', 'queria', 'por favor', 'pf', 'pls', 'please'
    ];
    
    // Dividir em palavras
    const palavras = msgSemPontuacao.split(/\s+/).filter(palavra => 
        palavra.length >= 2 && !palavrasIgnorar.includes(palavra)
    );
    
    // Critérios para considerar como busca de produto:
    // 1. Tem entre 1-4 palavras relevantes
    // 2. Não parece ser uma pergunta completa
    // 3. Parece nome de produto/marca
    
    if (palavras.length >= 1 && palavras.length <= 4) {
        // Verificar se não é uma pergunta estrutural
        const verbosInterrogativos = ['é', 'são', 'tem', 'existe', 'vale', 'custa', 'como', 'onde'];
        const primeiraPalavra = palavras[0];
        
        if (!verbosInterrogativos.includes(primeiraPalavra)) {
            const termo = palavras.join(' ');
            
            // Verificar padrões comuns de nomes de produtos
            const padraoMarca = /^[a-z]{3,}/i.test(termo);
            const padraoMedicamento = /^[a-z]+(ina|ol|il|ex|ax|um|al)$/i.test(palavras[palavras.length - 1]);
            
            if (padraoMarca || padraoMedicamento || termo.length >= 3) {
                return { buscar: true, termo };
            }
        }
    }
    
    // Se não detectou como busca específica, retorna o texto completo para o Gemini
    return { buscar: false, termo: '' };
}

// =========================================================================
// GOOGLE CUSTOM SEARCH FALLBACK (APERFEIÇOADO)
// =========================================================================
async function buscaGoogleFallback(consulta: string): Promise<string> {
    if (!temGoogleCSE) {
        return '⚠️ Busca de backup indisponível no momento.';
    }
    
    try {
        const url = new URL('https://www.googleapis.com/customsearch/v1');
        url.searchParams.set('key', GOOGLE_CSE_KEY!);
        url.searchParams.set('cx', GOOGLE_CSE_CX!);
        url.searchParams.set('q', consulta);
        url.searchParams.set('num', 3);

        const resposta = await fetch(url.toString());
        if (!resposta.ok) throw new Error(`Erro CSE: ${resposta.status}`);
        const dados = await resposta.json();

        if (!dados.items || dados.items.length === 0) {
            return '🔍 Não encontrei informações específicas sobre isso.';
        }

        // PROCESSAMENTO ESPECÍFICO PARA POSOLOGIA
        if (consulta.toLowerCase().includes('posologia')) {
            return formatarPosologia(dados.items, consulta);
        }
        
        // PROCESSAMENTO GENÉRICO MELHORADO
        let respostaTexto = `🔍 *Informações sobre "${consulta}":*\n\n`;
        
        for (const item of dados.items.slice(0, 2)) {
            // Limpar e formatar o snippet
            let snippet = item.snippet || '';
            snippet = snippet.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
            
            if (snippet.length > 150) {
                snippet = snippet.substring(0, 150) + '...';
            }
            
            respostaTexto += `• **${item.title}**\n`;
            respostaTexto += `  ${snippet}\n\n`;
        }
        
        respostaTexto += '⚠️ *Atenção*: Estas são informações gerais da web. ';
        respostaTexto += 'Para orientações médicas personalizadas, consulte sempre um médico ou farmacêutico.';
        
        return respostaTexto;
    } catch (erro) {
        console.error('❌ Erro no fallback Google CSE:', erro);
        return '⚠️ Não foi possível buscar informações no momento.';
    }
}

function formatarPosologia(items: any[], consulta: string): string {
    let resposta = `💊 *Informações sobre posologia*:\n\n`;
    
    // Extrair medicamento da consulta
    const medicamentoMatch = consulta.match(/posologia (?:do|da) (\w+)/i);
    const medicamento = medicamentoMatch ? medicamentoMatch[1] : 'este medicamento';
    
    // Padrões para extrair informações de posologia
    const padroesPosologia = [
        { regex: /(\d+)\s*(cápsula|comprimido|cp|cp\.)/i, desc: 'Dose:' },
        { regex: /a cada\s*(\d+)\s*(hora|horas|hs)/i, desc: 'Intervalo:' },
        { regex: /máximo\s*(\d+)\s*(ao dia|por dia|diário)/i, desc: 'Máximo diário:' },
        { regex: /não.*exceder\s*(\d+)/i, desc: 'Não exceder:' },
        { regex: /(\d+)\s*(mg|ml|g)/i, desc: 'Dosagem:' }
    ];
    
    const informacoesEncontradas = new Set<string>();
    
    items.forEach(item => {
        const texto = `${item.title} ${item.snippet}`.toLowerCase();
        
        padroesPosologia.forEach(padrao => {
            const match = texto.match(padrao.regex);
            if (match) {
                informacoesEncontradas.add(`${padrao.desc} ${match[0]}`);
            }
        });
    });
    
    if (informacoesEncontradas.size > 0) {
        informacoesEncontradas.forEach(info => {
            resposta += `• ${info}\n`;
        });
    } else {
        // Se não encontrou padrões específicos, usar a primeira informação relevante
        const primeiroItem = items[0];
        let snippet = primeiroItem.snippet || '';
        snippet = snippet.split('.')[0]; // Pegar apenas a primeira frase
        
        resposta += `• ${snippet}\n`;
    }
    
    resposta += '\n📋 *Observações importantes:*\n';
    resposta += '• Consulte a bula completa\n';
    resposta += '• Não exceda a dose recomendada\n';
    resposta += '• Mantenha fora do alcance de crianças\n\n';
    resposta += '⚠️ *IMPORTANTE*: Esta é uma informação geral. ';
    resposta += 'A posologia correta deve ser prescrita por um médico ou farmacêutico, ';
    resposta += 'considerando idade, peso, condições de saúde e outros fatores.';
    
    return resposta;
}

// =========================================================================
// FUNÇÕES DE SUPABASE E FLASK (MANTIDAS)
// =========================================================================
async function buscarProdutoNaApi(termo: string): Promise<string> {
    if (!temConfigFlask || !FLASK_API_URL) {
        return '⚠️ Sistema de produtos indisponível no momento.';
    }
    
    try {
        const resposta = await fetch(`${FLASK_API_URL}/api/products/search?q=${encodeURIComponent(termo)}`, {
            headers: { 
                'Content-Type': 'application/json', 
                'ngrok-skip-browser-warning': 'true' 
            }
        });
        
        if (!resposta.ok) {
            throw new Error(`Erro API: ${resposta.status}`);
        }
        
        const dados = await resposta.json();
        
        if (!dados?.data || dados.data.length === 0) {
            return `🔍 Nenhum produto encontrado para "*${termo}*".\n\nTente outro termo ou digite *MENU* para opções.`;
        }
        
        let respostaTexto = `🔍 *Resultados para "${termo}":*\n\n`;
        
        for (const produto of dados.data.slice(0, 5)) {
            const preco = produto.preco_final_venda || 'Consultar';
            const estoque = produto.qtd_estoque || 0;
            const desconto = produto.desconto_percentual > 0 ? 
                ` (🔻${produto.desconto_percentual.toFixed(1)}% OFF)` : '';
            
            respostaTexto += `▪️ *${produto.nome_produto}*\n`;
            respostaTexto += `   💊 ${produto.nom_laboratorio || 'Sem laboratório'}\n`;
            respostaTexto += `   💰 ${preco}${desconto}\n`;
            respostaTexto += `   📦 Estoque: ${estoque}\n`;
            respostaTexto += `   📋 Código: ${produto.cod_reduzido}\n`;
            respostaTexto += `   Para comprar: *COMPRAR ${produto.cod_reduzido}*\n\n`;
        }
        
        if (dados.data.length > 5) {
            respostaTexto += `_Mostrando 5 de ${dados.data.length} resultados._\n`;
        }
        
        respostaTexto += '\n💡 *Dica*: Digite *COMPRAR X* (onde X é o código) para adicionar ao carrinho.';
        
        return respostaTexto;
        
    } catch (erro) {
        console.error('❌ Erro na API de produtos:', erro);
        return '⚠️ Erro ao buscar produtos. Tente novamente ou digite *ATENDENTE* para ajuda.';
    }
}

// =========================================================================
// INTEGRAÇÃO COM GEMINI (OTIMIZADA)
// =========================================================================
async function interpretarComGemini(mensagem: string): Promise<{ resposta: string; usarCSE: boolean }> {
    if (!temConfigGemini) {
        return { resposta: 'IA desativada. Digite *MENU* para opções.', usarCSE: false };
    }

    // Se for pergunta médica, usar Google CSE diretamente
    if (ehPerguntaMedicaOuMedicamento(mensagem)) {
        console.log('🔍 Pergunta médica detectada, usando Google CSE direto');
        return { resposta: '', usarCSE: true };
    }

    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!);
        const modelo = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 500,
            }
        });

        const prompt = `Você é um assistente virtual de uma farmácia. 
        Responda à mensagem do cliente de forma amigável, útil e natural.
        
        DIRETRIZES:
        1. Converse naturalmente como um atendente real
        2. Seja prestativo e simpático
        3. Para perguntas sobre medicamentos com prescrição, explique que precisa consultar um farmacêutico
        4. Não dê conselhos médicos
        5. Mantenha as respostas claras e concisas
        6. Use emojis moderadamente se apropriado
        
        MENSAGEM DO CLIENTE: "${mensagem}"
        
        Sua resposta (em português, natural e conversacional):`;

        const resultado = await modelo.generateContent(prompt);
        const resposta = resultado.response;
        const textoResposta = resposta.text()?.trim() || '';

        console.log('📝 Resposta do Gemini:', textoResposta.substring(0, 200));

        // Verificar se a resposta contém frases de recusa
        const recusas = [
            'não posso',
            'não posso fornecer',
            'não sou capaz',
            'consulte um',
            'procure um',
            'orientação médica',
            'aconselhamento médico',
            'sou um assistente virtual',
            'sou uma ia',
            'limitações da ia',
            'como uma ia, não posso'
        ];

        const recusou = recusas.some(recusa => 
            textoResposta.toLowerCase().includes(recusa)
        );

        if (!textoResposta || recusou) {
            console.log('🚫 Gemini recusou ou resposta vazia, usando Google CSE');
            return { resposta: '', usarCSE: true };
        }

        // Adicionar aviso apenas se mencionar saúde/medicamentos
        const mencionaSaude = /(medicamento|remédio|saúde|tratamento|sintoma)/i.test(textoResposta);
        const respostaFinal = mencionaSaude ? 
            `${textoResposta}\n\n💡 *Informação importante*: Para orientações específicas sobre medicamentos, consulte sempre um farmacêutico ou médico.` : 
            textoResposta;
        
        return { resposta: respostaFinal, usarCSE: false };
    } catch (erro) {
        console.error('❌ Erro Gemini:', erro);
        return { resposta: '', usarCSE: true };
    }
}

// =========================================================================
// PROCESSAMENTO PRINCIPAL (FLUXO OTIMIZADO)
// =========================================================================
async function processarMensagemCompleta(de: string, whatsappPhoneId: string, textoMensagem: string) {
    // 1. VERIFICAR COMANDO COMPRAR
    const matchComprar = textoMensagem.match(/^comprar\s+(\d+)/i);
    if (matchComprar) {
        const codigo = matchComprar[1];
        // [Código existente para adicionar ao carrinho]
        await enviarComFormatosCorretos(de, `✅ Produto *${codigo}* adicionado ao carrinho.\n\nDigite *CARRINHO* ou *FINALIZAR*.`);
        return;
    }
    
    // 2. VERIFICAR SAUDAÇÃO
    if (ehSaudacao(textoMensagem)) {
        const saudacoes = [
            "Olá! 👋 Tudo bem?",
            "Oi! 😊 Em que posso ajudar?",
            "Olá! Sou seu assistente virtual da farmácia. Como posso te ajudar hoje?",
            "Oi! Que bom falar com você! O que precisa?",
            "Olá! Prontinho para te atender! 😄"
        ];
        const saudacaoAleatoria = saudacoes[Math.floor(Math.random() * saudacoes.length)];
        await enviarComFormatosCorretos(de, saudacaoAleatoria);
        return;
    }
    
    // 3. VERIFICAR SE É BUSCA DE PRODUTO
    const { buscar: ehBuscaProduto, termo: termoBusca } = extrairTermoBuscaInteligente(textoMensagem);
    
    if (ehBuscaProduto && termoBusca) {
        console.log(`🔍 Detectado busca por produto: "${termoBusca}"`);
        const resultadoBusca = await buscarProdutoNaApi(termoBusca);
        await enviarComFormatosCorretos(de, resultadoBusca);
        return;
    }
    
    // 4. VERIFICAR PERGUNTA MÉDICA (vai direto para Google CSE formatado)
    if (ehPerguntaMedicaOuMedicamento(textoMensagem)) {
        console.log(`🏥 Pergunta médica detectada: "${textoMensagem}"`);
        const resultadoCSE = await buscaGoogleFallback(textoMensagem);
        await enviarComFormatosCorretos(de, resultadoCSE);
        return;
    }
    
    // 5. USAR GEMINI PARA CONVERSA GERAL
    const { resposta: respostaGemini, usarCSE } = await interpretarComGemini(textoMensagem);
    
    if (usarCSE) {
        // Gemini recusou, usar Google CSE
        const resultadoCSE = await buscaGoogleFallback(textoMensagem);
        await enviarComFormatosCorretos(de, resultadoCSE);
        return;
    }
    
    if (respostaGemini.trim() !== '') {
        await enviarComFormatosCorretos(de, respostaGemini);
        return;
    }
    
    // 6. RESPOSTA PADRÃO (fallback final)
    await enviarComFormatosCorretos(de, 
        `*OLÁ! SOU SEU ASSISTENTE VIRTUAL DA FARMÁCIA* 💊\n\n` +
        `Posso te ajudar com:\n` +
        `🔍 *Busca de produtos* (ex: "paracetamol", "sorina")\n` +
        `🛒 *Compras* (digite "COMPRAR X" onde X é o código)\n` +
        `💬 *Informações gerais* sobre a farmácia\n` +
        `📞 *Contato com atendente* (digite ATENDENTE)\n\n` +
        `Como posso te ajudar hoje? 😊`
    );
}

// =========================================================================
// FUNÇÕES RESTANTES (MENSAGENS WHATSAPP, SUPABASE, ETC.)
// =========================================================================
// [MANTER TODAS AS OUTRAS FUNÇÕES COMO ESTAVAM:
// - enviarComFormatosCorretos
// - salvarProdutoNoCache
// - obterProdutoDoCache
// - obterOuCriarCliente
// - obterOuCriarCarrinho
// - adicionarItemAoCarrinho
// - GET e POST handlers]

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    const modo = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const desafio = searchParams.get('hub.challenge');

    if (modo === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
        return new NextResponse(desafio, { status: 200 });
    }
    return new NextResponse('Verificação falhou', { status: 403 });
}

export async function POST(req: NextRequest) {
    try {
        const corpo = await req.json();
        if (corpo.object === 'whatsapp_business_account' && corpo.entry) {
            for (const entrada of corpo.entry) {
                for (const mudanca of entrada.changes) {
                    if (mudanca.field === 'messages' && mudanca.value?.messages) {
                        for (const mensagem of mudanca.value.messages) {
                            const de = mensagem.from;
                            const whatsappPhoneId = mudanca.value.metadata.phone_number_id;
                            const textoMensagem = mensagem.text?.body || mensagem.button?.text || '';
                            
                            if (mensagem.type === 'text' || mensagem.type === 'button') {
                                await processarMensagemCompleta(de, whatsappPhoneId, textoMensagem);
                            } else {
                                await enviarComFormatosCorretos(de, 'Olá! 👋 Por favor, envie uma mensagem de texto para que eu possa te ajudar melhor.');
                            }
                        }
                    }
                }
            }
        }
        return new NextResponse('EVENTO_RECEBIDO', { status: 200 });
    } catch (erro) {
        console.error('❌ Erro no webhook:', erro);
        return new NextResponse('OK', { status: 200 });
    }
}
