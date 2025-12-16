// src/app/api/whatsapp/webhook/route.ts

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

// VARIÁVEIS PARA GOOGLE CUSTOM SEARCH (CSE)
const GOOGLE_CSE_API_KEY = process.env.CUSTOM_SEARCH_API_KEY; // Usando o nome da variável do Vercel
const GOOGLE_CSE_ID = process.env.CUSTOM_SEARCH_CX; // Usando o nome da variável do Vercel

// Flags para verificar configurações disponíveis
const hasWhatsAppConfig = !!(WHATSAPP_VERIFY_TOKEN && WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID);
const hasSupabaseConfig = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
const hasFlaskConfig = !!FLASK_API_URL;
const hasGeminiConfig = !!GEMINI_API_KEY;
const hasCustomSearchConfig = !!(GOOGLE_CSE_API_KEY && GOOGLE_CSE_ID);

// Log de status das configurações (apenas warnings, sem throw)
if (!hasWhatsAppConfig) {
  console.warn('⚠️ AVISO: Variáveis do WhatsApp não configuradas. O webhook não funcionará até que sejam configuradas.');
}

if (!hasSupabaseConfig) {
  console.warn('⚠️ AVISO: Variáveis do Supabase não configuradas. Funcionalidades de CRM/Carrinho desabilitadas.');
}

if (!hasFlaskConfig) {
  console.warn('⚠️ AVISO: Variável FLASK_API_URL não configurada. Busca de produtos desabilitada.');
}

if (!hasGeminiConfig) {
  console.warn('⚠️ AVISO: Variável GEMINI_API_KEY não configurada. IA Gemini desabilitada.');
}

if (!hasCustomSearchConfig) {
  console.warn('⚠️ AVISO: Variáveis do Custom Search (Google CSE) não configuradas. A busca de bulas será feita apenas via Gemini (se disponível).');
}

// Inicialização do Gemini (se configurado)
let ai: GoogleGenerativeAI | undefined;
if (hasGeminiConfig) {
  try {
    ai = new GoogleGenerativeAI(GEMINI_API_KEY!);
  } catch (e) {
    console.error('❌ ERRO ao inicializar Gemini:', e);
    // @ts-ignore
    ai = undefined;
  }
}

// =========================================================================
// GATILHOS E AUXILIARES DE INTENÇÃO
// =========================================================================

const TRIGGERS_BUSCA = [
  'buscar', 'produto', 'consulta', 'preço', 'preco', 'estoque',
  'achar', 'encontrar', 'ver se tem', 'quanto custa', 'me veja', 'me passe',
  'quero', 'tem', 'procurar'
];

const TRIGGERS_CARRINHO = [
  'adicionar', 'carrinho', 'comprar', 'levar', 'mais um', 'pegue'
];

const NOISE_WORDS = new Set([
  ...TRIGGERS_BUSCA,
  ...TRIGGERS_CARRINHO,
  'qual', 'o', 'a', 'os', 'as', 'de', 'do', 'da', 'dos', 'das', 'por', 'um', 'uma',
  'pra', 'eh', 'e', 'me', 'nele', 'dele', 'dela', 'em', 'para', 'na', 'no', 'favor', 'porfavor', 'porgentileza',
  'o produto', 'o item'
]);

// =========================================================================
// FUNÇÕES AUXILIARES DE PROCESSAMENTO DE TEXTO
// =========================================================================

function extrairTermoBusca(mensagem: string): string | null {
  const lowerMsg = mensagem.toLowerCase();
  const isSearchIntent = TRIGGERS_BUSCA.some(trigger => lowerMsg.includes(trigger));

  if (!isSearchIntent) {
    return null;
  }

  const tokens = lowerMsg.split(/\s+/).filter(Boolean);
  const filteredTokens = tokens.filter(token => !NOISE_WORDS.has(token));
  const termo = filteredTokens.join(' ').trim();

  if (termo.length >= 2) {
    return termo;
  }

  return null;
}

function extrairIntencaoCarrinho(mensagem: string): { quantity: number; productCode: string } | null {
  const lowerMsg = mensagem.toLowerCase();
  const isCartIntent = TRIGGERS_CARRINHO.some(trigger => lowerMsg.includes(trigger));
  // Regex para código de produto (pelo menos 6 dígitos)
  const regexCode = /(\d{6,})/i;
  const matchCode = lowerMsg.match(regexCode);

  if (!isCartIntent && !matchCode) {
    return null;
  }

  if (matchCode) {
    const productCode = matchCode[1];
    let quantity = 1;

    // Tentar extrair a quantidade
    // Busca por um número que não é o código de produto
    const regexQuantity = /(?:^|\s)(\d+)(?:\s+(?:do|o|item))?/i;
    const matchQuantity = lowerMsg.match(regexQuantity);

    // Evitar que o código do produto seja confundido com a quantidade se aparecer primeiro
    // CORREÇÃO: Uso do operador de asserção non-null (!) para resolver o erro de tipagem em Vercel/TS.
    if (matchQuantity && matchQuantity[1] !== productCode && matchCode.index! > matchQuantity.index!) {
        quantity = parseInt(matchQuantity[1], 10);
        if (isNaN(quantity) || quantity < 1) quantity = 1;
    }

    return { quantity, productCode };
  }

  return null;
}

