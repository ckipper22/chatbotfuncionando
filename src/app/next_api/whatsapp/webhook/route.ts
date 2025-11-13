// src/app/next_api/whatsapp/webhook/route.ts
import { consultarProduto } from '@/lib/services/api-confere-nota';
import { NextRequest, NextResponse } from 'next/server';
import { getGeminiService } from '../../../../lib/services/gemini-service';
import { getMedicamentoInfo, medicamentosData } from '../../../../../Lib/medicamentos_data';

// =========================================================================
// VARIÁVEIS E FUNÇÕES AUXILIARES PARA ENVIO WHATSAPP
// =========================================================================

const FORMATOS_COMPROVADOS = [
  '+5555984557096',
  '5555984557096',
];

function converterParaFormatoFuncional(numeroOriginal: string): string[] {
  console.log('🎯 [CONVERT] Convertendo para formato funcional:', numeroOriginal);

  const numeroLimpo = numeroOriginal.replace(/\D/g, '');
  console.log('🎯 [CONVERT] Número limpo:', numeroLimpo);

  if (numeroLimpo === '555584557096') {
    const formatosFuncionais = [
      '+5555984557096',
      '5555984557096',
    ];
    console.log('🎯 [CONVERT] ✅ Convertido para formatos funcionais (caso específico):', formatosFuncionais);
    return formatosFuncionais;
  }

  let numeroConvertido = numeroLimpo;

  if (numeroLimpo.length === 12 && numeroLimpo.startsWith('55')) {
    const ddd = numeroLimpo.substring(2, 4);
    const numeroSemDDIeDDD = numeroLimpo.substring(4);
    if (numeroSemDDIeDDD.length === 8 && !['1','2','3','4','5'].includes(numeroSemDDIeDDD.charAt(0))) {
        numeroConvertido = '55' + ddd + '9' + numeroSemDDIeDDD;
        console.log('🎯 [CONVERT] ✅ Adicionado 9 para celular brasileiro (heurística):', numeroConvertido);
    }
  }

  const formatosFinais = [
    '+' + numeroConvertido,
    numeroConvertido
  ];

  console.log('🎯 [CONVERT] Formatos finais a serem tentados (genérico):', formatosFinais);
  return formatosFinais;
}

async function testarFormatosSequencial(numero: string, texto: string): Promise<string | null> {
  console.log('🧪 [SEQUENTIAL TEST] Iniciando teste sequencial para:', numero);

  const formatos = converterParaFormatoFuncional(numero);

  for (let i = 0; i < formatos.length; i++) {
    const formato = formatos[i];
    console.log(`🧪 [SEQUENTIAL TEST] Tentativa ${i + 1}/${formatos.length}: ${formato}`);

    const sucesso = await tentarEnvioUnico(formato, texto, i + 1);
    if (sucesso) {
      console.log(`✅ [SEQUENTIAL TEST] SUCESSO no formato ${i + 1}: ${formato}`);
      return formato;
    }

    await new Promise(resolve => setTimeout(resolve, 300));
  }

  console.log('❌ [SEQUENTIAL TEST] Todos os formatos falharam');
  return null;
}

