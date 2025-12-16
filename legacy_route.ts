// src/app/api/whatsapp/webhook/route.ts
// ====================================================================================
// WEBHOOK CORRIGIDO - VERS├âO FUNCIONAL COMPLETA
// ====================================================================================

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// =========================================================================
// CONFIGURA├ç├âO DAS VARI├üVEIS DE AMBIENTE
// =========================================================================

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const FLASK_API_URL = process.env.FLASK_API_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Flags para verificar configura├º├Áes dispon├¡veis
const hasWhatsAppConfig = !!(WHATSAPP_VERIFY_TOKEN && WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID);
const hasSupabaseConfig = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
const hasFlaskConfig = !!FLASK_API_URL;
const hasGeminiConfig = !!GEMINI_API_KEY;

// Log de status das configura├º├Áes (apenas warnings, sem throw)
if (!hasWhatsAppConfig) {
  console.warn('ÔÜá´©Å AVISO: Vari├íveis do WhatsApp n├úo configuradas. O webhook n├úo funcionar├í at├® que sejam configuradas.');
}

if (!hasSupabaseConfig) {
  console.warn('ÔÜá´©Å AVISO: Vari├íveis do Supabase n├úo configuradas. Funcionalidades de CRM desabilitadas.');
}

if (!hasFlaskConfig) {
  console.warn('ÔÜá´©Å AVISO: Vari├ível FLASK_API_URL n├úo configurada. Busca de produtos desabilitada.');
}

if (!hasGeminiConfig) {
  console.warn('ÔÜá´©Å AVISO: Vari├ível GEMINI_API_KEY n├úo configurada. IA Gemini desabilitada.');
}

// =========================================================================
// BASE DE DADOS DE MEDICAMENTOS (FALLBACK)
// =========================================================================

const medicamentosData = [
  {
    "Nome do Medicamento": "Losartana",
    "Princ├¡pio(s) Ativo(s)": ["Losartana Pot├íssica"],
    "Classe Farmacol├│gica": "Antagonista do Receptor da Angiotensina II",
    "Mecanismo de A├º├úo": "Bloqueia receptores da angiotensina II, reduzindo press├úo arterial",
    "Indica├º├Áes": "Hipertens├úo arterial, insufici├¬ncia card├¡aca, prote├º├úo renal em diabetes",
    "Posologia": "50 mg uma vez ao dia, podendo ser ajustada at├® 100 mg/dia",
    "Contraindica├º├Áes": "Gravidez, hipersensibilidade, uso com alisquireno em diab├®ticos",
    "Efeitos Colaterais": "Tontura, cefaleia, fadiga, hipercalemia",
    "Intera├º├Áes Medicamentosas": "Diur├®ticos, AINEs, l├¡tio"
  },
  {
    "Nome do Medicamento": "Sinvastatina",
    "Princ├¡pio(s) Ativo(s)": ["Sinvastatina"],
    "Classe Farmacol├│gica": "Inibidor da HMG-CoA Redutase",
    "Mecanismo de A├º├úo": "Inibe a produ├º├úo de colesterol no f├¡gado",
    "Indica├º├Áes": "Hipercolesterolemia, preven├º├úo de eventos cardiovasculares",
    "Posologia": "10-40 mg uma vez ao dia, preferencialmente ├á noite",
    "Contraindica├º├Áes": "Doen├ºa hep├ítica ativa, gravidez, uso com certos antif├║ngicos",
    "Efeitos Colaterais": "Mialgia, dor abdominal, eleva├º├úo de enzimas hep├íticas",
    "Intera├º├Áes Medicamentosas": "Antif├║ngicos az├│is, antibi├│ticos macrol├¡deos"
  }
];

// =========================================================================
// GATILHOS E AUXILIARES DE INTEN├ç├âO
// =========================================================================

const TRIGGERS_BUSCA = [
  'buscar', 'produto', 'consulta', 'pre├ºo', 'preco', 'estoque',
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
// FUN├ç├òES AUXILIARES DE PROCESSAMENTO DE TEXTO
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
  const regexCode = /(\d{6,})/i;
  const matchCode = lowerMsg.match(regexCode);

  if (!isCartIntent && !matchCode) {
    return null;
  }

  if (matchCode) {
    const productCode = matchCode[1];
    let quantity = 1;

    const regexQuantity = /(?:^|\s)(\d+)(?:\s+(?:do|o|item))?/i;
    const matchQuantity = lowerMsg.match(regexQuantity);

    if (matchQuantity && matchQuantity[1] !== productCode) {
      quantity = parseInt(matchQuantity[1], 10);
      if (isNaN(quantity) || quantity < 1) quantity = 1;
    }

    return { quantity, productCode };
  }

  return null;
}

