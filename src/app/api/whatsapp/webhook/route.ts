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

const hasWhatsAppConfig = !!(WHATSAPP_VERIFY_TOKEN && WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID);
const hasSupabaseConfig = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
const hasFlaskConfig = !!FLASK_API_URL;
const hasGeminiConfig = !!GEMINI_API_KEY;
const hasGoogleCSE = !!(GOOGLE_CSE_KEY && GOOGLE_CSE_CX);

if (!hasWhatsAppConfig) console.warn('⚠️ WhatsApp não configurado');
if (!hasSupabaseConfig) console.warn('⚠️ Supabase não configurado');
if (!hasFlaskConfig) console.warn('⚠️ Flask API não configurada');
if (!hasGeminiConfig) console.warn('⚠️ Gemini API não configurada');
if (!hasGoogleCSE) console.warn('⚠️ Google CSE não configurado');

// =========================================================================
// GATILHOS
// =========================================================================
const TRIGGERS_BUSCA = ['buscar', 'produto', 'consulta', 'preço', 'preco', 'estoque', 'achar', 'encontrar', 'ver se tem', 'quanto custa', 'me veja', 'me passe', 'quero', 'tem', 'procurar'];
const TRIGGERS_CARRINHO = ['adicionar', 'carrinho', 'comprar', 'levar', 'mais um', 'pegue'];
const NOISE_WORDS = new Set([...TRIGGERS_BUSCA, ...TRIGGERS_CARRINHO, 'qual', 'o', 'a', 'os', 'as', 'de', 'do', 'da', 'dos', 'das', 'por', 'um', 'uma', 'pra', 'eh', 'e', 'me', 'nele', 'dele', 'dela', 'em', 'para', 'na', 'no', 'favor', 'porfavor', 'porgentileza', 'o produto', 'o item']);

function extrairTermoBusca(mensagem: string): string | null {
  const lowerMsg = mensagem.toLowerCase();
  const isSearchIntent = TRIGGERS_BUSCA.some(trigger => lowerMsg.includes(trigger));
  if (!isSearchIntent) return null;
  const tokens = lowerMsg.split(/\s+/).filter(Boolean);
  const filteredTokens = tokens.filter(token => !NOISE_WORDS.has(token));
  const termo = filteredTokens.join(' ').trim();
  return termo.length >= 2 ? termo : null;
}

// =========================================================================
// DETECTOR DE CONSULTA MÉDICA/MEDICAMENTOS
// =========================================================================
function isMedicalOrDrugQuestion(mensagem: string): boolean {
  const lowerMsg = mensagem.toLowerCase();
  
  const medicalKeywords = [
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

  const commonDrugs = [
    'paracetamol', 'dipirona', 'ibuprofeno', 'dorflex',
    'torsilax', 'novalgina', 'neosaldina', 'loratadina',
    'allegra', 'dexametasona', 'omeprazol', 'ranitidina',
    'losartana', 'captopril', 'metformina', 'glifage',
    'sinvastatina', 'atorvastatina', 'amoxicilina',
    'azitromicina', 'ciprofloxacino'
  ];

  const hasMedicalKeyword = medicalKeywords.some(keyword => 
    lowerMsg.includes(keyword)
  );

  const hasDrugName = commonDrugs.some(drug => 
    lowerMsg.includes(drug)
  );

  const drugPatterns = [
    /(para que serve|serve para) (o|a)?\s*[\w\s]+/i,
    /(posologia|dosagem|dose) (de|do|da)?\s*[\w\s]+/i,
    /(efeito|efeitos) (colateral|colaterais) (de|do|da)?\s*[\w\s]+/i,
  ];

  const hasDrugPattern = drugPatterns.some(pattern => 
    pattern.test(mensagem)
  );

  return hasMedicalKeyword || hasDrugName || hasDrugPattern;
}

// =========================================================================
// GOOGLE CUSTOM SEARCH FALLBACK
// =========================================================================
async function googleFallbackSearch(query: string): Promise<string> {
  if (!hasGoogleCSE) {
    return '⚠️ Busca de backup indisponível no momento.';
  }
  try {
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', GOOGLE_CSE_KEY!);
    url.searchParams.set('cx', GOOGLE_CSE_CX!);
    url.searchParams.set('q', query);
    url.searchParams.set('num', '3');

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`CSE error: ${res.status}`);
    const data = await res.json();

    if (!data.items || data.items.length === 0) {
      return '🔍 Não encontrei resultados relevantes na web. Tente reformular sua pergunta.';
    }

    let resposta = `🔍 *Resultados da web para "${query}":*\n\n`;
    for (const item of data.items.slice(0, 3)) {
      resposta += `• **${item.title}**\n  ${item.link}\n  ${item.snippet}\n\n`;
    }
    resposta += '⚠️ *Atenção*: Estas informações vêm de fontes da web. Consulte sempre um médico ou farmacêutico para orientações médicas.';
    return resposta;
  } catch (error) {
    console.error('❌ Erro no fallback Google CSE:', error);
    return '⚠️ Não foi possível buscar informações no momento.';
  }
}

