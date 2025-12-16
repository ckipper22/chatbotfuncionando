// src/app/api/whatsapp/webhook/route.ts
// ====================================================================================
// WEBHOOK FINAL - SEM BASE LOCAL, SÓ API + GOOGLE CSE FALLBACK
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
// GATILHOS
// =========================================================================
const GATILHOS_BUSCA = ['buscar', 'produto', 'consulta', 'preço', 'preco', 'estoque', 'achar', 'encontrar', 'ver se tem', 'quanto custa', 'me veja', 'me passe', 'quero', 'tem', 'procurar'];
const GATILHOS_CARRINHO = ['adicionar', 'carrinho', 'comprar', 'levar', 'mais um', 'pegue'];
const PALAVRAS_RUIDO = new Set([...GATILHOS_BUSCA, ...GATILHOS_CARRINHO, 'qual', 'o', 'a', 'os', 'as', 'de', 'do', 'da', 'dos', 'das', 'por', 'um', 'uma', 'pra', 'eh', 'e', 'me', 'nele', 'dele', 'dela', 'em', 'para', 'na', 'no', 'favor', 'porfavor', 'porgentileza', 'o produto', 'o item']);

function extrairTermoBusca(mensagem: string): string | null {
  const mensagemMinuscula = mensagem.toLowerCase();
  const ehBusca = GATILHOS_BUSCA.some(gatilho => mensagemMinuscula.includes(gatilho));
  if (!ehBusca) return null;
  const palavras = mensagemMinuscula.split(/\s+/).filter(Boolean);
  const palavrasFiltradas = palavras.filter(palavra => !PALAVRAS_RUIDO.has(palavra));
  const termo = palavrasFiltradas.join(' ').trim();
  return termo.length >= 2 ? termo : null;
}

// =========================================================================
// DETECTOR DE CONSULTA MÉDICA/MEDICAMENTOS
// =========================================================================
function ehPerguntaMedicaOuMedicamento(mensagem: string): boolean {
  const mensagemMinuscula = mensagem.toLowerCase();
  
  const palavrasChaveMedicas = [
    'para que serve', 'serve para', 'uso do', 'uso da',
    'posologia', 'dose', 'dosagem', 'quantos comprimidos',
    'efeito', 'efeitos', 'colateral', 'colaterais',
    'contra indicação', 'contraindicação', 'contra-indicação',
    'interação', 'interações', 'reação', 'reações',
    'tratamento', 'sintoma', 'sintomas', 'doença', 'doenças',
    'dor', 'dores', 'febre', 'inflamação', 'infecção',
    'antibiótico', 'analgésico', 'antitérmico', 'anti-inflamatório',
    'remédio', 'remédios', 'medicamento', 'medicamentos'
  ];

  const medicamentosComuns = [
    'paracetamol', 'dipirona', 'ibuprofeno', 'dorflex',
    'torsilax', 'novalgina', 'neosaldina', 'loratadina',
    'allegra', 'dexametasona', 'omeprazol', 'ranitidina',
    'losartana', 'captopril', 'metformina', 'glifage',
    'sinvastatina', 'atorvastatina', 'amoxicilina',
    'azitromicina', 'ciprofloxacino'
  ];

  const temPalavraChaveMedica = palavrasChaveMedicas.some(palavra => 
    mensagemMinuscula.includes(palavra)
  );

  const temNomeMedicamento = medicamentosComuns.some(medicamento => 
    mensagemMinuscula.includes(medicamento)
  );

  const padroesMedicamento = [
    /(para que serve|serve para) (o|a)?\s*[\w\s]+/i,
    /(posologia|dosagem|dose) (de|do|da)?\s*[\w\s]+/i,
    /(efeito|efeitos) (colateral|colaterais) (de|do|da)?\s*[\w\s]+/i,
  ];

  const temPadraoMedicamento = padroesMedicamento.some(padrao => 
    padrao.test(mensagem)
  );

  return temPalavraChaveMedica || temNomeMedicamento || temPadraoMedicamento;
}