function deveFazerBuscaDireta(mensagem: string): boolean {
  const texto = mensagem.toLowerCase().trim();

  // Se j├í foi identificado como inten├º├úo de busca, n├úo fazer busca direta
  if (extrairTermoBusca(mensagem)) return false;

  // Se ├® um comando num├®rico do menu
  if (/^[1-4]$/.test(texto)) return false;

  // Se ├® um comando conhecido
  const comandosConhecidos = ['menu', 'finalizar', 'carrinho', 'atendente', 'ajuda', 'voltar'];
  if (comandosConhecidos.includes(texto)) return false;

  // Se parece ser um c├│digo de produto (apenas n├║meros)
  if (/^\d{6,}$/.test(texto)) return false;

  // Se tem caracter├¡sticas de pergunta sobre medicamento
  const termosMedicamento = ['posologia', 'efeito', 'contraindicacao', 'bula', 'dose', 'como usar'];
  if (termosMedicamento.some(termo => texto.includes(termo))) return false;

  // Se ├® muito curto (provavelmente n├úo ├® um produto)
  if (texto.length < 3) return false;

  // Se cont├®m apenas palavras muito comuns
  const palavrasComuns = ['oi', 'ola', 'ok', 'sim', 'nao', 'obrigado', 'obrigada'];
  if (palavrasComuns.includes(texto)) return false;

  return true;
}

// =========================================================================
// FUN├ç├òES DE CACHE DE PRODUTOS
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
    console.log(`ÔÜá´©Å Erro ao salvar produto no cache:`, error);
  }
}

async function getProductFromCache(productCode: string): Promise<{name: string; price: number} | null> {
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
    console.log(`ÔÜá´©Å Erro ao buscar produto do cache:`, error);
    return null;
  }
}

// =========================================================================
// FUN├ç├òES AUXILIARES DE SUPABASE
// =========================================================================

async function getOrCreateCustomer(from: string, whatsappPhoneId: string): Promise<string | null> {
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
      console.error('ÔØî ERRO ao inserir novo cliente:', await insertResponse.text());
      return null;
    }

    selectResponse = await fetch(selectUrl, { method: 'GET', headers });
    data = await selectResponse.json();

    if (data && data.length > 0) {
      const newCustomerId = data[0].id;
      return newCustomerId;
    }

    return null;

  } catch (error) {
    console.error('ÔØî Erro cr├¡tico no CRM:', error);
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
      console.error('ÔØî ERRO ao criar novo pedido:', await insertResponse.text());
      return null;
    }

    selectResponse = await fetch(selectUrl, { method: 'GET', headers });
    data = await selectResponse.json();

    if (data && data.length > 0) {
      const newOrderId = data[0].id;
      return newOrderId;
    }

    return null;

  } catch (error) {
    console.error('ÔØî Erro cr├¡tico no Carrinho:', error);
    return null;
  }
}

async function getOrderItems(orderId: string): Promise<any[]> {
  try {
    const headers = new Headers({
      'apikey': SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    });

    const selectUrl = `${SUPABASE_URL}/rest/v1/order_items?order_id=eq.${orderId}&select=*`;
    const selectResponse = await fetch(selectUrl, { method: 'GET', headers });

    if (!selectResponse.ok) {
      console.error('ÔØî ERRO ao buscar itens do pedido:', await selectResponse.text());
      return [];
    }

    const data = await selectResponse.json();
    return data || [];

  } catch (error) {
    console.error('ÔØî Erro cr├¡tico ao buscar itens do pedido:', error);
    return [];
  }
}

async function updateOrderTotal(orderId: string, newTotal: number): Promise<void> {
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
      console.error('ÔØî ERRO ao atualizar total do pedido:', await response.text());
    }
  } catch (error) {
    console.error('ÔØî Erro cr├¡tico ao atualizar total do pedido:', error);
  }
}

async function addItemToCart(
  orderId: string,
  productCode: string,
  quantity: number,
  whatsappPhoneId: string
): Promise<boolean> {
  try {
    console.log(`­ƒøÆ Adicionando produto ${productCode} ao carrinho (ordem: ${orderId})`);

    let productName = `Produto ${productCode}`;
    let unitPrice = 0;

    // ­ƒÆ¥ PRIMEIRO: Tentar buscar do CACHE
    console.log(`­ƒôª Procurando no cache...`);
    const cachedProduct = await getProductFromCache(productCode);
    
    if (cachedProduct) {
      productName = cachedProduct.name;
      unitPrice = cachedProduct.price;
      console.log(`Ô£à ENCONTRADO NO CACHE: ${productName} - R$ ${unitPrice}`);
    } else {
      // ­ƒöì SE N├âO ESTIVER NO CACHE: Tentar buscar produto pela API (opcional)
      if (FLASK_API_URL) {
        try {
          const searchUrl = `${FLASK_API_URL}/api/products/search?q=${encodeURIComponent(productCode)}`;
          console.log(`­ƒôí N├úo em cache, buscando na API: ${searchUrl}`);
          
          const searchResponse = await fetch(searchUrl, {
            headers: {
              'Content-Type': 'application/json',
              'ngrok-skip-browser-warning': 'true',
              'User-Agent': 'WhatsAppWebhook/1.0'
            }
          });

          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            const product = searchData.data?.find((p: any) => String(p.cod_reduzido) === productCode);
            
            if (product) {
              productName = product.nome_produto;
              const priceStr = product.preco_final_venda.replace(/[^\d,]/g, '').replace(',', '.');
              unitPrice = parseFloat(priceStr) || 0;
              console.log(`Ô£à Encontrado na API: ${productName} - R$ ${unitPrice}`);
              // Salvar no cache para pr├│xima vez
              await saveProductToCache(productCode, productName, unitPrice);
            } else {
              console.log(`ÔÜá´©Å Produto n├úo encontrado na API, continuando com valores padr├úo`);
            }
          } else {
            console.log(`ÔÜá´©Å API retornou erro ${searchResponse.status}, continuando com valores padr├úo`);
          }
        } catch (apiError) {
          console.log(`ÔÜá´©Å Erro ao consultar API Flask: ${apiError}`);
        }
      }
    }

    const totalPrice = unitPrice * quantity;

    // ­ƒôØ Inserir item no Supabase
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

    console.log(`­ƒôØ Inserindo no Supabase:`, insertPayload);

    const insertResponse = await fetch(insertUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(insertPayload)
    });

    if (!insertResponse.ok) {
      const errorText = await insertResponse.text();
      console.error('ÔØî ERRO ao inserir item no carrinho:', errorText);
      return false;
    }

    console.log(`Ô£à Produto adicionado ao carrinho com sucesso!`);
    return true;

  } catch (error) {
    console.error('ÔØî Erro cr├¡tico ao adicionar item ao carrinho:', error);
    return false;
  }
}

