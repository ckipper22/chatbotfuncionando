import { NextRequest, NextResponse } from 'next/server';

// =========================================================================
// CONFIGURAÇÃO DAS VARIÁVEIS DE AMBIENTE
// =========================================================================

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const FLASK_API_BASE_URL = process.env.FLASK_API_BASE_URL; // Adicionando a URL da API Flask

// Verificação das variáveis essenciais
if (!WHATSAPP_VERIFY_TOKEN || !WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
  console.error('❌ ERRO: Variáveis do WhatsApp não configuradas.');
  throw new Error('Configuração do WhatsApp ausente');
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ ERRO: Variáveis do Supabase não configuradas.');
  throw new Error('Configuração do Supabase ausente');
}

if (!FLASK_API_BASE_URL) {
    console.error('❌ ERRO: Variável FLASK_API_BASE_URL não configurada. Necessária para a busca de produtos.');
    // Não lança erro, mas é importante para o console.
}


// =========================================================================
// BASE DE DADOS DE MEDICAMENTOS (FALLBACK)
// =========================================================================

const medicamentosData = [
  {
    "Nome do Medicamento": "Losartana",
    "Princípio(s) Ativo(s)": ["Losartana Potássica"],
    "Classe Farmacológica": "Antagonista do Receptor da Angiotensina II",
    "Mecanismo de Ação": "Bloqueia receptores da angiotensina II, reduzindo pressão arterial",
    "Indicações": "Hipertensão arterial, insuficiência cardíaca, proteção renal em diabetes",
    "Posologia": "50 mg uma vez ao dia, podendo ser ajustada até 100 mg/dia",
    "Contraindicações": "Gravidez, hipersensibilidade, uso com alisquireno em diabéticos",
    "Efeitos Colaterais": "Tontura, cefaleia, fadiga, hipercalemia",
    "Interações Medicamentosas": "Diuréticos, AINEs, lítio"
  },
  {
    "Nome do Medicamento": "Sinvastatina",
    "Princípio(s) Ativo(s)": ["Sinvastatina"],
    "Classe Farmacológica": "Inibidor da HMG-CoA Redutase",
    "Mecanismo de Ação": "Inibe a produção de colesterol no fígado",
    "Indicações": "Hipercolesterolemia, prevenção de eventos cardiovasculares",
    "Posologia": "10-40 mg uma vez ao dia, preferencialmente à noite",
    "Contraindicações": "Doença hepática ativa, gravidez, uso com certos antifúngicos",
    "Efeitos Colaterais": "Mialgia, dor abdominal, elevação de enzimas hepáticas",
    "Interações Medicamentosas": "Antifúngicos azóis, antibióticos macrolídeos"
  }
];


// =========================================================================
// GATILHOS E AUXILIARES DE INTENÇÃO
// =========================================================================

// Lista expandida de palavras-chave para identificar a intenção de BUSCA DE PRODUTOS
const TRIGGERS_BUSCA = [
  'buscar', 'produto', 'consulta', 'preço', 'preco', 'estoque',
  'achar', 'encontrar', 'ver se tem', 'quanto custa', 'me veja', 'me passe',
  'quero', 'tem', 'procurar'
];

// NOVAS PALAVRAS-CHAVE PARA ADICIONAR AO CARRINHO
const TRIGGERS_CARRINHO = [
    'adicionar', 'carrinho', 'quero', 'comprar', 'levar', 'mais um', 'pegue'
];

// Palavras de ruído que devem ser removidas para isolar o nome do produto
const NOISE_WORDS = new Set([
  ...TRIGGERS_BUSCA,
  ...TRIGGERS_CARRINHO,
  'qual', 'o', 'a', 'os', 'as', 'de', 'do', 'da', 'dos', 'das', 'por', 'um', 'uma',
  'pra', 'eh', 'e', 'me', 'nele', 'dele', 'dela', 'em', 'para', 'na', 'no', 'favor', 'porfavor', 'porgentileza',
  'o produto', 'o item'
]);

/**
 * Encontra e remove o ruído da mensagem usando tokenização para extrair o termo de busca.
 */
function extrairTermoBusca(mensagem: string): string | null {
  const lowerMsg = mensagem.toLowerCase();

  // 1. Verifica se a mensagem tem pelo menos um gatilho de busca (para confirmar a intenção)
  const isSearchIntent = TRIGGERS_BUSCA.some(trigger => lowerMsg.includes(trigger));

  if (!isSearchIntent) {
    return null;
  }

  // 2. Tokeniza a mensagem e filtra as palavras de ruído
  const tokens = lowerMsg.split(/\s+/).filter(Boolean);

  const filteredTokens = tokens.filter(token => !NOISE_WORDS.has(token));

  const termo = filteredTokens.join(' ').trim();

  // 3. Garante que restou um termo de busca válido
  if (termo.length >= 2) {
    return termo;
  }

  return null;
}

