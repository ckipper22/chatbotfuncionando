import { NextRequest, NextResponse } from 'next/server';
import { getGeminiService } from '@/lib/services/gemini-service';

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;
const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v22.0';

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
      },
    });
  }

  console.log('❌ Webhook verification failed');
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function POST(request: NextRequest) {
  try {
    console.log('📩 Webhook POST received');
    
    // Verificação das variáveis de ambiente
    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
      console.error('❌ Missing environment variables');
      return NextResponse.json(
        { error: 'Configuration error' }, 
        { status: 500 }
      );
    }

    const body = await request.json();
    console.log('📦 Raw webhook body:', JSON.stringify(body, null, 2));

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    console.log('🔍 Parsed webhook data:', {
      hasEntry: !!entry,
      hasChanges: !!changes,
      hasValue: !!value,
      hasMessages: !!messages,
      messageCount: messages?.length || 0
    });

    if (!messages || messages.length === 0) {
      console.log('ℹ️ No messages to process');
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    console.log(`🔄 Processing ${messages.length} message(s)`);

    for (const message of messages) {
      await processMessage(message, value);
    }

    return NextResponse.json({ status: 'ok' }, { status: 200 });

  } catch (error) {
    console.error('❌ Webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}

async function processMessage(message: any, value: any) {
  try {
    const messageType = message.type;
    const from = message.from;
    const messageId = message.id;

    console.log(`📨 Processing message:`, {
      from,
      type: messageType,
      id: messageId,
      timestamp: message.timestamp
    });

    // Aceitar apenas mensagens de texto por enquanto
    if (messageType !== 'text') {
      console.log(`⚠️ Unsupported message type: ${messageType}`);
      await sendWhatsAppMessage(
        from, 
        `⚠️ No momento só consigo processar mensagens de texto. Tipo recebido: ${messageType}`
      );
      return;
    }

    const userMessage = message.text?.body;
    if (!userMessage) {
      console.log('❌ No text body in message');
      return;
    }

    console.log(`💬 User message: "${userMessage}"`);

    // Comandos especiais
    const lowerMessage = userMessage.toLowerCase();
    if (lowerMessage === '/limpar' || lowerMessage === 'limpar') {
      const geminiService = getGeminiService();
      geminiService.clearHistory(from);
      await sendWhatsAppMessage(from, '🗑️ Histórico de conversa limpo! Vamos começar uma nova conversa.');
      return;
    }

    if (lowerMessage === '/ajuda' || lowerMessage === 'ajuda') {
      const helpMessage = `🤖 *Comandos disponíveis:*\n\n` +
        `• /limpar - Limpa o histórico da conversa\n` +
        `• /ajuda - Mostra esta mensagem\n\n` +
        `Envie qualquer mensagem para conversar comigo!`;
      await sendWhatsAppMessage(from, helpMessage);
      return;
    }

    // Processar com IA
    console.log(`🤖 Generating AI response for message...`);
    const geminiService = getGeminiService();
    const aiResponse = await geminiService.generateResponse(userMessage, from);
    
    console.log(`🤖 AI Response: "${aiResponse}"`);
    
    await sendWhatsAppMessage(from, aiResponse);

  } catch (error) {
    console.error('❌ Error processing message:', error);
    await sendWhatsAppMessage(
      from, 
      '❌ Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente em alguns instantes.'
    );
  }
}

async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  const cleanedTo = to.replace(/\D/g, '');
  const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

  console.log('🔧 WhatsApp API Request Details:', {
    to: cleanedTo,
    phoneNumberId: PHONE_NUMBER_ID,
    apiVersion: API_VERSION,
    tokenPreview: ACCESS_TOKEN ? `${ACCESS_TOKEN.substring(0, 15)}...` : 'NO_TOKEN',
    messageLength: text.length
  });

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanedTo,
    type: 'text',
    text: {
      preview_url: false,
      body: text.substring(0, 4096), // Limite do WhatsApp
    },
  };

  try {
    console.log('📝 Final payload being sent:', JSON.stringify(payload, null, 2));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'WhatsApp-Bot/1.0'
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    console.log('📨 WhatsApp API Response:', {
      status: response.status,
      statusText: response.statusText,
      body: responseText
    });

    if (!response.ok) {
      // Log mais detalhado do erro
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData = JSON.parse(responseText);
        errorMessage += ` - ${JSON.stringify(errorData)}`;
        
        // Erros comuns do WhatsApp
        if (errorData.error?.code === 100) {
          errorMessage += ' (Invalid parameter)';
        } else if (errorData.error?.code === 131021) {
          errorMessage += ' (Recipient phone number not valid)';
        } else if (errorData.error?.code === 132000) {
          errorMessage += ' (Message too long)';
        }
      } catch (e) {
        errorMessage += ` - ${responseText}`;
      }
      
      throw new Error(errorMessage);
    }

    console.log('✅ Message sent successfully');

  } catch (error) {
    console.error('❌ Critical error sending WhatsApp message:', error);
    throw error;
  }
}