// =========================================================================
// CACHE E SUPABASE (mínimo necessário)
// =========================================================================
async function saveProductToCache(productCode: string, productName: string, unitPrice: number): Promise<void> {
  if (!hasSupabaseConfig) return;
  try {
    const insertUrl = `${SUPABASE_URL}/rest/v1/product_cache?on_conflict=product_code`;
    const headers = new Headers({
      'apikey': SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    });
    await fetch(insertUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ product_code: productCode, product_name: productName, unit_price: unitPrice, updated_at: new Date().toISOString() })
    });
  } catch (error) {
    console.log(`⚠️ Erro ao salvar no cache:`, error);
  }
}

async function getProductFromCache(productCode: string): Promise<{ name: string; price: number } | null> {
  if (!hasSupabaseConfig) return null;
  try {
    const selectUrl = `${SUPABASE_URL}/rest/v1/product_cache?product_code=eq.${productCode}`;
    const headers = new Headers({ 'apikey': SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` });
    const response = await fetch(selectUrl, { method: 'GET', headers });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.[0] ? { name: data[0].product_name, price: data[0].unit_price } : null;
  } catch (error) {
    return null;
  }
}

async function getOrCreateCustomer(from: string, whatsappPhoneId: string): Promise<string | null> {
  if (!hasSupabaseConfig) return null;
  try {
    const headers = new Headers({
      'apikey': SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    });
    const selectUrl = `${SUPABASE_URL}/rest/v1/customers?whatsapp_phone_number=eq.${from}&select=id`;
    let res = await fetch(selectUrl, { method: 'GET', headers });
    if (!res.ok) throw new Error(`Erro cliente: ${res.status}`);
    let data = await res.json();
    if (data?.[0]?.id) return data[0].id;

    await fetch(`${SUPABASE_URL}/rest/v1/customers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ whatsapp_phone_number: from, client_connection_id: whatsappPhoneId })
    });

    res = await fetch(selectUrl, { method: 'GET', headers });
    data = await res.json();
    return data?.[0]?.id || null;
  } catch (error) {
    return null;
  }
}

async function getOrCreateCartOrder(customerId: string, whatsappPhoneId: string): Promise<string | null> {
  if (!hasSupabaseConfig) return null;
  try {
    const headers = new Headers({
      'apikey': SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    });
    const selectUrl = `${SUPABASE_URL}/rest/v1/orders?customer_id=eq.${customerId}&status=eq.CART&select=id`;
    let res = await fetch(selectUrl, { method: 'GET', headers });
    if (!res.ok) throw new Error(`Erro carrinho: ${res.status}`);
    let data = await res.json();
    if (data?.[0]?.id) return data[0].id;

    await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ customer_id: customerId, client_connection_id: whatsappPhoneId, status: 'CART', total_amount: 0.00 })
    });

    res = await fetch(selectUrl, { method: 'GET', headers });
    data = await res.json();
    return data?.[0]?.id || null;
  } catch (error) {
    return null;
  }
}

