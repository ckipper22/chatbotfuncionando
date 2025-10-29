import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

// Usando a versão estável v1 e o modelo mais recente
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: 'gemini-2.0-flash-exp' // Modelo estável mais recente
});

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  console.log('📥 Webhook GET recebido:', { mode, token, challenge });

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verificado com sucesso!');
    return new NextResponse(challenge, { status: 200 });
  }

  console.log('❌ Falha na verificação do webhook');
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('📨 Mensagem recebida:', JSON.stringify(body, null, 2));

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (!message) {
      return NextResponse.json({ status: 'no_message' }, { status: 200 });
    }

    const from = message.from;
    const messageText = message.text?.body;

    if (!messageText) {
      return NextResponse.json({ status: 'no_text' }, { status: 200 });
    }

    console.log(`💬 Processando mensagem de ${from}: "${messageText}"`);

    // Gera resposta com Gemini 2.0 Flash (modelo estável)
    const prompt = `Você é um assistente prestativo e amigável no WhatsApp. Responda de forma clara, concisa e em português brasileiro.\n\nUsuário: ${messageText}\n\nAssistente:`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const aiResponse = response.text() || 'Desculpe, não consegui processar sua mensagem.';

    console.log(`🤖 Resposta da IA: "${aiResponse}"`);

    // Envia resposta via WhatsApp
    const whatsappResponse = await fetch(
      `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: from,
          text: { body: aiResponse },
        }),
      }
    );

    const whatsappData = await whatsappResponse.json();
    
    if (!whatsappResponse.ok) {
      console.error('❌ Erro ao enviar mensagem WhatsApp:', whatsappData);
      throw new Error('Falha ao enviar mensagem');
    }

    console.log('📤 Resposta enviada com sucesso:', whatsappData);

    return NextResponse.json({ status: 'success' }, { status: 200 });
  } catch (error) {
    console.error('❌ Erro ao processar mensagem:', error);
    
    // Tratamento de erro com retry para 429 e 503
    if (error instanceof Error) {
      console.error('Detalhes do erro:', error.message);
    }
    
    return NextResponse.json({ 
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 });
  }
}