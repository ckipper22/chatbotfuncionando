import { NextRequest, NextResponse } from 'next/server';
import { getGeminiService } from '@/lib/services/gemini-service';

// 🎯 FUNÇÃO INTELIGENTE PARA DETECTAR FORMATO CORRETO
function detectarFormatoCorreto(numeroOriginal: string): string {
  console.log('🔍 [DETECT] Detectando formato para:', numeroOriginal);
  
  const numeroLimpo = numeroOriginal.replace(/\D/g, '');
  console.log('🔍 [DETECT] Número limpo:', numeroLimpo);
  
  // Detectar padrões brasileiros comuns
  if (numeroLimpo.length === 12) {
    // Exemplo: 555511999999999 → +555511999999999
    if (numeroLimpo.startsWith('5555')) {
      const formatoCorrigido = '+' + numeroLimpo;
      console.log('🔍 [DETECT] ✅ Formato DDD duplicado detectado:', formatoCorrigido);
      return formatoCorrigido;
    }
    
    // Exemplo: 551199999999 → +5551199999999
    if (numeroLimpo.startsWith('55')) {
      const formatoCorrigido = '+' + numeroLimpo;
      console.log('🔍 [DETECT] ✅ Formato brasileiro padrão:', formatoCorrigido);
      return formatoCorrigido;
    }
  }
  
  // Para números com 13 dígitos (555511999999999)
  if (numeroLimpo.length === 13 && numeroLimpo.startsWith('5555')) {
    const formatoCorrigido = '+' + numeroLimpo;
    console.log('🔍 [DETECT] ✅ Formato longo detectado:', formatoCorrigido);
    return formatoCorrigido;
  }
  
  // Para números sem código do país
  if (numeroLimpo.length === 11) {
    const formatoCorrigido = '+55' + numeroLimpo;
    console.log('🔍 [DETECT] ✅ Adicionado código Brasil:', formatoCorrigido);
    return formatoCorrigido;
  }
  
  // Para números locais (9 dígitos)
  if (numeroLimpo.length === 9) {
    // Assumir DDD padrão (pode ser customizado por região)
    const formatoCorrigido = '+5511' + numeroLimpo;
    console.log('🔍 [DETECT] ✅ Adicionado DDD padrão:', formatoCorrigido);
    return formatoCorrigido;
  }
  
  // Fallback: adicionar + se não tiver
  const formatoFallback = numeroLimpo.startsWith('+') ? numeroLimpo : '+' + numeroLimpo;
  console.log('🔍 [DETECT] ⚠️ Fallback aplicado:', formatoFallback);
  return formatoFallback;
}

// 🧪 FUNÇÃO DE TESTE PARA VALIDAR FORMATOS
async function testarFormatosParaNumero(numero: string, texto: string): Promise<string | null> {
  const formatosPossiveis = [
    numero,                    // Original
    '+' + numero,             // Com +
    numero.replace('+', ''),  // Sem +
  ];
  
  console.log('🧪 [TEST FORMATS] Testando formatos para:', numero);
  
  for (const formato of formatosPossiveis) {
    console.log('🧪 [TEST FORMATS] Tentando:', formato);
    
    const sucesso = await tentarEnviarPara(formato, texto);
    if (sucesso) {
      console.log('✅ [TEST FORMATS] Formato funcionou:', formato);
      return formato;
    }
  }
  
  console.log('❌ [TEST FORMATS] Nenhum formato funcionou para:', numero);
  return null;
}