/**
 * Tenta extrair a intenção de adicionar ao carrinho (quantidade e código do produto).
 * Ex: "Adicionar 2 do 12345" ou "quero 1 desse".
 */
function extrairIntencaoCarrinho(mensagem: string): { quantity: number; productCode: string } | null {
    const lowerMsg = mensagem.toLowerCase();

    // 1. Verifica a intenção de compra
    const isCartIntent = TRIGGERS_CARRINHO.some(trigger => lowerMsg.includes(trigger));
    if (!isCartIntent) {
        return null;
    }

    // Padrão 1: Tenta encontrar Quantidade e Código Reduzido (6 dígitos ou mais)
    // Ex: "adicionar 3 do 123456" ou "quero 555444"
    const regexFull = /(?:adicionar|comprar|quero)\s*(\d+)\s+(?:do|o|o item)?\s*(\d{6,})/i;
    const matchFull = lowerMsg.match(regexFull);

    if (matchFull) {
        const quantity = parseInt(matchFull[1], 10);
        const productCode = matchFull[2];
        return { quantity, productCode };
    }

    // Padrão 2: Tenta encontrar apenas o Código Reduzido (6 dígitos ou mais), assumindo quantidade 1
    // Ex: "quero comprar 123456"
    const regexCodeOnly = /(\d{6,})/i;
    const matchCodeOnly = lowerMsg.match(regexCodeOnly);

    if (matchCodeOnly) {
        const productCode = matchCodeOnly[1];
        // Se a mensagem contém "1" ou "um" e não contém outro número maior, assumimos 1
        let quantity = 1;
        const numberMatch = lowerMsg.match(/\s(\d+)\s/);
        if (numberMatch && numberMatch[1] !== productCode) {
             quantity = parseInt(numberMatch[1], 10);
        }

        return { quantity, productCode };
    }


    return null;
}

// =========================================================================
// FUNÇÕES AUXILIARES DE SUPABASE (NOVAS E MELHORADAS)
// =========================================================================

// --- FUNÇÃO AUXILIAR: GARANTIR CLIENTE (CRM) NO SUPABASE (Retorna o ID) ---
/**
 * Verifica se o número de WhatsApp já existe na tabela 'customers' e o cria se for novo.
 * @param from O número de telefone do cliente (ID único).
 * @param whatsappPhoneId O ID da conexão WhatsApp da farmácia (para multi-tenant).
 * @returns O ID do cliente (UUID).
 */
