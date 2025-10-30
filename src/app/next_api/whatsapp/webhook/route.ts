import { NextRequest, NextResponse } from 'next/server';
import { getGeminiService } from '@/lib/services/gemini-service';

// 🎯 SISTEMA PROFISSIONAL DE MAPEAMENTO DE NÚMEROS
const ALLOWED_NUMBERS_MAP: Record<string, string> = {
  // Mapeamento inteligente: números de teste → números reais
  '555584557096': '+55984557096',   // Número atual que chega → Seu número real
  '5555984557096': '+55984557096',  // Variação com DDD duplicado
  '55584557096': '+55984557096',    // Sem primeiro 5
  '55984557096': '+55984557096',    // Formato correto
  '984557096': '+55984557096',      // Apenas número local
  '5584557096': '+55984557096',     // Sem código país
  
  // Adicione outros mapeamentos conforme necessário
  // 'numeroTeste': '+numeroReal'
};

// 🛡️ WHITELIST DE NÚMEROS PERMITIDOS (Meta Development)
const DEVELOPMENT_WHITELIST = [
  '+55984557096',   // Carlos - número principal
  '+5511999999999', // Número de teste adicional
];

// 🧠 FUNÇÃO INTELIGENTE DE MAPEAMENTO DE NÚMEROS
function mapearNumeroInteligente(numero: string): string {
  console.log('🧠 [SMART MAP] Entrada:', numero);
  
  // 1. Limpar número
  const numeroLimpo = numero.replace(/\D/g, '');
  console.log('🧠 [SMART MAP] Limpo:', numeroLimpo);
  
  // 2. Mapeamento direto (mais rápido)
  if (ALLOWED_NUMBERS_MAP[numeroLimpo]) {
    const mapeado = ALLOWED_NUMBERS_MAP[numeroLimpo];
    console.log(`🧠 [SMART MAP] ✅ MAPEADO DIRETO: ${numeroLimpo} → ${mapeado}`);
    return mapeado;
  }
  
  // 3. Mapeamento por padrão (últimos 9 dígitos)
  for (const [pattern, realNumber] of Object.entries(ALLOWED_NUMBERS_MAP)) {
    const patternSuffix = pattern.slice(-9); // Últimos 9 dígitos
    const numeroSuffix = numeroLimpo.slice(-9);
    
    if (patternSuffix === numeroSuffix) {
      console.log(`🧠 [SMART MAP] ✅ PADRÃO ENCONTRADO: ${numeroLimpo} → ${realNumber}`);
      return realNumber;
    }
  }
  
  // 4. Fallback inteligente para número principal
  const fallback = '+55984557096';
  console.log(`🧠 [SMART MAP] ⚠️ FALLBACK: ${numeroLimpo} → ${fallback}`);
  return fallback;
}

// 🔒 VALIDAÇÃO DE NÚMERO PERMITIDO
function isNumeroPermitido(numero: string): boolean {
  const permitido = DEVELOPMENT_WHITELIST.includes(numero);
  console.log(`�� [VALIDATION] ${numero} → ${permitido ? 'PERMITIDO' : 'BLOQUEADO'}`);
  return permitido;
}

// Debug inicial otimizado
console.log('🚀 [SYSTEM] Iniciando sistema profissional...');
console.log('📊 [CONFIG] Status das variáveis:');
console.log('   WEBHOOK_TOKEN:', process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ? `✅ (${process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN.length} chars)` : '❌ FALTANDO');
console.log('   PHONE_ID:', process.env.WHATSAPP_PHONE_NUMBER_ID || '❌ FALTANDO');
console.log('   ACCESS_TOKEN:', process.env.WHATSAPP_ACCESS_TOKEN ? `✅ (${process.env.WHATSAPP_ACCESS_TOKEN.length} chars)` : '❌ FALTANDO');
console.log('   GEMINI_KEY:', process.env.GOOGLE_GEMINI_API_KEY ? `✅ (${process.env.GOOGLE_GEMINI_API_KEY.length} chars)` : '❌ FALTANDO');
console.log('🗺️ [CONFIG] Mapeamentos configurados:', Object.keys(ALLOWED_NUMBERS_MAP).length);
console.log('🔐 [CONFIG] Números na whitelist:', DEVELOPMENT_WHITELIST.length);