function deveFazerBuscaDireta(mensagem: string): boolean {
  const texto = mensagem.toLowerCase().trim();

  // Se já foi identificado como intenção de busca explícita, não fazer busca direta
  if (extrairTermoBusca(mensagem)) return false;

  // Se é um comando numérico do menu
  if (/^[1-4]$/.test(texto)) return false;

  // Se é um comando conhecido
  const comandosConhecidos = ['menu', 'finalizar', 'carrinho', 'atendente', 'ajuda', 'voltar', 'oi', 'ola', 'ok', 'sim', 'nao', 'obrigado', 'obrigada'];
  if (comandosConhecidos.includes(texto)) return false;

  // Se parece ser um código de produto (apenas números) - deve ser tratado como busca
  if (/^\d{6,}$/.test(texto)) return true;

  // Se tem características de pergunta sobre medicamento (será tratado pelo Gemini/CSE)
  const termosMedicamento = ['posologia', 'efeito', 'contraindicacao', 'bula', 'dose', 'como usar', 'que serve'];
  if (termosMedicamento.some(termo => texto.includes(termo))) return false;

  // Se é muito curto (provavelmente não é um produto)
  if (texto.length < 3) return false;

  return true;
}

// =========================================================================
// FUNÇÕES DE CACHE DE PRODUTOS
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

    const payload = {
      product_code: productCode,
      product_name: productName,
      unit_price: unitPrice,
      updated_at: new Date().toISOString()
    };

    await fetch(insertUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.log(`⚠️ Erro ao salvar produto no cache:`, error);
  }
}

async function getProductFromCache(productCode: string): Promise<{ name: string; price: number } | null> {
  if (!hasSupabaseConfig) return null;
  try {
    const selectUrl = `${SUPABASE_URL}/rest/v1/product_cache?product_code=eq.${productCode}`;
    const headers = new Headers({
      'apikey': SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    });

    const response = await fetch(selectUrl, { method: 'GET', headers });
    if (!response.ok) return null;

    const data = await response.json();
    if (data && data.length > 0) {
      return {
        name: data[0].product_name,
        price: data[0].unit_price
      };
    }
    return null;
  } catch (error) {
    console.log(`⚠️ Erro ao buscar produto do cache:`, error);
    return null;
  }
}

// =========================================================================
// FUNÇÕES AUXILIARES DE SUPABASE (CLIENTES, PEDIDOS, ITENS)
// =========================================================================

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
    let selectResponse = await fetch(selectUrl, { method: 'GET', headers });

    if (!selectResponse.ok) {
      throw new Error(`Status de busca de cliente: ${selectResponse.status} - ${await selectResponse.text()}`);
    }

    let data = await selectResponse.json();

    if (data && data.length > 0) {
      const customerId = data[0].id;
      return customerId;
    }

    const insertUrl = `${SUPABASE_URL}/rest/v1/customers`;
    const insertPayload = {
      whatsapp_phone_number: from,
      client_connection_id: whatsappPhoneId,
    };

    const insertResponse = await fetch(insertUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(insertPayload)
    });

    if (!insertResponse.ok) {
      console.error('❌ ERRO ao inserir novo cliente:', await insertResponse.text());
      return null;
    }

    // Busca novamente para pegar o ID gerado (prática comum em APIs REST simples)
    selectResponse = await fetch(selectUrl, { method: 'GET', headers });
    data = await selectResponse.json();

    if (data && data.length > 0) {
      const newCustomerId = data[0].id;
      return newCustomerId;
    }

    return null;

  } catch (error) {
    console.error('❌ Erro crítico no CRM:', error);
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
    let selectResponse = await fetch(selectUrl, { method: 'GET', headers });

    if (!selectResponse.ok) {
      throw new Error(`Status de busca de pedido: ${selectResponse.status} - ${await selectResponse.text()}`);
    }

    let data = await selectResponse.json();

    if (data && data.length > 0) {
      const orderId = data[0].id;
      return orderId;
    }

    const insertUrl = `${SUPABASE_URL}/rest/v1/orders`;
    const insertPayload = {
      customer_id: customerId,
      client_connection_id: whatsappPhoneId,
      status: 'CART',
      total_amount: 0.00
    };

    const insertResponse = await fetch(insertUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(insertPayload)
    });

    if (!insertResponse.ok) {
      console.error('❌ ERRO ao criar novo pedido:', await insertResponse.text());
      return null;
    }

    // Busca novamente para pegar o ID gerado
    selectResponse = await fetch(selectUrl, { method: 'GET', headers });
    data = await selectResponse.json();

    if (data && data.length > 0) {
      const newOrderId = data[0].id;
      return newOrderId;
    }

    return null;

  } catch (error) {
    console.error('❌ Erro crítico no Carrinho:', error);
    return null;
  }
}