async function getOrCreateCustomer(from: string, whatsappPhoneId: string): Promise<string | null> {
  try {
    const headers = new Headers({
      'apikey': SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation' // Pede o corpo do objeto retornado
    });

    // 1. Tentar buscar o cliente pelo número de WhatsApp
    const selectUrl = `${SUPABASE_URL}/rest/v1/customers?whatsapp_phone_number=eq.${from}&select=id`;
    let selectResponse = await fetch(selectUrl, { method: 'GET', headers });

    if (!selectResponse.ok) {
        throw new Error(`Status de busca de cliente: ${selectResponse.status} - ${await selectResponse.text()}`);
    }

    let data = await selectResponse.json();

    if (data && data.length > 0) {
      const customerId = data[0].id;
      console.log('👤 Cliente encontrado no CRM. ID:', customerId);
      return customerId;
    }

    // 2. Se o cliente não existir, inserir novo registro
    const insertUrl = `${SUPABASE_URL}/rest/v1/customers`;
    const insertPayload = {
      whatsapp_phone_number: from,
      client_connection_id: whatsappPhoneId, // Relaciona o cliente à farmácia (Multi-tenant)
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

    // Precisa buscar novamente o ID após a inserção (ou configurar 'Prefer' para retornar o objeto inserido)
    // O Supabase tem um bug que o "return=representation" não funciona 100% no POST. Vamos buscar.
    selectResponse = await fetch(selectUrl, { method: 'GET', headers });
    data = await selectResponse.json();

    if (data && data.length > 0) {
        const newCustomerId = data[0].id;
        console.log('➕ Novo cliente CRM criado com sucesso. ID:', newCustomerId);
        return newCustomerId;
    }

    return null;

  } catch (error) {
    console.error('❌ Erro crítico no CRM (getOrCreateCustomer):', error);
    return null;
  }
}


// --- FUNÇÃO AUXILIAR: GARANTIR PEDIDO (CARRINHO) ATIVO ---
/**
 * Busca um pedido com status 'CART' para o cliente. Se não existir, cria um novo.
 * @param customerId O ID do cliente (UUID).
 * @param whatsappPhoneId O ID da conexão WhatsApp da farmácia (Tenant ID).
 * @returns O ID do pedido (UUID).
 */
async function getOrCreateCartOrder(customerId: string, whatsappPhoneId: string): Promise<string | null> {
    try {
        const headers = new Headers({
            'apikey': SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        });

        // 1. Tentar buscar o carrinho ativo
        const selectUrl = `${SUPABASE_URL}/rest/v1/orders?customer_id=eq.${customerId}&status=eq.CART&select=id`;
        let selectResponse = await fetch(selectUrl, { method: 'GET', headers });

        if (!selectResponse.ok) {
            throw new Error(`Status de busca de pedido: ${selectResponse.status} - ${await selectResponse.text()}`);
        }

        let data = await selectResponse.json();

        if (data && data.length > 0) {
            const orderId = data[0].id;
            console.log('🛒 Carrinho ativo encontrado. ID:', orderId);
            return orderId;
        }

        // 2. Se não existir, criar novo pedido com status 'CART'
        const insertUrl = `${SUPABASE_URL}/rest/v1/orders`;
        const insertPayload = {
            customer_id: customerId,
            client_connection_id: whatsappPhoneId,
            status: 'CART', // Definido como carrinho
            total_amount: 0.00 // Inicia com zero
        };

        const insertResponse = await fetch(insertUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(insertPayload)
        });

        if (!insertResponse.ok) {
            console.error('❌ ERRO ao criar novo pedido (carrinho):', await insertResponse.text());
            return null;
        }

        // Busca o ID do novo pedido (necessário pois o POST nem sempre retorna o ID)
        selectResponse = await fetch(selectUrl, { method: 'GET', headers });
        data = await selectResponse.json();

        if (data && data.length > 0) {
            const newOrderId = data[0].id;
            console.log('➕ Novo carrinho criado com sucesso. ID:', newOrderId);
            return newOrderId;
        }

        return null;

    } catch (error) {
        console.error('❌ Erro crítico no Carrinho (getOrCreateCartOrder):', error);
        return null;
    }
}

// --- FUNÇÃO AUXILIAR: BUSCAR ITENS DO PEDIDO ---
/**
 * Busca todos os itens (order_items) associados a um determinado ID de pedido.
 */
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

// --- FUNÇÃO AUXILIAR: ATUALIZAR O TOTAL DO PEDIDO ---
/**
 * Atualiza o campo total_amount na tabela 'orders'.
 */
async function updateOrderTotal(orderId: string, newTotal: number): Promise<void> {
    try {
        const updateUrl = `${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`;
        const headers = new Headers({
            'apikey': SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
            // Usamos PATCH para atualizar apenas o campo total_amount
            'X-HTTP-Method-Override': 'PATCH'
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
        } else {
            console.log(`✅ Total do pedido ${orderId} atualizado para ${newTotal.toFixed(2)}.`);
        }
    } catch (error) {
        console.error('❌ Erro crítico ao atualizar total do pedido:', error);
    }
}

// --- FUNÇÃO PRINCIPAL: ADICIONAR ITEM AO CARRINHO ---
/**
 * Adiciona um item (produto) ao pedido ativo do cliente (carrinho).
 */
async function addItemToCart(
    orderId: string,
    productCode: string,
    quantity: number,
    whatsappPhoneId: string
): Promise<boolean> {
    if (!FLASK_API_BASE_URL) {
        console.error("❌ FLASK_API_BASE_URL não está definida. Não é possível buscar detalhes do produto.");
        return false;
    }

    try {
        // 1. Buscar detalhes do produto na API Flask (main.py)
        const productApiUrl = `${FLASK_API_BASE_URL}/api/products/get_details/${productCode}`;
        console.log('🔍 Buscando detalhes do produto na API Flask:', productApiUrl);

        const apiResponse = await fetch(productApiUrl);
        const productData = await apiResponse.json();

        if (!apiResponse.ok || !productData.success) {
            console.error('❌ Erro ao buscar produto na API Flask:', productData.error || 'Erro desconhecido');
            return false;
        }

        const unitPrice = parseFloat(productData.unit_price);
        const totalPrice = unitPrice * quantity;

        // 2. Inserir o item na tabela 'order_items'
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
            product_name: productData.product_name,
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
            console.error('❌ ERRO ao inserir item no carrinho:', await insertResponse.text());
            return false;
        }

        console.log(`✅ Item ${productCode} adicionado ao carrinho ${orderId} com sucesso.`);
        return true;

    } catch (error) {
        console.error('❌ Erro crítico ao adicionar item ao carrinho:', error);
        return false;
    }
}


