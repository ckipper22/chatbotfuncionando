// src/app/api/whatsapp/webhook/route.ts
// ====================================================================================
// WEBHOOK FINAL - SEM BASE LOCAL, SÓ API + GOOGLE CSE FALLBACK (MEDICAL BLOCK)
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

// Flags de configuração
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

function deveFazerBuscaDireta(mensagem: string): boolean {
  const texto = mensagem.toLowerCase().trim();
  if (extrairTermoBusca(mensagem)) return false;
  if (/^[1-4]$/.test(texto)) return false;
  const comandosConhecidos = ['menu', 'finalizar', 'carrinho', 'atendente', 'ajuda', 'voltar'];
  if (comandosConhecidos.includes(texto)) return false;
  if (/^\d{6,}$/.test(texto)) return false;
  const termosMedicamento = ['posologia', 'efeito', 'contraindicacao', 'bula', 'dose', 'como usar'];
  if (termosMedicamento.some(termo => texto.includes(termo))) return false;
  if (texto.length < 3) return false;
  const palavrasComuns = ['oi', 'ola', 'ok', 'sim', 'nao', 'obrigado', 'obrigada'];
  return !palavrasComuns.includes(texto);
}

// =========================================================================
// GOOGLE CUSTOM SEARCH FALLBACK
// =========================================================================
async function googleFallbackSearch(query: string): Promise<string> {
  if (!hasGoogleCSE) {
    return '⚠️ Busca de backup indisponível. Tente novamente mais tarde.';
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
      return '🔍 Não encontrei resultados relevantes. Tente reformular sua pergunta.';
    }

    let resposta = `ℹ️ A IA está com restrição para responder sobre saúde. Abaixo, resultados confiáveis da web:\n\n`;
    for (const item of data.items.slice(0, 3)) {
      resposta += `• **${item.title}**\n  ${item.link}\n  ${item.snippet}\n\n`;
    }
    resposta += '_Consulte sempre um profissional de saúde para orientações médicas._';
    return resposta;
  } catch (error) {
    console.error('❌ Erro no fallback Google CSE:', error);
    return '⚠️ Não foi possível buscar informações no momento. Por favor, tente mais tarde.';
  }
}

// =========================================================================
// CACHE E SUPABASE
// =========================================================================
async function saveProductToCache(productCode: string, productName: string, unitPrice: number): Promise<void> {
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
  try {
    const selectUrl = `${SUPABASE_URL}/rest/v1/product_cache?product_code=eq.${productCode}`;
    const headers = new Headers({ 'apikey': SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` });
    const response = await fetch(selectUrl, { method: 'GET', headers });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.[0] ? { name: data[0].product_name, price: data[0].unit_price } : null;
  } catch (error) {
    console.log(`⚠️ Erro ao buscar do cache:`, error);
    return null;
  }
}

async function getOrCreateCustomer(from: string, whatsappPhoneId: string): Promise<string | null> {
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
    console.error('❌ Erro CRM:', error);
    return null;
  }
}

async function getOrCreateCartOrder(customerId: string, whatsappPhoneId: string): Promise<string | null> {
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
    console.error('❌ Erro Carrinho:', error);
    return null;
  }
}

async function getOrderItems(orderId: string): Promise<any[]> {
  try {
    const headers = new Headers({ 'apikey': SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` });
    const res = await fetch(`${SUPABASE_URL}/rest/v1/order_items?order_id=eq.${orderId}&select=*`, { method: 'GET', headers });
    return res.ok ? (await res.json()) : [];
  } catch (error) {
    console.error('❌ Erro itens pedido:', error);
    return [];
  }
}

async function updateOrderTotal(orderId: string, newTotal: number): Promise<void> {
  try {
    const headers = new Headers({
      'apikey': SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    });
    await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ total_amount: newTotal })
    });
  } catch (error) {
    console.error('❌ Erro update total:', error);
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
    } else if (FLASK_API_URL) {
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
      } catch (e) {
        console.log('⚠️ Erro na API Flask durante adição ao carrinho');
      }
    }

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
    console.error('❌ Erro addItemToCart:', error);
    return false;
  }
}

async function salvarMensagemNoSupabase(whatsappPhoneId: string, from: string, body: string, direction: 'IN' | 'OUT'): Promise<void> {
  try {
    const headers = new Headers({
      'apikey': SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    });
    await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ whatsapp_phone_id: whatsappPhoneId, from_number: from, message_body: body, direction })
    });
  } catch (error) {
    console.error('❌ Erro salvar mensagem:', error);
  }
}