async function getOrderItems(orderId: string): Promise<any[]> {
  if (!hasSupabaseConfig) return [];
  try {
    const headers = new Headers({
      'apikey': SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    });

    const selectUrl = `${SUPABASE_URL}/rest/v1/order_items?order_id=eq.${orderId}&select=*`;
    const selectResponse = await fetch(selectUrl, { method: 'GET', headers });

    if (!selectResponse.ok) {
      console.error('❌ ERRO ao buscar itens do pedido:', await selectResponse.text());
      return [];
    }

    const data = await selectResponse.json();
    return data || [];

  } catch (error) {
    console.error('❌ Erro crítico ao buscar itens do pedido:', error);
    return [];
  }
}

async function updateOrderTotal(orderId: string, newTotal: number): Promise<void> {
  if (!hasSupabaseConfig) return;
  try {
    const updateUrl = `${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`;
    const headers = new Headers({
      'apikey': SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    });

    const updatePayload = {
      total_amount: newTotal
    };

    const response = await fetch(updateUrl, {
      method: 'PATCH',
      headers: headers,
      body: JSON.stringify(updatePayload)
    });

    if (!response.ok) {
      console.error('❌ ERRO ao atualizar total do pedido:', await response.text());
    }
  } catch (error) {
    console.error('❌ Erro crítico ao atualizar total do pedido:', error);
  }
}

async function recalcularTotalCarrinho(orderId: string): Promise<void> {
  if (!hasSupabaseConfig) return;
  const items = await getOrderItems(orderId);
  const newTotal = items.reduce((acc, item) => acc + (item.total_price || 0), 0);
  await updateOrderTotal(orderId, newTotal);
}

async function addItemToCart(
  orderId: string,
  productCode: string,
  quantity: number,
  whatsappPhoneId: string
): Promise<boolean> {
  if (!hasSupabaseConfig) return false;
  try {
    console.log(`🛒 Adicionando produto ${productCode} ao carrinho (ordem: ${orderId})`);

    let productName = `Produto ${productCode}`;
    let unitPrice = 0;

    // 💾 PRIMEIRO: Tentar buscar do CACHE
    const cachedProduct = await getProductFromCache(productCode);

    if (cachedProduct) {
      productName = cachedProduct.name;
      unitPrice = cachedProduct.price;
      console.log(`✅ ENCONTRADO NO CACHE: ${productName} - R$ ${unitPrice}`);
    } else {
      // 🔍 SE NÃO ESTIVER NO CACHE: Tentar buscar produto pela API (opcional)
      if (FLASK_API_URL) {
        try {
          const searchUrl = `${FLASK_API_URL}/api/products/search?q=${encodeURIComponent(productCode)}`;

          const searchResponse = await fetch(searchUrl, {
            headers: {
              'Content-Type': 'application/json',
              'ngrok-skip-browser-warning': 'true',
              'User-Agent': 'WhatsAppWebhook/1.0'
            }
          });

          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            // Buscar pelo código exato
            const product = searchData.data?.find((p: any) => String(p.cod_reduzido) === productCode);

            if (product) {
              productName = product.nome_produto;
              const priceStr = product.preco_final_venda.replace(/[^\d,]/g, '').replace(',', '.');
              unitPrice = parseFloat(priceStr) || 0;
              console.log(`✅ Encontrado na API: ${productName} - R$ ${unitPrice}`);
              // Salvar no cache para próxima vez
              await saveProductToCache(productCode, productName, unitPrice);
            } else {
              console.log(`⚠️ Produto não encontrado na API`);
            }
          } else {
            console.log(`⚠️ API retornou erro ${searchResponse.status}`);
          }
        } catch (apiError) {
          console.log(`⚠️ Erro ao consultar API Flask: ${apiError}`);
        }
      }
    }

    const totalPrice = unitPrice * quantity;

    // 📝 Inserir item no Supabase
    const insertUrl = `${SUPABASE_URL}/rest/v1/order_items`;
    const headers = new Headers({
      'apikey': SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    });

    const insertPayload = {
      order_id: orderId,
      product_api_id: productCode,
      product_name: productName,
      quantity: quantity,
      unit_price: unitPrice,
      total_price: totalPrice
    };

    const insertResponse = await fetch(insertUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(insertPayload)
    });

    if (!insertResponse.ok) {
      const errorText = await insertResponse.text();
      console.error('❌ ERRO ao inserir item no carrinho:', errorText);
      return false;
    }

    // 💰 Recalcular total do pedido
    await recalcularTotalCarrinho(orderId);

    console.log(`✅ Produto adicionado ao carrinho com sucesso!`);
    return true;

  } catch (error) {
    console.error('❌ Erro crítico ao adicionar item ao carrinho:', error);
    return false;
  }
}

