import { NextRequest, NextResponse } from 'next/server';

console.log('🚨 [WEBHOOK] Arquivo carregado - Verificando variáveis:');
console.log('   PHONE_NUMBER_ID:', process.env.WHATSAPP_PHONE_NUMBER_ID);
console.log('   ACCESS_TOKEN:', process.env.WHATSAPP_ACCESS_TOKEN ? 'EXISTE' : 'NÃO EXISTE');

// GET handler - Verificação do Webhook
export async function GET(request: NextRequest) {
  console.log('🚨 [GET] Verificação do webhook');
  
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.log('🚨 [GET] Verificação OK');
    return new NextResponse(challenge, { status: 200 });
  }

  console.log('🚨 [GET] Verificação FALHOU');
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// POST handler - SUPER SIMPLES
export async function POST(request: NextRequest) {
  console.log('🚨 [POST] ===== INÍCIO =====');
  
  try {
    const body = await request.json();
    
    console.log('🚨 [POST] CORPO COMPLETO DA MENSAGEM:');
    console.log(JSON.stringify(body, null, 2));
    
    // Extrair informações básicas
    const messages = body.entry?.[0]?.changes?.[0]?.value?.messages;
    
    if (messages && messages.length > 0) {
      const message = messages[0];
      const from = message.from;
      const text = message.text?.body;
      
      console.log('🚨 [POST] DADOS EXTRAÍDOS:');
      console.log('   FROM:', from);
      console.log('   TEXT:', text);
      console.log('   FROM TYPE:', typeof from);
      console.log('   FROM LENGTH:', from?.length);
      
      // APENAS LOGAR, NÃO ENVIAR RESPOSTA
      console.log('🚨 [POST] Mensagem processada, mas NÃO enviando resposta');
    }
    
    console.log('🚨 [POST] Retornando OK');
    return NextResponse.json({ status: 'ok' }, { status: 200 });
    
  } catch (error) {
    console.error('🚨 [POST] ERRO:', error);
    return NextResponse.json({ error: 'error' }, { status: 500 });
  }
}