async function salvarMensagemNoSupabase(
  whatsappPhoneId: string,
  from: string,
  body: string,
  direction: 'IN' | 'OUT'
): Promise<void> {
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
      console.error(`ÔØî ERRO ao salvar mensagem no Supabase:`, await response.text());
    }

  } catch (error) {
    console.error(`ÔØî Erro cr├¡tico ao salvar mensagem:`, error);
  }
}

// =========================================================================
// FUN├ç├òES AUXILIARES DE INTEGRA├ç├âO
// =========================================================================

async function enviarMenuInicial(from: string, whatsappPhoneId: string): Promise<boolean> {
  const texto = '*OL├ü! SOU SEU ASSISTENTE VIRTUAL DA FARM├üCIA.*\\n\\n' +
    'Como posso te ajudar hoje?\\n\\n' +
    'Digite o *n├║mero* da op├º├úo desejada, ou digite o nome do produto/medicamento:\\n' +
    '*1.* ­ƒöì Buscar Pre├ºos e Estoque de Produtos\\n' +
    '*2.* ­ƒÆè Consultar Informa├º├Áes de Medicamentos (Bula)\\n' +
    '*3.* ­ƒøÆ Ver/Finalizar Carrinho\\n' +
    '*4.* ­ƒæ®ÔÇì­ƒÆ╗ Falar com um Atendente (Hor├írio Comercial)\\n';

  const result = await enviarComFormatosCorretos(from, texto);
  if (result) {
    await salvarMensagemNoSupabase(whatsappPhoneId, from, texto, 'OUT');
  }
  return result;
}

async function findFarmacyAPI(whatsappPhoneId: string): Promise<{ api_url: string, client_id: string } | null> {
  try {
    // Se Supabase n├úo est├í configurado, retorna null graciosamente
    if (!hasSupabaseConfig) {
      console.warn('ÔÜá´©Å Supabase n├úo configurado - usando fallback local para busca de produtos');
      return null;
    }

    const url = `${SUPABASE_URL}/rest/v1/client_connections?whatsapp_phone_id=eq.${whatsappPhoneId}&select=api_base_url,client_id`;

    const headers = new Headers({
      'apikey': SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    });

    console.log('­ƒöì Buscando farm├ícia com whatsapp_phone_id:', whatsappPhoneId);
    console.log('­ƒôì URL de busca:', url);

    const response = await fetch(url, { method: 'GET', headers });

    console.log('­ƒô¿ Resposta Supabase:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ÔØî Erro na resposta Supabase:', errorText);
      throw new Error(`Supabase status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Ô£à Dados recebidos:', data);
    
    return data && data.length > 0 ? {
      api_url: data[0].api_base_url,
      client_id: data[0].client_id
    } : null;

  } catch (error) {
    console.error('ÔØî Erro ao buscar farm├ícia:', error);
    return null;
  }
}

async function consultarAPIFarmacia(apiUrl: string, termo: string): Promise<any> {
  try {
    const url = `${apiUrl}/api/products/search?q=${encodeURIComponent(termo)}`;
    console.log(`­ƒöù Consultando API da farm├ícia: ${url}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        'User-Agent': 'WhatsAppWebhook/1.0'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    console.log(`­ƒôè Status da API: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`ÔØî API retornou erro: ${response.status} - ${errorText}`);
      throw new Error(`API retornou status: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Ô£à Resposta da API:`, JSON.stringify(data).substring(0, 500));
    return data;

  } catch (error) {
    console.error('ÔØî Erro ao consultar API:', error);
    throw error;
  }
}

function converterParaFormatoFuncional(numeroOriginal: string): string[] {
  const numeroLimpo = numeroOriginal.replace(/\D/g, '');
  let numeroConvertido = numeroLimpo;

  if (numeroLimpo.length === 12 && numeroLimpo.startsWith('55')) {
    const ddd = numeroLimpo.substring(2, 4);
    const numeroSemDDIeDDD = numeroLimpo.substring(4);
    if (numeroSemDDIeDDD.length === 8 && !['1', '2', '3', '4', '5'].includes(numeroSemDDIeDDD.charAt(0))) {
      numeroConvertido = '55' + ddd + '9' + numeroSemDDIeDDD;
    }
  }
  return ['+' + numeroConvertido, numeroConvertido];
}

// =========================================================================
// FUN├ç├âO DE ENVIO CORRIGIDA
// =========================================================================

async function enviarComFormatosCorretos(from: string, texto: string): Promise<boolean> {
  try {
    const formatos = converterParaFormatoFuncional(from);

    for (let i = 0; i < formatos.length; i++) {
      const formato = formatos[i];

      try {
        const payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formato,
          type: 'text',
          text: {
            preview_url: false,
            body: texto.substring(0, 4096).replace(/\\n/g, '\n')
          }
        };

        const url = `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          return true;
        } else {
          const errorResponse = await response.text();
          console.log(`ÔØî Falha para: ${formato} - Status: ${response.status} - Erro: ${errorResponse}`);
        }
      } catch (error) {
        console.error(`­ƒÆÑ Erro para ${formato}:`, error);
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    }

    return false;

  } catch (error) {
    console.error('ÔØî Erro cr├¡tico no envio:', error);
    return false;
  }
}