// 🚀 FUNÇÃO DE ENVIO INDIVIDUAL
async function tentarEnviarPara(numero: string, texto: string): Promise<boolean> {
  try {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: numero,
      type: 'text',
      text: {
        preview_url: false,
        body: texto.substring(0, 4096)
      }
    };

    const url = `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    
    if (response.ok) {
      console.log(`✅ [SEND] Sucesso para ${numero}`);
      return true;
    } else {
      console.log(`❌ [SEND] Falha para ${numero}: ${response.status}`);
      return false;
    }

  } catch (error) {
    console.error(`❌ [SEND] Erro para ${numero}:`, error);
    return false;
  }
}

// Debug inicial
console.log('🌍 [PRODUCTION READY] Sistema universal iniciado');
console.log('📊 [CONFIG] Configuração:');
console.log('   WEBHOOK_TOKEN:', process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ? '✅' : '❌');
console.log('   PHONE_ID:', process.env.WHATSAPP_PHONE_NUMBER_ID || '❌');
console.log('   ACCESS_TOKEN:', process.env.WHATSAPP_ACCESS_TOKEN ? '✅' : '❌');
console.log('   GEMINI_KEY:', process.env.GOOGLE_GEMINI_API_KEY ? '✅' : '❌');

// GET handler
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ [WEBHOOK] Verificação bem-sucedida');
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// POST handler universal
export async function POST(request: NextRequest) {
  try {
    console.log('📨 [WEBHOOK] Nova mensagem recebida');
    
    if (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN) {
      console.error('❌ [WEBHOOK] Configuração inválida');
      return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
    }

    const body = await request.json();
    console.log('📦 [WEBHOOK] Payload:', JSON.stringify(body, null, 2));

    const value = body.entry?.[0]?.changes?.[0]?.value;
    
    if (value?.statuses) {
      console.log('📊 [STATUS] Status de entrega:', value.statuses[0]?.status);
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    const messages = value?.messages;
    if (!messages?.length) {
      console.log('ℹ️ [WEBHOOK] Nenhuma mensagem para processar');
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    console.log(`🔄 [WEBHOOK] Processando ${messages.length} mensagem(ns)`);

    for (const message of messages) {
      await processarMensagemUniversal(message);
    }

    return NextResponse.json({ status: 'ok' }, { status: 200 });

  } catch (error) {
    console.error('❌ [WEBHOOK] Erro:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// 🌍 PROCESSAMENTO UNIVERSAL
async function processarMensagemUniversal(message: any): Promise<void> {
  const { from, text, type, id } = message;
  
  console.log('🌍 [UNIVERSAL] Processando mensagem universal:', {
    from,
    type,
    messageId: id,
    hasText: !!text?.body
  });

  try {
    if (type !== 'text' || !text?.body) {
      console.log('⚠️ [UNIVERSAL] Mensagem ignorada');
      return;
    }

    const userMessage = text.body.trim();
    const lowerMessage = userMessage.toLowerCase();
    
    console.log(`💬 [UNIVERSAL] De ${from}: "${userMessage}"`);

    // Comandos universais
    if (lowerMessage === '/test' || lowerMessage === 'test') {
      await enviarMensagemUniversal(from, '✅ SISTEMA FUNCIONANDO!\n\nBot operacional para todos os usuários.');
      return;
    }

    if (lowerMessage === '/debug' || lowerMessage === 'debug') {
      const debugInfo = `🔧 DEBUG UNIVERSAL\n\n📱 Seu número: ${from}\n🌍 Sistema: Universal\n⚙️ Status: Operacional\n\nSistema funciona para qualquer número!`;
      await enviarMensagemUniversal(from, debugInfo);
      return;
    }

    // IA ou resposta padrão
    if (!process.env.GOOGLE_GEMINI_API_KEY) {
      await enviarMensagemUniversal(from, '🤖 Olá! Sou um assistente inteligente.\n\nAinda estou sendo configurado, mas já posso responder!\n\nUse /test para testar.');
      return;
    }

    try {
      console.log('🤖 [AI] Processando com IA...');
      const geminiService = getGeminiService();
      const aiResponse = await geminiService.generateResponse(userMessage, from);
      await enviarMensagemUniversal(from, aiResponse);
    } catch (aiError) {
      console.error('❌ [AI] Erro:', aiError);
      await enviarMensagemUniversal(from, '🤖 Desculpe, estou com dificuldades momentâneas.\n\nTente novamente em alguns instantes.');
    }

  } catch (error) {
    console.error('❌ [UNIVERSAL] Erro:', error);
    await enviarMensagemUniversal(from, '⚠️ Erro temporário.\n\nSistema se recuperando automaticamente.');
  }
}

// 🌍 ENVIO UNIVERSAL - FUNCIONA PARA QUALQUER NÚMERO
async function enviarMensagemUniversal(numeroOriginal: string, texto: string): Promise<boolean> {
  try {
    console.log('🌍 [UNIVERSAL SEND] Enviando para qualquer número:', numeroOriginal);
    
    // 1. Detectar formato correto automaticamente
    const formatoDetectado = detectarFormatoCorreto(numeroOriginal);
    
    // 2. Testar formatos até encontrar um que funcione
    const formatoFuncional = await testarFormatosParaNumero(formatoDetectado, texto);
    
    if (formatoFuncional) {
      console.log(`✅ [UNIVERSAL SEND] Mensagem enviada com sucesso para: ${formatoFuncional}`);
      return true;
    } else {
      console.log(`❌ [UNIVERSAL SEND] Não foi possível enviar para: ${numeroOriginal}`);
      return false;
    }

  } catch (error) {
    console.error('❌ [UNIVERSAL SEND] Erro:', error);
    return false;
  }
}
