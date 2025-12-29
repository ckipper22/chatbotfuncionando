import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppAPI } from '@/lib/whatsapp-api';

// =========================================================================
// NOVO: SUPABASE CONVERSATION STATES (PERSISTÊNCIA DE ESTADO)
// =========================================================================

async function saveConversationState(
  whatsappPhoneNumber: string,
  whatsappPhoneId: string,
  state: string,
  context: any = {},
  supabaseUrl: string,
  supabaseAnonKey: string
) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/conversation_states`, {
      method: 'POST',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        whatsapp_phone_number: whatsappPhoneNumber,
        whatsapp_phone_id: whatsappPhoneId,
        state,
        context,
        expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
      })
    });
    console.log(`[STATES] 💾 Estado "${state}" salvo para ${whatsappPhoneNumber}`);
  } catch (e) {
    console.error('[STATES] ❌ Erro ao salvar estado:', e);
  }
}

async function getConversationState(
  whatsappPhoneNumber: string,
  whatsappPhoneId: string,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/conversation_states?whatsapp_phone_number=eq.${whatsappPhoneNumber}&whatsapp_phone_id=eq.${whatsappPhoneId}&expires_at=gte.${new Date().toISOString()}&select=state`,
      {
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`
        }
      }
    );
    const states = await res.json();
    return states?.[0]?.state || null;
  } catch (e) {
    console.error('[STATES] ❌ Erro ao buscar estado:', e);
    return null;
  }
}

async function clearConversationState(
  whatsappPhoneNumber: string,
  whatsappPhoneId: string,
  supabaseUrl: string,
  supabaseAnonKey: string
) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/conversation_states`, {
      method: 'DELETE',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        whatsapp_phone_number: whatsappPhoneNumber,
        whatsapp_phone_id: whatsappPhoneId
      })
    });
  } catch (e) {
    console.error('[STATES] ❌ Erro ao limpar estado:', e);
  }
}

// =========================================================================
// CONFIGURAÇÕES
// =========================================================================

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
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

// Cache em memória (mantido como fallback)
const cacheEstados = new Map<string, string>();

// =========================================================================
// UTILITÁRIOS: FORMATAÇÃO DE TELEFONE
// =========================================================================

function formatarNumeroWhatsAppParaEnvio(numero: string): string {
  let limpo = numero.replace(/\D/g, '');

  if (limpo.startsWith('55')) {
    if (limpo.length === 12 && !limpo.startsWith('559', 2)) {
      const ddd = limpo.substring(2, 4);
      const resto = limpo.substring(4);
      limpo = `55${ddd}9${resto}`;
      console.log(`[RASTREAMENTO] 📱 Adicionado o 9 para envio: ${limpo}`);
    }
  }
  return limpo;
}

// =========================================================================
/** SUPABASE: LOG DE MENSAGENS (já existia, mantido) */
// =========================================================================