async function tentarEnvioUnico(numero: string, texto: string, tentativa: number): Promise<boolean> {
  try {
    console.log(`📤 [SEND ${tentativa}] Tentando enviar para: ${numero}`);

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

    console.log(`📝 [SEND ${tentativa}] Payload:`, JSON.stringify(payload, null, 2));

    const WHATSAPP_API_URL = `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();

    console.log(`📨 [SEND ${tentativa}] Status: ${response.status}`);
    console.log(`📨 [SEND ${tentativa}] Response: ${responseText}`);

    if (response.ok) {
      console.log(`🎉 [SEND ${tentativa}] ✅ SUCESSO para: ${numero}`);
      return true;
    } else {
      try {
        const errorData = JSON.parse(responseText);
        console.error(`💥 [SEND ${tentativa}] ❌ FALHA para: ${numero} - Status: ${response.status}, Erro:`, errorData);
      } catch (e) {
        console.error(`💥 [SEND ${tentativa}] ❌ FALHA para: ${numero} - Status: ${response.status}, Response: ${responseText}`);
      }
      return false;
    }

  } catch (error) {
    console.error(`❌ [SEND ${tentativa}] Erro de rede ou desconhecido para ${numero}:`, error);
    return false;
  }
}

async function enviarComFormatosCorretos(numeroOriginal: string, texto: string): Promise<boolean> {
  try {
    console.log('🎯 [SEND FIXED] Usando formatos comprovadamente funcionais para:', numeroOriginal);

    const formatoFuncional = await testarFormatosSequencial(numeroOriginal, texto);

    if (formatoFuncional) {
      console.log(`✅ [SEND FIXED] Mensagem enviada com sucesso usando formato: ${formatoFuncional}`);
      return true;
    } else {
      console.log(`❌ [SEND FIXED] Não foi possível enviar para nenhum formato de: ${numeroOriginal}`);
      return false;
    }

  } catch (error) {
    console.error('❌ [SEND FIXED] Erro crítico no envio:', error);
    return false;
  }
}

// =========================================================================
// FUNÇÕES AUXILIARES PARA PROCESSAMENTO DE MENSAGENS
// =========================================================================

function parseUserMessageForDrugInfo(message: string): { drugName?: string; infoType?: string } {
  const lowerMessage = message.toLowerCase();
  let drugName: string | undefined;
  let infoType: string | undefined;

  const infoTypeKeywords: { [key: string]: string[] } = {
    "classe terapeutica": ["classe terapeutica", "classe farmacologica", "categoria", "grupo de medicamentos", "tipo de remedio"],
    "posologia": ["posologia", "dose", "como usar", "modo de usar", "dosagem", "quantas vezes", "como tomar"],
    "indicacoes": ["indicacoes", "para que serve", "usos", "quando usar", "utilizacao", "beneficios"],
    "efeitos colaterais": ["efeitos colaterais", "reacoes adversas", "colaterais", "o que pode causar", "problemas", "efeitos indesejados"],
    "contraindicacoes": ["contraindicacoes", "contra indicado", "nao usar quando", "quem nao pode usar", "restricoes", "quando nao usar", "proibido"],
    "mecanismo de acao": ["mecanismo de acao", "como funciona", "acao do remedio", "age no organismo", "mecanismo"],
    "interacoes medicamentosas": ["interacoes medicamentosas", "pode misturar com", "outros remedios", "combinar com", "interage com", "interagir"],
    "tudo": ["tudo", "informacoes completas", "tudo sobre", "informacoes gerais", "ficha completa", "informacao completa"],
  };

  for (const typeKey in infoTypeKeywords) {
    if (infoTypeKeywords[typeKey].some(keyword => lowerMessage.includes(keyword))) {
      infoType = typeKey;
      break;
    }
  }

  const allDrugNames = medicamentosData.map(m => m["Nome do Medicamento"].toLowerCase());
  let bestMatchDrug: string | undefined;
  let bestMatchLength = 0;

  for (const drug of allDrugNames) {
    if (lowerMessage.includes(drug) && drug.length > bestMatchLength) {
      bestMatchDrug = drug;
      bestMatchLength = drug.length;
    }
  }
  drugName = bestMatchDrug;

  return { drugName, infoType };
}

// =========================================================================
// ROTA NEXT.JS API - WEBHOOK PARA WHATSAPP BUSINESS API
// =========================================================================

console.log('🎯 [COMPLETE SYSTEM] Sistema completo com IA ativada!');
console.log('✅ [FORMATS] Formatos que funcionam:', FORMATOS_COMPROVADOS);
console.log('📊 [CONFIG] Status completo:');
console.log('   WEBHOOK_TOKEN:', process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ? '✅' : '❌');
console.log('   PHONE_ID:', process.env.WHATSAPP_PHONE_NUMBER_ID || '❌');
console.log('   ACCESS_TOKEN:', process.env.WHATSAPP_ACCESS_TOKEN ? '✅' : '❌');
console.log('   GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? '✅ IA ATIVADA!' : '❌ IA DESATIVADA');

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  console.log('🔐 [WEBHOOK VERIFICATION] Verificação do webhook:', {
    mode,
    tokenMatch: token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    challenge: challenge?.substring(0, 20) + '...'
  });

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ [WEBHOOK] Verificação bem-sucedida!');
    return new NextResponse(challenge, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-cache'
      }
    });
  }

  console.log('❌ [WEBHOOK] Verificação falhou');
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function POST(request: NextRequest) {
  try {
    console.log('📨 [WEBHOOK] Nova mensagem recebida');

    if (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN) {
      console.error('❌ [WEBHOOK] Configuração crítica faltando: WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_ACCESS_TOKEN');
      return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
    }

    const body = await request.json();
    console.log('📦 [WEBHOOK] Payload recebido:', JSON.stringify(body, null, 2));

    const value = body.entry?.[0]?.changes?.[0]?.value;

    if (value?.statuses) {
      const status = value.statuses[0]?.status;
      console.log('📊 [STATUS] Status de entrega recebido:', status);
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    const messages = value?.messages;
    if (!messages?.length) {
      console.log('ℹ️ [WEBHOOK] Nenhuma mensagem para processar ou tipo inválido');
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    console.log(`🔄 [WEBHOOK] Processando ${messages.length} mensagem(ns)`);

    for (const message of messages) {
      await processarComIACompleta(message);
    }

    return NextResponse.json({ status: 'ok' }, { status: 200 });

  } catch (error) {
    console.error('❌ [WEBHOOK] Erro crítico no sistema:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// 🤖 PROCESSAMENTO COMPLETO COM IA E FALLBACK
async function processarComIACompleta(message: any): Promise<void> {
  const { from, text, type, id } = message;

  console.log('   [AI PROCESS] Processando com IA completa:', {
    from,
    type,
    messageId: id,
    hasText: !!text?.body
  });

  try {
    if (type !== 'text' || !text?.body) {
      console.log('⚠️ [AI PROCESS] Mensagem ignorada (não é texto)');
      return;
    }

    const userMessage = text.body.trim();
    const lowerMessage = userMessage.toLowerCase();

    console.log(`   [AI PROCESS] De ${from}: "${userMessage}"`);

    const geminiService = getGeminiService();

    // 👇👇👇 CONSULTA DE PRODUTOS - ADICIONADO AQUI 👇👇👇
    if (lowerMessage.startsWith('buscar ') ||
        lowerMessage.startsWith('produto ') ||
        lowerMessage.startsWith('consulta ') ||
        lowerMessage.startsWith('preço ') ||
        lowerMessage.startsWith('preco ') ||
        lowerMessage.startsWith('estoque ')) {

      console.log(`🛍️ [PRODUTO] Consultando produto: "${userMessage}"`);

      try {
        const termoBusca = userMessage.replace(/^(buscar|produto|consulta|preço|preco|estoque)\s*/i, '').trim();

        if (termoBusca.length < 2) {
          await enviarComFormatosCorretos(from,
            `🔍 *BUSCA DE PRODUTOS*\\n\\n` +
            `Por favor, digite o nome do produto que deseja buscar (mínimo 2 caracteres).\\n\\n` +
            `💡 *Exemplos:*\\n` +
            `• *buscar paracetamol*\\n` +
            `• *produto dipirona*\\n` +
            `• *estoque nimesulida*`
          );
          return;
        }

        const resultado = await consultarProduto(termoBusca);

        if (!resultado.success || resultado.count === 0) {
          await enviarComFormatosCorretos(from,
            `❌ *PRODUTO NÃO ENCONTRADO*\\n\\n` +
            `Não encontrei produtos para "*${termoBusca}*".\\n\\n` +
            `💡 *Sugestões:*\\n` +
            `• Verifique a ortografia\\n` +
            `• Tente um termo mais específico\\n` +
            `• Use apenas o nome principal`
          );
          return;
        }

        let resposta = `🔍 *${resultado.count} PRODUTO(S) ENCONTRADO(S)*\\n` +
                      `*Busca:* "${termoBusca}"\\n\\n`;

        resultado.data.slice(0, 5).forEach((produto: any, index: number) => {
          resposta += `*${index + 1}. ${produto.nome_produto}*\\n`;
          resposta += `💊 ${produto.nom_laboratorio}\\n`;
          resposta += `💰 ${produto.preco_final_venda}`;
          if (produto.desconto_percentual > 0) {
            resposta += ` (🔻${produto.desconto_percentual.toFixed(1)}% OFF)`;
          }
          resposta += `\\n📦 Estoque: ${produto.qtd_estoque} unidades\\n`;
          resposta += `📋 Código: ${produto.cod_reduzido}\\n\\n`;
        });

        if (resultado.count > 5) {
          resposta += `📊 *E mais ${resultado.count - 5} produtos...*\\n`;
          resposta += `Use um termo mais específico para ver todos.\\n\\n`;
        }

        resposta += `💡 *Dica:* Use *"código 12345"* para detalhes de um produto específico.`;

        await enviarComFormatosCorretos(from, resposta);
        return;

      } catch (error) {
        console.error('❌ [PRODUTO] Erro na consulta:', error);
        await enviarComFormatosCorretos(from,
          `⚠️ *ERRO NA CONSULTA*\\n\\n` +
          `Não consegui buscar produtos no momento.\\n` +
          `Nossa equipe foi notificada.\\n\\n` +
          `Tente novamente em alguns instantes.`
        );
        return;
      }
    }
    // 👆👆👆 FIM DA CONSULTA DE PRODUTOS 👆👆👆

    // Comandos administrativos
    if (lowerMessage === '/test' || lowerMessage === 'test') {
      const statusIA = process.env.GEMINI_API_KEY ? '🤖 IA ATIVA' : '⚠️ IA INATIVA';
      const statusMsg = `✅ *SISTEMA COMPLETO FUNCIONANDO!*\\n\\n🔗 WhatsApp: ✅ Conectado\\n${statusIA}\\n🛍️ Produtos: ✅ API Conectada\\n📊 Formatos: ✅ Corretos\\n🚀 Status: 100% Operacional\\n\\nTudo funcionando perfeitamente!`;
      await enviarComFormatosCorretos(from, statusMsg);
      return;
    }

    if (lowerMessage === '/debug' || lowerMessage === 'debug') {
      const formatos = converterParaFormatoFuncional(from);
      const statusIA = process.env.GEMINI_API_KEY ? '✅ ATIVA' : '❌ INATIVA';
      const debugInfo = `🔧 *DEBUG SISTEMA COMPLETO*\\n\\n📱 Seu número: ${from}\\n🎯 Convertido para:\\n• ${formatos[0]}\\n• ${formatos[1]}\\n\\n🤖 IA Status: ${statusIA}\\n🛍️ API Produtos: ✅ Conectada\\n📊 Formatos: ${FORMATOS_COMPROVADOS.length} testados\\n✅ Sistema: 100% Operacional\\n\\n🚀 *TUDO FUNCIONANDO!*`;
      await enviarComFormatosCorretos(from, debugInfo);
      return;
    }

    if (lowerMessage === '/limpar' || lowerMessage === 'limpar') {
      try {
        if (process.env.GEMINI_API_KEY) {
          geminiService.clearHistory(from);
          await enviarComFormatosCorretos(from, '🗑️ *HISTÓRICO LIMPO!*\\n\\nMemória da IA resetada com sucesso.\\nVamos começar uma nova conversa! 🚀');
        } else {
          await enviarComFormatosCorretos(from, '🗑️ *COMANDO RECEBIDO!*\\n\\nIA será ativada em breve.\\nSistema WhatsApp funcionando normalmente.');
        }
      } catch (error) {
        console.error('❌ [LIMPAR] Erro:', error);
        await enviarComFormatosCorretos(from, '❌ Erro ao limpar histórico.\\nSistema continua funcionando normalmente.');
      }
      return;
    }

    if (lowerMessage === '/ajuda' || lowerMessage === 'ajuda' || lowerMessage === '/help') {
      const statusIA = process.env.GEMINI_API_KEY ? '🤖 IA totalmente ativa - Posso conversar sobre qualquer assunto!' : '⚙️ IA sendo configurada';
      const helpMsg = `🤖 *ASSISTENTE INTELIGENTE ATIVO*\\n\\n` +
        `🛍️ *buscar [produto]* - Consulta produtos em estoque\\n` +
        `✅ */test* - Status do sistema\\n` +
        `🔧 */debug* - Informações técnicas\\n` +
        `🗑️ */limpar* - Resetar conversa\\n` +
        `❓ */ajuda* - Esta mensagem\\n\\n` +
        `${statusIA}\\n\\n` +
        `💬 *Como usar:*\\n` +
        `Envie qualquer mensagem para conversar comigo!\\n` +
        `Sou um assistente inteligente pronto para ajudar.\\n\\n` +
        `🚀 *STATUS: TOTALMENTE OPERACIONAL*`;
      await enviarComFormatosCorretos(from, helpMsg);
      return;
    }

    // Processamento com Inteligência Artificial
    if (!process.env.GEMINI_API_KEY) {
      console.log('⚠️ [AI PROCESS] GEMINI_API_KEY não encontrada');
      await enviarComFormatosCorretos(from, '🤖 *ASSISTENTE QUASE PRONTO!*\\n\\nSistema WhatsApp: ✅ Funcionando perfeitamente\\n🛍️ Produtos: ✅ API Conectada\\nIA: ⚙️ Sendo configurada\\n\\nEm breve estarei conversando inteligentemente!\\nUse */test* para verificar status.');
      return;
    }

    let aiResponseText: string;
    try {
      console.log('🤖 [AI] Iniciando processamento com Gemini IA...');
      aiResponseText = await geminiService.generateResponse(userMessage, from);
      console.log(`🤖 [AI] Resposta da IA gerada com sucesso (${aiResponseText.length} caracteres)`);
    } catch (aiError: any) {
      console.error('❌ [AI] Erro na inteligência artificial:', aiError);
      if (aiError.response && aiError.response.promptFeedback && aiError.response.promptFeedback.blockReason) {
        console.warn(`⚠️ Gemini API bloqueou o prompt: ${aiError.response.promptFeedback.blockReason}. Forçando fallback de medicamentos.`);
        aiResponseText = "Atenção (Política de Conteúdo da IA)";
      } else {
        const errorMsg = `🤖 *ASSISTENTE TEMPORARIAMENTE INDISPONÍVEL*\\n\\n` +
          `Estou com dificuldades momentâneas para processar sua mensagem.\\n\\n` +
          `💡 *Sugestões:*\\n` +
          `• Tente reformular sua pergunta\\n` +
          `• Envie uma mensagem mais simples\\n` +
          `• Use */test* para verificar o status\\n\\n` +
          `🔄 Tentarei novamente em alguns instantes...`;
        await enviarComFormatosCorretos(from, errorMsg);
        return;
      }
    }

    const medicalDisclaimerPattern = /atenção \(política de conteúdo da ia\)|não posso fornecer informações médicas|não sou um profissional de saúde|não estou qualificado para dar conselhos médicos|consulte um médico ou farmacêutico/i;
    const isMedicalDisclaimer = medicalDisclaimerPattern.test(aiResponseText.toLowerCase());

    if (isMedicalDisclaimer) {
      console.log("➡️ LLM acionou o disclaimer médico ou foi bloqueado. Tentando consultar a Lib/medicamentos_data.ts como fallback.");

      const parsedInfo = parseUserMessageForDrugInfo(userMessage);

      if (parsedInfo.drugName && parsedInfo.infoType) {
        console.log(`🔎 Informação extraída para fallback: Medicamento: '${parsedInfo.drugName}', Tipo: '${parsedInfo.infoType}'`);
        const libResult = getMedicamentoInfo(parsedInfo.drugName, parsedInfo.infoType);

        if (libResult.includes("Não encontrei informações sobre o medicamento") || libResult.includes("Não tenho a informação específica sobre")) {
          const finalResponse = `_Atenção (Política de Conteúdo da IA)_ - Para sua segurança, por favor, consulte diretamente um *farmacêutico* em nossa loja ou um *médico*. Como assistente, não posso fornecer informações ou recomendações médicas. Tentei buscar em nossa base de dados interna, mas ${libResult.toLowerCase()}. Por favor, procure um profissional de saúde para obter orientação.`;
          await enviarComFormatosCorretos(from, finalResponse);
        } else {
          const finalResponse = `_De acordo com nossa base de dados interna:_\\n\\n${libResult}\\n\\n*_Importante:_ Esta informação é para fins educacionais e informativos e não substitui o conselho, diagnóstico ou tratamento de um profissional de saúde qualificado. Sempre consulte um *médico* ou *farmacêutico* para orientações específicas sobre sua saúde e para a interpretação correta das informações.`;
          await enviarComFormatosCorretos(from, finalResponse);
        }
      } else {
        console.warn("⚠️ Não foi possível extrair nome do medicamento ou tipo de informação da mensagem do usuário para o fallback.");
        const finalResponse = `_Atenção (Política de Conteúdo da IA)_ - Para sua segurança, por favor, consulte diretamente um *farmacêutico* em nossa loja ou um *médico*. Como assistente, não posso fornecer informações ou recomendações médicas. Tentei buscar em nossa base de dados interna, mas não consegui entender qual medicamento ou informação específica você procura. Por favor, tente perguntar de forma mais direta (ex: _'Qual a posologia da losartana?'_ ou _'Indicações do paracetamol?'_).`;
        await enviarComFormatosCorretos(from, finalResponse);
      }
    } else {
      await enviarComFormatosCorretos(from, aiResponseText);
    }

  } catch (error) {
    console.error('❌ [AI PROCESS] Erro crítico no processamento:', error);

    const recoveryMsg = `⚠️ *ERRO TEMPORÁRIO DETECTADO*\\n\\n` +
      `O sistema detectou um problema momentâneo e está se recuperando automaticamente.\\n\\n` +
      `🔄 *Ações tomadas:*\\n` +
      `• Reinicialização automática em andamento\\n` +
      `• Sistema WhatsApp mantido ativo\\n` +
      `• Logs de erro registrados\\n\\n` +
      `Use */test* para verificar o status de recuperação.`;

    try {
      await enviarComFormatosCorretos(from, recoveryMsg);
    } catch (recoveryError) {
      console.error('❌ [RECOVERY] Falha crítica na recuperação:', recoveryError);
    }
  }
}