// =========================================================================
// GOOGLE CUSTOM SEARCH FALLBACK
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
    url.searchParams.set('num', '3');

    const resposta = await fetch(url.toString());
    if (!resposta.ok) throw new Error(`Erro CSE: ${resposta.status}`);
    const dados = await resposta.json();

    if (!dados.items || dados.items.length === 0) {
      return '🔍 Não encontrei resultados relevantes na web. Tente reformular sua pergunta.';
    }

    let respostaTexto = `🔍 *Resultados da web para "${consulta}":*\n\n`;
    for (const item of dados.items.slice(0, 3)) {
      respostaTexto += `• **${item.title}**\n  ${item.link}\n  ${item.snippet}\n\n`;
    }
    respostaTexto += '⚠️ *Atenção*: Estas informações vêm de fontes da web. Consulte sempre um médico ou farmacêutico para orientações médicas.';
    return respostaTexto;
  } catch (erro) {
    console.error('❌ Erro no fallback Google CSE:', erro);
    return '⚠️ Não foi possível buscar informações no momento.';
  }
}

// =========================================================================
// CACHE E SUPABASE (mínimo necessário)
// =========================================================================
async function salvarProdutoNoCache(codigoProduto: string, nomeProduto: string, precoUnitario: number): Promise<void> {
  if (!temConfigSupabase) return;
  try {
    const urlInsercao = `${SUPABASE_URL}/rest/v1/product_cache?on_conflict=product_code`;
    const headers = new Headers({
      'apikey': SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    });
    await fetch(urlInsercao, {
      method: 'POST',
      headers,
      body: JSON.stringify({ product_code: codigoProduto, product_name: nomeProduto, unit_price: precoUnitario, updated_at: new Date().toISOString() })
    });
  } catch (erro) {
    console.log(`⚠️ Erro ao salvar no cache:`, erro);
  }
}

async function obterProdutoDoCache(codigoProduto: string): Promise<{ nome: string; preco: number } | null> {
  if (!temConfigSupabase) return null;
  try {
    const urlSelecao = `${SUPABASE_URL}/rest/v1/product_cache?product_code=eq.${codigoProduto}`;
    const headers = new Headers({ 'apikey': SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` });
    const resposta = await fetch(urlSelecao, { method: 'GET', headers });
    if (!resposta.ok) return null;
    const dados = await resposta.json();
    return dados?.[0] ? { nome: dados[0].product_name, preco: dados[0].unit_price } : null;
  } catch (erro) {
    return null;
  }
}

async function obterOuCriarCliente(de: string, whatsappPhoneId: string): Promise<string | null> {
  if (!temConfigSupabase) return null;
  try {
    const headers = new Headers({
      'apikey': SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    });
    const urlSelecao = `${SUPABASE_URL}/rest/v1/customers?whatsapp_phone_number=eq.${de}&select=id`;
    let resposta = await fetch(urlSelecao, { method: 'GET', headers });
    if (!resposta.ok) throw new Error(`Erro cliente: ${resposta.status}`);
    let dados = await resposta.json();
    if (dados?.[0]?.id) return dados[0].id;

    await fetch(`${SUPABASE_URL}/rest/v1/customers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ whatsapp_phone_number: de, client_connection_id: whatsappPhoneId })
    });

    resposta = await fetch(urlSelecao, { method: 'GET', headers });
    dados = await resposta.json();
    return dados?.[0]?.id || null;
  } catch (erro) {
    return null;
  }
}

async function obterOuCriarCarrinho(clienteId: string, whatsappPhoneId: string): Promise<string | null> {
  if (!temConfigSupabase) return null;
  try {
    const headers = new Headers({
      'apikey': SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    });
    const urlSelecao = `${SUPABASE_URL}/rest/v1/orders?customer_id=eq.${clienteId}&status=eq.CART&select=id`;
    let resposta = await fetch(urlSelecao, { method: 'GET', headers });
    if (!resposta.ok) throw new Error(`Erro carrinho: ${resposta.status}`);
    let dados = await resposta.json();
    if (dados?.[0]?.id) return dados[0].id;

    await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ customer_id: clienteId, client_connection_id: whatsappPhoneId, status: 'CART', total_amount: 0.00 })
    });

    resposta = await fetch(urlSelecao, { method: 'GET', headers });
    dados = await resposta.json();
    return dados?.[0]?.id || null;
  } catch (erro) {
    return null;
  }
}

