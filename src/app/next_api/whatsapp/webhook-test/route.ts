import { NextRequest, NextResponse } from 'next/server';

// GET - Para testar configurações e verificar números
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action') || 'info';
  
  console.log('🔧 [WEBHOOK TEST] Ação:', action);

  try {
    switch (action) {
      case 'verify-number':
        return await verifyPhoneNumber();
      case 'test-send':
        return await testSendMessage(request);
      case 'check-env':
        return await checkEnvironment();
      default:
        return await getTestInfo();
    }
  } catch (error) {
    console.error('❌ [WEBHOOK TEST] Erro:', error);
    return NextResponse.json(
      { error: 'Test failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// POST - Para testar envio de mensagens
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { to, message, action } = body;

    console.log('🧪 [WEBHOOK TEST POST]', { to, message, action });

    if (action === 'send-message') {
      return await sendTestMessage(to, message);
    }

    if (action === 'verify-webhook') {
      return await verifyWebhookConfiguration();
    }

    return NextResponse.json({ error: 'Ação não reconhecida' }, { status: 400 });

  } catch (error) {
    console.error('❌ [WEBHOOK TEST POST] Erro:', error);
    return NextResponse.json(
      { error: 'Test failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// Funções de teste
async function getTestInfo() {
  const envInfo = {
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || '❌ NÃO CONFIGURADO',
    WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN 
      ? `✅ CONFIGURADO (${process.env.WHATSAPP_ACCESS_TOKEN.length} caracteres)` 
      : '❌ NÃO CONFIGURADO',
    WHATSAPP_API_VERSION: process.env.WHATSAPP_API_VERSION || 'v22.0 (padrão)',
    NODE_ENV: process.env.NODE_ENV,
  };

  return NextResponse.json({
    message: '🔧 Webhook Test Endpoint',
    timestamp: new Date().toISOString(),
    environment: envInfo,
    endpoints: {
      'GET ?action=check-env': 'Verificar variáveis de ambiente',
      'GET ?action=verify-number': 'Verificar número do WhatsApp',
      'GET ?action=test-send&to=5511999999999': 'Testar envio para número específico',
      'POST {action: "send-message", to: "5511999999999", message: "Teste"}': 'Enviar mensagem de teste',
    }
  });
}

async function checkEnvironment() {
  const requiredVars = [
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_WEBHOOK_VERIFY_TOKEN'
  ];

  const envStatus = requiredVars.map(varName => ({
    variable: varName,
    configured: !!process.env[varName],
    value: process.env[varName] 
      ? `${process.env[varName]?.substring(0, 10)}... (${process.env[varName]?.length} chars)`
      : 'NÃO CONFIGURADO'
  }));

  return NextResponse.json({
    message: '🔍 Verificação de Ambiente',
    status: envStatus.every(v => v.configured) ? '✅ Tudo configurado' : '⚠️ Configuração incompleta',
    variables: envStatus,
    timestamp: new Date().toISOString()
  });
}

async function verifyPhoneNumber() {
  const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
  const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v22.0';

  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    return NextResponse.json(
      { error: 'Variáveis de ambiente não configuradas' },
      { status: 400 }
    );
  }

  try {
    const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}`;
    
    console.log('🔍 [VERIFY NUMBER] Verificando número:', url);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
      },
    });

    const data = await response.json();

    console.log('📊 [VERIFY NUMBER] Resposta:', data);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
    }

    return NextResponse.json({
      message: '✅ Informações do número obtidas',
      phoneNumberInfo: data,
      verificationStatus: 'SUCCESS'
    });

  } catch (error) {
    console.error('❌ [VERIFY NUMBER] Erro:', error);
    return NextResponse.json(
      { 
        error: 'Falha ao verificar número',
        details: error instanceof Error ? error.message : String(error),
        solution: 'Verifique se o Phone Number ID está correto e se o token de acesso tem permissões'
      },
      { status: 500 }
    );
  }
}

async function testSendMessage(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const to = searchParams.get('to') || '5511999999999'; // Número padrão para teste

  console.log('🧪 [TEST SEND] Testando envio para:', to);

  try {
    const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
    const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;
    const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v22.0';

    // Limpar e formatar número
    const cleanedTo = to.replace(/\D/g, '');
    let finalTo = cleanedTo;
    
    // Ajustar formato conforme necessário
    if (cleanedTo.startsWith('55') && cleanedTo.length === 13) {
      finalTo = cleanedTo.substring(2); // Remove 55 do início se for número brasileiro completo
    }

    console.log('🔢 [TEST SEND] Número formatado:', { original: to, final: finalTo });

    const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: finalTo,
      type: 'text',
      text: {
        preview_url: false,
        body: `🧪 Mensagem de teste - ${new Date().toLocaleString('pt-BR')}`,
      },
    };

    console.log('📤 [TEST SEND] Enviando payload:', JSON.stringify(payload, null, 2));

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

    console.log('📨 [TEST SEND] Resposta completa:', {
      status: response.status,
      statusText: response.statusText,
      body: responseData
    });

    if (!response.ok) {
      // Analisar erro específico do WhatsApp
      if (responseData.error?.code === 131030) {
        return NextResponse.json({
          status: 'ERROR',
          error: 'NUMBER_NOT_ALLOWED',
          message: 'Número não está na lista de permissões',
          details: responseData.error,
          solution: 'Adicione este número às permissões no WhatsApp Business API'
        }, { status: 400 });
      }

      throw new Error(`HTTP ${response.status}: ${JSON.stringify(responseData)}`);
    }

    return NextResponse.json({
      status: 'SUCCESS',
      message: 'Mensagem de teste enviada com sucesso',
      to: finalTo,
      response: responseData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [TEST SEND] Erro:', error);
    return NextResponse.json(
      { 
        status: 'ERROR',
        error: 'Falha no envio',
        details: error instanceof Error ? error.message : String(error),
        solution: 'Verifique: 1) Token de acesso 2) Phone Number ID 3) Número de destino 4) Permissões do número'
      },
      { status: 500 }
    );
  }
}

async function sendTestMessage(to: string, message: string) {
  // Reutiliza a lógica do testSendMessage
  const mockRequest = new NextRequest(`http://localhost?to=${encodeURIComponent(to)}`);
  return testSendMessage(mockRequest);
}

async function verifyWebhookConfiguration() {
  return NextResponse.json({
    message: '🔗 Verificação de Webhook',
    webhookUrl: `${process.env.VERCEL_URL || 'https://your-domain.vercel.app'}/next_api/whatsapp/webhook`,
    verifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN 
      ? `✅ CONFIGURADO (${process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN.length} chars)`
      : '❌ NÃO CONFIGURADO',
    setupSteps: [
      '1. Configure o webhook no Facebook Developer',
      '2. URL: https://your-domain.vercel.app/next_api/whatsapp/webhook',
      '3. Verify Token: Use o mesmo do WHATSAPP_WEBHOOK_VERIFY_TOKEN',
      '4. Subscribe to: messages, messaging_postbacks',
      '5. Adicione números às permissões no WhatsApp Business API'
    ],
    timestamp: new Date().toISOString()
  });
}
