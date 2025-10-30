import { NextRequest, NextResponse } from 'next/server';
import { getGeminiService } from '@/lib/services/gemini-service';

// Debug inicial das variáveis
console.log('🔧 [WEBHOOK] Iniciando - Verificando variáveis de ambiente:');
console.log('   WHATSAPP_WEBHOOK_VERIFY_TOKEN:', process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ? `✅ (${process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN.length} chars)` : '❌ NÃO ENCONTRADO');
console.log('   WHATSAPP_PHONE_NUMBER_ID:', process.env.WHATSAPP_PHONE_NUMBER_ID || '❌ NÃO ENCONTRADO');
console.log('   WHATSAPP_ACCESS_TOKEN:', process.env.WHATSAPP_ACCESS_TOKEN ? `✅ (${process.env.WHATSAPP_ACCESS_TOKEN.length} chars)` : '❌ NÃO ENCONTRADO');

// Função para corrigir número com DDD duplicado
function corrigirNumero(numero: string): string {
  console.log('🚨🚨🚨 [CORRIGIR] Entrada:', numero);
  console.error('🚨🚨🚨 [CORRIGIR] Entrada:', numero);
  
  // Remove caracteres não numéricos
  let limpo = numero.replace(/\D/g, '');
  console.log('🚨🚨🚨 [CORRIGIR] Após limpeza:', limpo);
  console.error('🚨🚨🚨 [CORRIGIR] Após limpeza:', limpo);
  
  // Se começar com 5555, remove um 55 (DDD duplicado)
  if (limpo.startsWith('5555')) {
    limpo = limpo.substring(2); // Remove os primeiros 2 dígitos (55)
    console.log('🚨🚨🚨 [CORRIGIR] Removido DDD duplicado:', limpo);
    console.error('🚨🚨🚨 [CORRIGIR] Removido DDD duplicado:', limpo);
  }
  
  // Garantir que tenha o código do país (55 para Brasil)
  if (!limpo.startsWith('55')) {
    limpo = '55' + limpo;
    console.log('🚨🚨🚨 [CORRIGIR] Adicionado código 55:', limpo);
    console.error('🚨🚨🚨 [CORRIGIR] Adicionado código 55:', limpo);
  }
  
  // Adicionar + no início para formato E.164
  const resultado = '+' + limpo;
  console.log('��🚨🚨 [CORRIGIR] Resultado final:', resultado);
  console.error('🚨🚨🚨 [CORRIGIR] Resultado final:', resultado);
  
  return resultado;
}

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
    console.log('🚨🚨🚨 [WEBHOOK] Nova mensagem POST recebida');
    console.error('🚨🚨🚨 [WEBHOOK] Nova mensagem POST recebida');
    
    // Verificar variáveis essenciais
    if (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN) {
      console.error('❌ [WEBHOOK] Variáveis de ambiente faltando');
      return NextResponse.json(
        { error: 'Configuration error' }, 
        { status: 500 }
      );
    }

    const body = await request.json();
    console.log('🚨🚨🚨 [WEBHOOK] Corpo completo da mensagem:');
    console.log(JSON.stringify(body, null, 2));
    console.error('🚨🚨🚨 [WEBHOOK] Corpo completo da mensagem:');
    console.error(JSON.stringify(body, null, 2));

    // Processar a estrutura do webhook
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    console.log('🚨🚨🚨 [WEBHOOK] Estrutura analisada:', {
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

    console.log(`🚨🚨🚨 [WEBHOOK] Processando ${messages.length} mensagem(ns)`);
    console.error(`🚨🚨🚨 [WEBHOOK] Processando ${messages.length} mensagem(ns)`);

    // Processar cada mensagem
    for (const message of messages) {
      await processMessage(message);
    }

    return NextResponse.json({ status: 'ok' }, { status: 200 });

  } catch (error) {
    console.error('🚨🚨🚨 [WEBHOOK] Erro geral:', error);
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

  console.log('🚨🚨🚨 [PROCESS MESSAGE] Nova mensagem:', {
    from,
    type: messageType,
    id: messageId,
    timestamp: message.timestamp
  });
  console.error('🚨🚨🚨 [PROCESS MESSAGE] Nova mensagem:', {
    from,
    type: messageType,
    id: messageId,
    timestamp: message.timestamp
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

    console.log(`🚨🚨🚨 [PROCESS MESSAGE] Texto recebido: "${userMessage}"`);
    console.error(`🚨🚨🚨 [PROCESS MESSAGE] Texto recebido: "${userMessage}"`);

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
      const numeroCorrigido = corrigirNumero(from);
      const debugMessage = `�� *Informações de Debug:*\n\n` +
        `• Seu número original: ${from}\n` +
        `• Número corrigido: ${numeroCorrigido}\n` +
        `• Tipo: ${typeof from}\n` +
        `• Tamanho: ${from?.length}\n` +
        `• Timestamp: ${message.timestamp}`;
      await sendWhatsAppMessage(from, debugMessage);
      return;
    }

    // Processar com IA
    console.log('🚨🚨🚨 [PROCESS MESSAGE] Gerando resposta com IA...');
    console.error('🚨🚨🚨 [PROCESS MESSAGE] Gerando resposta com IA...');
    const geminiService = getGeminiService();
    const aiResponse = await geminiService.generateResponse(userMessage, from);
    
    console.log(`🚨🚨🚨 [PROCESS MESSAGE] Resposta da IA: "${aiResponse}"`);
    console.error(`🚨🚨🚨 [PROCESS MESSAGE] Resposta da IA: "${aiResponse}"`);
    
    await sendWhatsAppMessage(from, aiResponse);

  } catch (error) {
    console.error('🚨🚨🚨 [PROCESS MESSAGE] Erro:', error);
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

  // 🚨 LOGS FORÇADOS MÚLTIPLOS
  console.log('🚨🚨🚨 [SEND] INÍCIO - Número original:', to);
  console.error('🚨🚨🚨 [SEND] INÍCIO - Número original:', to);
  console.warn('🚨🚨🚨 [SEND] INÍCIO - Número original:', to);

  // ✅ CORREÇÃO: Usar a função para corrigir o número
  const finalTo = corrigirNumero(to);

  // 🚨 LOGS FORÇADOS DO RESULTADO
  console.log('🚨🚨🚨 [SEND] Número final:', finalTo);
  console.error('🚨🚨🚨 [SEND] Número final:', finalTo);
  console.warn('🚨🚨🚨 [SEND] Número final:', finalTo);

  // 🚨 VAMOS TESTAR MÚLTIPLOS FORMATOS
  const formatosTeste = [
    '+5555984557096',  // Original com DDD duplicado
    '+55984557096',    // Sem DDD duplicado
    '+559845570960',   // Com 9 extra
    '+55984557096',    // Exato da lista
  ];

  console.log('🚨🚨🚨 [SEND] Formatos para testar:', formatosTeste);
  console.error('🚨🚨🚨 [SEND] Formatos para testar:', formatosTeste);

  // VAMOS TENTAR O PRIMEIRO FORMATO DA LISTA
  const numeroTeste = '+55984557096'; // SEM DDD duplicado

  console.log('��🚨🚨 [SEND] Usando número de teste:', numeroTeste);
  console.error('🚨🚨🚨 [SEND] Usando número de teste:', numeroTeste);

  const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: numeroTeste, // USANDO NÚMERO FIXO PARA TESTE
    type: 'text',
    text: {
      preview_url: false,
      body: text.substring(0, 4096),
    },
  };

  try {
    console.log('��🚨🚨 [SEND] Payload:', JSON.stringify(payload, null, 2));
    console.error('🚨🚨🚨 [SEND] Payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    console.log('🚨🚨🚨 [SEND] Resposta:', responseText);
    console.error('🚨🚨🚨 [SEND] Resposta:', responseText);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${responseText}`);
    }

    console.log('🚨🚨🚨 [SEND] SUCESSO!');
    console.error('🚨🚨🚨 [SEND] SUCESSO!');

  } catch (error) {
    console.error('🚨🚨🚨 [SEND] ERRO:', error);
    throw error;
  }
}