async function salvarMensagemNoSupabase(
  whatsappPhoneId: string,
  from: string,
  body: string,
  direction: 'IN' | 'OUT'
): Promise<void> {
  if (!hasSupabaseConfig) return;
  try {
    const url = `${SUPABASE_URL}/rest/v1/whatsapp_messages`;

    const headers = new Headers({
      'apikey': SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    });

    const payload = {
      whatsapp_phone_id: whatsappPhoneId,
      from_number: from,
      message_body: body,
      direction: direction,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error(`❌ ERRO ao salvar mensagem no Supabase:`, await response.text());
    }

  } catch (error) {
    console.error(`❌ Erro crítico ao salvar mensagem:`, error);
  }
}

// =========================================================================
// FUNÇÕES AUXILIARES DE INTEGRAÇÃO (WHATSAPP API)
// =========================================================================

async function enviarComFormatosCorretos(to: string, text: string): Promise<boolean> {
  if (!hasWhatsAppConfig) {
    console.error('❌ WhatsApp API não configurada. Não é possível enviar a mensagem.');
    return false;
  }
  const apiUrl = `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const headers = {
    'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  };
  const body = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'text',
    text: { body: text }
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      console.error('❌ ERRO ao enviar mensagem:', response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error('❌ Erro de rede/fetch ao enviar mensagem:', error);
    return false;
  }
}

async function enviarMenuInicial(from: string, whatsappPhoneId: string): Promise<boolean> {
  const texto = '*OLÁ! SOU SEU ASSISTENTE VIRTUAL DA FARMÁCIA.*\\n\\n' +
    'Como posso te ajudar hoje?\\n\\n' +
    'Digite o *número* da opção desejada, ou digite o nome do produto/medicamento:\\n' +
    '*1.* 🔍 Buscar Preços e Estoque de Produtos\\n' +
    '*2.* 💊 Consultar Informações de Medicamentos (Bula)\\n' +
    '*3.* 🛒 Ver/Finalizar Carrinho\\n' +
    '*4.* 👩‍💻 Falar com um Atendente (Horário Comercial)\\n';

  const result = await enviarComFormatosCorretos(from, texto);
  if (result && hasSupabaseConfig) {
    await salvarMensagemNoSupabase(whatsappPhoneId, from, texto, 'OUT');
  }
  return result;
}

// =========================================================================
// FUNÇÕES DE BUSCA DE BULA (GOOGLE CSE)
// =========================================================================

async function handleGoogleCustomSearch(query: string): Promise<string | null> {
    if (!hasCustomSearchConfig) return null;

    // Adapta a query para buscar bulas
    const fullQuery = `bula posologia ${query}`; 
    console.log(`🔍 Buscando informações de bula via Google CSE para: "${fullQuery}"`);

    try {
        const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_API_KEY}&cx=${GOOGLE_CSE_ID}&q=${encodeURIComponent(fullQuery)}`;

        const response = await fetch(searchUrl, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'WhatsAppBulaBot/1.0'
            }
        });

        if (!response.ok) {
            console.error(`❌ Google CSE API retornou erro ${response.status}: ${await response.text()}`);
            return null;
        }

        const data = await response.json();
        const items = data.items || [];

        if (items.length === 0) {
            return null;
        }

        let searchResults = `📚 *Bula e Informações sobre ${query} (Fonte Externa)*:\n\n`;
        
        // Limita a 3 resultados
        items.slice(0, 3).forEach((item: any, index: number) => {
            const title = item.title || 'Resultado Sem Título';
            // Limpeza básica do snippet
            const snippet = item.snippet ? item.snippet.replace(/\n/g, ' ').trim() : 'Sem resumo disponível.';
            const link = item.link || '#';

            searchResults += `*${index + 1}. ${title}*\n`;
            searchResults += `_${snippet.substring(0, 200)}..._\n`; // Trunca o snippet
            searchResults += `[Clique para ver a fonte completa](${link})\n\n`;
        });

        searchResults += '⚠️ _Aviso: Consulte sempre um médico ou farmacêutico para obter orientações específicas de saúde._';
        return searchResults;

    } catch (error) {
        console.error('❌ Erro ao consultar a API do Google Custom Search:', error);
        return null;
    }
}


