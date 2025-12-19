import { NextRequest, NextResponse } from 'next/server';

// =========================================================================
// CONFIGURAÇÃO E VARIÁVEIS DE AMBIENTE (VERCEL)
// =========================================================================
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const GOOGLE_SEARCH_CX = process.env.GOOGLE_SEARCH_CX;

// =========================================================================
// 1. MULTITENANT & HISTÓRICO (SUPABASE)
// =========================================================================

// Busca a URL da API da farmácia dinamicamente [cite: 501, 502, 503]
async function findFarmacyAPI(whatsappPhoneId: string) {
  const url = `${SUPABASE_URL}/rest/v1/client_connections?whatsapp_phone_id=eq.${whatsappPhoneId}&select=api_base_url,client_id`;
  const headers = { 'apikey': SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` };
  const response = await fetch(url, { method: 'GET', headers });
  const data = await response.json();
  return data?.[0] || null;
}

// Salva o histórico de mensagens (Entrada e Saída) [cite: 491, 492, 493, 494]
async function salvarHistorico(whatsappPhoneId: string, from: string, body: string, direction: 'IN' | 'OUT') {
  const url = `${SUPABASE_URL}/rest/v1/whatsapp_messages`;
  const payload = { whatsapp_phone_id: whatsappPhoneId, from_number: from, message_body: body, direction: direction };
  await fetch(url, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

// =========================================================================
// 2. BUSCA DE BULAS (GOOGLE SEARCH - CONFORME SUA MASTER)
// =========================================================================

async function buscarBulaGoogle(medicamento: string): Promise<string> {
  const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_API_KEY}&cx=${GOOGLE_SEARCH_CX}&q=${encodeURIComponent('bula ' + medicamento)}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.items?.[0]) {
      return `💊 *Informação encontrada:* \n\n${data.items[0].snippet}\n\n🔗 *Fonte:* ${data.items[0].link}`;
    }
    return `Não encontrei informações oficiais para "${medicamento}".`;
  } catch (error) {
    return "Erro ao consultar o Google Search.";
  }
}

// =========================================================================
// 3. GESTÃO DE CARRINHO (SUPABASE)
// =========================================================================

async function handleCarrinho(from: string, texto: string, farmacia: any) {
  // Lógica de getOrCreateCustomer e addItemToCart conforme sua versão funcional [cite: 436, 448, 471]
  // ... (Funções internas de carrinho omitidas para brevidade, mas devem ser incluídas aqui)
}

// =========================================================================
// 4. FLUXO PRINCIPAL (WEBHOOK)
// =========================================================================

async function processarMensagemCompleta(from: string, texto: string, phoneId: string) {
  const msgLower = texto.toLowerCase();

  // Salva mensagem de entrada no histórico 
  await salvarHistorico(phoneId, from, texto, 'IN');

  // Identifica a farmácia (Multitenant) 
  const farmacia = await findFarmacyAPI(phoneId);
  if (!farmacia) return;

  let resposta = "";

  // DECISÃO DE FLUXO
  if (msgLower.includes('comprar') || msgLower.includes('carrinho')) {
    // Fluxo de Carrinho [cite: 406]
    await handleCarrinho(from, texto, farmacia);
    return;
  } else if (msgLower.includes('bula') || msgLower.includes('para que serve')) {
    // Fluxo de Bulário (SUA MASTER)
    resposta = await buscarBulaGoogle(texto);
  } else {
    // Busca de produtos via API da Farmácia (Multitenant) [cite: 565]
    resposta = "Buscando produtos em nosso estoque..."; 
    // Aqui entra sua função buscarEOferecerProdutos(from, farmacia.api_base_url, texto)
  }

  // Envia resposta e salva no histórico [cite: 499]
  await enviarWhatsApp(from, resposta);
  await salvarHistorico(phoneId, from, resposta, 'OUT');
}

// Handlers do Next.js (GET/POST) [cite: 394]
export async function POST(req: NextRequest) {
  const body = await req.json();
  const msg = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const phoneId = body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

  if (msg?.type === 'text') {
    await processarMensagemCompleta(msg.from, msg.text.body, phoneId);
  }
  return NextResponse.json({ status: 'ok' });
}

async function enviarWhatsApp(to: string, message: string) {
  // Função de envio padrão utilizando WHATSAPP_ACCESS_TOKEN [cite: 524]
}