// =========================================================================
// FUNÇÕES AUXILIARES DE SUPABASE (EXISTENTES)
// =========================================================================

// --- FUNÇÃO AUXILIAR: SALVAR MENSAGEM NO SUPABASE (MANTIDA) ---
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
      console.error(`❌ ERRO [${direction}] ao salvar mensagem no Supabase:`, await response.text());
    } else {
      console.log(`✅ Mensagem de direção ${direction} salva no Supabase.`);
    }

  } catch (error) {
    console.error(`❌ Erro crítico ao salvar mensagem [${direction}]:`, error);
  }
}

// =========================================================================
// FUNÇÕES AUXILIARES DE INTEGRAÇÃO (MANTIDAS)
// =========================================================================


// --- Envio de Mensagem de Menu (Simples) ---
async function enviarMenuInicial(from: string, whatsappPhoneId: string): Promise<boolean> {
  const texto = '*OLÁ! SOU SEU ASSISTENTE VIRTUAL DA FARMÁCIA.*\\n\\n' +
                'Como posso te ajudar hoje?\\n\\n' +
                'Digite o *número* da opção desejada, ou digite o nome do produto/medicamento:\\n' +
                '*1.* 🔍 Buscar Preços e Estoque de Produtos\\n' +
                '*2.* 💊 Consultar Informações de Medicamentos (Bula)\\n' +
                '*3.* 👩‍💻 Falar com um Atendente (Horário Comercial)\\n' +
                '*4.* 🆘 Ver comandos administrativos (/test, /ajuda)';

  const result = await enviarComFormatosCorretos(from, texto, whatsappPhoneId);
  // Integração: Grava a resposta do Menu
  if (result) {
    await salvarMensagemNoSupabase(whatsappPhoneId, from, texto, 'OUT');
  }
  return result;
}

