// src/app/api/whatsapp/webhook/route.ts
// ====================================================================================
// WEBHOOK CORRIGIDO - SEM BASE LOCAL, SÓ API
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

// Google CSE (Busca Personalizada) - para medicamentos quando Gemini bloqueado
const GOOGLE_CSE_KEY = 'AIzaSyCxXcv8JZTVbX2IMSHN-MLVrT5Qt5u7rp8';
const GOOGLE_CSE_CX  = '8529dabe7585542f5';

// Flags para verificar configurações disponíveis
const hasWhatsAppConfig = !!(WHATSAPP_VERIFY_TOKEN && WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID);
const hasSupabaseConfig = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
const hasFlaskConfig = !!(FLASK_API_URL);
const hasGeminiConfig = !!(GEMINI_API_KEY);

// Log de status das configurações
if (!hasWhatsAppConfig) {
  console.warn('⚠️ AVISO: Variáveis do WhatsApp não configuradas.');
}
if (!hasSupabaseConfig) {
  console.warn('⚠️ AVISO: Variáveis do Supabase não configuradas.');
}
if (!hasFlaskConfig) {
  console.warn('⚠️ AVISO: Variável FLASK_API_URL não configurada.');
}
if (!hasGeminiConfig) {
  console.warn('⚠️ AVISO: Variável GEMINI_API_KEY não configurada.');
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

  if (extrairTermoBusca(mensagem)) return false;
  if (/^[1-4]$/.test(texto)) return false;

  const comandosConhecidos = ['menu', 'finalizar', 'carrinho', 'atendente', 'ajuda', 'voltar'];
  if (comandosConhecidos.includes(texto)) return false;

  if (/^\d{6,}$/.test(texto)) return false;

  const termosMedicamento = ['posologia', 'efeito', 'contraindicacao', 'bula', 'dose', 'como usar'];
  if (termosMedicamento.some(termo => texto.includes(termo))) return false;

  if (texto.length < 3) return false;

  const palavrasComuns = ['oi', 'ola', 'ok', 'sim', 'nao', 'obrigado', 'obrigada'];
  if (palavrasComuns.includes(texto)) return false;

  return true;
}

// =========================================================================
// FUNÇÕES DE CACHE DE PRODUTOS
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
    console.log(`⚠️ Erro ao salvar produto no cache:`, error);
  }
}

async function getProductFromCache(productCode: string): Promise<{ name: string; price: number } | null> {
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
      throw new Error(`Status de busca de cliente: ${selectResponse.status}`);
    }

    let data = await selectResponse.json();

    if (data && data.length > 0) {
      return data[0].id;
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
      return data[0].id;
    }

    return null;

  } catch (error) {
    console.error('❌ Erro crítico no CRM:', error);
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
      throw new Error(`Status de busca de pedido: ${selectResponse.status}`);
    }

    let data = await selectResponse.json();

    if (data && data.length > 0) {
      return data[0].id;
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

    selectResponse = await fetch(selectUrl, { method: 'GET', headers });
    data = await selectResponse.json();

    if (data && data.length > 0) {
      return data[0].id;
    }

    return null;

  } catch (error) {
    console.error('❌ Erro crítico no Carrinho:', error);
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

async function addItemToCart(
  orderId: string,
  productCode: string,
  quantity: number,
  whatsappPhoneId: string
): Promise<boolean> {
  try {
    console.log(`🛒 Adicionando produto ${productCode} ao carrinho (ordem: ${orderId})`);

    let productName = `Produto ${productCode}