// =========================================================================
// FUNÇÕES DE MANIPULAÇÃO DE INTENÇÕES
// =========================================================================

async function handleProductSearch(
  from: string,
  whatsappPhoneId: string,
  searchTerm: string
): Promise<boolean> {
  const isCode = /^\d{6,}$/.test(searchTerm);
  console.log(`🔎 Processando busca: "${searchTerm}" (É código? ${isCode})`);

  if (!hasFlaskConfig) {
    const msg = `⚠️ Desculpe, a busca por produtos está indisponível no momento. Por favor, tente mais tarde ou digite *4* para falar com um atendente.`;
    const sent = await enviarComFormatosCorretos(from, msg);
    if (sent && hasSupabaseConfig) await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
    return sent;
  }

  try {
    const searchUrl = `${FLASK_API_URL}/api/products/search?q=${encodeURIComponent(searchTerm)}`;
    const response = await fetch(searchUrl, {
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true', 'User-Agent': 'WhatsAppWebhook/1.0' }
    });

    if (!response.ok) {
      throw new Error(`API status: ${response.status}`);
    }

    const searchData = await response.json();
    const products = searchData.data || [];

    if (products.length === 0) {
      const msg = `❌ Nenhum produto encontrado para "${searchTerm}". Tente refinar sua busca.`;
      const sent = await enviarComFormatosCorretos(from, msg);
      if (sent && hasSupabaseConfig) await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
      return sent;
    }

    // Limitar a 5 resultados
    const topProducts = products.slice(0, 5);

    let reply = `✅ Encontrei ${topProducts.length} produtos para "${searchTerm}":\n\n`;
    reply += topProducts.map((p: any, index: number) => {
      const priceStr = p.preco_final_venda.replace(/[^\d,]/g, '').replace(',', '.');
      const unitPrice = parseFloat(priceStr) || 0;
      const priceFormatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(unitPrice);

      // Salvar no cache assincronamente
      if (hasSupabaseConfig) {
        saveProductToCache(String(p.cod_reduzido), p.nome_produto, unitPrice);
      }

      return `*${index + 1}.* ${p.nome_produto} (${p.cod_reduzido}) - *${priceFormatted}*\n   _Para adicionar, digite: adicionar ${p.cod_reduzido}_`;
    }).join('\n\n');

    reply += '\n\nDigite o nome ou código de outro produto para continuar buscando, ou *MENU* para voltar.';

    const sent = await enviarComFormatosCorretos(from, reply);
    if (sent && hasSupabaseConfig) await salvarMensagemNoSupabase(whatsappPhoneId, from, reply, 'OUT');
    return sent;

  } catch (error) {
    console.error('❌ Erro na busca de produtos:', error);
    const msg = `⚠️ Desculpe, houve um erro ao processar sua busca. Tente novamente mais tarde.`;
    const sent = await enviarComFormatosCorretos(from, msg);
    if (sent && hasSupabaseConfig) await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
    return sent;
  }
}

async function handleAddToCart(
  from: string,
  whatsappPhoneId: string,
  quantity: number,
  productCode: string
): Promise<boolean> {
  if (!hasSupabaseConfig) {
    const msg = `⚠️ Desculpe, a funcionalidade de carrinho está temporariamente indisponível. Por favor, digite *4* para falar com um atendente.`;
    const sent = await enviarComFormatosCorretos(from, msg);
    if (sent && hasSupabaseConfig) await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
    return sent;
  }

  const customerId = await getOrCreateCustomer(from, whatsappPhoneId);
  if (!customerId) {
    const msg = `❌ Não foi possível identificar seu cadastro. Tente novamente mais tarde.`;
    const sent = await enviarComFormatosCorretos(from, msg);
    if (sent && hasSupabaseConfig) await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
    return sent;
  }

  const orderId = await getOrCreateCartOrder(customerId, whatsappPhoneId);
  if (!orderId) {
    const msg = `❌ Não foi possível criar seu carrinho. Tente novamente mais tarde.`;
    const sent = await enviarComFormatosCorretos(from, msg);
    if (sent && hasSupabaseConfig) await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
    return sent;
  }

  const added = await addItemToCart(orderId, productCode, quantity, whatsappPhoneId);

  if (added) {
    const msg = `✅ *${quantity} unidade(s)* do produto (cód: ${productCode}) adicionada(s) ao seu carrinho! Digite *CARRINHO* para ver o total ou *MENU* para continuar.`;
    const sent = await enviarComFormatosCorretos(from, msg);
    if (sent && hasSupabaseConfig) await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
    return sent;
  } else {
    const msg = `❌ Não foi possível adicionar o produto (cód: ${productCode}) ao carrinho. Verifique se o código está correto ou se a API de busca está disponível.`;
    const sent = await enviarComFormatosCorretos(from, msg);
    if (sent && hasSupabaseConfig) await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
    return sent;
  }
}