// =========================================================================
// FUN├ç├òES DE CONSULTA DE MEDICAMENTOS
// =========================================================================

function parseUserMessageForDrugInfo(message: string): { drugName?: string; infoType?: string } {
  const lowerMessage = message.toLowerCase();
  let drugName: string | undefined;
  let infoType: string | undefined;

  const infoTypeKeywords: { [key: string]: string[] } = {
    "classe terapeutica": ["classe terapeutica", "classe farmacologica", "categoria"],
    "posologia": ["posologia", "dose", "como usar", "dosagem"],
    "indicacoes": ["indicacoes", "para que serve", "usos"],
    "efeitos colaterais": ["efeitos colaterais", "reacoes adversas", "colaterais"],
    "contraindicacoes": ["contraindicacoes", "contra indicado", "nao usar"],
    "mecanismo de acao": ["mecanismo de acao", "como funciona"],
    "interacoes medicamentosas": ["interacoes medicamentosas", "pode misturar com"],
    "tudo": ["tudo", "informacoes completas", "tudo sobre"],
  };

  for (const typeKey in infoTypeKeywords) {
    if (infoTypeKeywords[typeKey].some(keyword => lowerMessage.includes(keyword))) {
      infoType = typeKey;
      break;
    }
  }

  const allDrugNames = medicamentosData.map(m => m["Nome do Medicamento"].toLowerCase());
  let bestMatchDrug: string | undefined;
  let bestMatchLength = 0;

  for (const drug of allDrugNames) {
    if (lowerMessage.includes(drug) && drug.length > bestMatchLength) {
      bestMatchDrug = drug;
      bestMatchLength = drug.length;
    }
  }
  drugName = bestMatchDrug;

  return { drugName, infoType };
}

function getMedicamentoInfo(drugName: string, infoType: string): string {
  const termoBuscaMedicamento = drugName.toLowerCase();

  const medicamentoEncontrado = medicamentosData.find(bula =>
    bula["Nome do Medicamento"].toLowerCase().includes(termoBuscaMedicamento)
  );

  if (!medicamentoEncontrado) {
    return `N├úo encontrei informa├º├Áes sobre o medicamento '${drugName}' em nossa base de dados.`;
  }

  if (infoType === "tudo") {
    let fullInfo = `­ƒÆè *Informa├º├Áes completas sobre ${medicamentoEncontrado["Nome do Medicamento"]}*:\\n\\n`;

    for (const key in medicamentoEncontrado) {
      const typedKey = key as keyof typeof medicamentoEncontrado;
      if (key !== "Nome do Medicamento") {
        const value = medicamentoEncontrado[typedKey];
        fullInfo += `*ÔÇó ${key}:* ${Array.isArray(value) ? value.join(', ') : value}\\n\\n`;
      }
    }

    fullInfo += `_Consulte sempre um farmac├¬utico ou m├®dico para orienta├º├Áes espec├¡ficas._`;
    return fullInfo;
  }

  const infoTypeMap: { [key: string]: string } = {
    "classe terapeutica": "Classe Farmacol├│gica",
    "posologia": "Posologia",
    "indicacoes": "Indica├º├Áes",
    "efeitos colaterais": "Efeitos Colaterais",
    "contraindicacoes": "Contraindica├º├Áes",
    "mecanismo de acao": "Mecanismo de A├º├úo",
    "interacoes medicamentosas": "Intera├º├Áes Medicamentosas",
  };

  const mappedInfoType = infoTypeMap[infoType];

  if (!mappedInfoType) {
    return `N├úo tenho a informa├º├úo espec├¡fica sobre '${infoType}'. Tente: classe terapeutica, posologia, indicacoes, efeitos colaterais, contraindicacoes, mecanismo de acao, interacoes medicamentosas ou tudo.`;
  }

  const info = medicamentoEncontrado[mappedInfoType as keyof typeof medicamentoEncontrado];

  if (info) {
    return `­ƒÆè *${mappedInfoType} de ${medicamentoEncontrado["Nome do Medicamento"]}*:\\n\\n${Array.isArray(info) ? info.join(', ') : info}\\n\\n_Consulte um profissional de sa├║de para orienta├º├Áes._`;
  } else {
    return `N├úo encontrei a informa├º├úo de '${mappedInfoType}' para o medicamento '${medicamentoEncontrado["Nome do Medicamento"]}'.`;
  }
}

// =========================================================================
// FUN├ç├òES DE E-COMMERCE
// =========================================================================

