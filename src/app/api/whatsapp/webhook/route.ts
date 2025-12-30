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

async function consultarEstoqueFlask(
  termo: string,
  apiBase: string,
  supabaseUrl: string,
  supabaseAnonKey: string
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

    // Ajuste para pesquisa multi-palavra (ex: "Losartana 100")
    let finalSearchTerm = termo;
    const words = termo.split(' ').filter(word => word.length > 0);
    if (words.length > 1) {
        finalSearchTerm = '%' + words.join('%') + '%';
    }

    const res = await fetch(
      `${base}/api/products/search?q=${encodeURIComponent(finalSearchTerm)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const data = await res.json();
    const produtos = data.data || [];

    // Salvar produtos encontrados no product_cache do Supabase (mantido como está)
    if (produtos.length > 0) {
      for (const p of produtos) {
        try {
          const productCode = p.cod_reduzido?.toString();
          if (!productCode) continue;

          const precoFinalVenda = p.vlr_liquido_raw_float;
          const qtdEstoque = p.qtd_estoque;

          await fetch(`${supabaseUrl}/rest/v1/product_cache`, {
            method: 'POST',
            headers: {
              'apikey': supabaseAnonKey,
              'Authorization': `Bearer ${supabaseAnonKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            },
            body: JSON.stringify({
              cod_reduzido: productCode,
              nome_produto: p.nome_produto || 'Produto sem nome',
              nom_laboratorio: p.nom_laboratorio || 'Não informado',
              preco_final_venda: precoFinalVenda,
              unit_price: precoFinalVenda,
              qtd_estoque: qtdEstoque,
              api_source: apiBase,
              updated_at: new Date().toISOString()
            })
          });
        } catch (cacheError) {
          console.error(`[CACHE] ❌ Erro ao salvar produto no cache ${p.cod_reduzido}:`, cacheError);
        }
      }
    }

    if (produtos.length === 0) {
      return `❌ Não encontrei "${termo}" no sistema. Por favor, verifique a escrita ou tente um nome diferente.`;
    }

    let inStockMessages: string[] = [];
    let outOfStockMessages: string[] = [];

    produtos.forEach((p: any) => {
      const codReduzido = p.cod_reduzido || 'N/A';
      const nomeProduto = p.nome_produto || 'Produto sem nome';
      const nomLaboratorio = p.nom_laboratorio || 'Laboratório não informado';

      const precoBruto = Number(p.vlr_venda_raw_float || 0);
      const precoFinalVenda = Number(p.vlr_liquido_raw_float || 0);
      const qtdEstoque = Number(p.qtd_estoque || 0);

      let productMessage = `*${nomeProduto}* (Cód: ${codReduzido})`;

      if (nomLaboratorio && nomLaboratorio !== 'N/A') {
          productMessage += `\n   💊 Laboratório: ${nomLaboratorio}`;
      }

      if (precoFinalVenda > 0) {
          if (precoBruto > precoFinalVenda && precoBruto > 0) {
              const descontoPercentual = ((precoBruto - precoFinalVenda) / precoBruto) * 100;
              productMessage += `\n   💰 ~~R$ ${precoBruto.toFixed(2).replace('.', ',')}~~ por *R$ ${precoFinalVenda.toFixed(2).replace('.', ',')}* à vista (🔻${descontoPercentual.toFixed(1).replace('.', ',')}% OFF)`;
          } else {
              productMessage += `\n   💰 *R$ ${precoFinalVenda.toFixed(2).replace('.', ',')}* à vista`;
          }
      } else {
          productMessage += `\n   💰 Preço: Não informado`;
      }

      if (qtdEstoque > 0) {
        productMessage += `\n   📦 Temos ${qtdEstoque} unidades em estoque.`;
        inStockMessages.push(productMessage);
      } else {
        productMessage += `\n   ⚠️ No momento, está esgotado.`;
        if (precoFinalVenda > 0) {
            productMessage += ` Gostaria de verificar a encomenda para você?`;
        }
        outOfStockMessages.push(productMessage);
      }
    });

    let resposta = '';

    if (inStockMessages.length > 0) {
      resposta += `✅ *Produtos Disponíveis em Estoque:*\n\n`;
      resposta += inStockMessages.join('\n\n');
      resposta += '\n\n';
    }

    if (outOfStockMessages.length > 0) {
      if (inStockMessages.length > 0) {
        resposta += `---\n\n`;
      }
      resposta += `⚠️ *Produtos Sem Estoque no momento (mas podemos verificar a encomenda para você):*\n\n`;
      resposta += outOfStockMessages.join('\n\n');
      resposta += '\n\n';
    }
    
    if (inStockMessages.length === 0 && outOfStockMessages.length === 0) {
      return `❌ Não encontrei "${termo}" no sistema. Por favor, verifique a escrita ou tente um nome diferente.`;
    }

    resposta += `Para adicionar um item ao carrinho, digite *COMPRAR* seguido do *CÓDIGO* do produto. Ex: *COMPRAR 12345*\n`;
    resposta += `Para buscar opções genéricas mais baratas, digite *GENÉRICO* seguido do *CÓDIGO* do produto. Ex: *GENÉRICO 12345*`;

    return resposta;
  } catch (e) {
    console.error(`[FLASK] ❌ Erro:`, e);
    return '⚠️ Erro ao consultar o estoque local. Por favor, tente novamente em instantes.';
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
// FUNÇÃO CONSULTAR GENÉRICO FLASK (CORRIGIDA)
// =========================================================================
async function consultarGenericoFlask(
  productCode: string,
  apiBase: string
): Promise<string> {
  console.log(`[FLASK] 🔍 Buscando genérico para: "${productCode}" em ${apiBase}`);
  try {
    const base = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
    if (!apiBase) {
      console.warn(`[FLASK] ⚠️ apiBase está vazia ou inválida, pulando consulta de genérico.`);
      return '⚠️ Serviço de consulta de genéricos indisponível. Por favor, contate o administrador.';
    }

    const cleanProductCode = productCode.replace(/[^0-9]/g, '');
    if (!cleanProductCode) {
        return '❌ Por favor, informe um código de produto válido para buscar genéricos.';
    }

    // CHAMA A NOVA API DO FLASK QUE RETORNA DADOS JSON E NÃO MENSAGENS FORMATADAS
    const res = await fetch(
      `${base}/api/chatbot/buscar-generico/${cleanProductCode}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const data = await res.json(); // Espera um JSON estruturado

    // LÓGICA DE FORMATAÇÃO DA MENSAGEM MOVIDA DO FLASK PARA CÁ
    if (!data.success) {
      return data.error || '❌ Erro desconhecido ao buscar genérico.'; // Retorna o erro direto do Flask
    }

    if (!data.tem_generico) {
      // Se não encontrou genérico ou economia baixa, o Flask retorna 'tem_generico: false' e uma 'error' simples.
      return data.error || 'Este já é o melhor preço disponível!';
    }

    const { generico, produto_original, economia } = data;
    let mensagem = `💰 Economize R$ ${economia.valor.toFixed(2).replace('.', ',')} (${economia.percentual.toFixed(1).replace('.', ',')}%) com '*${generico.nome}*'!`;

    // Se o genérico também tem desconto, informar
    if (generico.tem_desconto) {
        const desconto_generico_valor = generico.preco_tabela - generico.preco_final;
        const perc_desc_generico = (desconto_generico_valor / generico.preco_tabela) * 100;
        mensagem += `\n🎁 Genérico já está com ${perc_desc_generico.toFixed(0)}% OFF (de R$ ${generico.preco_tabela.toFixed(2).replace('.', ',')} por R$ ${generico.preco_final.toFixed(2).replace('.', ',')})`;
    }

    mensagem += `\n📦 ${generico.estoque} unidades disponíveis`;

    return mensagem; // Retorna a mensagem formatada aqui
  } catch (e) {
    console.error(`[FLASK] ❌ Erro ao consultar genérico:`, e);
    return '⚠️ Erro ao consultar opções genéricas. Tente novamente mais tarde.';
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

async function getProductDetails(
    productCode: string,
    flaskApiUrl: string,
    supabaseUrl: string,
    supabaseAnonKey: string
): Promise<any | null> {
    let productInfo = null;
    const cleanProductCode = productCode.replace(/[^0-9]/g, '');

    if (!cleanProductCode) {
        console.warn('[CART] Código de produto limpo está vazio.');
        return null;
    }

    try {
        const res = await fetch(
            `${supabaseUrl}/rest/v1/product_cache?cod_reduzido=eq.${cleanProductCode}&select=nome_produto,preco_final_venda&limit=1`,
            { headers: { 'apikey': supabaseAnonKey, 'Authorization': `Bearer ${supabaseAnonKey}` } }
        );
        const products = await res.json();
        if (products?.[0]) {
            productInfo = {
                nome_produto: products[0].nome_produto,
                preco_final_venda: Number(products[0].preco_final_venda || 0)
            };
            if (productInfo.preco_final_venda > 0) {
                console.log(`[CART] Produto ${cleanProductCode} encontrado no cache com preço válido.`);
                return productInfo;
            } else {
                console.warn(`[CART] Produto ${cleanProductCode} encontrado no cache, mas com preço inválido (0 ou menos).`);
            }
        } else {
            console.warn(`[CART] Produto ${cleanProductCode} não encontrado no cache.`);
        }
    } catch (e) {
        console.error('[CART] ❌ Erro ao buscar produto no cache:', e);
    }

    console.log(`[CART] Produto ${cleanProductCode} não encontrado no cache ou preço inválido. Tentando Flask API via /api/chatbot/buscar-reduzido.`);
    try {
        const base = flaskApiUrl.endsWith('/') ? flaskApiUrl.slice(0, -1) : flaskApiUrl;
        const res = await fetch(`${base}/api/chatbot/buscar-reduzido/${cleanProductCode}`, {
            method: 'GET',
            signal: AbortSignal.timeout(8000)
        });
        const data = await res.json();

        if (data.success && data.encontrado && data.produto) {
            console.log(`[CART] Produto ${cleanProductCode} encontrado na Flask API via /api/chatbot/buscar-reduzido.`);
            const produtoFlask = data.produto;
            const preco = Number(produtoFlask.preco_final || produtoFlask.preco || 0); 

            if (preco > 0) {
                await fetch(`${supabaseUrl}/rest/v1/product_cache`, {
                    method: 'POST', 
                    headers: {
                        'apikey': supabaseAnonKey,
                        'Authorization': `Bearer ${supabaseAnonKey}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify({
                        cod_reduzido: produtoFlask.cod_reduzido?.toString(),
                        nome_produto: produtoFlask.nome || 'Produto sem nome',
                        preco_final_venda: preco,
                        unit_price: preco,
                        qtd_estoque: produtoFlask.estoque,
                        api_source: `${flaskApiUrl} (chatbot/buscar-reduzido)`,
                        updated_at: new Date().toISOString()
                    })
                });

                return {
                    nome_produto: produtoFlask.nome,
                    preco_final_venda: preco
                };
            } else {
                console.warn(`[CART] Produto ${cleanProductCode} da Flask API tem preço inválido: ${preco}`);
            }
        } else {
            console.warn(`[CART] Flask API /api/chatbot/buscar-reduzido não encontrou ${cleanProductCode} ou retornou erro:`, data.message || data.error);
        }
    } catch (e) {
        console.error('[CART] ❌ Erro ao buscar produto na Flask API via /api/chatbot/buscar-reduzido:', e);
    }
    
    return null;
}

