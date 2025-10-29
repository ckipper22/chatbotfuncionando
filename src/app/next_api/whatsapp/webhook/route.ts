import { NextRequest, NextResponse } from 'next/server';
import { getGeminiService } from '@/lib/services/gemini-service';

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;
const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  console.log('🔔 Webhook verification request received:', { mode, token, challenge });

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('✅ Webhook verified successfully!');
    return new NextResponse(challenge, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'ngrok-skip-browser-warning': 'true',
      },
    });
  }

  console.log('❌ Webhook verification failed');
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('📩 Webhook POST received:', JSON.stringify(body, null, 2));

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) {
      console.log('ℹ️ No messages to process');
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    for (const message of messages) {
      await processMessage(message, value);
    }

    return NextResponse.json({ status: 'ok' }, {
      status: 200,
      headers: {
        'ngrok-skip-browser-warning': 'true',
      },
    });

  } catch (error) {
    console.error('❌ Webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function processMessage(message: any, value: any) {
  const messageType = message.type;
  const from = message.from;
  const messageId = message.id;

  console.log(`📨 Processing message from ${from}:`, {
    type: messageType,
    id: messageId,
  });

  if (messageType !== 'text') {
    console.log(`⚠️ Ignoring non-text message type: ${messageType}`);
    return;
  }

  const userMessage = message.text.body;
  console.log(`💬 User message: "${userMessage}"`);

  if (userMessage.toLowerCase() === '/limpar') {
    const geminiService = getGeminiService();
    geminiService.clearHistory(from);
    await sendWhatsAppMessage(from, '🗑️ Histórico de conversa limpo! Vamos começar uma nova conversa.');
    return;
  }

  if (userMessage.toLowerCase() === '/ajuda') {
    const helpMessage = `🤖 *Comandos disponíveis:*\n\n` +
      `• /limpar - Limpa o histórico da conversa\n` +
      `• /ajuda - Mostra esta mensagem\n\n` +
      `Envie qualquer mensagem para conversar comigo!`;
    await sendWhatsAppMessage(from, helpMessage);
    return;
  }

  try {
    const geminiService = getGeminiService();
    const aiResponse = await geminiService.generateResponse(userMessage, from);
    
    console.log(`🤖 AI Response: "${aiResponse}"`);
    
    await sendWhatsAppMessage(from, aiResponse);

  } catch (error) {
    console.error('❌ Error generating AI response:', error);
    await sendWhatsAppMessage(from, 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.');
  }
}

async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'text',
    text: {
      preview_url: false,
      body: text,
    },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Failed to send WhatsApp message:', error);
      throw new Error(error.error?.message || 'Failed to send message');
    }

    const result = await response.json();
    console.log('✅ Message sent successfully:', result);

  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error);
    throw error;
  }
}