async function handleViewCart(from: string, whatsappPhoneId: string): Promise<boolean> {
  if (!hasSupabaseConfig) {
    const msg = `⚠️ Desculpe, a funcionalidade de carrinho está indisponível.`;
    const sent = await enviarComFormatosCorretos(from, msg);
    if (sent && hasSupabaseConfig) await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
    return sent;
  }

  const customerId = await getOrCreateCustomer(from, whatsappPhoneId);
  if (!customerId) return false;

  const orderId = await getOrCreateCartOrder(customerId, whatsappPhoneId);
  if (!orderId) {
    const msg = `🛒 Seu carrinho está vazio! Comece buscando produtos no *MENU*.`;
    const sent = await enviarComFormatosCorretos(from, msg);
    if (sent && hasSupabaseConfig) await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
    return sent;
  }

  const items = await getOrderItems(orderId);
  await recalcularTotalCarrinho(orderId);

  if (items.length === 0) {
    const msg = `🛒 Seu carrinho está vazio! Comece buscando produtos no *MENU*.`;
    const sent = await enviarComFormatosCorretos(from, msg);
    if (sent && hasSupabaseConfig) await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
    return sent;
  }

  const total = items.reduce((sum, item) => sum + item.total_price, 0);
  const totalFormatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total);

  let cartSummary = `🛒 *Seu Carrinho de Compras* (Total: ${totalFormatted}):\n\n`;
  cartSummary += items.map((item, index) => {
    const unitPriceFormatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unit_price);
    const totalPriceFormatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.total_price);
    return `*${index + 1}.* ${item.product_name}\n   - Qtd: ${item.quantity} x ${unitPriceFormatted} = ${totalPriceFormatted}`;
  }).join('\n\n');

  cartSummary += '\n\nPara *finalizar* seu pedido e ser atendido, digite *FINALIZAR*.';

  const sent = await enviarComFormatosCorretos(from, cartSummary);
  if (sent && hasSupabaseConfig) await salvarMensagemNoSupabase(whatsappPhoneId, from, cartSummary, 'OUT');
  return sent;
}

async function handleFinalizeOrder(from: string, whatsappPhoneId: string): Promise<boolean> {
    if (!hasSupabaseConfig) {
        const msg = `⚠️ Desculpe, a finalização de pedido está indisponível. Por favor, ligue para (XX) XXXX-XXXX.`;
        const sent = await enviarComFormatosCorretos(from, msg);
        if (sent && hasSupabaseConfig) await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
        return sent;
    }

    const customerId = await getOrCreateCustomer(from, whatsappPhoneId);
    const orderId = customerId ? await getOrCreateCartOrder(customerId, whatsappPhoneId) : null;
    if (!orderId) {
        const msg = `❌ Seu carrinho está vazio. Não há pedido para finalizar.`;
        const sent = await enviarComFormatosCorretos(from, msg);
        if (sent && hasSupabaseConfig) await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
        return sent;
    }
    
    // Verifique se o carrinho tem itens antes de finalizar
    const items = await getOrderItems(orderId);
    if (items.length === 0) {
        const msg = `❌ Seu carrinho está vazio. Adicione produtos antes de finalizar.`;
        const sent = await enviarComFormatosCorretos(from, msg);
        if (sent && hasSupabaseConfig) await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
        return sent;
    }

    const headers = new Headers({
        'apikey': SUPABASE_ANON_KEY!,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
    });
    
    // Atualizar status para PENDING_REVIEW
    const updateUrl = `${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`;
    const updatePayload = { status: 'PENDING_REVIEW' };
    const response = await fetch(updateUrl, { method: 'PATCH', headers, body: JSON.stringify(updatePayload) });

    if (!response.ok) {
        console.error('❌ Erro ao finalizar pedido:', await response.text());
        const msg = `❌ Ocorreu um erro ao finalizar seu pedido. Por favor, digite *4* para falar com um atendente.`;
        const sent = await enviarComFormatosCorretos(from, msg);
        if (sent && hasSupabaseConfig) await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
        return sent;
    }

    const msg = `🎉 *PEDIDO FINALIZADO!* 🎉\n\nSeu pedido foi registrado e um de nossos atendentes irá entrar em contato em breve para confirmar a entrega e o pagamento.\n\nNúmero do seu pedido: *${orderId.substring(0, 8)}*.\n\nObrigado por comprar conosco! Digite *MENU* para recomeçar.`;
    const sent = await enviarComFormatosCorretos(from, msg);
    if (sent && hasSupabaseConfig) await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
    return sent;
}

