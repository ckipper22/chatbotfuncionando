import { NextRequest, NextResponse } from 'next/server';
import { getGeminiService } from '@/lib/services/gemini-service';

// 🎯 FORMATOS PARA TESTAR - BASEADO NO +55 (55) 98455-7096
const FORMATOS_TESTE = [
  '+555598455709',    // Sem último 6
  '+5555984557096',   // Como está chegando
  '+55984557096',     // Formato correto esperado
  '+559845570',       // Apenas começo
  '+5598455',         // Mais curto
  '+555984557',       // Médio
  '+55559845570',     // Sem últimos 2
  '+555984557096',    // Sem um 5
  '+5555598455709',   // Extra longo
  '55984557096',      // Sem +
  '5555984557096',    // Sem + com DDD duplicado
  '+5555984557',      // Truncado
  '+55984557',        // Mais truncado
  '+555984',          // Muito truncado
  '+55598455709',     // Sem último dígito
  '+555598455',       // Truncado médio
];

// 🧠 SISTEMA PROFISSIONAL DE MAPEAMENTO
const ALLOWED_NUMBERS_MAP: Record<string, string[]> = {
  // Para cada número que chega, definir TODOS os formatos para testar
  '555584557096': FORMATOS_TESTE,
  '5555984557096': FORMATOS_TESTE,
  '55984557096': FORMATOS_TESTE,
  '984557096': FORMATOS_TESTE,
};

// 🔧 FUNÇÃO QUE FORÇA TESTE DE TODOS OS FORMATOS
function obterFormatosPossiveis(numero: string): string[] {
  console.log('🎯 [FORMATOS] Gerando todos os formatos para:', numero);
  
  const numeroLimpo = numero.replace(/\D/g, '');
  console.log('🎯 [FORMATOS] Número limpo:', numeroLimpo);
  
  // Se temos mapeamento específico, usar
  if (ALLOWED_NUMBERS_MAP[numeroLimpo]) {
    console.log(`🎯 [FORMATOS] Usando mapeamento específico: ${FORMATOS_TESTE.length} formatos`);
    return FORMATOS_TESTE;
  }
  
  // Fallback: gerar formatos dinamicamente
  const formatos = [
    `+${numeroLimpo}`,                    // Com + original
    `+55${numeroLimpo.substring(2)}`,     // Com +55
    `+555${numeroLimpo.substring(3)}`,    // Com +555
    numeroLimpo,                          // Sem +
    `55${numeroLimpo.substring(2)}`,      // Sem + com 55
  ];
  
  console.log(`🎯 [FORMATOS] Formatos gerados: ${formatos.length}`);
  return formatos;
}

// Debug inicial
console.log('🚀 [SYSTEM] Sistema de teste de formatos iniciado');
console.log('📊 [CONFIG] Status das variáveis:');
console.log('   WEBHOOK_TOKEN:', process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ? '✅' : '❌');
console.log('   PHONE_ID:', process.env.WHATSAPP_PHONE_NUMBER_ID || '❌');
console.log('   ACCESS_TOKEN:', process.env.WHATSAPP_ACCESS_TOKEN ? '✅' : '❌');
console.log('   GEMINI_KEY:', process.env.GOOGLE_GEMINI_API_KEY ? '✅' : '❌');
console.log('🧪 [TEST] Formatos configurados para teste:', FORMATOS_TESTE.length);

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