async function saveMessageToSupabase(
  messageData: {
    whatsapp_phone_id: string;
    from_number: string;
    message_body: string;
    direction: 'inbound' | 'outbound';
  },
  supabaseUrl: string,
  supabaseAnonKey: string
) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/whatsapp_messages`, {
      method: 'POST',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(messageData)
    });

    if (!res.ok) {
      const errorData = await res.json();
      console.error(
        `[SUPABASE] ❌ Falha ao salvar mensagem na tabela whatsapp_messages:`,
        JSON.stringify(errorData, null, 2)
      );
    } else {
      console.log(
        `[SUPABASE] ✅ Mensagem salva: ${messageData.direction} de ${messageData.from_number}`
      );
    }
  } catch (error) {
    console.error(`[SUPABASE] ❌ Erro ao salvar mensagem no DB:`, error);
  }
}

async function sendWhatsappMessageAndSaveHistory(
  customerPhoneNumber: string,
  text: string,
  supabaseUrl: string,
  supabaseAnonKey: string
) {
  const formattedCustomerNumber = formatarNumeroWhatsAppParaEnvio(customerPhoneNumber);

  await whatsapp.sendTextMessage(formattedCustomerNumber, text);

  await saveMessageToSupabase(
    {
      whatsapp_phone_id: WHATSAPP_PHONE_NUMBER_ID || '',
      from_number: customerPhoneNumber,
      message_body: text,
      direction: 'outbound'
    },
    supabaseUrl,
    supabaseAnonKey
  );
}

// =========================================================================
// MENU INTERATIVO (já existia, mantido)
// =========================================================================

async function enviarMenuBoasVindas(
  customerPhoneNumber: string,
  nomeFarmacia: string,
  supabaseUrl: string,
  supabaseAnonKey: string
) {
  const formattedCustomerNumber = formatarNumeroWhatsAppParaEnvio(customerPhoneNumber);
  const url = `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

  console.log(`[MENU] 📱 Preparando menu para: ${formattedCustomerNumber}`);

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: formattedCustomerNumber,
    type: 'interactive',
    interactive: {
      type: 'button',
      header: { type: 'text', text: nomeFarmacia.substring(0, 60) },
      body: {
        text: 'Olá! Como posso ajudar você hoje?\nEscolha uma das opções abaixo para começar:'
      },
      footer: { text: 'Assistente Virtual Farmacêutico' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'menu_estoque', title: 'Preço ou Estoque' } },
          { type: 'reply', reply: { id: 'menu_info', title: 'Informação Médica' } },
          { type: 'reply', reply: { id: 'menu_outros', title: 'Outro Assunto' } }
        ]
      }
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`
    },
    body: JSON.stringify(payload)
  });

  const resData = await res.json();
  if (!res.ok) {
    console.error(
      `[WHATSAPP API] ❌ ERRO 400 NO MENU:`,
      JSON.stringify(resData, null, 2)
    );
  } else {
    console.log(`[WHATSAPP API] ✅ Menu enviado com sucesso.`);
    await saveMessageToSupabase(
      {
        whatsapp_phone_id: WHATSAPP_PHONE_NUMBER_ID || '',
        from_number: customerPhoneNumber,
        message_body: payload.interactive.body.text,
        direction: 'outbound'
      },
      supabaseUrl,
      supabaseAnonKey
    );
  }
}

// =========================================================================
// INTEGRAÇÕES: FLASK / GOOGLE
// =========================================================================

function parseCurrencyStringToFloat(currencyString: string | undefined): number {
  if (!currencyString) return 0;
  const cleanedString = currencyString.replace('R$', '').trim().replace(',', '.');
  return parseFloat(cleanedString) || 0;
}

async function consultarEstoqueFlask(
  termo: string,
  apiBase: string
): Promise<string> {
  console.log(`[FLASK] 🔍 Buscando: "${termo}" em ${apiBase}`);
  try {
    const base = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
    if (!apiBase) {
      console.warn(
        `[FLASK] ⚠️ apiBase está vazia ou inválida, pulando consulta Flask.`
      );
      return '⚠️ Serviço de consulta de estoque indisponível. Por favor, contate o administrador.';
    }
    const res = await fetch(
      `${base}/api/products/search?q=${encodeURIComponent(termo)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const data = await res.json();
    const produtos = data.data || [];

    if (produtos.length === 0)
      return `❌ Não encontrei "*${termo}*" em estoque agora.`;

    let resposta = `✅ *Produtos Encontrados:*\n\n`;
    produtos.forEach((p: any) => {
      const nomeProduto = p.nome_produto || 'Produto sem nome';
      const nomLaboratorio = p.nom_laboratorio || 'Laboratório não informado';

      const precoBruto = parseCurrencyStringToFloat(p.vlr_venda);
      const precoFinalVenda = parseCurrencyStringToFloat(p.preco_final_venda);

      const qtdEstoque = p.qtd_estoque !== undefined ? p.qtd_estoque : '0';
      const codReduzido = p.cod_reduzido || 'N/A';

      resposta += `▪️ *${nomeProduto}*\n`;
      resposta += `   💊 ${nomLaboratorio}\n`;

      if (precoBruto > precoFinalVenda && precoBruto > 0) {
        const descontoPercentual =
          ((precoBruto - precoFinalVenda) / precoBruto) * 100;
        // CORRIGIDO AQUI: Removido o '%' extra após o preço
        resposta += `   💰 ~~R$ ${precoBruto
          .toFixed(2)
          .replace('.', ',')}~~ *R$ ${precoFinalVenda
          .toFixed(2)
          .replace('.', ',')}* (🔻${descontoPercentual
          .toFixed(1)
          .replace('.', ',')}% OFF)\n`;
      } else {
        // CORRIGIDO AQUI: Removido o '%' extra após o preço
        resposta += `   💰 *R$ ${precoFinalVenda
          .toFixed(2)
          .replace('.', ',')}*\n`;
      }
      resposta += `   📦 Estoque: ${qtdEstoque} unidades\n`;
      resposta += `   📋 Código: ${codReduzido}\n\n`;
    });

    resposta += `Digite *COMPRAR CÓDIGO* para adicionar um item ao carrinho. Ex: COMPRAR 12345`;
    return resposta;
  } catch (e) {
    console.error(`[FLASK] ❌ Erro:`, e);
    return '⚠️ Erro ao consultar o estoque local.';
  }
}