async function finalizarPedido(from: string, whatsappPhoneId: string, customerId: string): Promise<void> {
  const orderId = await getOrCreateCartOrder(customerId, whatsappPhoneId);

  if (!orderId) {
    const erroMsg = 'ÔÜá´©Å N├úo foi poss├¡vel finalizar o pedido. O carrinho est├í vazio ou ocorreu um erro.';
    await enviarComFormatosCorretos(from, erroMsg);
    await salvarMensagemNoSupabase(whatsappPhoneId, from, erroMsg, 'OUT');
    return;
  }

  try {
    const updateUrl = `${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`;
    const headers = new Headers({
      'apikey': SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    });

    const updatePayload = {
      status: 'PENDING',
      checkout_at: new Date().toISOString()
    };

    const response = await fetch(updateUrl, {
      method: 'PATCH',
      headers: headers,
      body: JSON.stringify(updatePayload)
    });

    if (!response.ok) {
      console.error('ÔØî ERRO ao finalizar pedido:', await response.text());
      throw new Error('Erro na API Supabase.');
    }

    const sucessoMsg = '­ƒÄë *PEDIDO FINALIZADO COM SUCESSO!*\\n\\n' +
      `Seu pedido (ID: ${orderId.substring(0, 8)}) foi enviado para nossa equipe.\\n` +
      'Em breve, um de nossos atendentes ir├í te contatar para confirmar endere├ºo, pagamento e tempo de entrega.';

    await enviarComFormatosCorretos(from, sucessoMsg);
    await salvarMensagemNoSupabase(whatsappPhoneId, from, sucessoMsg, 'OUT');

  } catch (error) {
    const erroMsg = 'ÔÜá´©Å Ocorreu um erro ao processar o seu pedido. Por favor, tente novamente ou digite *ATENDENTE*.';
    await enviarComFormatosCorretos(from, erroMsg);
    await salvarMensagemNoSupabase(whatsappPhoneId, from, erroMsg, 'OUT');
  }
}

async function buscarEOferecerProdutos(from: string, whatsappPhoneId: string, termoBusca: string): Promise<void> {
  let resposta = `­ƒöì *Resultados da busca por "${termoBusca}":*\\n\\n`;

  try {
    const farmacia = await findFarmacyAPI(whatsappPhoneId);

    console.log(`­ƒÅ¬ Farm├ícia encontrada:`, farmacia);

    if (farmacia && farmacia.api_url) {
      // Tenta buscar via API da farm├ícia
      console.log(`­ƒöä Buscando no banco da API...`);
      const searchResults = await consultarAPIFarmacia(farmacia.api_url, termoBusca);

      console.log(`­ƒôª Produtos retornados:`, searchResults);

      if (searchResults.data && searchResults.data.length > 0) {
        searchResults.data.slice(0, 5).forEach((product: any) => {
          // ­ƒÆ¥ SALVAR NO CACHE
          const priceStr = product.preco_final_venda.replace(/[^\d,]/g, '').replace(',', '.');
          const unitPrice = parseFloat(priceStr) || 0;
          saveProductToCache(product.cod_reduzido, product.nome_produto, unitPrice).catch(e => 
            console.log(`ÔÜá´©Å Erro ao salvar cache:`, e)
          );

          resposta += `Ôû¬´©Å *${product.nome_produto}*\\n`;
          resposta += `   ­ƒÆè ${product.nom_laboratorio}\\n`;
          
          if (product.desconto_percentual > 0) {
            resposta += `   ­ƒÆ░ ~~${product.vlr_venda}~~ *${product.preco_final_venda}* (­ƒö╗${product.desconto_percentual.toFixed(1)}% OFF)\\n`;
          } else {
            resposta += `   ­ƒÆ░ *${product.preco_final_venda}*\\n`;
          }
          
          resposta += `   ­ƒôª Estoque: ${product.qtd_estoque} unidades\\n`;
          resposta += `   ­ƒôï C├│digo: ${product.cod_reduzido}\\n`;
          resposta += `   Para adicionar ao carrinho, digite: *COMPRAR ${product.cod_reduzido}*\\n\\n`;
        });

        if (searchResults.data.length > 5) {
          resposta += `\\n_Encontramos ${searchResults.data.length} produtos! Mostrando os 5 primeiros. Refina a busca ou digite o c├│digo do produto para comprar._`;
        }
      } else {
        resposta += 'N├úo encontramos nenhum produto que corresponda ├á sua busca. Tente um nome diferente ou digite *MENU*.';
      }
    } else {
      // Fallback: usa banco de dados local de medicamentos
      console.warn('ÔÜá´©Å Usando base local de medicamentos como fallback');
      const termoBuscaLower = termoBusca.toLowerCase();
      const resultados = medicamentosData.filter(med => 
        med['Nome do Medicamento'].toLowerCase().includes(termoBuscaLower) ||
        med['Princ├¡pio(s) Ativo(s)'].some(p => p.toLowerCase().includes(termoBuscaLower))
      );

      if (resultados.length > 0) {
        resultados.slice(0, 3).forEach(med => {
          resposta += `Ôû¬´©Å *${med['Nome do Medicamento']}*\\n`;
          resposta += `   *Princ├¡pio ativo:* ${med['Princ├¡pio(s) Ativo(s)'].join(', ')}\\n`;
          resposta += `   Para mais info, digite: "INFO ${med['Nome do Medicamento']}"\\n\\n`;
        });
      } else {
        resposta += 'N├úo encontramos nenhum produto que corresponda ├á sua busca. Tente um nome diferente ou digite *MENU*.';
      }
    }
  } catch (error) {
    console.error('ÔØî Erro na busca de produtos:', error);
    resposta += 'ÔÜá´©Å N├úo foi poss├¡vel buscar produtos neste momento. Por favor, tente novamente mais tarde ou digite *ATENDENTE*.';
  }

  await enviarComFormatosCorretos(from, resposta);
  await salvarMensagemNoSupabase(whatsappPhoneId, from, resposta, 'OUT');
}