async function adicionarItemAoCarrinho(idPedido: string, codigoProduto: string, quantidade: number, whatsappPhoneId: string): Promise<boolean> {
  try {
    let nomeProduto = `Produto ${codigoProduto}`;
    let precoUnitario = 0;

    const cache = await obterProdutoDoCache(codigoProduto);
    if (cache) {
      nomeProduto = cache.nome;
      precoUnitario = cache.preco;
    } else if (temConfigFlask && FLASK_API_URL) {
      try {
        const resposta = await fetch(`${FLASK_API_URL}/api/products/search?q=${encodeURIComponent(codigoProduto)}`, {
          headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }
        });
        if (resposta.ok) {
          const dados = await resposta.json();
          const produto = dados.data?.find((p: any) => String(p.cod_reduzido) === codigoProduto);
          if (produto) {
            nomeProduto = produto.nome_produto;
            precoUnitario = parseFloat(produto.preco_final_venda.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
            salvarProdutoNoCache(codigoProduto, nomeProduto, precoUnitario).catch(() => {});
          }
        }
      } catch (e) {}
    }

    if (!temConfigSupabase) return false;
    const headers = new Headers({
      'apikey': SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    });
    const resposta = await fetch(`${SUPABASE_URL}/rest/v1/order_items`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        order_id: idPedido,
        product_api_id: codigoProduto,
        product_name: nomeProduto,
        quantity: quantidade,
        unit_price: precoUnitario,
        total_price: precoUnitario * quantidade
      })
    });
    return resposta.ok;
  } catch (erro) {
    return false;
  }
}