async function handleGemini(
  from: string,
  whatsappPhoneId: string,
  message: string
): Promise<boolean> {
  console.log(`🧠 Processando consulta de medicamento: "${message}"`);
  
  let replyMsg = '';

  // 1. TENTA USAR A BUSCA CUSTOMIZADA (GOOGLE CSE) PARA INFORMAÇÕES DE BULA
  if (hasCustomSearchConfig) {
    const searchResult = await handleGoogleCustomSearch(message);
    if (searchResult) {
      replyMsg = searchResult;
    }
  }

  // 2. SE A BUSCA FALHOU OU NÃO ESTÁ CONFIGURADA, USA GEMINI COMO FALLBACK
  if (!replyMsg) {
    if (!hasGeminiConfig || !ai) {
        // Se a busca e o Gemini falharam
        replyMsg = `⚠️ Desculpe, não consegui encontrar informações detalhadas sobre "${message}" no momento. Por favor, tente a busca de produtos (opção 1) ou fale com um atendente (opção 4).`;
    } else {
        // Usa Gemini
        try {
            const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });
            const prompt = `Você é um assistente virtual de uma farmácia brasileira. Responda à pergunta do usuário sobre medicamentos, saúde ou produtos de forma profissional e informativa. *ATENÇÃO*: Não faça diagnósticos, não prescreva tratamentos. Sempre inclua um aviso como: "Consulte um médico ou farmacêutico para obter orientações específicas." O usuário perguntou: "${message}"`;
            
            const result = await model.generateContent(prompt);
            replyMsg = result.text.trim();

            // Adicionar aviso de segurança se não houver
            if (!replyMsg.toLowerCase().includes('consulte') && !replyMsg.toLowerCase().includes('médico') && !replyMsg.toLowerCase().includes('farmacêutico')) {
                replyMsg += '\n\n⚠️ _Lembre-se: Consulte sempre um médico ou farmacêutico para orientações específicas de saúde._';
            }

        } catch (error) {
            console.error('❌ Erro no Gemini:', error);
            replyMsg = `⚠️ Desculpe, houve um erro ao consultar as informações. Tente novamente mais tarde.`;
        }
    }
  }


  const sent = await enviarComFormatosCorretos(from, replyMsg);
  if (sent && hasSupabaseConfig) await salvarMensagemNoSupabase(whatsappPhoneId, from, replyMsg, 'OUT');
  return sent;
}

// =========================================================================
// HANDLER PRINCIPAL DE MENSAGENS
// =========================================================================