async function consultarGoogleInfo(pergunta: string): Promise<string> {
  console.log(`[GOOGLE] 🌐 Buscando info para: "${pergunta}"`);
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_KEY}&cx=${GOOGLE_CSE_CX}&q=${encodeURIComponent(
      pergunta
    )}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.items?.length)
      return '🔍 Não localizei informações técnicas sobre isso.';
    return `💊 *Informação Técnica:*\n\n${data.items[0].snippet}\n\n🔗 *Fonte:* ${data.items[0].link}`;
  } catch (e) {
    return '⚠️ Erro na busca técnica.';
  }
}

// =========================================================================
// NOVO: RATE LIMIT POR NÚMERO (whatsapp_messages)
// =========================================================================

async function checkRateLimit(
  fromNumber: string,
  phoneId: string,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<boolean> {
  try {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const url = `${supabaseUrl}/rest/v1/whatsapp_messages` +
      `?from_number=eq.${fromNumber}` +
      `&whatsapp_phone_id=eq.${phoneId}` +
      `&direction=eq.inbound` +
      `&created_at=gte.${oneMinuteAgo}` +
      `&select=id`;

    const res = await fetch(url, {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    });
    const data = await res.json();
    const count = data?.length || 0;
    const LIMIT = 15;

    if (count >= LIMIT) {
      console.warn(
        `[RATE_LIMIT] 🚫 from=${fromNumber} phoneId=${phoneId} count=${count}/min`
      );
      return false;
    }
    return true;
  } catch (e) {
    console.error('[RATE_LIMIT] ❌ Erro ao verificar rate limit:', e);
    return true; // em erro, deixa passar para não travar tudo
  }
}

// =========================================================================
// NOVO: HELPER DE CARRINHO (customers, orders, order_items)
// =========================================================================

async function getOrCreateCustomer(
  whatsappPhoneNumber: string,
  clientConnectionId: string,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<string | null> {
  try {
    const getUrl =
      `${supabaseUrl}/rest/v1/customers` +
      `?whatsapp_phone_number=eq.${whatsappPhoneNumber}` +
      `&client_connection_id=eq.${clientConnectionId}` +
      `&select=id&limit=1`;

    const res = await fetch(getUrl, {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    });
    const data = await res.json();

    if (data?.[0]?.id) return data[0].id as string;

    const insertRes = await fetch(`${supabaseUrl}/rest/v1/customers`, {
      method: 'POST',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        whatsapp_phone_number: whatsappPhoneNumber,
        client_connection_id: clientConnectionId
      })
    });
    const created = await insertRes.json();
    return created?.[0]?.id || null;
  } catch (e) {
    console.error('[CART] ❌ Erro em getOrCreateCustomer:', e);
    return null;
  }
}

async function getOrCreateCart(
  customerId: string,
  clientConnectionId: string,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<string | null> {
  try {
    const getUrl =
      `${supabaseUrl}/rest/v1/orders` +
      `?customer_id=eq.${customerId}` +
      `&client_connection_id=eq.${clientConnectionId}` +
      `&status=eq.CART` +
      `&select=id&limit=1`;

    const res = await fetch(getUrl, {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    });
    const data = await res.json();
    if (data?.[0]?.id) return data[0].id as string;

    const insertRes = await fetch(`${supabaseUrl}/rest/v1/orders`, {
      method: 'POST',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        customer_id: customerId,
        client_connection_id: clientConnectionId,
        status: 'CART',
        total_amount: 0
      })
    });
    const created = await insertRes.json();
    return created?.[0]?.id || null;
  } catch (e) {
    console.error('[CART] ❌ Erro em getOrCreateCart:', e);
    return null;
  }
}