async function addItemToCart(
  orderId: string,
  productCode: string,
  flaskApiUrl: string,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<string> {
  try {
    const cleanProductCode = productCode.replace(/[^0-9]/g, '');
    if (!cleanProductCode) {
        return '❌ Por favor, informe um código de produto válido para adicionar ao carrinho.';
    }

    const productDetails = await getProductDetails(cleanProductCode, flaskApiUrl, supabaseUrl, supabaseAnonKey);
    
    if (!productDetails || productDetails.preco_final_venda <= 0) {
        return `❌ Produto com código *${cleanProductCode}* não encontrado no sistema ou com preço inválido. Por favor, verifique o código e tente novamente.`;
    }

    const unitPrice = productDetails.preco_final_venda;
    const productName = productDetails.nome_produto;

    const getItemUrl =
      `${supabaseUrl}/rest/v1/order_items` +
      `?order_id=eq.${orderId}` +
      `&product_api_id=eq.${cleanProductCode}` +
      `&select=id,quantity&limit=1`;

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
          unit_price: unitPrice
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
      `${supabaseUrl}/rest/v1/order_items?order_id=eq.${orderId}&select=product_api_id,product_name,quantity,unit_price,total_price`,
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
      const precoUnit = Number(it.unit_price || 0);
      const totalItem = Number(it.total_price || 0);

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
  const textoComparavel = textoUsuario?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const textoLimpo = textoUsuario?.toLowerCase();
  const cliqueBotao = msg.interactive?.button_reply?.id;

  console.log(
    `\n[RASTREAMENTO] 📥 Msg de ${originalCustomerPhoneNumber}: ${
      textoUsuario || '[Botão: ' + cliqueBotao + ']'
    }`
  );
  console.log(`[DEBUG] textoUsuario: "${textoUsuario}"`);
  console.log(`[DEBUG] textoLimpo: "${textoLimpo}"`);
  console.log(`[DEBUG] textoComparavel: "${textoComparavel}"`);

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

  // 7. FLUXO DE CARRINHO (PRIORIDADE ALTA)
  if (textoComparavel?.startsWith('comprar ') && textoUsuario) {
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

    const respCarrinho = await addItemToCart(
      cartId,
      codigo,
      apiFlask,
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

  // NOVO: 7.5 FLUXO DE GENÉRICOS (PRIORIDADE MÉDIA-ALTA)
  if (textoComparavel?.startsWith('generico ') && textoUsuario) {
    const startIndex = textoComparavel.indexOf('generico ') + 'generico '.length;
    const rawCodePart = textoUsuario.substring(startIndex).trim();
    const codigo = rawCodePart.replace(/[^0-9]/g, '');

    if (!codigo) {
      await sendWhatsappMessageAndSaveHistory(
        originalCustomerPhoneNumber,
        'Para buscar genéricos, use: *GENÉRICO CÓDIGO*.\nEx: GENÉRICO 12345',
        supabaseUrl,
        supabaseAnonKey
      );
      return;
    }

    const respGenerico = await consultarGenericoFlask(codigo, apiFlask);
    console.log(`[DEBUG_SEND] Mensagem genérico a ser enviada: "${respGenerico}"`); // Log de depuração
    
    await sendWhatsappMessageAndSaveHistory(
      originalCustomerPhoneNumber,
      respGenerico,
      supabaseUrl,
      supabaseAnonKey
    );
    return;
  }

  // 8. FLUXO ESTOQUE (baseado no estado 'menu_estoque')
  if (estadoAtual === 'menu_estoque' && textoUsuario) {
    const res = await consultarEstoqueFlask(textoUsuario, apiFlask, supabaseUrl, supabaseAnonKey);
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
      'Desculpe, não entendi. Digite \'menu\' para ver as opções.';
    await sendWhatsappMessageAndSaveHistory(
      originalCustomerPhoneNumber,
      textoIA,
      supabaseUrl,
      supabaseAnonKey
    );
  } catch (e) {
    await sendWhatsappMessageAndSaveHistory(
      originalCustomerPhoneNumber,
      'Olá! Como posso ajudar? Digite \'menu\' para ver as opções principais.',
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