async function enviarComFormatosCorretos(de: string, texto: string): Promise<boolean> {
  if (!temConfigWhatsApp) return false;
  try {
    const numeroLimpo = de.replace(/\D/g, '');
    let numeroConvertido = numeroLimpo;
    if (numeroLimpo.length === 12 && numeroLimpo.startsWith('55')) {
      const ddd = numeroLimpo.substring(2, 4);
      const num = numeroLimpo.substring(4);
      if (num.length === 8 && !['1','2','3','4','5'].includes(num.charAt(0))) {
        numeroConvertido = '55' + ddd + '9' + num;
      }
    }
    const formatos = ['+' + numeroConvertido, numeroConvertido];
    for (const formato of formatos) {
      const payload = {
        messaging_product: 'whatsapp',
        to: formato,
        type: 'text',
        text: { body: texto.substring(0, 4096).replace(/\\n/g, '\n') }
      };
      const resposta = await fetch(`https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (resposta.ok) return true;
      await new Promise(r => setTimeout(r, 300));
    }
    return false;
  } catch (erro) {
    return false;
  }
}

// =========================================================================
// INTEGRAÇÃO COM GEMINI + FALLBACK GOOGLE
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
    });

    const prompt = `Você é um assistente de farmácia. Responda à pergunta do usuário de forma clara e informativa.

Pergunta: "${mensagem}"

Responda de forma útil e direta. Se for sobre produtos de farmácia (exceto medicamentos com prescrição), forneça informações.`;

    const resultado = await modelo.generateContent(prompt);
    const resposta = resultado.response;
    const textoResposta = resposta.text()?.trim() || '';

    console.log('📝 Resposta do Gemini:', textoResposta.substring(0, 200));

    // Verificar se a resposta contém frases de recusa
    if (!textoResposta || 
        textoResposta.toLowerCase().includes('não posso') ||
        textoResposta.toLowerCase().includes('consulte um') ||
        textoResposta.toLowerCase().includes('procure um') ||
        textoResposta.toLowerCase().includes('orientação médica') ||
        textoResposta.toLowerCase().includes('sou um assistente virtual')) {
      console.log('🚫 Gemini recusou responder, usando Google CSE');
      return { resposta: '', usarCSE: true };
    }

    // Adicionar aviso a todas as respostas do Gemini
    const respostaComAviso = `${textoResposta}\n\n⚠️ *Atenção*: Para informações sobre medicamentos e saúde, consulte sempre um médico ou farmacêutico.`;
    
    return { resposta: respostaComAviso, usarCSE: false };
  } catch (erro) {
    console.error('❌ Erro Gemini:', erro);
    return { resposta: '', usarCSE: true };
  }
}

// =========================================================================
// PROCESSAMENTO PRINCIPAL
// =========================================================================
async function processarMensagemCompleta(de: string, whatsappPhoneId: string, textoMensagem: string) {
  const clienteId = await obterOuCriarCliente(de, whatsappPhoneId);
  if (!clienteId) return;

  const matchComprar = textoMensagem.match(/^comprar\s+(\d+)/i);
  if (matchComprar) {
    const codigo = matchComprar[1];
    const idPedido = await obterOuCriarCarrinho(clienteId, whatsappPhoneId);
    if (idPedido && await adicionarItemAoCarrinho(idPedido, codigo, 1, whatsappPhoneId)) {
      await enviarComFormatosCorretos(de, `✅ Produto *${codigo}* adicionado ao carrinho.\n\nDigite *CARRINHO* ou *FINALIZAR*.`);
    } else {
      await enviarComFormatosCorretos(de, `❌ Produto *${codigo}* não encontrado.`);
    }
    return;
  }

  // Processar a mensagem
  const termoBusca = extrairTermoBusca(textoMensagem);
  
  // Se for busca de produto
  if (termoBusca && temConfigFlask && FLASK_API_URL) {
    try {
      const resposta = await fetch(`${FLASK_API_URL}/api/products/search?q=${encodeURIComponent(termoBusca)}`, {
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }
      });
      let respostaTexto = `🔍 *Resultados da busca por "${termoBusca}":*\n\n`;
      if (resposta.ok) {
        const dados = await resposta.json();
        if (dados?.data?.length > 0) {
          for (const p of dados.data.slice(0, 5)) {
            const preco = p.preco_final_venda;
            const desconto = p.desconto_percentual > 0 ? ` (🔻${p.desconto_percentual.toFixed(1)}% OFF)` : '';
            respostaTexto += `▪️ *${p.nome_produto}*\n`;
            respostaTexto += `   💊 ${p.nom_laboratorio}\n`;
            respostaTexto += `   💰 ${preco}${desconto}\n`;
            respostaTexto += `   📦 Estoque: ${p.qtd_estoque}\n`;
            respostaTexto += `   📋 Código: ${p.cod_reduzido}\n`;
            respostaTexto += `   Para comprar: *COMPRAR ${p.cod_reduzido}*\n\n`;
            salvarProdutoNoCache(p.cod_reduzido, p.nome_produto, parseFloat(preco.replace(/[^\d,]/g, '').replace(',', '.')) || 0).catch(() => {});
          }
          if (dados.data.length > 5) {
            respostaTexto += `_Mostrando 5 de ${dados.data.length} resultados._\n`;
          }
        } else {
          respostaTexto += 'Nenhum produto encontrado.\n';
        }
      } else {
        respostaTexto += '⚠️ Erro ao buscar produtos. Tente novamente.\n';
      }
      await enviarComFormatosCorretos(de, respostaTexto);
    } catch (e) {
      await enviarComFormatosCorretos(de, '⚠️ Erro ao buscar produtos. Use *ATENDENTE* para ajuda.');
    }
    return;
  }

  // Para outras mensagens, usar Gemini + Google CSE
  const { resposta, usarCSE } = await interpretarComGemini(textoMensagem);

  if (usarCSE) {
    const fallback = await buscaGoogleFallback(textoMensagem);
    await enviarComFormatosCorretos(de, fallback);
    return;
  }

  if (resposta.trim() !== '') {
    await enviarComFormatosCorretos(de, resposta);
    return;
  }

  // Resposta padrão
  await enviarComFormatosCorretos(de, '*OLÁ! SOU SEU ASSISTENTE VIRTUAL DA FARMÁCIA.*\n\n• Digite o nome de um produto para buscar\n• Para questões de saúde, consulte um profissional\n• Digite *MENU* para opções');
}

// =========================================================================
// HANDLERS
// =========================================================================
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
                await enviarComFormatosCorretos(de, 'Envie uma mensagem de texto.');
              }
            }
          }
        }
      }
    }
    return new NextResponse('EVENTO_RECEBIDO', { status: 200 });
  } catch (erro) {
    return new NextResponse('OK', { status: 200 });
  }
}