// NOVO: Função unificada para buscar detalhes do produto (cache ou Flask)
async function getProductDetails(
    productCode: string,
    flaskApiUrl: string,
    supabaseUrl: string,
    supabaseAnonKey: string
): Promise<any | null> {
    let productInfo = null;

    // 1. Tenta buscar do product_cache
    try {
        const res = await fetch(
            `${supabaseUrl}/rest/v1/product_cache?cod_reduzido=eq.${productCode}&select=nome_produto,preco_final_venda&limit=1`,
            { headers: { 'apikey': supabaseAnonKey, 'Authorization': `Bearer ${supabaseAnonKey}` } }
        );
        const products = await res.json();
        if (products?.[0]) {
            console.log(`[CART] Produto ${productCode} encontrado no cache.`);
            productInfo = {
                nome_produto: products[0].nome_produto,
                preco_final_venda: Number(products[0].preco_final_venda || 0)
            };
            // Retorna do cache se tiver preço válido
            if (productInfo.preco_final_venda > 0) return productInfo;
        }
    } catch (e) {
        console.error('[CART] ❌ Erro ao buscar produto no cache (ignorado para tentar Flask):', e);
    }

    // 2. Se não encontrou no cache ou o preço era inválido, tenta Flask API
    console.log(`[CART] Produto ${productCode} não encontrado ou preço inválido no cache. Tentando Flask API.`);
    try {
        const base = flaskApiUrl.endsWith('/') ? flaskApiUrl.slice(0, -1) : flaskApiUrl;
        const res = await fetch(`${base}/api/products/search?q=${encodeURIComponent(productCode)}`, { signal: AbortSignal.timeout(8000) });
        const data = await res.json();
        const productsFromFlask = data.data || [];

        // Filtra por uma correspondência exata do cod_reduzido
        const exactMatch = productsFromFlask.find((p: any) => p.cod_reduzido === productCode);

        if (exactMatch) {
            console.log(`[CART] Produto ${productCode} encontrado na Flask API.`);
            const price = parseCurrencyStringToFloat(exactMatch.preco_final_venda) || parseCurrencyStringToFloat(exactMatch.vlr_venda);
            if (price > 0) {
                // Opcionalmente, você pode adicionar/atualizar o product_cache aqui para futuras buscas
                return {
                    nome_produto: exactMatch.nome_produto,
                    preco_final_venda: price
                };
            } else {
                console.warn(`[CART] Produto ${productCode} da Flask API tem preço inválido: ${price}`);
            }
        }
    } catch (e) {
        console.error('[CART] ❌ Erro ao buscar produto na Flask API:', e);
    }

    return null;
}