async function addItemToCart(orderId: string, productCode: string, quantity: number, whatsappPhoneId: string): Promise<boolean> {
  try {
    let productName = `Produto ${productCode}`;
    let unitPrice = 0;

    const cached = await getProductFromCache(productCode);
    if (cached) {
      productName = cached.name;
      unitPrice = cached.price;
    } else if (hasFlaskConfig && FLASK_API_URL) {
      try {
        const res = await fetch(`${FLASK_API_URL}/api/products/search?q=${encodeURIComponent(productCode)}`, {
          headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }
        });
        if (res.ok) {
          const data = await res.json();
          const product = data.data?.find((p: any) => String(p.cod_reduzido) === productCode);
          if (product) {
            productName = product.nome_produto;
            unitPrice = parseFloat(product.preco_final_venda.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
            saveProductToCache(productCode, productName, unitPrice).catch(() => {});
          }
        }
      } catch (e) {}
    }

    if (!hasSupabaseConfig) return false;
    const headers = new Headers({
      'apikey': SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    });
    const res = await fetch(`${SUPABASE_URL}/rest/v1/order_items`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        order_id: orderId,
        product_api_id: productCode,
        product_name: productName,
        quantity,
        unit_price: unitPrice,
        total_price: unitPrice * quantity
      })
    });
    return res.ok;
  } catch (error) {
    return false;
  }
}