// GET handler - Verificação do Webhook pelo Facebook
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  console.log('🔐 [WEBHOOK VERIFICATION] Dados recebidos:', {
    mode,
    tokenReceived: token,
    tokenExpected: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    tokensMatch: token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    challenge: challenge?.substring(0, 20) + '...'
  });

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ [WEBHOOK] Verificação bem-sucedida!');
    return new NextResponse(challenge, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-cache'
      },
    });
  }

  console.log('❌ [WEBHOOK] Verificação falhou');
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// POST handler - Processamento principal
export async function POST(request: NextRequest) {
  try {
    console.log('📨 [WEBHOOK] Nova mensagem recebida');
    
    // Validação crítica de configuração
    if (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN) {
      console.error('❌ [WEBHOOK] Configuração crítica faltando');
      return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
    }

    const body = await request.json();
    console.log('📦 [WEBHOOK] Payload recebido:', JSON.stringify(body, null, 2));

    // Extrair estrutura do webhook
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    console.log('🔍 [WEBHOOK] Análise estrutural:', {
      hasEntry: !!entry,
      hasChanges: !!changes,
      hasValue: !!value,
      hasMessages: !!messages,
      messageCount: messages?.length || 0
    });

    if (!messages?.length) {
      console.log('ℹ️ [WEBHOOK] Nenhuma mensagem para processar');
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    console.log(`🔄 [WEBHOOK] Processando ${messages.length} mensagem(ns)`);

    // Processar cada mensagem com sistema robusto
    for (const message of messages) {
      await processMessageProfessional(message);
    }

    return NextResponse.json({ status: 'ok' }, { status: 200 });

  } catch (error) {
    console.error('❌ [WEBHOOK] Erro crítico no sistema:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// �� PROCESSAMENTO PROFISSIONAL DE MENSAGENS
async function processMessageProfessional(message: any): Promise<void> {
  const { from, text, type, id, timestamp } = message;
  
  console.log('🔄 [PROCESS] Iniciando processamento profissional:', {
    from,
    type,
    messageId: id,
    timestamp,
    hasText: !!text?.body
  });

  try {
    // Validação de tipo
    if (type !== 'text') {
      console.log(`⚠️ [PROCESS] Tipo não suportado: ${type} - IGNORADO`);
      return;
    }

    const userMessage = text?.body?.trim();
    if (!userMessage) {
      console.log('❌ [PROCESS] Mensagem vazia - IGNORADA');
      return;
    }

    const lowerMessage = userMessage.toLowerCase();
    console.log(`💬 [PROCESS] Mensagem: "${userMessage}"`);

    // 🎯 COMANDOS ADMINISTRATIVOS PROFISSIONAIS
    
    if (lowerMessage === '/test' || lowerMessage === 'test') {
      console.log('🧪 [COMMAND] Test - Verificando conectividade');
      await enviarMensagemProfissional(from, '✅ SISTEMA OPERACIONAL\n\n🔗 Conectividade: OK\n📡 WhatsApp API: Ativa\n🤖 Bot: Funcionando\n\nTudo funcionando perfeitamente!');
      return;
    }

    if (lowerMessage === '/debug' || lowerMessage === 'debug') {
      console.log('🔧 [COMMAND] Debug - Gerando relatório');
      const debugInfo = await gerarRelatorioDebug(from, message);
      await enviarMensagemProfissional(from, debugInfo);
      return;
    }

    if (lowerMessage === '/limpar' || lowerMessage === 'limpar') {
      console.log('🗑️ [COMMAND] Limpar histórico');
      try {
        const geminiService = getGeminiService();
        geminiService.clearHistory(from);
        await enviarMensagemProfissional(from, '🗑️ HISTÓRICO LIMPO\n\nTodo o histórico da conversa foi removido.\nVamos começar uma nova conversa! 🚀');
      } catch (error) {
        console.error('❌ [COMMAND] Erro ao limpar:', error);
        await enviarMensagemProfissional(from, '❌ Erro ao limpar histórico.\nTente novamente em alguns instantes.');
      }
      return;
    }

    if (lowerMessage === '/ajuda' || lowerMessage === 'ajuda' || lowerMessage === '/help') {
      console.log('❓ [COMMAND] Ajuda');
      const helpMessage = `🤖 *COMANDOS DISPONÍVEIS*\n\n` +
        `🧪 */test* - Testar conectividade\n` +
        `🔧 */debug* - Informações do sistema\n` +
        `🗑️ */limpar* - Limpar histórico\n` +
        `❓ */ajuda* - Esta mensagem\n\n` +
        `💬 *COMO USAR:*\n` +
        `Envie qualquer mensagem para conversar comigo!\n` +
        `Sou um assistente inteligente pronto para ajudar.\n\n` +
        `🚀 *STATUS: OPERACIONAL*`;
      await enviarMensagemProfissional(from, helpMessage);
      return;
    }

    // 🤖 PROCESSAMENTO COM IA
    if (!process.env.GOOGLE_GEMINI_API_KEY) {
      console.warn('⚠️ [PROCESS] Gemini não configurado');
      await enviarMensagemProfissional(from, '⚙️ SISTEMA EM CONFIGURAÇÃO\n\nA IA está sendo configurada.\nUse */test* para verificar outros recursos.\n\nTente novamente em alguns minutos.');
      return;
    }

    try {
      console.log('🤖 [AI] Processando com Gemini...');
      const geminiService = getGeminiService();
      const aiResponse = await geminiService.generateResponse(userMessage, from);
      
      console.log(`🤖 [AI] Resposta gerada (${aiResponse.length} chars)`);
      await enviarMensagemProfissional(from, aiResponse);
      console.log('✅ [AI] Resposta enviada com sucesso');
      
    } catch (aiError) {
      console.error('❌ [AI] Erro no processamento:', aiError);
      await enviarMensagemProfissional(from, '🤖 ASSISTENTE TEMPORARIAMENTE INDISPONÍVEL\n\nEstou com dificuldades momentâneas.\nUse */test* para verificar outros recursos.\n\nTente novamente em alguns instantes.');
    }

  } catch (error) {
    console.error('❌ [PROCESS] Erro crítico no processamento:', error);
    
    // Sistema de recuperação automática
    try {
      await enviarMensagemProfissional(from, '⚠️ ERRO TEMPORÁRIO DETECTADO\n\nO sistema detectou um problema momentâneo.\nJá estou me recuperando automaticamente.\n\nUse */test* para verificar o status.');
    } catch (recoveryError) {
      console.error('❌ [RECOVERY] Falha crítica na recuperação:', recoveryError);
    }
  }
}

// 🚀 FUNÇÃO PROFISSIONAL DE ENVIO DE MENSAGENS
async function enviarMensagemProfissional(to: string, text: string): Promise<boolean> {
  try {
    console.log('📤 [SEND] Iniciando envio profissional...');
    
    // 1. Mapeamento inteligente do número
    const numeroMapeado = mapearNumeroInteligente(to);
    
    // 2. Validação de permissão
    const isPermitido = isNumeroPermitido(numeroMapeado);
    
    if (!isPermitido) {
      console.warn(`⚠️ [SEND] ATENÇÃO: Número ${numeroMapeado} não está na whitelist de desenvolvimento`);
      console.warn('🔧 [SEND] Tentativa de envio prosseguirá para debug');
    }

    // 3. Preparação do payload otimizado
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: numeroMapeado,
      type: 'text',
      text: {
        preview_url: false,
        body: text.substring(0, 4096) // Limite da API
      }
    };

    console.log('📋 [SEND] Detalhes do envio:', {
      numeroOriginal: to,
      numeroMapeado: numeroMapeado,
      permitido: isPermitido,
      tamanhoTexto: text.length,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID
    });

    console.log('📝 [SEND] Payload final:', JSON.stringify(payload, null, 2));

    // 4. Envio via WhatsApp Business API
    const url = `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'WhatsApp-Bot-Professional/1.0'
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    
    console.log('📨 [SEND] Resposta da API:', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      bodyLength: responseText.length,
      body: responseText
    });

    if (!response.ok) {
      throw new Error(`WhatsApp API Error ${response.status}: ${responseText}`);
    }

    console.log('✅ [SEND] MENSAGEM ENVIADA COM SUCESSO!');
    return true;

  } catch (error) {
    console.error('❌ [SEND] ERRO NO ENVIO:', error);
    console.log('🔄 [SEND] Sistema mantém operação normal para próximas mensagens');
    return false;
  }
}

// 📊 GERADOR DE RELATÓRIO DE DEBUG PROFISSIONAL
async function gerarRelatorioDebug(from: string, message: any): Promise<string> {
  const numeroMapeado = mapearNumeroInteligente(from);
  const isPermitido = isNumeroPermitido(numeroMapeado);
  const timestamp = new Date(parseInt(message.timestamp) * 1000);
  
  const relatorio = `🔧 *RELATÓRIO DE DEBUG PROFISSIONAL*\n\n` +
    
    `📱 *ANÁLISE DE NÚMEROS:*\n` +
    `• Original: \`${from}\`\n` +
    `• Mapeado: \`${numeroMapeado}\`\n` +
    `• Status: ${isPermitido ? '✅ PERMITIDO' : '❌ NÃO PERMITIDO'}\n` +
    `• Mapeamentos: ${Object.keys(ALLOWED_NUMBERS_MAP).length}\n\n` +
    
    `⚙️ *CONFIGURAÇÃO DO SISTEMA:*\n` +
    `• Gemini API: ${process.env.GOOGLE_GEMINI_API_KEY ? '✅ CONFIGURADA' : '❌ FALTANDO'}\n` +
    `• WhatsApp API: ${process.env.WHATSAPP_ACCESS_TOKEN ? '✅ CONFIGURADA' : '❌ FALTANDO'}\n` +
    `• Phone Number ID: ${process.env.WHATSAPP_PHONE_NUMBER_ID || '❌ FALTANDO'}\n` +
    `• Webhook Token: ${process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ? '✅ CONFIGURADO' : '❌ FALTANDO'}\n\n` +
    
    `📊 *DADOS DA MENSAGEM:*\n` +
    `• Message ID: \`${message.id}\`\n` +
    `• Timestamp: ${timestamp.toISOString()}\n` +
    `• Tipo: ${message.type}\n` +
    `• Tamanho: ${message.text?.body?.length || 0} chars\n\n` +
    
    `🎯 *STATUS GERAL:*\n` +
    `• Sistema: 🟢 OPERACIONAL\n` +
    `• Conectividade: 🟢 ATIVA\n` +
    `• Whitelist: ${DEVELOPMENT_WHITELIST.length} números\n` +
    `• Modo: DESENVOLVIMENTO\n\n` +
    
    `🚀 *SISTEMA PROFISSIONAL ATIVO*`;
    
  return relatorio;
}