async function addItemToCart(
  orderId: string,
  productCode: string,
  flaskApiUrl: string, // NOVO: Passar flaskApiUrl para a busca de produto
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<string> {
  try {
    const cleanProductCode = productCode.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();
    if (!cleanProductCode) {
        return '❌ Por favor, informe um código de produto válido para adicionar ao carrinho.';
    }

    // Usar a função unificada getProductDetails
    const productDetails = await getProductDetails(cleanProductCode, flaskApiUrl, supabaseUrl, supabaseAnonKey);
    
    // Validação robusta
    if (!productDetails || productDetails.preco_final_venda <= 0) {
        return `❌ Produto com código *${cleanProductCode}* não encontrado ou com preço inválido. Verifique o código e tente novamente.`;
    }

    const unitPrice = productDetails.preco_final_venda;
    const productName = productDetails.nome_produto;

    const getItemUrl =
      `${supabaseUrl}/rest/v1/order_items` +
      `?order_id=eq.${orderId}` +
      `&product_api_id=eq.${cleanProductCode}` +
      `&select=id,quantity&limit=1`; // Seleção simplificada

    const resItem = await fetch(getItemUrl, {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    });
    const itemData = await resItem.json();

    if (itemData?.[0]?.id) {
      const currentQty = itemData[0].quantity || 0;
      const newQty = currentQty + 1;
      const newTotal = unitPrice * newQty;

      await fetch(`${supabaseUrl}/rest/v1/order_items?id=eq.${itemData[0].id}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          quantity: newQty,
          total_price: newTotal,
          unit_price: unitPrice // Garante que o unit_price está atualizado
        })
      });
    } else {
      await fetch(`${supabaseUrl}/rest/v1/order_items`, {
        method: 'POST',
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          order_id: orderId,
          product_api_id: cleanProductCode,
          product_name: productName,
          quantity: 1,
          unit_price: unitPrice,
          total_price: unitPrice
        })
      });
    }

    // Recalcular total do pedido
    const itemsRes = await fetch(
      `${supabaseUrl}/rest/v1/order_items?order_id=eq.${orderId}&select=total_price`,
      {
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`
        }
      }
    );
    const items = await itemsRes.json();
    const total = (items || []).reduce(
      (acc: number, it: any) => acc + Number(it.total_price || 0),
      0
    );

    await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${orderId}`, {
      method: 'PATCH',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ total_amount: total })
    });

    return `✅ *${productName}* adicionado ao carrinho.\n\nDigite *CARRINHO* para ver os itens ou *FINALIZAR* para concluir o pedido.`;
  } catch (e) {
    console.error('[CART] ❌ Erro em addItemToCart:', e);
    return '⚠️ Não consegui adicionar o item ao carrinho. Tente novamente em instantes.';
  }
}

async function getCartSummary(
  customerId: string,
  clientConnectionId: string,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<string> {
  try {
    const cartUrl =
      `${supabaseUrl}/rest/v1/orders` +
      `?customer_id=eq.${customerId}` +
      `&client_connection_id=eq.${clientConnectionId}` +
      `&status=eq.CART` +
      `&select=id,total_amount&limit=1`;

    const resCart = await fetch(cartUrl, {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    });
    const cartData = await resCart.json();
    if (!cartData?.[0]?.id) {
      return '🛒 Seu carrinho está vazio no momento.\n\nDigite o nome de um produto ou use *COMPRAR CÓDIGO* para adicionar itens.';
    }

    const orderId = cartData[0].id as string;
    const totalAmount = Number(cartData[0].total_amount || 0);

    const itemsRes = await fetch(
      `${supabaseUrl}/rest/v1/order_items?order_id=eq.${orderId}&select=product_api_id,product_name,quantity,unit_price,total_price`, // Incluir unit_price para exibição detalhada
      {
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`
        }
      }
    );
    const items = await itemsRes.json();

    if (!items || items.length === 0) {
      return '🛒 Seu carrinho está vazio no momento.\n\nDigite o nome de um produto ou use *COMPRAR CÓDIGO* para adicionar itens.';
    }

    let resposta = '🛒 *Seu Carrinho Atual:*\n\n';
    items.forEach((it: any) => {
      const nome = it.product_name || `Produto código ${it.product_api_id}`;
      const qtd = it.quantity || 1;
      const precoUnit = Number(it.unit_price || 0); // Preço unitário
      const totalItem = Number(it.total_price || 0); // Total do item

      resposta += `▪️ *${nome}*\n`;
      resposta += `   🔢 Qtde: ${qtd} x R$ ${precoUnit.toFixed(2).replace('.', ',')}\n`;
      resposta += `   💰 Subtotal: R$ ${totalItem.toFixed(2).replace('.', ',')}\n\n`;
    });

    resposta += `*Total do carrinho:* R$ ${totalAmount
      .toFixed(2)
      .replace('.', ',')}\n\n`;
    resposta += `Para concluir, digite *FINALIZAR*.\nPara adicionar mais itens, pesquise o produto ou use *COMPRAR CÓDIGO*.`;
    return resposta;
  } catch (e) {
    console.error('[CART] ❌ Erro em getCartSummary:', e);
    return '⚠️ Não consegui carregar o carrinho agora. Tente novamente em instantes.';
  }
}