async function enviarComFormatosCorretos(from: string, texto: string): Promise<boolean> {
  if (!hasWhatsAppConfig) return false;
  try {
    const numeroLimpo = from.replace(/\D/g, '');
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
      const res = await fetch(`https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) return true;
      await new Promise(r => setTimeout(r, 300));
    }
    return false;
  } catch (error) {
    return false;
  }
}

// =========================================================================
// INTEGRAÇÃO COM GEMINI + FALLBACK GOOGLE
// =========================================================================
async function interpretarComGemini(mensagem: string): Promise<{ resposta: string; usarCSE: boolean }> {
  if (!hasGeminiConfig) {
    return { resposta: 'IA desativada. Digite *MENU* para opções.', usarCSE: false };
  }

  // Se for pergunta médica, usar Google CSE diretamente
  if (isMedicalOrDrugQuestion(mensagem)) {
    console.log('🔍 Pergunta médica detectada, usando Google CSE direto');
    return { resposta: '', usarCSE: true };
  }

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
    });

    const prompt = `Você é um assistente de farmácia. Responda à pergunta do usuário de forma clara e informativa.

Pergunta: "${mensagem}"

Responda de forma útil e direta. Se for sobre produtos de farmácia (exceto medicamentos com prescrição), forneça informações.`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const respostaText = response.text()?.trim() || '';

    console.log('📝 Resposta do Gemini:', respostaText.substring(0, 200));

    // Verificar se a resposta contém frases de recusa
    if (!respostaText || 
        respostaText.toLowerCase().includes('não posso') ||
        respostaText.toLowerCase().includes('consulte um') ||
        respostaText.toLowerCase().includes('procure um') ||
        respostaText.toLowerCase().includes('orientação médica') ||
        respostaText.toLowerCase().includes('sou um assistente virtual')) {
      console.log('🚫 Gemini recusou responder, usando Google CSE');
      return { resposta: '', usarCSE: true };
    }

    // Adicionar aviso a todas as respostas do Gemini
    const respostaComAviso = `${respostaText}\n\n⚠️ *Atenção*: Para informações sobre medicamentos e saúde, consulte sempre um médico ou farmacêutico.`;
    
    return { resposta: respostaComAviso, usarCSE: false };
  } catch (error) {
    console.error('❌ Erro Gemini:', error);
    return { resposta: '', usarCSE: true };
  }
}

// =========================================================================
// PROCESSAMENTO PRINCIPAL
// =========================================================================
async function processarMensagemCompleta(from: string, whatsappPhoneId: string, messageText: string) {
  const customerId = await getOrCreateCustomer(from, whatsappPhoneId);
  if (!customerId) return;

  const comprarMatch = messageText.match(/^comprar\s+(\d+)/i);
  if (comprarMatch) {
    const code = comprarMatch[1];
    const orderId = await getOrCreateCartOrder(customerId, whatsappPhoneId);
    if (orderId && await addItemToCart(orderId, code, 1, whatsappPhoneId)) {
      await enviarComFormatosCorretos(from, `✅ Produto *${code}* adicionado ao carrinho.\n\nDigite *CARRINHO* ou *FINALIZAR*.`);
    } else {
      await enviarComFormatosCorretos(from, `❌ Produto *${code}* não encontrado.`);
    }
    return;
  }

  // Processar a mensagem
  const termoBusca = extrairTermoBusca(messageText);
  
  // Se for busca de produto
  if (termoBusca && hasFlaskConfig && FLASK_API_URL) {
    try {
      const res = await fetch(`${FLASK_API_URL}/api/products/search?q=${encodeURIComponent(termoBusca)}`, {
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }
      });
      let resposta = `🔍 *Resultados da busca por "${termoBusca}":*\n\n`;
      if (res.ok) {
        const data = await res.json();
        if (data?.data?.length > 0) {
          for (const p of data.data.slice(0, 5)) {
            const price = p.preco_final_venda;
            const discount = p.desconto_percentual > 0 ? ` (🔻${p.desconto_percentual.toFixed(1)}% OFF)` : '';
            resposta += `▪️ *${p.nome_produto}*\n`;
            resposta += `   💊 ${p.nom_laboratorio}\n`;
            resposta += `   💰 ${price}${discount}\n`;
            resposta += `   📦 Estoque: ${p.qtd_estoque}\n`;
            resposta += `   📋 Código: ${p.cod_reduzido}\n`;
            resposta += `   Para comprar: *COMPRAR ${p.cod_reduzido}*\n\n`;
            saveProductToCache(p.cod_reduzido, p.nome_produto, parseFloat(price.replace(/[^\d,]/g, '').replace(',', '.')) || 0).catch(() => {});
          }
          if (data.data.length > 5) {
            resposta += `_Mostrando 5 de ${data.data.length} resultados._\n`;
          }
        } else {
          resposta += 'Nenhum produto encontrado.\n';
        }
      } else {
        resposta += '⚠️ Erro ao buscar produtos. Tente novamente.\n';
      }
      await enviarComFormatosCorretos(from, resposta);
    } catch (e) {
      await enviarComFormatosCorretos(from, '⚠️ Erro ao buscar produtos. Use *ATENDENTE* para ajuda.');
    }
    return;
  }

  // Para outras mensagens, usar Gemini + Google CSE
  const { resposta, usarCSE } = await interpretarComGemini(messageText);

  if (usarCSE) {
    const fallback = await googleFallbackSearch(messageText);
    await enviarComFormatosCorretos(from, fallback);
    return;
  }

  if (resposta.trim() !== '') {
    await enviarComFormatosCorretos(from, resposta);
    return;
  }

  // Resposta padrão
  await enviarComFormatosCorretos(from, '*OLÁ! SOU SEU ASSISTENTE VIRTUAL DA FARMÁCIA.*\n\n• Digite o nome de um produto para buscar\n• Para questões de saúde, consulte um profissional\n• Digite *MENU* para opções');
}

// =========================================================================
// HANDLERS
// =========================================================================
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse('Verification failed', { status: 403 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.object === 'whatsapp_business_account' && body.entry) {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.field === 'messages' && change.value?.messages) {
            for (const message of change.value.messages) {
              const from = message.from;
              const whatsappPhoneId = change.value.metadata.phone_number_id;
              const messageText = message.text?.body || message.button?.text || '';
              if (message.type === 'text' || message.type === 'button') {
                await processarMensagemCompleta(from, whatsappPhoneId, messageText);
              } else {
                await enviarComFormatosCorretos(from, 'Envie uma mensagem de texto.');
              }
            }
          }
        }
      }
    }
    return new NextResponse('EVENT_RECEIVED', { status: 200 });
  } catch (error) {
    return new NextResponse('OK', { status: 200 });
  }
}
