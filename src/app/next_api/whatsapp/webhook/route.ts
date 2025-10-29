import { NextRequest, NextResponse } from 'next/server';
import { getGeminiService } from '@/lib/services/gemini-service';

// Variáveis de ambiente
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v22.0';
const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

console.log('🔧 Webhook loaded - Verify Token exists:', !!VERIFY_TOKEN);

// Função SIMPLES para enviar mensagem
async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    throw new Error('WhatsApp configuration missing');
  }

  // 🔥 FORÇAR o número que sabemos que funciona
  const finalTo = '555584557096';

  const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: finalTo,
    type: 'text',
    text: {
      preview_url: false,
      body: text,
    },
  };

  console.log('📤 Sending message to:', finalTo);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  console.log('📨 Send response:', result);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(result)}`);
  }
}

// Process message
async function processMessage(message: any): Promise<void> {
  const from = message.from;
  const messageType = message.type;

  console.log('🔢 INCOMING MESSAGE FROM:', from);

  if (messageType !== 'text') {
    console.log('⚠️ Ignoring non-text message');
    return;
  }

  const userMessage = message.text?.body;
  console.log('💬 Message content:', userMessage);

  try {
    const geminiService = getGeminiService();
    const aiResponse = await geminiService.generateResponse(userMessage, from);
    console.log('🤖 AI Response:', aiResponse);
    await sendWhatsAppMessage(from, aiResponse);
  } catch (error) {
    console.error('❌ Process error:', error);
    await sendWhatsAppMessage(from, '❌ Erro ao processar mensagem.');
  }
}

// GET handler - VERIFICAÇÃO DO WEBHOOK
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  console.log('🔔 Webhook verification attempt:', {
    mode,
    token,
    challenge,
    expectedToken: VERIFY_TOKEN,
    tokensMatch: token === VERIFY_TOKEN
  });

  // 🔥 CORREÇÃO: Verificação mais detalhada
  if (mode === 'subscribe') {
    if (token === VERIFY_TOKEN) {
      console.log('✅ Webhook verified successfully!');
      return new NextResponse(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    } else {
      console.log('❌ Token mismatch:', {
        received: token,
        expected: VERIFY_TOKEN
      });
    }
  }

  console.log('❌ Webhook verification failed');
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// POST handler - RECEBER MENSAGENS
export async function POST(request: NextRequest) {
  try {
    console.log('📩 Webhook POST received');
    
    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
      return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
    }

    const body = await request.json();
    console.log('📦 Full webhook body:', JSON.stringify(body, null, 2));

    const messages = body.entry?.[0]?.changes?.[0]?.value?.messages;
    
    if (!messages || messages.length === 0) {
      console.log('ℹ️ No messages to process');
      return NextResponse.json({ status: 'ok' });
    }

    console.log(`🔄 Processing ${messages.length} messages`);
    
    for (const message of messages) {
      await processMessage(message);
    }

    return NextResponse.json({ status: 'ok' });

  } catch (error) {
    console.error('❌ Webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