async function finishCart(
  customerId: string,
  clientConnectionId: string,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<string> {
  try {
    const cartUrl =
      `${supabaseUrl}/rest/v1/orders` +
      `?customer_id=eq.${customerId}` +
      `&client_connection_id=eq.${clientConnectionId}` +
      `&status=eq.CART` +
      `&select=id,total_amount&limit=1`;

    const resCart = await fetch(cartUrl, {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    });
    const cartData = await resCart.json();
    if (!cartData?.[0]?.id) {
      return '🛒 Não há nenhum carrinho em aberto para finalizar.';
    }

    const orderId = cartData[0].id as string;
    const totalAmount = Number(cartData[0].total_amount || 0);

    // NOVO: Verifica se o carrinho tem itens antes de finalizar
    const itemsCheckRes = await fetch(`${supabaseUrl}/rest/v1/order_items?order_id=eq.${orderId}&limit=1`, {
        headers: { 'apikey': supabaseAnonKey, 'Authorization': `Bearer ${supabaseAnonKey}` }
    });
    const itemsCheckData = await itemsCheckRes.json();
    if (!itemsCheckData || itemsCheckData.length === 0) {
        return '🛒 Seu carrinho está vazio! Adicione itens antes de finalizar o pedido.';
    }

    await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${orderId}`, {
      method: 'PATCH',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'PENDING' })
    });

    return (
      `✅ Pedido *#${orderId.substring(0, 8).toUpperCase()}* recebido com sucesso!\n\n` +
      `Valor total: R$ ${totalAmount.toFixed(2).replace('.', ',')}\n\n` +
      `Um atendente irá confirmar os detalhes e combinar o pagamento/entrega com você. Obrigado pela preferência!`
    );
  } catch (e) {
    console.error('[CART] ❌ Erro em finishCart:', e);
    return '⚠️ Não consegui finalizar o carrinho agora. Tente novamente em alguns minutos.';
  }
}

// =========================================================================
// ORQUESTRADOR DE FLUXO PRINCIPAL
// =========================================================================