// =========================================================================
// FUNÇÕES DE ENVIO
// =========================================================================
function converterParaFormatoFuncional(numeroOriginal: string): string[] {
  const numeroLimpo = numeroOriginal.replace(/\D/g, '');
  let numeroConvertido = numeroLimpo;
  if (numeroLimpo.length === 12 && numeroLimpo.startsWith('55')) {
    const ddd = numeroLimpo.substring(2, 4);
    const num = numeroLimpo.substring(4);
    if (num.length === 8 && !['1','2','3','4','5'].includes(num.charAt(0))) {
      numeroConvertido = '55' + ddd + '9' + num;
    }
  }
  return ['+' + numeroConvertido, numeroConvertido];
}

async function enviarComFormatosCorretos(from: string, texto: string): Promise<boolean> {
  try {
    const formatos = converterParaFormatoFuncional(from);
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
    console.error('❌ Erro envio WhatsApp:', error);
    return false;
  }
}

async function findFarmacyAPI(whatsappPhoneId: string) {
  if (!hasSupabaseConfig) return null;
  try {
    const headers = new Headers({ 'apikey': SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` });
    const res = await fetch(`${SUPABASE_URL}/rest/v1/client_connections?whatsapp_phone_id=eq.${whatsappPhoneId}&select=api_base_url,client_id`, { method: 'GET', headers });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.[0] || null;
  } catch (error) {
    console.error('❌ Erro findFarmacyAPI:', error);
    return null;
  }
}

async function consultarAPIFarmacia(apiUrl: string, termo: string) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(`${apiUrl}/api/products/search?q=${encodeURIComponent(termo)}`, {
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error('❌ Erro consultarAPIFarmacia:', error);
    throw error;
  }
}

async function buscarEOferecerProdutos(from: string, whatsappPhoneId: string, termoBusca: string): Promise<void> {
  let resposta = `🔍 *Resultados da busca por "${termoBusca}":*\n\n`;

  try {
    const farmacia = await findFarmacyAPI(whatsappPhoneId);
    if (farmacia?.api_base_url) {
      const data = await consultarAPIFarmacia(farmacia.api_base_url, termoBusca);
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
          resposta += `_Mostrando 5 de ${data.data.length} resultados. Refine sua busca._\n`;
        }
      } else {
        resposta += 'Nenhum produto encontrado. Tente outro termo.\n';
      }
    } else {
      resposta += '⚠️ API da farmácia não disponível. Tente novamente mais tarde.\n';
    }
  } catch (error) {
    resposta += '⚠️ Erro ao buscar produtos. Use *ATENDENTE* para ajuda humana.\n';
  }

  await enviarComFormatosCorretos(from, resposta);
  await salvarMensagemNoSupabase(whatsappPhoneId, from, resposta, 'OUT');
}

async function verCarrinho(from: string, whatsappPhoneId: string, customerId: string): Promise<void> {
  const orderId = await getOrCreateCartOrder(customerId, whatsappPhoneId);
  if (!orderId) {
    const msg = '⚠️ Erro ao carregar carrinho.';
    await enviarComFormatosCorretos(from, msg);
    await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
    return;
  }
  const items = await getOrderItems(orderId);
  let total = 0;
  let resposta = `🛒 *SEU CARRINHO* (ID: ${orderId.substring(0, 8)})\n\n`;
  if (items.length === 0) {
    resposta += 'Seu carrinho está vazio! Envie o nome de um produto para começar.';
  } else {
    for (const item of items) {
      const unit = parseFloat(item.unit_price);
      const sub = item.quantity * unit;
      total += sub;
      resposta += `▪️ *${item.product_name}* (${item.product_api_id})\n`;
      resposta += `   Qtd: ${item.quantity} × R$${unit.toFixed(2)} = R$${sub.toFixed(2)}\n`;
    }
    resposta += `\n-------------------------------\n`;
    resposta += `💰 **TOTAL: R$${total.toFixed(2)}**\n`;
    resposta += `-------------------------------\n\n`;
    resposta += `*FINALIZAR* para concluir ou *MENU* para voltar.`;
  }
  await enviarComFormatosCorretos(from, resposta);
  await salvarMensagemNoSupabase(whatsappPhoneId, from, resposta, 'OUT');
  if (items.length > 0) await updateOrderTotal(orderId, total);
}

async function finalizarPedido(from: string, whatsappPhoneId: string, customerId: string): Promise<void> {
  const orderId = await getOrCreateCartOrder(customerId, whatsappPhoneId);
  if (!orderId) {
    await enviarComFormatosCorretos(from, '⚠️ Carrinho vazio ou erro.');
    return;
  }
  try {
    const headers = new Headers({ 'apikey': SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' });
    await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'PENDING', checkout_at: new Date().toISOString() })
    });
    const msg = `🎉 *PEDIDO FINALIZADO!*\n\nSeu pedido (ID: ${orderId.substring(0, 8)}) foi recebido. Em breve entraremos em contato para confirmar pagamento e entrega.`;
    await enviarComFormatosCorretos(from, msg);
    await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
  } catch (error) {
    await enviarComFormatosCorretos(from, '⚠️ Erro ao finalizar. Tente novamente ou fale com *ATENDENTE*.');
    console.error('❌ Erro finalizar pedido:', error);
  }
}

// =========================================================================
// INTEGRAÇÃO COM GEMINI + GOOGLE CSE FALLBACK
// =========================================================================
async function interpretarComGemini(mensagem: string): Promise<{ resposta: string; usarCSE: boolean }> {
  if (!hasGeminiConfig) {
    return { resposta: 'IA desativada. Digite *MENU* para opções.', usarCSE: false };
  }

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      safetySettings: [
        { category: 'HARM_CATEGORY_MEDICAL', threshold: 'BLOCK_NONE' },
      ]
    });

    const prompt = `Você é um assistente de farmácia. Responda com clareza, mas NUNCA dê conselhos médicos.
Se a pergunta for sobre posologia, efeitos colaterais, contraindicações, etc., responda: "Sou um assistente virtual e não posso fornecer orientações médicas. Consulte um farmacêutico."
Mensagem: "${mensagem}"`;

    const result = await model.generateContent(prompt);
    const response = result.response;

    const safetyRatings = response.candidates?.[0]?.safetyRatings || [];
    const isMedicalBlocked = safetyRatings.some(r =>
      r.category === 'HARM_CATEGORY_MEDICAL' &&
      (r.probability === 'HIGH' || r.probability === 'VERY_HIGH')
    );

    if (isMedicalBlocked || response.text?.trim() === '') {
      return { resposta: '', usarCSE: true };
    }

    return { resposta: response.text, usarCSE: false };
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
  await salvarMensagemNoSupabase(whatsappPhoneId, from, messageText, 'IN');

  const comprarMatch = messageText.match(/^comprar\s+(\d+)/i);
  if (comprarMatch) {
    const code = comprarMatch[1];
    const orderId = await getOrCreateCartOrder(customerId, whatsappPhoneId);
    if (orderId && await addItemToCart(orderId, code, 1, whatsappPhoneId)) {
      const msg = `✅ Produto *${code}* adicionado ao carrinho.\n\nDigite *CARRINHO* ou *FINALIZAR*.`;
      await enviarComFormatosCorretos(from, msg);
      await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
      return;
    } else {
      const msg = `❌ Produto *${code}* não encontrado. Verifique o código.`;
      await enviarComFormatosCorretos(from, msg);
      await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
      return;
    }
  }

  const { resposta, usarCSE } = await interpretarComGemini(messageText);

  if (usarCSE) {
    const fallback = await googleFallbackSearch(messageText);
    await enviarComFormatosCorretos(from, fallback);
    await salvarMensagemNoSupabase(whatsappPhoneId, from, fallback, 'OUT');
    return;
  }

  if (resposta.trim() !== '') {
    await enviarComFormatosCorretos(from, resposta);
    await salvarMensagemNoSupabase(whatsappPhoneId, from, resposta, 'OUT');
    return;
  }

  const termo = messageText.trim();
  if (termo.length >= 2) {
    await buscarEOferecerProdutos(from, whatsappPhoneId, termo);
  } else {
    const msg = '*OLÁ! SOU SEU ASSISTENTE VIRTUAL DA FARMÁCIA.*\n\nDigite:\n*1.* Buscar produtos\n*2.* Ver carrinho\n*3.* Falar com atendente\nOu envie o nome de um medicamento/produto.';
    await enviarComFormatosCorretos(from, msg);
    await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
  }
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
    console.error('❌ Erro webhook:', error);
    return new NextResponse('OK', { status: 200 });
  }
}
