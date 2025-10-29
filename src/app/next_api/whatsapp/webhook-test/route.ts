import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { to, message, action } = body;

    console.log('🧪 [WEBHOOK TEST] Recebido:', { to, message, action });

    switch (action) {
      case 'send-template':
        return await sendTemplateMessage(to);
      case 'send-message':
        return await sendTextMessage(to, message);
      case 'check-account-status':
        return await checkAccountStatus();
      default:
        return NextResponse.json({ 
          error: 'Ação não reconhecida',
          available_actions: [
            'send-template', 
            'send-message', 
            'check-account-status'
          ]
        }, { status: 400 });
    }

  } catch (error) {
    console.error('❌ [WEBHOOK TEST] Erro:', error);
    return NextResponse.json(
      { 
        error: 'Test failed', 
        details: error instanceof Error ? error.message : String(error),
        solution: 'Configure o pagamento no Meta Business para enviar mensagens de texto'
      },
      { status: 500 }
    );
  }
}

// 🟢 FUNCIONA SEM PAGAMENTO - Template
async function sendTemplateMessage(to: string) {
  const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;
  const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v22.0';

  const cleanedTo = to.replace(/\D/g, '');
  
  const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanedTo,
    type: 'template',
    template: {
      name: 'hello_world',
      language: { code: 'en_US' }
    }
  };

  console.log('📤 [TEMPLATE] Enviando para:', cleanedTo);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  let responseData;
  
  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = { raw: responseText };
  }

  if (!response.ok) {
    return NextResponse.json({
      status: 'TEMPLATE_ERROR',
      error: 'Falha no template',
      details: responseData,
      solution: 'Verifique se o template "hello_world" está aprovado'
    }, { status: 400 });
  }

  return NextResponse.json({
    status: 'SUCCESS',
    message: '✅ Template enviado com sucesso!',
    type: 'TEMPLATE',
    to: cleanedTo,
    response: responseData
  });
}

// 🔴 PRECISA DE PAGAMENTO - Texto Normal
async function sendTextMessage(to: string, message: string) {
  const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;
  const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v22.0';

  const cleanedTo = to.replace(/\D/g, '');
  
  const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanedTo,
    type: 'text',
    text: {
      preview_url: false,
      body: message.substring(0, 4096),
    },
  };

  console.log('📤 [TEXT] Tentando enviar para:', cleanedTo);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  let responseData;
  
  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = { raw: responseText };
  }

  if (!response.ok) {
    return NextResponse.json({
      status: 'PAYMENT_REQUIRED',
      error: 'Pagamento não configurado',
      details: responseData,
      solution: 'Adicione forma de pagamento no Meta Business: Configuração da API → Adicionar forma de pagamento'
    }, { status: 400 });
  }

  return NextResponse.json({
    status: 'SUCCESS',
    message: '✅ Mensagem de texto enviada!',
    type: 'TEXT', 
    to: cleanedTo,
    response: responseData
  });
}

async function checkAccountStatus() {
  return NextResponse.json({
    status: 'ANALYSIS',
    message: 'Configuração de pagamento pendente',
    steps: [
      '1. Acesse: WhatsApp Manager → Configuração da API',
      '2. Clique em: "Adicionar forma de pagamento"', 
      '3. Configure cartão de crédito',
      '4. Após ativação, mensagens de texto funcionarão'
    ],
    current_limitation: 'Apenas templates funcionam sem pagamento',
    timestamp: new Date().toISOString()
  });
}