async function processarFluxoPrincipal(
  originalCustomerPhoneNumber: string,
  msg: any,
  phoneId: string,
  supabaseUrl: string,
  supabaseAnonKey: string
) {
  const textoUsuario: string | undefined = msg.text?.body?.trim();
  const textoLimpo = textoUsuario?.toLowerCase();
  const cliqueBotao = msg.interactive?.button_reply?.id;

  console.log(
    `\n[RASTREAMENTO] 📥 Msg de ${originalCustomerPhoneNumber}: ${
      textoUsuario || '[Botão: ' + cliqueBotao + ']'
    }`
  );

  // 1. RATE LIMIT antes de tudo
  const allowed = await checkRateLimit(
    originalCustomerPhoneNumber,
    phoneId,
    supabaseUrl,
    supabaseAnonKey
  );
  if (!allowed) {
    await sendWhatsappMessageAndSaveHistory(
      originalCustomerPhoneNumber,
      '⚠️ Você enviou muitas mensagens em pouco tempo. Aguarde um momento e tente novamente.',
      supabaseUrl,
      supabaseAnonKey
    );
    return;
  }

  // 2. Salva mensagem de entrada no Supabase
  if (msg) {
    await saveMessageToSupabase(
      {
        whatsapp_phone_id: phoneId,
        from_number: originalCustomerPhoneNumber,
        message_body: textoUsuario || JSON.stringify(msg),
        direction: 'inbound'
      },
      supabaseUrl,
      supabaseAnonKey
    );
  }

  // 3. Busca configuração da farmácia
  let apiFlask: string = process.env.FLASK_API_URL || '';
  let nomeFarmacia = 'Nossa Farmácia';

  try {
    const resDB = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/client_connections?whatsapp_phone_id=eq.${phoneId}&select=*`,
      {
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
        }
      }
    );
    const farmacias = await resDB.json();
    if (farmacias?.[0]) {
      apiFlask = farmacias[0].api_base_url || apiFlask;
      nomeFarmacia = farmacias[0].name || nomeFarmacia;
    }
  } catch (e) {
    console.error(
      '[SUPABASE] ❌ Erro de conexão ao buscar client_connections:',
      e
    );
  }

  // 4. Lida com saudações ('oi', 'menu', etc.)
  const saudacoes = [
    'oi',
    'ola',
    'olá',
    'menu',
    'inicio',
    'bom dia',
    'boa tarde',
    'boa noite'
  ];
  if (textoLimpo && saudacoes.includes(textoLimpo) && !cliqueBotao) {
    console.log(`[ESTADO] 🔄 Saudação. Enviando menu.`);

    cacheEstados.delete(originalCustomerPhoneNumber);
    await clearConversationState(
      originalCustomerPhoneNumber,
      phoneId,
      supabaseUrl,
      supabaseAnonKey
    );

    await enviarMenuBoasVindas(
      originalCustomerPhoneNumber,
      nomeFarmacia,
      supabaseUrl,
      supabaseAnonKey
    );
    return;
  }

  // 5. Lida com cliques em botões interativos
  if (cliqueBotao) {
    console.log(`[ESTADO] 🎯 Usuário escolheu: ${cliqueBotao}`);

    cacheEstados.set(originalCustomerPhoneNumber, cliqueBotao);
    await saveConversationState(
      originalCustomerPhoneNumber,
      phoneId,
      cliqueBotao,
      {},
      supabaseUrl,
      supabaseAnonKey
    );

    let msgContexto = '';
    if (cliqueBotao === 'menu_estoque')
      msgContexto =
        '📦 *Consulta de Estoque*\n\nPor favor, digite o *nome do produto* que deseja consultar.';
    else if (cliqueBotao === 'menu_info')
      msgContexto =
        '📖 *Informação Médica*\n\nQual medicamento você quer pesquisar?';
    else if (cliqueBotao === 'menu_outros')
      msgContexto =
        '🤖 *Assistente Virtual*\n\nComo posso ajudar com outros assuntos?';

    await sendWhatsappMessageAndSaveHistory(
      originalCustomerPhoneNumber,
      msgContexto,
      supabaseUrl,
      supabaseAnonKey
    );
    return;
  }

  // 6. Sincroniza estado Supabase + cache (caso servidor reiniciou)
  const estadoCache = cacheEstados.get(originalCustomerPhoneNumber);
  const estadoSupabase = await getConversationState(
    originalCustomerPhoneNumber,
    phoneId,
    supabaseUrl,
    supabaseAnonKey
  );
  const estadoAtual = estadoCache || estadoSupabase;

  if (estadoSupabase && !estadoCache) {
    cacheEstados.set(originalCustomerPhoneNumber, estadoSupabase);
    console.log(
      `[STATES] 🔄 Estado restaurado do Supabase: ${estadoSupabase}`
    );
  }

  console.log(
    `[ESTADO] 🧠 Estado final de ${originalCustomerPhoneNumber}: ${
      estadoAtual || 'Sem Estado'
    }`
  );

  // 7. FLUXO DE CARRINHO (PRIORIDADE ALTA - Corrigido para vir antes dos fluxos de estado)
  if (textoLimpo?.startsWith('comprar ') && textoUsuario) {
    const codigo = textoUsuario.substring('comprar '.length).trim();
    if (!codigo) {
      await sendWhatsappMessageAndSaveHistory(
        originalCustomerPhoneNumber,
        'Para adicionar ao carrinho, use: *COMPRAR CÓDIGO*.\nEx: COMPRAR 12345',
        supabaseUrl,
        supabaseAnonKey
      );
      return;
    }

    const customerId = await getOrCreateCustomer(
      originalCustomerPhoneNumber,
      phoneId,
      supabaseUrl,
      supabaseAnonKey
    );
    if (!customerId) {
      await sendWhatsappMessageAndSaveHistory(
        originalCustomerPhoneNumber,
        '⚠️ Não consegui identificar o cliente para o carrinho. Tente novamente mais tarde.',
        supabaseUrl,
        supabaseAnonKey
      );
      return;
    }

    const cartId = await getOrCreateCart(
      customerId,
      phoneId,
      supabaseUrl,
      supabaseAnonKey
    );
    if (!cartId) {
      await sendWhatsappMessageAndSaveHistory(
        originalCustomerPhoneNumber,
        '⚠️ Não consegui criar o carrinho agora. Tente novamente em instantes.',
        supabaseUrl,
        supabaseAnonKey
      );
      return;
    }

    // Corrigido: Passando apiFlask para addItemToCart
    const respCarrinho = await addItemToCart(
      cartId,
      codigo,
      apiFlask, // Passando apiFlask aqui
      supabaseUrl,
      supabaseAnonKey
    );
    await sendWhatsappMessageAndSaveHistory(
      originalCustomerPhoneNumber,
      respCarrinho,
      supabaseUrl,
      supabaseAnonKey
    );
    return;
  }

  if (textoLimpo === 'carrinho' || textoLimpo === 'meu carrinho') {
    const customerId = await getOrCreateCustomer(
      originalCustomerPhoneNumber,
      phoneId,
      supabaseUrl,
      supabaseAnonKey
    );
    if (!customerId) {
      await sendWhatsappMessageAndSaveHistory(
        originalCustomerPhoneNumber,
        '⚠️ Não consegui identificar o cliente para o carrinho. Tente novamente mais tarde.',
        supabaseUrl,
        supabaseAnonKey
      );
      return;
    }

    const resumo = await getCartSummary(
      customerId,
      phoneId,
      supabaseUrl,
      supabaseAnonKey
    );
    await sendWhatsappMessageAndSaveHistory(
      originalCustomerPhoneNumber,
      resumo,
      supabaseUrl,
      supabaseAnonKey
    );
    return;
  }

  if (textoLimpo === 'finalizar' || textoLimpo === 'fechar pedido') {
    const customerId = await getOrCreateCustomer(
      originalCustomerPhoneNumber,
      phoneId,
      supabaseUrl,
      supabaseAnonKey
    );
    if (!customerId) {
      await sendWhatsappMessageAndSaveHistory(
        originalCustomerPhoneNumber,
        '⚠️ Não consegui identificar o cliente para finalizar o pedido.',
        supabaseUrl,
        supabaseAnonKey
      );
      return;
    }

    const msgFinal = await finishCart(
      customerId,
      phoneId,
      supabaseUrl,
      supabaseAnonKey
    );
    await sendWhatsappMessageAndSaveHistory(
      originalCustomerPhoneNumber,
      msgFinal,
      supabaseUrl,
      supabaseAnonKey
    );
    return;
  }

  // 8. FLUXO ESTOQUE (baseado no estado 'menu_estoque')
  if (estadoAtual === 'menu_estoque' && textoUsuario) {
    const res = await consultarEstoqueFlask(textoUsuario, apiFlask);
    await sendWhatsappMessageAndSaveHistory(
      originalCustomerPhoneNumber,
      res,
      supabaseUrl,
      supabaseAnonKey
    );
    return;
  }

  // 9. FLUXO INFO MÉDICA (baseado no estado 'menu_info')
  if (estadoAtual === 'menu_info' && textoUsuario) {
    const res = await consultarGoogleInfo(textoUsuario);
    cacheEstados.delete(originalCustomerPhoneNumber);
    await clearConversationState(
      originalCustomerPhoneNumber,
      phoneId,
      supabaseUrl,
      supabaseAnonKey
    );
    await sendWhatsappMessageAndSaveHistory(
      originalCustomerPhoneNumber,
      res,
      supabaseUrl,
      supabaseAnonKey
    );
    return;
  }

  // 10. GEMINI (FALLBACK - se nenhuma das condições anteriores for atendida)
  console.log(`[GEMINI] 🤖 Gerando resposta inteligente.`);
  try {
    const urlGemini = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const resGemini = await fetch(urlGemini, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Aja como atendente de farmácia: ${textoUsuario}`
              }
            ]
          }
        ]
      })
    });
    const dataGemini = await resGemini.json();
    const textoIA =
      dataGemini.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Desculpe, não entendi. Digite 'menu' para ver as opções.";
    await sendWhatsappMessageAndSaveHistory(
      originalCustomerPhoneNumber,
      textoIA,
      supabaseUrl,
      supabaseAnonKey
    );
  } catch (e) {
    await sendWhatsappMessageAndSaveHistory(
      originalCustomerPhoneNumber,
      "Olá! Como posso ajudar? Digite 'menu' para ver as opções principais.",
      supabaseUrl,
      supabaseAnonKey
    );
  }
}

// =========================================================================
// HANDLERS NEXT.JS
// =========================================================================

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      '[SUPABASE_CONFIG] ❌ NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY não configurados.'
    );
    return new NextResponse(
      'Internal Server Error: Supabase configuration missing.',
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const value = body.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    const phoneId = value?.metadata?.phone_number_id;

    if (msg) {
      await processarFluxoPrincipal(
        msg.from,
        msg,
        phoneId!, 
        supabaseUrl,
        supabaseAnonKey
      );
    }
    return new NextResponse('OK', { status: 200 });
  } catch (e) {
    console.error(`[WEBHOOK] ❌ Erro fatal:`, e);
    return new NextResponse('OK', { status: 200 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  if (searchParams.get('hub.verify_token') === WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
  }
  return new NextResponse('Erro', { status: 403 });
}
