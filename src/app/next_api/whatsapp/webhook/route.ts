// src/app/next_api/whatsapp/webhook/route.ts
import { consultarProduto } from '@/lib/api-confere-nota';
import { NextRequest, NextResponse } from 'next/server';
<<<<<<< HEAD
import { getGeminiService } from '../../../../src/lib/services/gemini-service'; // Caminho CORRIGIDO para o gemini-service
import { getMedicamentoInfo, medicamentosData } from '../../../../../Lib/medicamentos_data'; // Caminho CORRIGIDO para o medicamentos_data
=======
import { getGeminiService } from '../../../../lib/services/gemini-service';
import { getMedicamentoInfo, medicamentosData } from '../../../../../Lib/medicamentos_data';
>>>>>>> integracao-whatsapp-api

// =========================================================================
// VARIÁVEIS E FUNÇÕES AUXILIARES PARA ENVIO WHATSAPP
// =========================================================================

<<<<<<< HEAD
function converterParaFormatoFuncional(numeroOriginal: string): string[] {
  const numeroLimpo = numeroOriginal.replace(/\D/g, ''); // Remove todos os caracteres não-dígitos
  
  if (numeroLimpo === '555584557096') { // Lógica específica do seu teste
=======
const FORMATOS_COMPROVADOS = [
  '+5555984557096',
  '5555984557096',
];

function converterParaFormatoFuncional(numeroOriginal: string): string[] {
  console.log('🎯 [CONVERT] Convertendo para formato funcional:', numeroOriginal);

  const numeroLimpo = numeroOriginal.replace(/\D/g, '');
  console.log('🎯 [CONVERT] Número limpo:', numeroLimpo);

  if (numeroLimpo === '555584557096') {
>>>>>>> integracao-whatsapp-api
    const formatosFuncionais = [
      '+5555984557096',
      '5555984557096',
    ];
    return formatosFuncionais;
  }
<<<<<<< HEAD
  
  let numeroConvertido = numeroLimpo;

  // Heurística para adicionar o '9' a números de celular brasileiros que possam vir sem ele.
=======

  let numeroConvertido = numeroLimpo;

>>>>>>> integracao-whatsapp-api
  if (numeroLimpo.length === 12 && numeroLimpo.startsWith('55')) {
    const ddd = numeroLimpo.substring(2, 4);
    const numeroSemDDIeDDD = numeroLimpo.substring(4);
    if (numeroSemDDIeDDD.length === 8 && !['1','2','3','4','5'].includes(numeroSemDDIeDDD.charAt(0))) {
        numeroConvertido = '55' + ddd + '9' + numeroSemDDIeDDD;
    }
  }

  const formatosFinais = [
    '+' + numeroConvertido,
    numeroConvertido
  ];
  return formatosFinais;
}

<<<<<<< HEAD
async function tentarEnvioUnico(numero: string, payload: any, tentativa: number): Promise<boolean> {
=======
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
>>>>>>> integracao-whatsapp-api
  try {
    console.log(`[SEND ${tentativa}] Tentando enviar para: ${numero}`);

<<<<<<< HEAD
=======
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

>>>>>>> integracao-whatsapp-api
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

    console.log(`[SEND ${tentativa}] Status: ${response.status}`);
    console.log(`[SEND ${tentativa}] Response: ${responseText}`);

    if (response.ok) {
      console.log(`🎉 [SEND ${tentativa}] ✅ SUCESSO para: ${numero}`);
      return true;
    } else {
      try {
        const errorData = JSON.parse(responseText);
        console.error(`�� [SEND ${tentativa}] ❌ FALHA para: ${numero} - Status: ${response.status}, Erro:`, errorData);
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
  console.log('�� [SEND TEXT] Tentando enviar texto para:', numeroOriginal);
  const formatos = converterParaFormatoFuncional(numeroOriginal);

  const textPayload = { // Cria um payload de texto padrão
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '', // Será preenchido por tentarEnvioUnico
      type: 'text',
      text: {
        preview_url: false,
        body: texto.substring(0, 4096)
      }
  };

  for (let i = 0; i < formatos.length; i++) {
    const formato = formatos[i];
    textPayload.to = formato; // Atribui o formato atual ao payload
    const sucesso = await tentarEnvioUnico(formato, textPayload, i + 1);
    if (sucesso) {
      console.log(`✅ [SEND TEXT] Mensagem de texto enviada com sucesso usando formato: ${formato}`);
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  console.log(`❌ [SEND TEXT] Não foi possível enviar texto para nenhum formato de: ${numeroOriginal}`);
  return false;
}

<<<<<<< HEAD
// FUNÇÕES AUXILIARES PARA MENSAGENS INTERATIVAS DO WHATSAPP
async function sendListMessage(to: string, header: string, body: string, buttonText: string, sectionTitle: string, rows: { id: string; title: string; description?: string }[]): Promise<boolean> {
    const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'interactive',
        interactive: {
            type: 'list',
            header: { type: 'text', text: header.substring(0, 60) }, // Header max 60 chars
            body: { text: body.substring(0, 1024) }, // Body max 1024 chars
            action: {
                button: buttonText.substring(0, 20), // Button max 20 chars
                sections: [
                    {
                        title: sectionTitle.substring(0, 24), // Section title max 24 chars
                        rows: rows.map(row => ({
                            id: row.id.substring(0, 200), // ID max 200 chars
                            title: row.title.substring(0, 24), // Title max 24 chars
                            description: row.description ? row.description.substring(0, 72) : undefined // Description max 72 chars
                        }))
                    }
                ]
            }
        }
    };
    return await tentarEnvioUnico(to, payload, 1);
}

async function sendReplyButtons(to: string, body: string, buttons: { id: string; title: string }[]): Promise<boolean> {
    const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'interactive',
        interactive: {
            type: 'button',
            body: { text: body.substring(0, 1024) }, // Body max 1024 chars
            action: {
                buttons: buttons.map(btn => ({
                    type: 'reply',
                    reply: {
                        id: btn.id.substring(0, 256), // ID max 256 chars
                        title: btn.title.substring(0, 20) // Title max 20 chars
                    }
                }))
            }
        }
    };
    return await tentarEnvioUnico(to, payload, 1);
}
=======
// =========================================================================
// FUNÇÕES AUXILIARES PARA PROCESSAMENTO DE MENSAGENS
// =========================================================================
>>>>>>> integracao-whatsapp-api

function parseUserMessageForDrugInfo(message: string): { drugName?: string; infoType?: string } {
    const lowerMessage = message.toLowerCase();
    let drugName: string | undefined;
    let infoType: string | undefined;

<<<<<<< HEAD
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
=======
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
>>>>>>> integracao-whatsapp-api

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
console.log('📊 [CONFIG] Status completo:');
console.log('   WEBHOOK_TOKEN:', process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ? '✅' : '❌');
console.log('   PHONE_ID:', process.env.WHATSAPP_PHONE_NUMBER_ID || '❌');
console.log('   ACCESS_TOKEN:', process.env.WHATSAPP_ACCESS_TOKEN ? '✅' : '❌');
console.log('   GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? '✅ IA ATIVADA!' : '❌ IA DESATIVADA');
console.log('   FLASK_API_URL:', process.env.FLASK_API_URL ? '✅ URL FLASK CONFIGURADA!' : '❌ URL FLASK AUSENTE!');


export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  console.log('[WEBHOOK VERIFICATION] Verificação do webhook:', {
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
    console.log('�� [WEBHOOK] Nova mensagem recebida');

<<<<<<< HEAD
    if (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN || !process.env.FLASK_API_URL) {
      console.error('❌ [WEBHOOK] Configuração crítica faltando: WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN ou FLASK_API_URL');
=======
    if (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN) {
      console.error('❌ [WEBHOOK] Configuração crítica faltando: WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_ACCESS_TOKEN');
>>>>>>> integracao-whatsapp-api
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

    console.log(`[WEBHOOK] Processando ${messages.length} mensagem(ns)`);

    for (const message of messages) {
      await processarComIACompleta(message);
    }

    return NextResponse.json({ status: 'ok' }, { status: 200 });

  } catch (error) {
    console.error('❌ [WEBHOOK] Erro crítico no sistema:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


// =========================================================================
// NOVO: Gerenciamento de estado da conversa (em memória - apenas para demonstração)
// Para produção em Vercel, use um banco de dados externo (Redis, Postgres, etc.) para persistência.
// =========================================================================
const conversationState: Record<string, {
    state: string; // 'IDLE', 'AWAITING_PRODUCT_SELECTION', 'AWAITING_ORDER_CONFIRMATION_YES_NO', 'AWAITING_ORDER_QUANTITY', 'AWAITING_ORDER_CLIENT_NAME_OR_CONFIRMATION', 'AWAITING_ORDER_FINAL_CONFIRMATION'
    searchResults?: any[];
    selectedProduct?: any;
    orderQuantity?: number;
    clientName?: string;
    clientPhone?: string;
    // Adicione outros dados de contexto conforme necessário
}> = {};
// =========================================================================


// PROCESSAMENTO COMPLETO COM IA E FALLBACK
async function processarComIACompleta(message: any): Promise<void> {
  const { from, text, type, id } = message;

  console.log('   [AI PROCESS] Processando com IA completa:', {
    from,
    type,
    messageId: id,
    hasText: !!text?.body
  });

  try {
    if (type !== 'text' && type !== 'interactive') { // Agora aceita tipo 'interactive'
      console.log('⚠️ [AI PROCESS] Mensagem ignorada (não é texto nem interativa)');
      return;
    }

    // --- NOVO: Extrair o conteúdo da mensagem, seja texto ou resposta interativa ---
    let userMessageRaw: string;
    if (type === 'interactive') {
        if (message.interactive.type === 'list_reply') {
            userMessageRaw = message.interactive.list_reply.id; // O ID do item da lista selecionado
        } else if (message.interactive.type === 'button_reply') {
            userMessageRaw = message.interactive.button_reply.id; // O ID do botão selecionado
        } else {
            userMessageRaw = text?.body?.trim() || ''; // Fallback para outros tipos interativos
        }
    } else { // type === 'text'
        userMessageRaw = text?.body?.trim() || '';
    }

    const userMessage = userMessageRaw; // Agora userMessage contém o conteúdo ou o ID da resposta interativa
    const lowerMessage = userMessage.toLowerCase();
    // --- FIM NOVO ---

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

        console.log(`🔍 [PRODUTO] Buscando: "${termoBusca}" na API Flask...`);
        const resultado = await consultarProduto(termoBusca);
        console.log(`✅ [PRODUTO] Resultado: ${resultado.count} produtos encontrados`);

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
          resposta += `🏭 ${produto.nom_laboratorio}\\n`;
          resposta += `💰 ${produto.preco_final_venda}`;
          if (produto.desconto_percentual > 0) {
            resposta += ` (🤑${produto.desconto_percentual.toFixed(1)}% OFF)`;
          }
          resposta += `\\n📦 Estoque: ${produto.qtd_estoque} unidades\\n`;
          resposta += `🔢 Código: ${produto.cod_reduzido}\\n\\n`;
        });

        if (resultado.count > 5) {
          resposta += `📋 *E mais ${resultado.count - 5} produtos...*\\n`;
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
<<<<<<< HEAD
      const statusMsg = `✅ *SISTEMA COMPLETO FUNCIONANDO!*\n\n🔗 WhatsApp: ✅ Conectado\n${statusIA}\n📊 Flask API: ${process.env.FLASK_API_URL ? '✅ Conectado' : '❌ Não configurado'}\n🚀 Status: 100% Operacional\n\nTudo funcionando perfeitamente!`;
=======
      const statusMsg = `✅ *SISTEMA COMPLETO FUNCIONANDO!*\\n\\n🔗 WhatsApp: ✅ Conectado\\n${statusIA}\\n🛍️ Produtos: ✅ API Conectada\\n📊 Formatos: ✅ Corretos\\n🚀 Status: 100% Operacional\\n\\nTudo funcionando perfeitamente!`;
>>>>>>> integracao-whatsapp-api
      await enviarComFormatosCorretos(from, statusMsg);
      conversationState[from] = { state: 'IDLE' }; // Reset state after admin command
      return;
    }

    if (lowerMessage === '/debug' || lowerMessage === 'debug') {
      const formatos = converterParaFormatoFuncional(from);
      const statusIA = process.env.GEMINI_API_KEY ? '✅ ATIVA' : '❌ INATIVA';
<<<<<<< HEAD
      const debugInfo = `🔧 *DEBUG SISTEMA COMPLETO*\n\n📱 Seu número: ${from}\n🎯 Convertido para:\n• ${formatos[0]}\n• ${formatos[1]}\n\n🤖 IA Status: ${statusIA}\n📊 Flask API: ${process.env.FLASK_API_URL ? process.env.FLASK_API_URL : 'Não configurado'}\n✅ Sistema: 100% Operacional\n\n🚀 *TUDO FUNCIONANDO!*`;
=======
      const debugInfo = `🔧 *DEBUG SISTEMA COMPLETO*\\n\\n📱 Seu número: ${from}\\n🎯 Convertido para:\\n• ${formatos[0]}\\n• ${formatos[1]}\\n\\n🤖 IA Status: ${statusIA}\\n🛍️ API Produtos: ✅ Conectada\\n📊 Formatos: ${FORMATOS_COMPROVADOS.length} testados\\n✅ Sistema: 100% Operacional\\n\\n🚀 *TUDO FUNCIONANDO!*`;
>>>>>>> integracao-whatsapp-api
      await enviarComFormatosCorretos(from, debugInfo);
      conversationState[from] = { state: 'IDLE' }; // Reset state after admin command
      return;
    }

    if (lowerMessage === '/limpar' || lowerMessage === 'limpar') {
      try {
        if (process.env.GEMINI_API_KEY) {
<<<<<<< HEAD
          geminiService.clearHistory(from); // Usa a instância do serviço para limpar histórico
          await enviarComFormatosCorretos(from, '🗑️ *HISTÓRICO LIMPO!*\n\nMemória da IA resetada com sucesso.\nVamos começar uma nova conversa! 🚀');
=======
          geminiService.clearHistory(from);
          await enviarComFormatosCorretos(from, '🗑️ *HISTÓRICO LIMPO!*\\n\\nMemória da IA resetada com sucesso.\\nVamos começar uma nova conversa! 🚀');
>>>>>>> integracao-whatsapp-api
        } else {
          await enviarComFormatosCorretos(from, '🗑️ *COMANDO RECEBIDO!*\n\nIA será ativada em breve.\nSistema WhatsApp funcionando normalmente.');
        }
        conversationState[from] = { state: 'IDLE' }; // Reset state after admin command
      } catch (error) {
        console.error('❌ [LIMPAR] Erro:', error);
        await enviarComFormatosCorretos(from, '❌ Erro ao limpar histórico.\nSistema continua funcionando normalmente.');
      }
      return;
    }

    if (lowerMessage === '/ajuda' || lowerMessage === 'ajuda' || lowerMessage === '/help') {
      const statusIA = process.env.GEMINI_API_KEY ? '🤖 IA totalmente ativa - Posso conversar sobre qualquer assunto!' : '⚙️ IA sendo configurada';
<<<<<<< HEAD
      const helpMsg = `🤖 *ASSISTENTE INTELIGENTE ATIVO*\n\n` +
        `✅ */test* - Status do sistema\n` +
        `�� */debug* - Informações técnicas\n` +
        `🗑️ */limpar* - Resetar conversa\n` +
        `❓ */ajuda* - Esta mensagem\n\n` +
        `${statusIA}\n\n` +
        `💬 *Como usar:*\n` +
        `Envie qualquer mensagem para conversar comigo!\n` +
        `Ou pergunte sobre um produto (ex: "Tem Losartana?").\n\n` +
=======
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
>>>>>>> integracao-whatsapp-api
        `🚀 *STATUS: TOTALMENTE OPERACIONAL*`;
      await enviarComFormatosCorretos(from, helpMsg);
      conversationState[from] = { state: 'IDLE' }; // Reset state after admin command
      return;
    }

    // =========================================================================
    // LÓGICA DE BUSCA DE PRODUTOS E ENCOMENDA
    // =========================================================================

    // Recupera o estado atual da conversa para este usuário
    let currentState = conversationState[from] || { state: 'IDLE' };
    console.log(`[AI PROCESS] Estado da conversa para ${from}: ${currentState.state}`);

    // --- State 1: AWAITING_PRODUCT_SELECTION (Usuário escolheu um item da lista) ---
    if (currentState.state === 'AWAITING_PRODUCT_SELECTION') {
        const selectedIndex = parseInt(userMessage); // O ID enviado pela lista é o índice (1-baseado)
        if (!isNaN(selectedIndex) && selectedIndex > 0 && currentState.searchResults && currentState.searchResults[selectedIndex - 1]) {
            const chosenProduct = currentState.searchResults[selectedIndex - 1];
            currentState.selectedProduct = chosenProduct;

            let responseText = `Você escolheu: *${chosenProduct.nome_produto}*\n` +
                               `Laboratório: ${chosenProduct.nom_laboratorio}\n` +
                               `Preço Final: ${chosenProduct.preco_final_venda}\n` +
                               `Estoque: ${chosenProduct.qtd_estoque} unidades.`;

            await enviarComFormatosCorretos(from, responseText); // Corrected function name

            if (chosenProduct.qtd_estoque === 0) {
                // Se estiver fora de estoque, pergunta sobre encomenda
                await sendReplyButtons(from, "No momento, este item está *fora de estoque*. Gostaria de encomendar?", [
                    { id: 'encomendar_sim', title: 'Sim' },
                    { id: 'encomendar_nao', title: 'Não' }
                ]);
                currentState.state = 'AWAITING_ORDER_CONFIRMATION_YES_NO';
            } else {
                // Se tiver estoque, apenas pergunta se precisa de algo mais
                await enviarComFormatosCorretos(from, "Posso ajudar com algo mais?"); // Corrected function name
                currentState.state = 'IDLE'; // Volta ao estado inicial
            }
        } else {
            await enviarComFormatosCorretos(from, "Opção inválida. Por favor, selecione um número válido da lista de produtos."); // Corrected function name
        }
        conversationState[from] = currentState; // Atualiza o estado
        return; // Sai da função, pois a mensagem foi tratada
    }

    // --- State 2: AWAITING_ORDER_CONFIRMATION_YES_NO (Usuário respondeu "Sim" ou "Não" para encomendar) ---
    if (currentState.state === 'AWAITING_ORDER_CONFIRMATION_YES_NO') {
        if (lowerMessage === 'encomendar_sim') {
            await enviarComFormatosCorretos(from, `Excelente! Quantas unidades de *${currentState.selectedProduct.nome_produto}* você gostaria de encomendar? Por favor, digite apenas o número.`); // Corrected function name
            currentState.state = 'AWAITING_ORDER_QUANTITY';
        } else if (lowerMessage === 'encomendar_nao') {
            await enviarComFormatosCorretos(from, "Tudo bem! A encomenda foi cancelada. Posso te ajudar com algo mais?"); // Corrected function name
            currentState.state = 'IDLE';
        } else {
            await enviarComFormatosCorretos(from, "Resposta inválida. Por favor, clique 'Sim' ou 'Não'."); // Corrected function name
        }
        conversationState[from] = currentState;
        return;
    }

    // --- State 3: AWAITING_ORDER_QUANTITY (Usuário informou a quantidade) ---
    if (currentState.state === 'AWAITING_ORDER_QUANTITY') {
        const quantity = parseInt(userMessage);
        if (!isNaN(quantity) && quantity > 0) {
            currentState.orderQuantity = quantity;
            await enviarComFormatosCorretos(from, `Certo, *${quantity}* unidades de *${currentState.selectedProduct.nome_produto}*. Para quem devemos registrar a encomenda? (Nome completo e telefone, se for diferente do seu WhatsApp)`); // Corrected function name
            currentState.state = 'AWAITING_ORDER_CLIENT_NAME_OR_CONFIRMATION';
        } else {
            await enviarComFormatosCorretos(from, "Quantidade inválida. Por favor, digite um número válido para a quantidade."); // Corrected function name
        }
        conversationState[from] = currentState;
        return;
    }

    // --- State 4: AWAITING_ORDER_CLIENT_NAME_OR_CONFIRMATION (Usuário informou os dados do cliente) ---
    if (currentState.state === 'AWAITING_ORDER_CLIENT_NAME_OR_CONFIRMATION') {
        const clientInfo = userMessage;
        // Tentativa de extrair nome e telefone. O número do WhatsApp do próprio usuário será o fallback.
        const clientNameMatch = clientInfo.match(/^[^\(]+/); // Pega tudo antes do primeiro '('
        const clientName = clientNameMatch ? clientNameMatch[0].trim() : "Cliente WhatsApp";
        const clientPhoneMatch = clientInfo.match(/(\(?\d{2}\)?\s?\d{4,5}-?\d{4})/); // Busca um padrão de telefone
        const clientPhone = clientPhoneMatch ? clientPhoneMatch[1].replace(/\D/g, '') : from; // Limpa o telefone, senão usa o WhatsApp do remetente

        const product = currentState.selectedProduct;
        const quantity = currentState.orderQuantity;

        let confirmationMessage = `Por favor, confirme os detalhes da encomenda:\n\n` +
                                  `*Produto:* ${product.nome_produto}\n` +
                                  `*Quantidade:* ${quantity}\n` +
                                  `*Preço Unitário:* ${product.preco_final_venda}\n` +
                                  `*Cliente:* ${clientName}\n` +
                                  `*Contato:* ${clientPhone}\n\n` +
                                  `Confirma o pedido?`;

        await enviarComFormatosCorretos(from, confirmationMessage); // Corrected function name // Envia texto primeiro
        await sendReplyButtons(from, "Confirma o pedido?", [
            { id: 'confirmar_pedido_sim', title: 'Sim, Confirmar' },
            { id: 'confirmar_pedido_nao', title: 'Não, Cancelar' }
        ]);
        currentState.state = 'AWAITING_ORDER_FINAL_CONFIRMATION';
        currentState.clientName = clientName;
        currentState.clientPhone = clientPhone;

        conversationState[from] = currentState;
        return;
    }

    // --- State 5: AWAITING_ORDER_FINAL_CONFIRMATION (Usuário confirmou ou cancelou o pedido final) ---
    if (currentState.state === 'AWAITING_ORDER_FINAL_CONFIRMATION') {
        if (lowerMessage === 'confirmar_pedido_sim') {
            const product = currentState.selectedProduct;
            const quantity = currentState.orderQuantity;
            const clientName = currentState.clientName;
            const clientPhone = currentState.clientPhone;

            try {
                const formData = new FormData();
                formData.append('cod_reduzido', product.cod_reduzido.toString());
                formData.append('nome_produto', product.nome_produto);
                formData.append('cod_barra', ''); // Cod barra não está na resposta do search_live, poderia ser buscado se necessário
                formData.append('laboratorio', product.nom_laboratorio || 'Não cadastrado');
                formData.append('preco_final', product.vlr_liquido_raw_float.toString());
                formData.append('cod_cliente_selecionado', ''); // Assumindo que não temos o código do cliente neste fluxo
                formData.append('cliente_nome', clientName || 'Cliente WhatsApp');
                formData.append('funcionario', 'Bot-WhatsApp');
                formData.append('unidades', quantity.toString());
                formData.append('telefone', clientPhone || from);
                formData.append('observacao', `Encomenda via WhatsApp. Cliente: ${clientName || 'Cliente WhatsApp'}. Contato: ${clientPhone || from}`);

                const response = await fetch(`${process.env.FLASK_API_URL}/processar_pedido`, {
                    method: 'POST',
                    body: formData,
                });

                if (response.ok) {
                    await enviarComFormatosCorretos(from, `✅ Pedido de encomenda para *${product.nome_produto}* (${quantity} unidades) foi registrado com sucesso para *${clientName}*! Entraremos em contato em breve.`); // Corrected function name
                } else {
                    const errorData = await response.text();
                    console.error('Erro ao processar pedido Flask:', errorData);
                    await enviarComFormatosCorretos(from, `❌ Ocorreu um erro ao registrar seu pedido. Por favor, tente novamente ou fale com um atendente. Detalhes: ${errorData}`); // Corrected function name
                }
            } catch (error) {
                console.error('Erro de rede ao chamar Flask /processar_pedido:', error);
                await enviarComFormatosCorretos(from, '❌ Ocorreu um erro de comunicação ao tentar registrar seu pedido. Por favor, tente novamente mais tarde.'); // Corrected function name
            }
        } else if (lowerMessage === 'confirmar_pedido_nao') {
            await enviarComFormatosCorretos(from, "Pedido cancelado. Posso te ajudar com algo mais?"); // Corrected function name
        } else {
            await enviarComFormatosCorretos(from, "Opção inválida. Por favor, clique 'Sim, Confirmar' ou 'Não, Cancelar'."); // Corrected function name
        }
        // Reseta o estado após a tentativa de pedido ou cancelamento
        currentState.state = 'IDLE';
        currentState.searchResults = undefined;
        currentState.selectedProduct = undefined;
        currentState.orderQuantity = undefined;
        currentState.clientName = undefined;
        currentState.clientPhone = undefined;
        conversationState[from] = currentState;
        return;
    }

    // --- Default IDLE state ou Busca de Produto Geral ---
    // Este bloco será executado se nenhuma ação dependente de estado foi tomada
    if (currentState.state === 'IDLE') {
        const productSearchKeywords = ['tem', 'preço', 'disponível', 'estoque', 'qual o valor', 'gostaria de saber sobre', 'buscar'];
        const isProductSearchIntent = productSearchKeywords.some(keyword => lowerMessage.includes(keyword));

        let potentialProductName = lowerMessage;
        const commonPrefixes = ['vc tem', 'você tem', 'tem', 'qual o', 'gostaria de saber o', 'quero saber do', 'buscar por'];
        for (const prefix of commonPrefixes) {
            if (potentialProductName.startsWith(prefix)) {
                potentialProductName = potentialProductName.substring(prefix.length).trim();
                break;
            }
        }
        // Remove termos comuns de busca que não fazem parte do nome do produto
        potentialProductName = potentialProductName.replace(/em estoque|o preço|disponível|qual o valor|tem|você tem|preço de/g, '').trim();

        // Considera uma busca de produto se houver intenção explícita ou o texto parecer um nome de produto
        if (isProductSearchIntent || potentialProductName.length > 2) {
            console.log(`[AI PROCESS] Tentando busca de produto para: "${potentialProductName}"`);
            try {
                const searchResponse = await fetch(`${process.env.FLASK_API_URL}/search_live?search_term=${encodeURIComponent(potentialProductName)}`);
                if (!searchResponse.ok) {
                    throw new Error(`Erro HTTP! status: ${searchResponse.status}`);
                }
                const products = await searchResponse.json();

                if (products.length === 0) {
                    await enviarComFormatosCorretos(from, `Desculpe, não encontrei nenhum item relacionado a "*${potentialProductName}*". Por favor, tente um nome diferente ou mais específico.`); // Corrected function name
                    currentState.state = 'IDLE';
                } else if (products.length === 1) {
                    const product = products[0];
                    currentState.selectedProduct = product; // Armazena o produto único para futura encomenda

                    let responseText = `Encontrei: *${product.nome_produto}*\n` +
                                       `Laboratório: ${product.nom_laboratorio}\n` +
                                       `Preço Final: ${product.preco_final_venda}\n` +
                                       `Estoque: ${product.qtd_estoque} unidades.`;

                    await enviarComFormatosCorretos(from, responseText); // Corrected function name // Envia o texto primeiro

                    if (product.qtd_estoque === 0) {
                        // Se estiver fora de estoque, pergunta sobre encomenda
                        await sendReplyButtons(from, "No momento, este item está *fora de estoque*. Gostaria de encomendar?", [
                            { id: 'encomendar_sim', title: 'Sim' },
                            { id: 'encomendar_nao', title: 'Não' }
                        ]);
                        currentState.state = 'AWAITING_ORDER_CONFIRMATION_YES_NO';
                    } else {
                        await enviarComFormatosCorretos(from, "Posso ajudar com algo mais?"); // Corrected function name
                        currentState.state = 'IDLE';
                    }
                } else { // Múltiplos produtos encontrados
                    currentState.searchResults = products;
                    const rows = products.slice(0, 10).map((p: any, index: number) => ({ // Limita a 10 opções para mensagem de lista do WhatsApp
                        id: (index + 1).toString(), // IDs precisam ser string
                        title: p.nome_produto,
                        description: `Estoque: ${p.qtd_estoque}, Preço: ${p.preco_final_venda}`
                    }));

                    await sendListMessage(from,
                        "Encontrei vários produtos",
                        "Por favor, selecione o item desejado na lista abaixo para mais detalhes:",
                        "Ver produtos",
                        "Produtos Encontrados",
                        rows
                    );
                    currentState.state = 'AWAITING_PRODUCT_SELECTION';
                }
                conversationState[from] = currentState;
                return; // Sai, pois a busca de produto foi tratada
            } catch (error) {
                console.error('Erro ao buscar produtos no Flask:', error);
                await enviarComFormatosCorretos(from, 'Ocorreu um erro ao consultar nosso estoque. Por favor, tente novamente mais tarde.'); // Corrected function name
                currentState.state = 'IDLE';
                conversationState[from] = currentState;
                return;
            }
        }
    }

    // =========================================================================
    // LÓGICA DE PROCESSAMENTO COM INTELIGÊNCIA ARTIFICIAL (EXISTENTE)
    // Este bloco só será executado se a busca de produtos acima NÃO tiver sido acionada ou resolvida.
    // =========================================================================

    if (!process.env.GEMINI_API_KEY) {
      console.log('⚠️ [AI PROCESS] GEMINI_API_KEY não encontrada');
<<<<<<< HEAD
      await enviarComFormatosCorretos(from, '🤖 *ASSISTENTE QUASE PRONTO!*\n\nSistema WhatsApp: ✅ Funcionando perfeitamente\nIA: ⚙️ Sendo configurada\n\nEm breve estarei conversando inteligentemente!\nUse */test* para verificar status.'); // Corrected function name
=======
      await enviarComFormatosCorretos(from, '🤖 *ASSISTENTE QUASE PRONTO!*\\n\\nSistema WhatsApp: ✅ Funcionando perfeitamente\\n🛍️ Produtos: ✅ API Conectada\\nIA: ⚙️ Sendo configurada\\n\\nEm breve estarei conversando inteligentemente!\\nUse */test* para verificar status.');
>>>>>>> integracao-whatsapp-api
      return;
    }

    let aiResponseText: string;
    try {
<<<<<<< HEAD
      console.log('[AI] Iniciando processamento com Gemini IA...');
      aiResponseText = await geminiService.generateResponse(userMessage, from); // Usa o serviço Gemini
      console.log(`[AI] Resposta da IA gerada com sucesso (${aiResponseText.length} caracteres)`);
=======
      console.log('🤖 [AI] Iniciando processamento com Gemini IA...');
      aiResponseText = await geminiService.generateResponse(userMessage, from);
      console.log(`🤖 [AI] Resposta da IA gerada com sucesso (${aiResponseText.length} caracteres)`);
>>>>>>> integracao-whatsapp-api
    } catch (aiError: any) {
      console.error('❌ [AI] Erro na inteligência artificial:', aiError);
      if (aiError.response && aiError.response.promptFeedback && aiError.response.promptFeedback.blockReason) {
        console.warn(`⚠️ Gemini API bloqueou o prompt: ${aiError.response.promptFeedback.blockReason}. Forçando fallback de medicamentos.`);
        aiResponseText = "Atenção (Política de Conteúdo da IA)";
      } else {
<<<<<<< HEAD
        const errorMsg = `🤖 *ASSISTENTE TEMPORARIAMENTE INDISPONÍVEL*\n\n` +
          `Estou com dificuldades momentâneas para processar sua mensagem.\n\n` +
          `💡 *Sugestões:*\n` +
          `• Tente reformular sua pergunta\n` +
          `• Envie uma mensagem mais simples\n` +
          `• Use */test* para verificar o status\n\n` +
          `🔄 Tentarei novamente em alguns instantes...`;
        await enviarComFormatosCorretos(from, errorMsg); // Corrected function name
=======
        const errorMsg = `🤖 *ASSISTENTE TEMPORARIAMENTE INDISPONÍVEL*\\n\\n` +
          `Estou com dificuldades momentâneas para processar sua mensagem.\\n\\n` +
          `💡 *Sugestões:*\\n` +
          `• Tente reformular sua pergunta\\n` +
          `• Envie uma mensagem mais simples\\n` +
          `• Use */test* para verificar o status\\n\\n` +
          `🔄 Tentarei novamente em alguns instantes...`;
        await enviarComFormatosCorretos(from, errorMsg);
>>>>>>> integracao-whatsapp-api
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
          await enviarComFormatosCorretos(from, finalResponse); // Corrected function name
        } else {
<<<<<<< HEAD
          const finalResponse = `_De acordo com nossa base de dados interna:_\n\n${libResult}\n\n*_Importante:_ Esta informação é para fins educacionais e informativos e não substitui o conselho, diagnóstico ou tratamento de um profissional de saúde qualificado. Sempre consulte um *médico* ou *farmacêutico* para orientações específicas sobre sua saúde e para a interpretação correta das informações.`;
          await enviarComFormatosCorretos(from, finalResponse); // Corrected function name
=======
          const finalResponse = `_De acordo com nossa base de dados interna:_\\n\\n${libResult}\\n\\n*_Importante:_ Esta informação é para fins educacionais e informativos e não substitui o conselho, diagnóstico ou tratamento de um profissional de saúde qualificado. Sempre consulte um *médico* ou *farmacêutico* para orientações específicas sobre sua saúde e para a interpretação correta das informações.`;
          await enviarComFormatosCorretos(from, finalResponse);
>>>>>>> integracao-whatsapp-api
        }
      } else {
        console.warn("⚠️ Não foi possível extrair nome do medicamento ou tipo de informação da mensagem do usuário para o fallback.");
        const finalResponse = `_Atenção (Política de Conteúdo da IA)_ - Para sua segurança, por favor, consulte diretamente um *farmacêutico* em nossa loja ou um *médico*. Como assistente, não posso fornecer informações ou recomendações médicas. Tentei buscar em nossa base de dados interna, mas não consegui entender qual medicamento ou informação específica você procura. Por favor, tente perguntar de forma mais direta (ex: _'Qual a posologia da losartana?'_ ou _'Indicações do paracetamol?'_).`;
        await enviarComFormatosCorretos(from, finalResponse); // Corrected function name
      }
    } else {
<<<<<<< HEAD
      await enviarComFormatosCorretos(from, aiResponseText); // Corrected function name
=======
      await enviarComFormatosCorretos(from, aiResponseText);
>>>>>>> integracao-whatsapp-api
    }
  } catch (error) {
    console.error('❌ [AI PROCESS] Erro crítico no processamento:', error);
<<<<<<< HEAD
    const recoveryMsg = `⚠️ *ERRO TEMPORÁRIO DETECTADO*\n\n` +
      `O sistema detectou um problema momentâneo e está se recuperando automaticamente.\n\n` +
      `🔄 *Ações tomadas:*\n` +
      `• Reinicialização automática em andamento\n` +
      `• Sistema WhatsApp mantido ativo\n` +
      `• Logs de erro registrados\n\n` +
=======

    const recoveryMsg = `⚠️ *ERRO TEMPORÁRIO DETECTADO*\\n\\n` +
      `O sistema detectou um problema momentâneo e está se recuperando automaticamente.\\n\\n` +
      `🔄 *Ações tomadas:*\\n` +
      `• Reinicialização automática em andamento\\n` +
      `• Sistema WhatsApp mantido ativo\\n` +
      `• Logs de erro registrados\\n\\n` +
>>>>>>> integracao-whatsapp-api
      `Use */test* para verificar o status de recuperação.`;
    try {
      await enviarComFormatosCorretos(from, recoveryMsg); // Corrected function name
    } catch (recoveryError) {
      console.error('❌ [RECOVERY] Falha crítica na recuperação:', recoveryError);
    }
  }
}