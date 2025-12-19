import { NextRequest, NextResponse } from 'next/server';

// =========================================================================
// CONFIGURAÇÃO (VERCEL)
// =========================================================================
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const GOOGLE_SEARCH_CX = process.env.GOOGLE_SEARCH_CX;

// =========================================================================
// 1. FUNÇÕES DE SUPORTE (MULTITENANT & HISTÓRICO)
// =========================================================================

async function findFarmacyAPI(whatsappPhoneId: string) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/client_connections?whatsapp_phone_id=eq.${whatsappPhoneId}&select=api_base_url,client_id`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'apikey': SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    const data = await response.json();
    return data?.[0] || null;
  } catch (e) {
    console.error("Erro ao buscar Multitenant:", e);
    return null;
  }
}

async function salvarHistorico(phoneId: string, from: string, body: string, direction: 'IN' | 'OUT') {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages`, {
      method: 'POST',
      headers: { 
        'apikey': SUPABASE_ANON_KEY!, 
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal' 
      },
      body: JSON.stringify({
        whatsapp_phone_id: phoneId,
        from_number: from,
        message_body: body,
        direction: direction
      })
    });
  } catch (e) {
    console.error("Erro ao salvar histórico:", e);
  }
}

// =========================================================================
// 2. BUSCA DE BULAS (LOGICA DA SUA MASTER)
// =========================================================================

async function buscarBulaGoogle(texto: string): Promise<string> {
  const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_API_KEY}&cx=${GOOGLE_SEARCH_CX}&q=${encodeURIComponent(texto)}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.items?.[0]) {
      return `💊 *Informação encontrada:* \n\n${data.items[0].snippet}\n\n🔗 *Link:* ${data.items[0].link}`;
    }
    return "Não encontrei informações específicas sobre isso.";
  } catch (e) {
    return "Erro ao acessar base de conhecimentos.";
  }
}

// =========================================================================
// 3. LOGICA DO CARRINHO (RESTAURADA)
// =========================================================================
// Aqui você deve manter as funções addItemToCart, getOrCreateCustomer, etc.
// que estavam funcionando nos outros arquivos.

// =========================================================================
// 4. PROCESSAMENTO PRINCIPAL (WEBHOOK)
// =========================================================================

async function processarMensagemCompleta(from: string, texto: string, phoneId: string) {
  console.log(`Recebido de ${from}: ${texto}`);
  
  // Salva entrada
  await salvarHistorico(phoneId, from, texto, 'IN');

  // Identifica Farmácia
  const farmacia = await findFarmacyAPI(phoneId);
  
  let resposta = "";
  const msgLower = texto.toLowerCase();

  // PRIORIDADE 1: Carrinho e Compras
  if (msgLower.includes('carrinho') || msgLower.includes('comprar') || /^[a-z0-9]{4,8}$/.test(msgLower)) {
    // Chame sua lógica de carrinho aqui
    resposta = "Processando seu pedido... (Integração com Carrinho)";
  } 
  // PRIORIDADE 2: Bula (Sua Master Original)
  else if (msgLower.includes('bula') || msgLower.includes('serve') || msgLower.includes('posologia')) {
    resposta = await buscarBulaGoogle(texto);
  }
  // PRIORIDADE 3: Saudação ou Fallback (Sua Master Original)
  else {
    resposta = "Olá! Como posso ajudar hoje? Você pode pedir uma *bula*, buscar um *produto* ou consultar seu *carrinho*.";
  }

  // Envia e Salva Saída
  await enviarWhatsApp(from, resposta, phoneId);
  await salvarHistorico(phoneId, from, resposta, 'OUT');
}

// =========================================================================
// HANDLERS E ENVIO
// =========================================================================

async function enviarWhatsApp(to: string, message: string, phoneId: string) {
  try {
    await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: message } })
    });
  } catch (e) {
    console.error("Erro ao enviar WhatsApp:", e);
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  if (searchParams.get('hub.mode') === 'subscribe' && searchParams.get('hub.verify_token') === WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
  }
  return new NextResponse('Erro token', { status: 403 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];
    const metadata = changes?.value?.metadata;

    if (message?.text?.body && metadata?.phone_number_id) {
      // Importante: Passamos o ID dinâmico do telefone para o Multitenant funcionar
      await processarMensagemCompleta(message.from, message.text.body, metadata.phone_number_id);
    }
    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error("Erro no Webhook:", error);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}