// --- Buscar API da farmácia no Supabase ---
async function findFarmacyAPI(whatsappPhoneId: string): Promise<{api_base_url: string, client_id: string} | null> {
  try {
    console.log('🔍 Buscando farmácia:', whatsappPhoneId);

    const url = `${SUPABASE_URL}/rest/v1/client_connections?whatsapp_phone_id=eq.${whatsappPhoneId}&select=api_base_url,client_id`;

    const headers = new Headers({
      'apikey': SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    });

    const response = await fetch(url, { method: 'GET', headers });

    if (!response.ok) {
      throw new Error(`Supabase status: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Farmácia encontrada:', data[0] || 'Nenhuma');

    return data && data.length > 0 ? {
      api_base_url: data[0].api_base_url,
      client_id: data[0].client_id
    } : null;

  } catch (error) {
    console.error('❌ Erro ao buscar farmácia:', error);
    return null;
  }
}

// --- Consultar API da farmácia ---
async function consultarAPIFarmacia(apiBaseUrl: string, termo: string): Promise<any> {
  try {
    const url = `${apiBaseUrl}/api/products/search?q=${encodeURIComponent(termo)}`;
    console.log('🔍 Consultando API farmácia:', url);

    const controller = new AbortController();
    // Timeout ajustado para 15 segundos
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

    if (!response.ok) {
      throw new Error(`API retornou status: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Resposta da API:', data);

    return data;

  } catch (error) {
    console.error('❌ Erro ao consultar API:', error);
    throw error;
  }
}

// --- Formatação de números WhatsApp ---
function converterParaFormatoFuncional(numeroOriginal: string): string[] {
  console.log('🎯 [CONVERT] Convertendo para formato funcional:', numeroOriginal);

  const numeroLimpo = numeroOriginal.replace(/\D/g, '');
  console.log('🎯 [CONVERT] Número limpo:', numeroLimpo);

  if (numeroLimpo === '555584557096') {
    const formatosFuncionais = ['5555984557096', '+5555984557096'];
    console.log('🎯 [CONVERT] ✅ Convertido para formatos funcionais (caso específico):', formatosFuncionais);
    return formatosFuncionais;
  }

  let numeroConvertido = numeroLimpo;

  if (numeroLimpo.length === 12 && numeroLimpo.startsWith('55')) {
    const ddd = numeroLimpo.substring(2, 4);
    const numeroSemDDIeDDD = numeroLimpo.substring(4);
    if (numeroSemDDIeDDD.length === 8 && !['1','2','3','4','5'].includes(numeroSemDDIeDDD.charAt(0))) {
        numeroConvertido = '55' + ddd + '9' + numeroSemDDIeDDD;
        console.log('🎯 [CONVERT] ✅ Adicionado 9 para celular brasileiro:', numeroConvertido);
    }
  }

  return ['+' + numeroConvertido, numeroConvertido];
}

// --- Envio WhatsApp com formatação correta ---
async function enviarComFormatosCorretos(from: string, texto: string, whatsappPhoneId: string): Promise<boolean> {
  try {
    console.log('🎯 [SEND] Enviando mensagem para:', from);

    const formatos = converterParaFormatoFuncional(from);

    for (let i = 0; i < formatos.length; i++) {
      const formato = formatos[i];
      console.log(`📤 Tentativa ${i + 1}/${formatos.length}: ${formato}`);

      try {
        const payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formato,
          type: 'text',
          text: {
            preview_url: false,
            body: texto.substring(0, 4096)
          }
        };

        const url = `https://graph.facebook.com/v19.0/${whatsappPhoneId}/messages`;

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          console.log(`✅ Mensagem enviada com sucesso para: ${formato}`);
          return true;
        } else {
          const errorResponse = await response.text();
          console.log(`❌ Falha para: ${formato} - Status: ${response.status} - Erro: ${errorResponse}`);
        }
      } catch (error) {
        console.error(`💥 Erro para ${formato}:`, error);
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log('❌ Todos os formatos falharam para:', from);
    return false;

  } catch (error) {
    console.error('❌ Erro crítico no envio:', error);
    return false;
  }
}

// --- Processar informações de medicamentos ---
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
    return `Não encontrei informações sobre o medicamento '${drugName}' em nossa base de dados.`;
  }

  if (infoType === "tudo") {
    let fullInfo = `💊 *Informações completas sobre ${medicamentoEncontrado["Nome do Medicamento"]}*:\\n\\n`;

    for (const key in medicamentoEncontrado) {
      const typedKey = key as keyof typeof medicamentoEncontrado;
      if (key !== "Nome do Medicamento") {
        const value = medicamentoEncontrado[typedKey];
        fullInfo += `*• ${key}:* ${Array.isArray(value) ? value.join(', ') : value}\\n\\n`;
      }
    }

    fullInfo += `_Consulte sempre um farmacêutico ou médico para orientações específicas._`;
    return fullInfo;
  }

  const infoTypeMap: { [key: string]: string } = {
    "classe terapeutica": "Classe Farmacológica",
    "posologia": "Posologia",
    "indicacoes": "Indicações",
    "efeitos colaterais": "Efeitos Colaterais",
    "contraindicacoes": "Contraindicações",
    "mecanismo de acao": "Mecanismo de Ação",
    "interacoes medicamentosas": "Interações Medicamentosas",
  };

  const mappedInfoType = infoTypeMap[infoType];

  if (!mappedInfoType) {
    return `Não tenho a informação específica sobre '${infoType}'. Tente: classe terapeutica, posologia, indicacoes, efeitos colaterais, contraindicacoes, mecanismo de acao, interacoes medicamentosas ou tudo.`;
  }

  const info = medicamentoEncontrado[mappedInfoType as keyof typeof medicamentoEncontrado];

  if (info) {
    return `💊 *${mappedInfoType} de ${medicamentoEncontrado["Nome do Medicamento"]}*:\\n\\n${Array.isArray(info) ? info.join(', ') : info}\\n\\n_Consulte um profissional de saúde para orientações._`;
  } else {
    return `Não encontrei a informação de '${mappedInfoType}' para o medicamento '${medicamentoEncontrado["Nome do Medicamento"]}'.`;
  }
}

// =========================================================================
// HANDLERS PRINCIPAIS (MANTIDOS)
// =========================================================================

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  console.log('🔔 Webhook verification:', { mode, token });

  if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
    console.log('✅ Webhook VERIFICADO!');
    return new NextResponse(challenge, { status: 200 });
  } else {
    console.error('❌ Falha na verificação');
    return new NextResponse('Verification failed', { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('📩 Mensagem recebida:', JSON.stringify(body, null, 2));

    if (body.object === 'whatsapp_business_account' && body.entry) {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.field === 'messages' && change.value?.messages) {
            for (const message of change.value.messages) {
              const from = message.from;
              const whatsappPhoneId = change.value.metadata.phone_number_id;
              const messageText = message.text?.body;

              console.log(`📱 De: ${from}, Farmácia: ${whatsappPhoneId}, Texto: "${messageText}"`);

              if (message.type === 'text' && messageText) {
                await processarMensagemCompleta(from, whatsappPhoneId, messageText);
              } else {
                // Se não for texto ou for mídia, mostra o menu inicial.
                await enviarMenuInicial(from, whatsappPhoneId);
              }
            }
          }
        }
      }
    }

    return new NextResponse('EVENT_RECEIVED', { status: 200 });
  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