async function verCarrinho(from: string, whatsappPhoneId: string, customerId: string): Promise<void> {
  const orderId = await getOrCreateCartOrder(customerId, whatsappPhoneId);

  if (!orderId) {
    const erroMsg = 'ÔÜá´©Å N├úo foi poss├¡vel carregar seu carrinho. Tente novamente mais tarde.';
    await enviarComFormatosCorretos(from, erroMsg);
    await salvarMensagemNoSupabase(whatsappPhoneId, from, erroMsg, 'OUT');
    return;
  }

  const items = await getOrderItems(orderId);

  let totalGeral = 0;
  let resposta = `­ƒøÆ *SEU CARRINHO DE COMPRAS* (ID: ${orderId.substring(0, 8)})\\n\\n`;

  if (items.length === 0) {
    resposta += 'Seu carrinho est├í vazio! Comece a adicionar produtos digitando o nome ou o c├│digo (ex: "quero losartana" ou "adicionar 123456").';
  } else {
    resposta += '*Itens Atuais:*\\n';
    items.forEach(item => {
      const unitPrice = parseFloat(item.unit_price);
      const subtotal = item.quantity * unitPrice;
      totalGeral += subtotal;

      const precoUnitarioFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(unitPrice);
      const subtotalFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subtotal);

      resposta += `Ôû¬´©Å *${item.product_name}* (${item.product_api_id})\\n`;
      resposta += `   *Qtd:* ${item.quantity} x ${precoUnitarioFormatado} = ${subtotalFormatado}\\n`;
    });

    const totalFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalGeral);

    resposta += `\\n-------------------------------\\n`;
    resposta += `­ƒÆ░ *TOTAL GERAL: ${totalFormatado}*`;
    resposta += `\\n-------------------------------\\n\\n`;
    resposta += `*Para finalizar:* Digite 'FINALIZAR' para iniciar a confirma├º├úo de endere├ºo e pagamento.\\n`;
    resposta += `*Para remover:* Digite 'REMOVER [C├ôDIGO]' (ainda n├úo implementado).`;
  }

  resposta += '\\n\\nOu *digite menu* para voltar ao Menu Principal.';

  await enviarComFormatosCorretos(from, resposta);
  await salvarMensagemNoSupabase(whatsappPhoneId, from, resposta, 'OUT');

  if (items.length > 0) {
    await updateOrderTotal(orderId, totalGeral);
  }
}

// =========================================================================
// FUN├ç├âO DE INTERPRETA├ç├âO COM IA GEMINI
// =========================================================================

interface IntencaoMensagem {
  tipo: 'saudacao' | 'busca_produto' | 'consulta_medicamento' | 'carrinho' | 'comando' | 'outro';
  termo_busca?: string;
  medicamento?: string;
  resposta_ia?: string;
}