// POST handler
export async function POST(request: NextRequest) {
  try {
    console.log('📨 [WEBHOOK] Nova mensagem recebida');
    
    if (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN) {
      console.error('❌ [WEBHOOK] Configuração inválida');
      return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
    }

    const body = await request.json();
    console.log('📦 [WEBHOOK] Payload:', JSON.stringify(body, null, 2));

    const messages = body.entry?.[0]?.changes?.[0]?.value?.messages;
    if (!messages?.length) {
      console.log('ℹ️ [WEBHOOK] Nenhuma mensagem para processar');
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    console.log(`🔄 [WEBHOOK] Processando ${messages.length} mensagem(ns)`);

    for (const message of messages) {
      await processarMensagemComTeste(message);
    }

    return NextResponse.json({ status: 'ok' }, { status: 200 });

  } catch (error) {
    console.error('❌ [WEBHOOK] Erro:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// 🧪 PROCESSAMENTO COM TESTE DE FORMATOS
async function processarMensagemComTeste(message: any): Promise<void> {
  const { from, text, type, id } = message;
  
  console.log('🧪 [TEST PROCESS] Iniciando teste de formatos:', {
    from,
    type,
    messageId: id,
    hasText: !!text?.body
  });

  try {
    if (type !== 'text' || !text?.body) {
      console.log('⚠️ [TEST PROCESS] Mensagem ignorada');
      return;
    }

    const userMessage = text.body.trim();
    const lowerMessage = userMessage.toLowerCase();
    
    console.log(`💬 [TEST PROCESS] Mensagem: "${userMessage}"`);

    // Comando especial para forçar teste
    if (lowerMessage === '/testarformatos' || lowerMessage === 'testar') {
      console.log('🧪 [COMMAND] Comando de teste de formatos detectado');
      await testarTodosFormatos(from);
      return;
    }

    // Comandos normais
    if (lowerMessage === '/test') {
      await tentarEnviarComTodosFormatos(from, '✅ TESTE DE CONECTIVIDADE\n\nSistema funcionando!');
      return;
    }

    if (lowerMessage === '/debug') {
      const debugInfo = await gerarDebugCompleto(from, message);
      await tentarEnviarComTodosFormatos(from, debugInfo);
      return;
    }

    // IA ou mensagem padrão
    if (!process.env.GOOGLE_GEMINI_API_KEY) {
      await tentarEnviarComTodosFormatos(from, '⚙️ SISTEMA EM TESTE\n\nTestando formatos de número.\nUse "/testarformatos" para ver todos os testes.');
      return;
    }

    try {
      const geminiService = getGeminiService();
      const aiResponse = await geminiService.generateResponse(userMessage, from);
      await tentarEnviarComTodosFormatos(from, aiResponse);
    } catch (aiError) {
      console.error('❌ [AI] Erro:', aiError);
      await tentarEnviarComTodosFormatos(from, '🤖 IA temporariamente indisponível.\nUse "/testarformatos" para testar conectividade.');
    }

  } catch (error) {
    console.error('❌ [TEST PROCESS] Erro:', error);
    await tentarEnviarComTodosFormatos(from, '⚠️ Erro detectado.\nSistema em modo de teste.');
  }
}

// 🎯 FUNÇÃO PRINCIPAL - TENTA TODOS OS FORMATOS
async function tentarEnviarComTodosFormatos(numeroOriginal: string, texto: string): Promise<boolean> {
  console.log('🎯 [FORCE TEST] Iniciando teste forçado de todos os formatos');
  
  const formatos = obterFormatosPossiveis(numeroOriginal);
  
  console.log(`🧪 [FORCE TEST] Testando ${formatos.length} formatos para: ${numeroOriginal}`);
  
  let sucessos = 0;
  let tentativas = 0;
  
  for (const formato of formatos) {
    tentativas++;
    console.log(`\n🔄 [TENTATIVA ${tentativas}/${formatos.length}] Testando formato: ${formato}`);
    
    const sucesso = await enviarParaFormato(formato, texto, tentativas);
    
    if (sucesso) {
      sucessos++;
      console.log(`✅ [SUCESSO] Formato funcionou: ${formato}`);
      // Continue testando todos, não pare no primeiro sucesso
    } else {
      console.log(`❌ [FALHA] Formato falhou: ${formato}`);
    }
    
    // Pequena pausa entre tentativas
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`\n📊 [RESULTADO FINAL] ${sucessos}/${tentativas} formatos funcionaram`);
  
  return sucessos > 0;
}

// 🚀 ENVIO PARA FORMATO ESPECÍFICO
async function enviarParaFormato(numero: string, texto: string, tentativa: number): Promise<boolean> {
  try {
    const url = `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: numero,
      type: 'text',
      text: {
        preview_url: false,
        body: `[TESTE ${tentativa}] ${texto.substring(0, 4000)}`
      }
    };

    console.log(`📤 [SEND ${tentativa}] Para: ${numero}`);
    console.log(`📝 [PAYLOAD ${tentativa}]:`, JSON.stringify(payload, null, 2));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    
    console.log(`📨 [RESPONSE ${tentativa}] Status: ${response.status}`);
    console.log(`📨 [RESPONSE ${tentativa}] Body: ${responseText}`);

    if (response.ok) {
      console.log(`🎉 [SUCESSO ${tentativa}] FORMATO ACEITO: ${numero}`);
      return true;
    } else {
      console.log(`💥 [ERRO ${tentativa}] FORMATO REJEITADO: ${numero} - ${response.status}`);
      return false;
    }

  } catch (error) {
    console.error(`❌ [ERRO ${tentativa}] Exceção ao enviar para ${numero}:`, error);
    return false;
  }
}

// 🧪 TESTE EXPLÍCITO DE TODOS OS FORMATOS
async function testarTodosFormatos(numeroOriginal: string): Promise<void> {
  const textoTeste = `🧪 TESTE DE FORMATO DE NÚMERO\n\nTestando conectividade com diferentes formatos.\nEste é um teste automatizado.`;
  
  console.log('🧪 [EXPLICIT TEST] Iniciando teste explícito de formatos');
  await tentarEnviarComTodosFormatos(numeroOriginal, textoTeste);
}

// 📊 DEBUG COMPLETO
async function gerarDebugCompleto(from: string, message: any): Promise<string> {
  const formatos = obterFormatosPossiveis(from);
  
  return `🔧 *DEBUG COMPLETO*\n\n` +
    `📱 *Número Original:* ${from}\n` +
    `🧪 *Formatos para Teste:* ${formatos.length}\n` +
    `📋 *Lista:*\n${formatos.map((f, i) => `${i+1}. ${f}`).join('\n')}\n\n` +
    `⚙️ *Sistema:*\n` +
    `• WhatsApp API: ${process.env.WHATSAPP_ACCESS_TOKEN ? '✅' : '❌'}\n` +
    `• Gemini: ${process.env.GOOGLE_GEMINI_API_KEY ? '✅' : '❌'}\n\n` +
    `📊 *Message ID:* ${message.id}\n` +
    `🕐 *Timestamp:* ${message.timestamp}\n\n` +
    `🚀 *SISTEMA DE TESTE ATIVO*`;
}