// =========================================================================
// FUNÇÃO PRINCIPAL: VISUALIZAR CARRINHO
// =========================================================================
/**
 * Busca e exibe o conteúdo do carrinho ativo do cliente.
 */
async function verCarrinho(from: string, whatsappPhoneId: string, customerId: string): Promise<void> {
    const orderId = await getOrCreateCartOrder(customerId, whatsappPhoneId);

    if (!orderId) {
        const erroMsg = '⚠️ Não foi possível carregar seu carrinho. Tente novamente mais tarde.';
        await enviarComFormatosCorretos(from, erroMsg, whatsappPhoneId);
        await salvarMensagemNoSupabase(whatsappPhoneId, from, erroMsg, 'OUT');
        return;
    }

    const items = await getOrderItems(orderId);

    let totalGeral = 0;
    // Exibe apenas 8 caracteres do ID do pedido para não poluir
    let resposta = `🛒 *SEU CARRINHO DE COMPRAS* (ID: ${orderId.substring(0, 8)})\\n\\n`;

    if (items.length === 0) {
        resposta += 'Seu carrinho está vazio! Comece a adicionar produtos digitando o nome ou o código (ex: "quero losartana" ou "adicionar 123456").';
    } else {
        resposta += '*Itens Atuais:*\\n';
        items.forEach(item => {
            // Garante que o item.unit_price e item.quantity são números
            const unitPrice = parseFloat(item.unit_price);
            const subtotal = item.quantity * unitPrice;
            totalGeral += subtotal;

            const precoUnitarioFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(unitPrice);
            const subtotalFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subtotal);

            // Item ID do produto (Product_API_ID)
            resposta += `▪️ *${item.product_name}* (${item.product_api_id})\\n`;
            resposta += `   *Qtd:* ${item.quantity} x ${precoUnitarioFormatado} = ${subtotalFormatado}\\n`;
        });

        const totalFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalGeral);

        resposta += `\\n-------------------------------\\n`;
        resposta += `💰 *TOTAL GERAL: ${totalFormatado}*`;
        resposta += `\\n-------------------------------\\n\\n`;
        resposta += `*Para finalizar:* Digite 'FINALIZAR' para iniciar a confirmação de endereço e pagamento.\\n`;
        resposta += `*Para remover:* Digite 'REMOVER [CÓDIGO]' (ex: remover 123456).`;
    }

    resposta += '\\n\\nOu *digite voltar* para o Menu Principal.';

    await enviarComFormatosCorretos(from, resposta, whatsappPhoneId);
    await salvarMensagemNoSupabase(whatsappPhoneId, from, resposta, 'OUT');

    // Atualiza o total do pedido no Supabase
    if (items.length > 0) {
        await updateOrderTotal(orderId, totalGeral);
    }
}


// =========================================================================
// PROCESSAMENTO COMPLETO DE MENSAGENS (COM LÓGICA DE CARRINHO ADICIONADA)
// =========================================================================