async function interpretarComGemini(mensagem: string): Promise<IntencaoMensagem> {
  try {
    if (!hasGeminiConfig) {
      console.warn('ÔÜá´©Å Gemini n├úo configurado - usando detec├º├úo b├ísica');
      return detectarIntencaoBasica(mensagem);
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!);
    
    // Usar modelo Gemini 2.5 (atual e funcional)
    const modelsToTest = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-pro'];
    
    for (const modelName of modelsToTest) {
      try {
        console.log(`­ƒñû Testando modelo Gemini: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });

        const prompt = `Voc├¬ ├® um assistente de farm├ícia virtual. Analise a mensagem do cliente e identifique a inten├º├úo.

RESPONDA EM JSON com este formato exato:
{
  "tipo": "saudacao" | "busca_produto" | "consulta_medicamento" | "carrinho" | "comando" | "outro",
  "termo_busca": "nome do produto ou medicamento (se aplic├ível)",
  "medicamento": "nome do medicamento (se for consulta de medicamento)",
  "resposta_ia": "sua resposta de assistente virtual (apenas se for sauda├º├úo ou outro)"
}

Tipos:
- saudacao: Ol├í, Oi, Como vai, etc
- busca_produto: Cliente busca por produto/pre├ºo/estoque
- consulta_medicamento: Cliente quer info de medicamento, posologia, efeitos
- carrinho: Cliente quer ver carrinho ou finalizar pedido
- comando: Menu, ajuda, atendente
- outro: Qualquer outra coisa

Mensagem do cliente: "${mensagem}"

Responda APENAS com JSON v├ílido, sem markdown.`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim();
        
        // Remover markdown se houver
        const jsonText = responseText.replace(/```json\n?|\n?```/g, '').trim();
        const parsed = JSON.parse(jsonText);

        console.log(`Ô£à Modelo ${modelName} funcionou. Inten├º├úo:`, parsed);
        return parsed;
        
      } catch (error) {
        console.log(`ÔØî Modelo ${modelName} falhou:`, (error as Error).message);
        continue;
      }
    }
    
    throw new Error('Nenhum modelo Gemini dispon├¡vel');

  } catch (error) {
    console.error('ÔØî Erro ao usar Gemini:', error);
    return detectarIntencaoBasica(mensagem);
  }
}

function detectarIntencaoBasica(mensagem: string): IntencaoMensagem {
  const msg = mensagem.toLowerCase().trim();

  // Sauda├º├Áes
  if (/^(oi|ol├í|ola|hey|e ai|e a├¡|como vai|tudo bem|opa)/.test(msg)) {
    return {
      tipo: 'saudacao',
      resposta_ia: '*OL├ü! SOU SEU ASSISTENTE VIRTUAL DA FARM├üCIA.*\n\nComo posso te ajudar hoje?\n\nDigite o *n├║mero* da op├º├úo desejada, ou digite o nome do produto/medicamento:\n*1.* ­ƒöì Buscar Pre├ºos e Estoque de Produtos\n*2.* ­ƒÆè Consultar Informa├º├Áes de Medicamentos (Bula)\n*3.* ­ƒæ®ÔÇì­ƒÆ╗ Falar com um Atendente (Hor├írio Comercial)\n*4.* ­ƒåÿ Ver comandos administrativos (/test, /ajuda)'
    };
  }

  // Comandos
  if (msg === '1' || msg === 'menu' || msg === 'finalizar') {
    return { tipo: 'comando' };
  }

  // Busca de produto
  if (/buscar|pre├ºo|preco|estoque|tem|quanto custa/.test(msg)) {
    const termo = msg.replace(/buscar|pre├ºo|preco|estoque|tem\s+|quanto custa|o\s+|a\s+|de\s+/gi, '').trim();
    return {
      tipo: 'busca_produto',
      termo_busca: termo || msg
    };
  }

  // Por padr├úo, trata como busca de produto
  return {
    tipo: 'busca_produto',
    termo_busca: msg
  };
}

// =========================================================================
// FUN├ç├âO PRINCIPAL - AGORA COM GEMINI COMO PRIMEIRO PASSO
// =========================================================================

async function processarMensagemCompleta(from: string, whatsappPhoneId: string, messageText: string) {
  const customerId = await getOrCreateCustomer(from, whatsappPhoneId);
  if (!customerId) return;

  await salvarMensagemNoSupabase(whatsappPhoneId, from, messageText, 'IN');

  console.log(`­ƒñû [GEMINI] Processando: "${messageText}"`);

  // ­ƒøÆ VERIFICA SE ├ë COMANDO "COMPRAR [C├ôDIGO]"
  const comprarMatch = messageText.match(/^comprar\s+(\d+)/i);
  if (comprarMatch) {
    const productCode = comprarMatch[1];
    console.log(`­ƒøÆ Comando COMPRAR detectado: ${productCode}`);
    
    const orderId = await getOrCreateCartOrder(customerId, whatsappPhoneId);
    if (orderId && await addItemToCart(orderId, productCode, 1, whatsappPhoneId)) {
      const sucessoMsg = `Ô£à *PRODUTO ADICIONADO!*\\n\\nProduto *${productCode}* foi adicionado ao seu carrinho.\\n\\nDigite *CARRINHO* para visualizar ou *FINALIZAR* para completar o pedido.`;
      await enviarComFormatosCorretos(from, sucessoMsg);
      await salvarMensagemNoSupabase(whatsappPhoneId, from, sucessoMsg, 'OUT');
      return;
    } else {
      const erroMsg = `ÔØî N├úo foi poss├¡vel adicionar o produto ao carrinho.\\n\\nVerifique se o c├│digo *${productCode}* est├í correto e tente novamente.`;
      await enviarComFormatosCorretos(from, erroMsg);
      await salvarMensagemNoSupabase(whatsappPhoneId, from, erroMsg, 'OUT');
      return;
    }
  }

  // Ô£¿ FLUXO COM GEMINI - PARA OUTROS TIPOS DE MENSAGEM
  const intencao = await interpretarComGemini(messageText);
  
  console.log(`­ƒÄ» Inten├º├úo detectada:`, intencao.tipo);

  // 1´©ÅÔâú SAUDA├ç├âO - Responder com menu
  if (intencao.tipo === 'saudacao') {
    console.log('Ô£à Sauda├º├úo detectada');
    const resposta = intencao.resposta_ia || '*OL├ü! SOU SEU ASSISTENTE VIRTUAL DA FARM├üCIA.*\n\nComo posso te ajudar hoje?';
    await enviarComFormatosCorretos(from, resposta);
    await salvarMensagemNoSupabase(whatsappPhoneId, from, resposta, 'OUT');
    return;
  }

  // 2´©ÅÔâú BUSCA DE PRODUTO - Buscar na API
  if (intencao.tipo === 'busca_produto' && intencao.termo_busca) {
    console.log(`Ô£à Busca de produto: "${intencao.termo_busca}"`);
    await buscarEOferecerProdutos(from, whatsappPhoneId, intencao.termo_busca);
    return;
  }

  // 3´©ÅÔâú CONSULTA DE MEDICAMENTO - Retornar info
  if (intencao.tipo === 'consulta_medicamento' && intencao.medicamento) {
    console.log(`Ô£à Consulta de medicamento: ${intencao.medicamento}`);
    const infoMedicamento = getMedicamentoInfo(intencao.medicamento, 'tudo');
    await enviarComFormatosCorretos(from, infoMedicamento);
    await salvarMensagemNoSupabase(whatsappPhoneId, from, infoMedicamento, 'OUT');
    return;
  }

  // 4´©ÅÔâú CARRINHO
  if (intencao.tipo === 'carrinho') {
    console.log('Ô£à Carrinho');
    const normalizedText = messageText.toLowerCase().trim();
    
    if (normalizedText.includes('finalizar')) {
      await finalizarPedido(from, whatsappPhoneId, customerId);
    } else {
      await verCarrinho(from, whatsappPhoneId, customerId);
    }
    return;
  }

  // 5´©ÅÔâú COMANDO (Menu, ajuda, atendente)
  if (intencao.tipo === 'comando') {
    console.log('Ô£à Comando');
    const normalizedText = messageText.toLowerCase().trim();

    if (normalizedText === '1') {
      const msg = 'Certo! Digite o nome do produto ou o c├│digo de barras (ex: *DIPIRONA* ou *7896000000000*).';
      await enviarComFormatosCorretos(from, msg);
      await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
      return;
    }

    if (normalizedText === '2') {
      const msg = 'Qual medicamento voc├¬ gostaria de consultar? (Ex: *Losartana posologia*)';
      await enviarComFormatosCorretos(from, msg);
      await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
      return;
    }

    if (normalizedText === '3') {
      await verCarrinho(from, whatsappPhoneId, customerId);
      return;
    }

    if (normalizedText === '4') {
      const msg = '­ƒæ®ÔÇì­ƒÆ╗ *ATENDIMENTO HUMANO*\n\nVoc├¬ ser├í redirecionado para um de nossos atendentes em hor├írio comercial (segunda a sexta, 8h ├ás 18h).\n\nEnquanto isso, posso te ajudar com algo mais?';
      await enviarComFormatosCorretos(from, msg);
      await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
      return;
    }

    await enviarMenuInicial(from, whatsappPhoneId);
    return;
  }

  // 6´©ÅÔâú OUTRO - Mostrar menu ou tentar busca
  console.log('ÔØô Inten├º├úo n├úo identificada - tentando busca');
  const termoBusca = messageText.trim();
  
  if (termoBusca.length >= 2) {
    await buscarEOferecerProdutos(from, whatsappPhoneId, termoBusca);
  } else {
    await enviarMenuInicial(from, whatsappPhoneId);
  }
}

// =========================================================================
// HANDLER DE RESPOSTAS INTERATIVAS
// =========================================================================

async function handleInteractiveReply(from: string, whatsappPhoneId: string, replyId: string) {
  const customerId = await getOrCreateCustomer(from, whatsappPhoneId);
  if (!customerId) return;

  await salvarMensagemNoSupabase(whatsappPhoneId, from, `Interactive Reply ID: ${replyId}`, 'IN');

  const normalizedReplyId = replyId.toLowerCase().trim();

  if (normalizedReplyId === "ver_carrinho") {
    await verCarrinho(from, whatsappPhoneId, customerId);
    return;
  }

  const productCodeMatch = normalizedReplyId.match(/(\d{6,})/);
  if (productCodeMatch) {
    const productCode = productCodeMatch[1];
    const orderId = await getOrCreateCartOrder(customerId, whatsappPhoneId);

    if (orderId && await addItemToCart(orderId, productCode, 1, whatsappPhoneId)) {
      await enviarComFormatosCorretos(from, `Ô£à Produto *${productCode}* adicionado ao carrinho.`);
      await salvarMensagemNoSupabase(whatsappPhoneId, from, `Adicionado ${productCode} (Interactive)`, 'OUT');
      await verCarrinho(from, whatsappPhoneId, customerId);
    } else {
      await enviarComFormatosCorretos(from, `ÔØî N├úo foi poss├¡vel adicionar o produto *${productCode}* ao carrinho.`);
      await salvarMensagemNoSupabase(whatsappPhoneId, from, `Erro ao adicionar ${productCode} (Interactive)`, 'OUT');
    }
    return;
  }

  await enviarComFormatosCorretos(from, `Obrigado pelo seu clique! N├úo entendi essa a├º├úo. Digite *MENU*.`);
  await salvarMensagemNoSupabase(whatsappPhoneId, from, `Resposta padr├úo Interactive`, 'OUT');
}

// =========================================================================
// HANDLERS PRINCIPAIS
// =========================================================================

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  } else {
    return new NextResponse('Verification failed', { status: 403 });
  }
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

              const messageText = message.text?.body;
              const replyId = message.interactive?.list_reply?.id || message.interactive?.button_reply?.id;

              if (replyId) {
                await handleInteractiveReply(from, whatsappPhoneId, replyId);
              } else if (message.type === 'text' && messageText) {
                await processarMensagemCompleta(from, whatsappPhoneId, messageText);
              } else if (message.type === 'button') {
                await processarMensagemCompleta(from, whatsappPhoneId, message.button.text);
              } else {
                await enviarMenuInicial(from, whatsappPhoneId);
              }
            }
          }
        }
      }
    }

    return new NextResponse('EVENT_RECEIVED', { status: 200 });
  } catch (error) {
    console.error('ÔØî Erro no webhook:', error);
    return new NextResponse('Internal Server Error but OK to Meta', { status: 200 });
  }
}
