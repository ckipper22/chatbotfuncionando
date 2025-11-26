// src/app/api/whatsapp/webhook/route.ts
// ====================================================================================
// WEBHOOK PRINCIPAL - COM LÓGICA DE E-COMMERCE INTEGRADA
// ====================================================================================

import { NextRequest, NextResponse } from 'next/server';

// =========================================================================
// CONFIGURAÇÃO DAS VARIÁVEIS DE AMBIENTE
// =========================================================================

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const FLASK_API_BASE_URL = process.env.FLASK_API_BASE_URL;

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
    console.warn('⚠️ AVISO: Variável FLASK_API_BASE_URL não configurada. A busca de produtos não funcionará.');
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

/**
 * Encontra e remove o ruído da mensagem usando tokenização para extrair o termo de busca.
 */
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

/**
 * Tenta extrair a intenção de adicionar ao carrinho (quantidade e código do produto).
 */
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

// =========================================================================
// FUNÇÕES AUXILIARES DE SUPABASE
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
          console.log('👤 Cliente encontrado no CRM. ID:', customerId);
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
            console.log('🛒 Carrinho ativo encontrado. ID:', orderId);
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
            console.error('❌ ERRO ao criar novo pedido (carrinho):', await insertResponse.text());
            return null;
        }

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

async function updateOrderTotal(orderId: string, newTotal: number): Promise<void> {
    try {
        const updateUrl = `${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`;
        const headers = new Headers({
            'apikey': SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
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
// FUNÇÕES AUXILIARES DE INTEGRAÇÃO
// =========================================================================

async function enviarMenuInicial(from: string, whatsappPhoneId: string): Promise<boolean> {
  const texto = '*OLÁ! SOU SEU ASSISTENTE VIRTUAL DA FARMÁCIA.*\\n\\n' +
                'Como posso te ajudar hoje?\\n\\n' +
                'Digite o *número* da opção desejada, ou digite o nome do produto/medicamento:\\n' +
                '*1.* 🔍 Buscar Preços e Estoque de Produtos\\n' +
                '*2.* 💊 Consultar Informações de Medicamentos (Bula)\\n' +
                '*3.* 🛒 Ver/Finalizar Carrinho\\n' +
                '*4.* 👩‍💻 Falar com um Atendente (Horário Comercial)\\n';

  const result = await enviarComFormatosCorretos(from, texto, whatsappPhoneId);
  if (result) {
    await salvarMensagemNoSupabase(whatsappPhoneId, from, texto, 'OUT');
  }
  return result;
}

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

async function consultarAPIFarmacia(apiBaseUrl: string, termo: string): Promise<any> {
    try {
        const url = `${apiBaseUrl}/api/products/search?q=${encodeURIComponent(termo)}`;
        console.log('🔍 Consultando API farmácia:', url);

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

        if (!response.ok) {
          throw new Error(`API retornou status: ${response.status}`);
        }

        const data = await response.json();
        return data;

      } catch (error) {
        console.error('❌ Erro ao consultar API:', error);
        throw error;
      }
}

function converterParaFormatoFuncional(numeroOriginal: string): string[] {
    const numeroLimpo = numeroOriginal.replace(/\D/g, '');
    let numeroConvertido = numeroLimpo;

    if (numeroLimpo.length === 12 && numeroLimpo.startsWith('55')) {
        const ddd = numeroLimpo.substring(2, 4);
        const numeroSemDDIeDDD = numeroLimpo.substring(4);
        if (numeroSemDDIeDDD.length === 8 && !['1','2','3','4','5'].includes(numeroSemDDIeDDD.charAt(0))) {
            numeroConvertido = '55' + ddd + '9' + numeroSemDDIeDDD;
        }
    }
    return ['+' + numeroConvertido, numeroConvertido];
}

async function enviarComFormatosCorretos(from: string, texto: string, whatsappPhoneId: string): Promise<boolean> {
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
// FUNÇÕES DE E-COMMERCE E ROTAS
// =========================================================================

async function finalizarPedido(from: string, whatsappPhoneId: string, customerId: string): Promise<void> {
    const orderId = await getOrCreateCartOrder(customerId, whatsappPhoneId);

    if (!orderId) {
        const erroMsg = '⚠️ Não foi possível finalizar o pedido. O carrinho está vazio ou ocorreu um erro.';
        await enviarComFormatosCorretos(from, erroMsg, whatsappPhoneId);
        await salvarMensagemNoSupabase(whatsappPhoneId, from, erroMsg, 'OUT');
        return;
    }

    try {
        const updateUrl = `${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`;
        const headers = new Headers({
            'apikey': SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
            'X-HTTP-Method-Override': 'PATCH'
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
            console.error('❌ ERRO ao finalizar pedido:', await response.text());
            throw new Error('Erro na API Supabase.');
        }

        const sucessoMsg = '🎉 *PEDIDO FINALIZADO COM SUCESSO!*\\n\\n' +
                            `Seu pedido (ID: ${orderId.substring(0, 8)}) foi enviado para nossa equipe.\\n` +
                            'Em breve, um de nossos atendentes irá te contatar para confirmar endereço, pagamento e tempo de entrega.';

        await enviarComFormatosCorretos(from, sucessoMsg, whatsappPhoneId);
        await salvarMensagemNoSupabase(whatsappPhoneId, from, sucessoMsg, 'OUT');

    } catch (error) {
        const erroMsg = '⚠️ Ocorreu um erro ao processar o seu pedido. Por favor, tente novamente ou digite *ATENDENTE*.';
        await enviarComFormatosCorretos(from, erroMsg, whatsappPhoneId);
        await salvarMensagemNoSupabase(whatsappPhoneId, from, erroMsg, 'OUT');
    }
}

/**
 * CORREÇÃO CRÍTICA: Busca produtos na API Flask corretamente
 */
async function buscarEOferecerProdutos(from: string, whatsappPhoneId: string, termoBusca: string): Promise<void> {
    let resposta = `🔍 *Resultados da busca por "${termoBusca}":*\\n\\n`;

    try {
        // ✅ CORREÇÃO: Buscar a API da farmácia configurada no Supabase primeiro
        const farmacia = await findFarmacyAPI(whatsappPhoneId);

        if (!farmacia || !farmacia.api_base_url) {
            throw new Error('Farmácia não configurada no sistema');
        }

        // ✅ CORREÇÃO: Usar a API da farmácia do Supabase (que aponta para sua Flask)
        const searchResults = await consultarAPIFarmacia(farmacia.api_base_url, termoBusca);

        if (searchResults.products && searchResults.products.length > 0) {
            searchResults.products.slice(0, 5).forEach((product: any) => {
                const precoFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.unit_price);

                resposta += `▪️ *${product.product_name}*\\n`;
                resposta += `   *Cód:* ${product.product_code} | *Preço:* ${precoFormatado}\\n`;
                resposta += `   Para adicionar, digite: *'COMPRAR ${product.product_code}'*\\n\\n`;
            });

            if (searchResults.products.length > 5) {
                 resposta += `\\n_Encontramos mais resultados, refina a sua busca ou digite o código do produto para comprar._`;
            }

        } else {
            resposta += 'Não encontramos nenhum produto que corresponda à sua busca. Tente um nome diferente ou digite *MENU*.';
        }
    } catch (error) {
        console.error('❌ Erro na busca de produtos:', error);
        resposta += '⚠️ Não foi possível comunicar com a API da farmácia. Por favor, tente novamente mais tarde ou digite *ATENDENTE*.';
    }

    await enviarComFormatosCorretos(from, resposta, whatsappPhoneId);
    await salvarMensagemNoSupabase(whatsappPhoneId, from, resposta, 'OUT');
}

async function processarMensagemCompleta(from: string, whatsappPhoneId: string, messageText: string) {
    const customerId = await getOrCreateCustomer(from, whatsappPhoneId);
    if (!customerId) return;

    await salvarMensagemNoSupabase(whatsappPhoneId, from, messageText, 'IN');

    const normalizedText = messageText.toLowerCase().trim();

    if (normalizedText === '1') {
        const msg = 'Certo! Digite o nome do produto ou o código de barras (ex: *DIPIRONA* ou *7896000000000*).';
        await enviarComFormatosCorretos(from, msg, whatsappPhoneId);
        await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
        return;
    }
    if (normalizedText === '2') {
        const msg = 'Qual medicamento você gostaria de consultar? (Ex: *Losartana posologia*)';
        await enviarComFormatosCorretos(from, msg, whatsappPhoneId);
        await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
        return;
    }
    if (normalizedText === '3' || normalizedText.includes('carrinho')) {
        await verCarrinho(from, whatsappPhoneId, customerId);
        return;
    }
    if (normalizedText === '4' || normalizedText.includes('atendente')) {
        const msg = 'Encaminhando para um atendente... Aguarde um momento.';
        await enviarComFormatosCorretos(from, msg, whatsappPhoneId);
        await salvarMensagemNoSupabase(whatsappPhoneId, from, msg, 'OUT');
        return;
    }

    if (normalizedText.includes('finalizar') || normalizedText.includes('checkout')) {
        await finalizarPedido(from, whatsappPhoneId, customerId);
        return;
    }

    const cartIntent = extrairIntencaoCarrinho(messageText);
    if (cartIntent) {
        const orderId = await getOrCreateCartOrder(customerId, whatsappPhoneId);
        if (orderId && await addItemToCart(orderId, cartIntent.productCode, cartIntent.quantity, whatsappPhoneId)) {
            await enviarComFormatosCorretos(from, `✅ Adicionado ao carrinho: ${cartIntent.quantity} unidade(s) do produto *${cartIntent.productCode}*.`, whatsappPhoneId);
            await salvarMensagemNoSupabase(whatsappPhoneId, from, `Adicionado ${cartIntent.productCode}`, 'OUT');
            await verCarrinho(from, whatsappPhoneId, customerId);
        } else {
            await enviarComFormatosCorretos(from, `❌ Não foi possível adicionar o produto *${cartIntent.productCode}* ao carrinho. Ele existe?`, whatsappPhoneId);
            await salvarMensagemNoSupabase(whatsappPhoneId, from, `Erro ao adicionar ${cartIntent.productCode}`, 'OUT');
        }
        return;
    }

    const { drugName, infoType } = parseUserMessageForDrugInfo(messageText);
    if (drugName && infoType) {
        const respostaBula = getMedicamentoInfo(drugName, infoType);
        await enviarComFormatosCorretos(from, respostaBula, whatsappPhoneId);
        await salvarMensagemNoSupabase(whatsappPhoneId, from, respostaBula, 'OUT');
        return;
    }

    const termoBusca = extrairTermoBusca(messageText);
    if (termoBusca) {
        await buscarEOferecerProdutos(from, whatsappPhoneId, termoBusca);
        return;
    }

    await enviarMenuInicial(from, whatsappPhoneId);
}

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
            await enviarComFormatosCorretos(from, `✅ Produto *${productCode}* adicionado ao carrinho.`, whatsappPhoneId);
            await salvarMensagemNoSupabase(whatsappPhoneId, from, `Adicionado ${productCode} (Interactive)`, 'OUT');
            await verCarrinho(from, whatsappPhoneId, customerId);
        } else {
            await enviarComFormatosCorretos(from, `❌ Não foi possível adicionar o produto *${productCode}* ao carrinho.`, whatsappPhoneId);
            await salvarMensagemNoSupabase(whatsappPhoneId, from, `Erro ao adicionar ${productCode} (Interactive)`, 'OUT');
        }
        return;
    }

    await enviarComFormatosCorretos(from, `Obrigado pelo seu clique! Não entendi essa ação. Digite *MENU*.`, whatsappPhoneId);
    await salvarMensagemNoSupabase(whatsappPhoneId, from, `Resposta padrão Interactive`, 'OUT');
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
    console.error('❌ Erro no webhook:', error);
    return new NextResponse('Internal Server Error but OK to Meta', { status: 200 });
  }
}

// =========================================================================
// FUNÇÃO PRINCIPAL: VISUALIZAR CARRINHO
// =========================================================================

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
    let resposta = `🛒 *SEU CARRINHO DE COMPRAS* (ID: ${orderId.substring(0, 8)})\\n\\n`;

    if (items.length === 0) {
        resposta += 'Seu carrinho está vazio! Comece a adicionar produtos digitando o nome ou o código (ex: "quero losartana" ou "adicionar 123456").';
    } else {
        resposta += '*Itens Atuais:*\\n';
        items.forEach(item => {
            const unitPrice = parseFloat(item.unit_price);
            const subtotal = item.quantity * unitPrice;
            totalGeral += subtotal;

            const precoUnitarioFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(unitPrice);
            const subtotalFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subtotal);

            resposta += `▪️ *${item.product_name}* (${item.product_api_id})\\n`;
            resposta += `   *Qtd:* ${item.quantity} x ${precoUnitarioFormatado} = ${subtotalFormatado}\\n`;
        });

        const totalFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalGeral);

        resposta += `\\n-------------------------------\\n`;
        resposta += `💰 *TOTAL GERAL: ${totalFormatado}*`;
        resposta += `\\n-------------------------------\\n\\n`;
        resposta += `*Para finalizar:* Digite 'FINALIZAR' para iniciar a confirmação de endereço e pagamento.\\n`;
        resposta += `*Para remover:* Digite 'REMOVER [CÓDIGO]' (ainda não implementado).`;
    }

    resposta += '\\n\\nOu *digite menu* para voltar ao Menu Principal.';

    await enviarComFormatosCorretos(from, resposta, whatsappPhoneId);
    await salvarMensagemNoSupabase(whatsappPhoneId, from, resposta, 'OUT');

    if (items.length > 0) {
        await updateOrderTotal(orderId, totalGeral);
    }
}