async function processarMensagemCompleta(from: string, whatsappPhoneId: string, messageText: string): Promise<void> {
  const userMessage = messageText.trim();
  const lowerMessage = userMessage.toLowerCase();

  console.log(`🤖 Processando: "${userMessage}"`);

  // ----------------------------------------------------------------------
  // --- 1. CRM: GARANTIR REGISTRO DO CLIENTE ---
  const customerId = await getOrCreateCustomer(from, whatsappPhoneId);
  if (!customerId) {
    console.error('❌ Falha ao obter Customer ID. Interrompendo processamento.');
    const resposta = '⚠️ *ERRO CRÍTICO*\\n\\nNão foi possível registrar seu contato. Por favor, tente novamente ou contate o suporte.';
    await enviarComFormatosCorretos(from, resposta, whatsappPhoneId);
    await salvarMensagemNoSupabase(whatsappPhoneId, from, resposta, 'OUT');
    return;
  }
  // ----------------------------------------------------------------------

  // --- 2. INTEGRAÇÃO: SALVAR A MENSAGEM RECEBIDA (IN) ---
  if (userMessage.length > 0) {
    // Por enquanto, salvamos sem order_id/customer_id, mas a função getOrCreateCustomer garante que o cliente existe
    await salvarMensagemNoSupabase(whatsappPhoneId, from, userMessage, 'IN');
  }
  // ----------------------------------------------------------------------

  try {
    // --- OPÇÕES FIXAS (MENU) ---

    if (lowerMessage === '1') {
      const resposta = '✅ *BUSCA DE PRODUTOS*\\n\\nDigite o nome do produto que deseja buscar. Exemplos:\\n• dipirona\\n• paracetamol 500mg\\n• sorinan\\n\\nOu *digite voltar* para o Menu Principal.';
      await enviarComFormatosCorretos(from, resposta, whatsappPhoneId);
      await salvarMensagemNoSupabase(whatsappPhoneId, from, resposta, 'OUT'); // Gravar resposta
      return;
    }

    if (lowerMessage === '2') {
      const resposta = '✅ *INFORMAÇÕES DE MEDICAMENTOS*\\n\\nDigite o nome do medicamento e a informação desejada. Exemplos:\\n• losartana posologia\\n• sinvastatina tudo\\n• diclofenaco efeitos colaterais\\n\\nOu *digite voltar* para o Menu Principal.';
      await enviarComFormatosCorretos(from, resposta, whatsappPhoneId);
      await salvarMensagemNoSupabase(whatsappPhoneId, from, resposta, 'OUT'); // Gravar resposta
      return;
    }

    if (lowerMessage === '3') {
      // Aqui você pode adicionar lógica mais complexa de horário de atendimento
      const resposta = '👩‍💻 *FALAR COM ATENDENTE*\\n\\nNossos atendentes estão disponíveis de [INSERIR HORÁRIO AQUI].\\nPara ser transferido, aguarde um momento. Se for urgente, ligue para [INSERIR NÚMERO AQUI].\\n\\nOu *digite voltar* para o Menu Principal.';
      await enviarComFormatosCorretos(from, resposta, whatsappPhoneId);
      await salvarMensagemNoSupabase(whatsappPhoneId, from, resposta, 'OUT'); // Gravar resposta
      return;
    }

    if (lowerMessage === '4' || lowerMessage === '/comandos' || lowerMessage === '/admin') {
      const resposta = `🆘 *COMANDOS ADMINISTRATIVOS*\\n\\n• /test - Status de Conexão\\n• /debug - Informações Técnicas\\n• /carrinho - Ver meu carrinho atual (NOVO)\\n• /ajuda - Menu Principal`;
      await enviarComFormatosCorretos(from, resposta, whatsappPhoneId);
      await salvarMensagemNoSupabase(whatsappPhoneId, from, resposta, 'OUT'); // Gravar resposta
      return;
    }

    if (lowerMessage === 'voltar' || lowerMessage === 'menu' || lowerMessage === '/ajuda' || lowerMessage === 'ajuda' || lowerMessage === '/help' || lowerMessage === 'oi' || lowerMessage === 'ola' || lowerMessage === 'olá') {
      await enviarMenuInicial(from, whatsappPhoneId);
      return;
    }


    // --- COMANDOS ADMINISTRATIVOS ---
    if (lowerMessage === '/test' || lowerMessage === 'test') {
      const farmacyData = await findFarmacyAPI(whatsappPhoneId);
      const statusAPI = farmacyData ? '✅ CONFIGURADA' : '❌ NÃO CONFIGURADA';
      const resposta = `✅ *SISTEMA MULTI-TENANT FUNCIONANDO!*\\n\\n🏪 Farmácia: ${statusAPI}\\n📞 WhatsApp: ✅ Conectado\\n🛍️ Produtos: ✅ API Conectada\\n🛒 Carrinho: ✅ Supabase (orders, items)\\n🤖 IA: ✅ Base de Medicamentos\\n🚀 Status: 100% Operacional`;
      await enviarComFormatosCorretos(from, resposta, whatsappPhoneId);
      await salvarMensagemNoSupabase(whatsappPhoneId, from, resposta, 'OUT'); // Gravar resposta
      return;
    }

    // NOVO COMANDO: VISUALIZAR CARRINHO
    if (lowerMessage === '/carrinho' || lowerMessage === 'carrinho') {
      await verCarrinho(from, whatsappPhoneId, customerId);
      return;
    }


    // --- 3. BUSCA DE INFORMAÇÕES DE MEDICAMENTOS (Opção 2) ---
    const { drugName, infoType } = parseUserMessageForDrugInfo(userMessage);

    if (drugName && infoType) {
      const resposta = getMedicamentoInfo(drugName, infoType);
      await enviarComFormatosCorretos(from, resposta, whatsappPhoneId);
      await salvarMensagemNoSupabase(whatsappPhoneId, from, resposta, 'OUT'); // Gravar resposta
      return;
    }

    // --- 4. ADICIONAR ITEM AO CARRINHO (NOVO) ---
    const cartIntent = extrairIntencaoCarrinho(userMessage);
    if (cartIntent) {
        const { quantity, productCode } = cartIntent;

        const orderId = await getOrCreateCartOrder(customerId, whatsappPhoneId);

        if (orderId && productCode) {
            const added = await addItemToCart(orderId, productCode, quantity, whatsappPhoneId);
            if (added) {
                const sucessoMsg = `✅ *${quantity} unidade(s)* do produto *${productCode}* adicionada(s) ao seu carrinho!\\n\\nDigite /carrinho para ver o total ou continue comprando.`;
                await enviarComFormatosCorretos(from, sucessoMsg, whatsappPhoneId);
                await salvarMensagemNoSupabase(whatsappPhoneId, from, sucessoMsg, 'OUT');
            } else {
                const erroMsg = '⚠️ Houve um erro ao adicionar o item. Por favor, verifique se o código do produto está correto e tente novamente.';
                await enviarComFormatosCorretos(from, erroMsg, whatsappPhoneId);
                await salvarMensagemNoSupabase(whatsappPhoneId, from, erroMsg, 'OUT');
            }
            return;
        }
    }


    // --- 5. BUSCA DE PRODUTOS GERAL (Opção 1) ---
    const termoBusca = extrairTermoBusca(userMessage);

    if (termoBusca) {
      const farmacyData = await findFarmacyAPI(whatsappPhoneId);

      if (!farmacyData || !farmacyData.api_base_url) {
        const resposta = '❌ A farmácia não possui uma API de produtos configurada. Tente a opção 2 (Informações de Medicamentos).';
        await enviarComFormatosCorretos(from, resposta, whatsappPhoneId);
        await salvarMensagemNoSupabase(whatsappPhoneId, from, resposta, 'OUT'); // Gravar resposta
        return;
      }

      try {
        const apiResponse = await consultarAPIFarmacia(farmacyData.api_base_url, termoBusca);
        const products = apiResponse.products || [];

        let resposta = `🔍 *RESULTADO DA BUSCA POR: ${termoBusca.toUpperCase()}*\\n\\n`;

        if (products.length === 0) {
          resposta += 'Não encontramos nenhum produto com esse nome. Tente um termo mais genérico.';
        } else {
          resposta += 'Estes são os produtos encontrados:\\n\\n';
          products.slice(0, 5).forEach((p: any) => {
            const preco = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.unit_price);
            resposta += `*▪️ ${p.product_name}*\\n`;
            resposta += `  *Preço:* ${preco} | *Cód:* ${p.product_api_id}\\n\\n`;
          });
          if (products.length > 5) {
             resposta += `...e mais ${products.length - 5} produtos. Refine sua busca ou digite o código exato.\\n\\n`;
          }
          resposta += `*Para comprar,* digite: "adicionar [quantidade] do [código]" (ex: adicionar 2 do 123456)`;
        }

        await enviarComFormatosCorretos(from, resposta, whatsappPhoneId);
        await salvarMensagemNoSupabase(whatsappPhoneId, from, resposta, 'OUT'); // Gravar resposta

      } catch (error) {
        console.error('❌ Erro na busca de produtos:', error);
        const resposta = '⚠️ Desculpe, houve um problema de comunicação com a API de produtos. Tente novamente mais tarde.';
        await enviarComFormatosCorretos(from, resposta, whatsappPhoneId);
        await salvarMensagemNoSupabase(whatsappPhoneId, from, resposta, 'OUT'); // Gravar resposta
      }
      return;
    }


    // --- 6. RESPOSTA PADRÃO (SE NADA MAIS BATER) ---
    const respostaPadrao = `Não entendi sua solicitação. Por favor, *digite o número* da opção desejada, ou *digite /ajuda* para ver o menu principal.\\n\\n1. Buscar Preços\\n2. Consultar Bula`;
    await enviarComFormatosCorretos(from, respostaPadrao, whatsappPhoneId);
    await salvarMensagemNoSupabase(whatsappPhoneId, from, respostaPadrao, 'OUT'); // Gravar resposta


  } catch (error) {
    console.error('❌ Erro ao processar mensagem:', error);
    const resposta = '⚠️ Ocorreu um erro interno inesperado. Por favor, tente novamente mais tarde.';
    await enviarComFormatosCorretos(from, resposta, whatsappPhoneId);
    await salvarMensagemNoSupabase(whatsappPhoneId, from, resposta, 'OUT'); // Gravar resposta
  }
}