async function handleWhatsAppMessage(body: any): Promise<NextResponse> {
  const changes = body.entry?.[0]?.changes?.[0];
  const messageData = changes?.value?.messages?.[0];
  const whatsappPhoneId = changes?.value?.metadata?.phone_number_id;

  if (!messageData || messageData.type !== 'text') {
    return NextResponse.json({ status: 'Mensagem ignorada (não é texto ou notificação)' }, { status: 200 });
  }

  const { from, text } = messageData;
  const incomingMessage = text.body;
  const lowerCaseMsg = incomingMessage.toLowerCase().trim();

  console.log(`📥 Nova mensagem de ${from}: "${incomingMessage}"`);

  // Salvar mensagem de entrada no Supabase (se configurado)
  if (hasSupabaseConfig) {
    await salvarMensagemNoSupabase(whatsappPhoneId, from, incomingMessage, 'IN');
  }

  // 1. **Comandos Diretos e Menu**
  if (['menu', 'ajuda', 'olá', 'oi', 'voltar'].includes(lowerCaseMsg) || lowerCaseMsg === '0' || lowerCaseMsg.length < 3) {
    await enviarMenuInicial(from, whatsappPhoneId);
    return NextResponse.json({ status: 'Menu enviado' }, { status: 200 });
  }

  // Opção 1: Intenção de Buscar Produtos
  if (lowerCaseMsg === '1') {
    const msg = '🔍 Por favor, digite o *nome* ou *código* do produto que você deseja consultar o preço e estoque.';
    await enviarComFormatosCorretos(from, msg);
    if (hasSupabaseConfig) await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
    return NextResponse.json({ status: 'Intenção de Busca confirmada' }, { status: 200 });
  }

  // Opção 2: Intenção de Consultar Medicamentos
  if (lowerCaseMsg === '2') {
    const msg = '💊 Por favor, digite o *nome do medicamento* sobre o qual você gostaria de saber mais (ex: posologia, efeitos, etc.).';
    await enviarComFormatosCorretos(from, msg);
    if (hasSupabaseConfig) await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
    return NextResponse.json({ status: 'Intenção de Bula confirmada' }, { status: 200 });
  }

  // Opção 3: Ver Carrinho
  if (lowerCaseMsg === '3' || lowerCaseMsg === 'carrinho') {
    await handleViewCart(from, whatsappPhoneId);
    return NextResponse.json({ status: 'Carrinho visualizado' }, { status: 200 });
  }

  // Finalizar Pedido
  if (lowerCaseMsg === 'finalizar') {
    await handleFinalizeOrder(from, whatsappPhoneId);
    return NextResponse.json({ status: 'Pedido finalizado' }, { status: 200 });
  }

  // Opção 4: Falar com Atendente
  if (lowerCaseMsg === '4' || lowerCaseMsg === 'atendente') {
    const msg = '👩‍💻 Certo! Estou transferindo seu atendimento para um de nossos atendentes. Eles continuarão a conversa por aqui em breve. Por favor, aguarde.';
    await enviarComFormatosCorretos(from, msg);
    if (hasSupabaseConfig) await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
    // **TODO:** Adicionar lógica de transferência/flag de atendimento humano no Supabase.
    return NextResponse.json({ status: 'Transferido para atendente' }, { status: 200 });
  }

  // 2. **Intenção de Adicionar ao Carrinho (Comando Expresso)**
  const cartIntent = extrairIntencaoCarrinho(incomingMessage);
  if (cartIntent) {
    await handleAddToCart(from, whatsappPhoneId, cartIntent.quantity, cartIntent.productCode);
    return NextResponse.json({ status: 'Adicionar ao Carrinho processado' }, { status: 200 });
  }

  // 3. **Intenção de Busca de Produto (Comando Expresso)**
  const explicitSearchTerm = extrairTermoBusca(incomingMessage);
  if (explicitSearchTerm) {
    await handleProductSearch(from, whatsappPhoneId, explicitSearchTerm);
    return NextResponse.json({ status: 'Busca de Produto processada' }, { status: 200 });
  }

  // 4. **Busca Direta (Usuário digitou o nome do produto/código sem trigger)**
  if (deveFazerBuscaDireta(incomingMessage)) {
    await handleProductSearch(from, whatsappPhoneId, incomingMessage);
    return NextResponse.json({ status: 'Busca Direta processada' }, { status: 200 });
  }
  
  // 5. **Consulta de Bula/Medicamentos (CSE / Gemini - Fallback)**
  // Se não foi capturado por nenhuma intenção de e-commerce e tem mais de 3 caracteres, assume-se que é uma consulta de saúde.
  if (incomingMessage.length >= 3 && !['oi', 'ola'].includes(lowerCaseMsg)) {
      await handleGemini(from, whatsappPhoneId, incomingMessage);
      return NextResponse.json({ status: 'Consulta Gemini/CSE processada' }, { status: 200 });
  }


  // 6. **Fallback (Resposta Genérica)**
  const fallbackMsg = 'Desculpe, não entendi sua mensagem. Digite *MENU* para ver as opções disponíveis.';
  await enviarComFormatosCorretos(from, fallbackMsg);
  if (hasSupabaseConfig) await salvarMensagemNoSupabase(whatsappPhoneId, from, fallbackMsg, 'OUT');
  return NextResponse.json({ status: 'Fallback' }, { status: 200 });
}

// =========================================================================
// MÉTODOS HTTP (GET e POST)
// =========================================================================

/**
 * Manipula a requisição GET para verificação do Webhook do WhatsApp.
 * @param req 
 * @returns 
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
    console.log('✅ Webhook verificado com sucesso!');
    return new NextResponse(challenge, { status: 200 });
  } else {
    console.error('❌ Falha na verificação do Webhook.');
    return new NextResponse('Falha na Verificação.', { status: 403 });
  }
}

/**
 * Manipula a requisição POST para receber dados do Webhook do WhatsApp.
 * @param req 
 * @returns 
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!hasWhatsAppConfig) {
    console.error('❌ ERRO: Variáveis do WhatsApp não configuradas para POST.');
    return NextResponse.json({ status: 'Erro de configuração' }, { status: 500 });
  }
  
  try {
    const body = await req.json();
    console.log('Recebendo POST do Webhook:', JSON.stringify(body, null, 2));

    if (body.object === 'whatsapp_business_account') {
      return await handleWhatsAppMessage(body);
    }

    return NextResponse.json({ status: 'Evento ignorado' }, { status: 200 });
  } catch (error) {
    console.error('❌ ERRO ao processar requisição POST:', error);
    return NextResponse.json({ status: 'Erro interno no servidor' }, { status: 500 });
  }
}
