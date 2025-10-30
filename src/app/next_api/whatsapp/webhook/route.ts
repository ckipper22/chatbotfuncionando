import { NextRequest, NextResponse } from 'next/server';
import { getGeminiService } from '@/lib/services/gemini-service';

// Debug inicial das variáveis
console.log('🔧 [WEBHOOK] Iniciando - Verificando variáveis de ambiente:');
console.log('   WHATSAPP_WEBHOOK_VERIFY_TOKEN:', process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ? `✅ (${process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN.length} chars)` : '❌ NÃO ENCONTRADO');
console.log('   WHATSAPP_PHONE_NUMBER_ID:', process.env.WHATSAPP_PHONE_NUMBER_ID || '❌ NÃO ENCONTRADO');
console.log('   WHATSAPP_ACCESS_TOKEN:', process.env.WHATSAPP_ACCESS_TOKEN ? `✅ (${process.env.WHATSAPP_ACCESS_TOKEN.length} chars)` : '❌ NÃO ENCONTRADO');

// GET handler - Verificação do Webhook pelo Facebook
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  console.log('🎯 [WEBHOOK VERIFICATION]');
  console.log('   Mode:', mode);
  console.log('   Token Recebido:', token);
  console.log('   Token Esperado:', process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN);
  console.log('   São Iguais?:', token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN);
  console.log('   Challenge:', challenge);

  // Verificação do webhook
  if (mode === 'subscribe') {
    if (token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
      console.log('🎉 [WEBHOOK] VERIFICAÇÃO BEM-SUCEDIDA!');
      return new NextResponse(challenge, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-cache'
        },
      });
    } else {
      console.log('💥 [WEBHOOK] FALHA - Tokens não coincidem!');
      console.log('   Detalhes:', {
        tokenRecebido: token,
        tokenEsperado: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
        tipoRecebido: typeof token,
        tipoEsperado: typeof process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
      });
    }
  }

  console.log('❌ [WEBHOOK] Verificação falhou');
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// POST handler - Receber mensagens do WhatsApp
export async function POST(request: NextRequest) {
  try {
    console.log('📩 [WEBHOOK] Nova mensagem POST recebida');
    
    // Verificar variáveis essenciais
    if (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN) {
      console.error('❌ [WEBHOOK] Variáveis de ambiente faltando');
      return NextResponse.json(
        { error: 'Configuration error' }, 
        { status: 500 }
      );
    }

    const body = await request.json();
    console.log('📦 [WEBHOOK] Corpo completo da mensagem:');
    console.log(JSON.stringify(body, null, 2));

    // Processar a estrutura do webhook
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    console.log('🔍 [WEBHOOK] Estrutura analisada:', {
      hasEntry: !!entry,
      hasChanges: !!changes,
      hasValue: !!value,
      hasMessages: !!messages,
      messageCount: messages?.length || 0
    });

    if (!messages || messages.length === 0) {
      console.log('ℹ️ [WEBHOOK] Nenhuma mensagem para processar');
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    console.log(`🔄 [WEBHOOK] Processando ${messages.length} mensagem(ns)`);

    // Processar cada mensagem
    for (const message of messages) {
      await processMessage(message);
    }

    return NextResponse.json({ status: 'ok' }, { status: 200 });

  } catch (error) {
    console.error('❌ [WEBHOOK] Erro geral:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}

// Função para processar mensagens individuais
async function processMessage(message: any): Promise<void> {
  const messageType = message.type;
  const from = message.from;
  const messageId = message.id;

  console.log('📨 [PROCESS MESSAGE] Nova mensagem:', {
    from,
    type: messageType,
    id: messageId,
    timestamp: message.timestamp
  });

  // 🔍 DEBUG AVANÇADO: Vamos ver EXATAMENTE o que está chegando
  console.log('🔍 [DEBUG CRÍTICO] Número do remetente:', {
    valor: from,
    tipo: typeof from,
    length: from?.length,
    caracteres: from ? from.split('').map((c: string) => `'${c}'`).join(', ') : 'N/A',
    isString: typeof from === 'string',
    isEmpty: !from || from.length === 0
  });

  try {
    // Processar apenas mensagens de texto por enquanto
    if (messageType !== 'text') {
      console.log(`⚠️ [PROCESS MESSAGE] Ignorando tipo não suportado: ${messageType}`);
      return;
    }

    const userMessage = message.text?.body;
    if (!userMessage) {
      console.log('❌ [PROCESS MESSAGE] Mensagem sem texto');
      return;
    }

    console.log(`💬 [PROCESS MESSAGE] Texto recebido: "${userMessage}"`);

    // Comandos especiais
    const lowerMessage = userMessage.toLowerCase().trim();
    if (lowerMessage === '/limpar' || lowerMessage === 'limpar') {
      console.log('🗑️ [PROCESS MESSAGE] Comando: Limpar histórico');
      const geminiService = getGeminiService();
      geminiService.clearHistory(from);
      await sendWhatsAppMessage(from, '🗑️ Histórico de conversa limpo! Vamos começar uma nova conversa.');
      return;
    }

    if (lowerMessage === '/ajuda' || lowerMessage === 'ajuda') {
      console.log('❓ [PROCESS MESSAGE] Comando: Ajuda');
      const helpMessage = `🤖 *Comandos disponíveis:*\n\n` +
        `• /limpar - Limpa o histórico da conversa\n` +
        `• /ajuda - Mostra esta mensagem\n\n` +
        `Envie qualquer mensagem para conversar comigo!`;
      await sendWhatsAppMessage(from, helpMessage);
      return;
    }

    // 🔍 DEBUG: Comando especial para ver informações
    if (lowerMessage === '/debug' || lowerMessage === 'debug') {
      console.log('🔧 [PROCESS MESSAGE] Comando: Debug');
      const debugMessage = `🔧 *Informações de Debug:*\n\n` +
        `• Seu número: ${from}\n` +
        `• Tipo: ${typeof from}\n` +
        `• Tamanho: ${from?.length}\n` +
        `• Timestamp: ${message.timestamp}`;
      await sendWhatsAppMessage(from, debugMessage);
      return;
    }

    // Processar com IA
    console.log('🤖 [PROCESS MESSAGE] Gerando resposta com IA...');
    const geminiService = getGeminiService();
    const aiResponse = await geminiService.generateResponse(userMessage, from);
    
    console.log(`🤖 [PROCESS MESSAGE] Resposta da IA: "${aiResponse}"`);
    
    await sendWhatsAppMessage(from, aiResponse);

  } catch (error) {
    console.error('❌ [PROCESS MESSAGE] Erro:', error);
    // Adicionado o 'from' para garantir que o remetente seja notificado do erro
    if (from) {
        await sendWhatsAppMessage(
            from, 
            '❌ Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente em alguns instantes.'
        );
    }
  }
}

// Função para enviar mensagens via WhatsApp
async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;
  const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v22.0';

  console.log('�� [SEND MESSAGE] Preparando envio:', {
    para: to,
    phoneNumberId: PHONE_NUMBER_ID,
    textoLength: text.length
  });

  // 🔍 DEBUG CRÍTICO: Vamos ver EXATAMENTE o que está chegando
  console.log('🔍 [DEBUG CRÍTICO] Número original recebido:', {
    valor: to,
    tipo: typeof to,
    length: to?.length,
    caracteres: to ? to.split('').map((c: string) => `'${c}' (${c.charCodeAt(0)})`).join(', ') : 'N/A',
    startsWithPlus: to?.startsWith('+'),
    startsWithFive: to?.startsWith('5'),
    includesPlus: to?.includes('+')
  });

  // ✅ MÚLTIPLAS TENTATIVAS: Vamos testar diferentes formatos
  const formatosTeste = [];
  
  // Formato 1: Original
  formatosTeste.push({
    nome: 'Original',
    numero: to
  });
  
  // Formato 2: Só números
  const apenasNumeros = to.replace(/\D/g, '');
  formatosTeste.push({
    nome: 'Apenas números',
    numero: apenasNumeros
  });
  
  // Formato 3: + números
  formatosTeste.push({
    nome: '+ números',
    numero: '+' + apenasNumeros
  });
  
  // Formato 4: +55 + números (se não começar com 55)
  let comCodigo55 = apenasNumeros;
  if (!apenasNumeros.startsWith('55')) {
    comCodigo55 = '55' + apenasNumeros;
  }
  formatosTeste.push({
    nome: '+55 + números',
    numero: '+' + comCodigo55
  });
  
  // Formato 5: Sem + mas com 55
  formatosTeste.push({
    nome: 'Sem + mas com 55',
    numero: comCodigo55
  });

  console.log('🧪 [DEBUG] Todos os formatos para testar:', formatosTeste);

  // Vamos usar o formato mais provável: +55 + números
  const finalTo = '+' + comCodigo55;

  console.log('🔢 [SEND MESSAGE] Formato escolhido:', {
    original: to,
    final: finalTo,
    finalLength: finalTo.length
  });

  const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: finalTo,
    type: 'text',
    text: {
      preview_url: false,
      body: text.substring(0, 4096), // Limite do WhatsApp
    },
  };

  try {
    console.log('📝 [SEND MESSAGE] Payload completo:');
    console.log(JSON.stringify(payload, null, 2));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    console.log('📨 [SEND MESSAGE] Resposta da API:', {
      status: response.status,
      statusText: response.statusText,
      body: responseText
    });

    if (!response.ok) {
      console.error('💥 [SEND MESSAGE] ERRO DETALHADO:', {
        status: response.status,
        response: responseText,
        numeroTentativa: finalTo,
        formatosDisponiveis: formatosTeste
      });
      throw new Error(`HTTP ${response.status}: ${responseText}`);
    }

    console.log('✅ [SEND MESSAGE] Mensagem enviada com sucesso');

  } catch (error) {
    console.error('❌ [SEND MESSAGE] Erro ao enviar:', error);
    console.error('🔍 [SEND MESSAGE] Contexto do erro:', {
      numeroOriginal: to,
      numeroFinal: finalTo,
      formatosTentados: formatosTeste
    });
    throw error;
  }
}
