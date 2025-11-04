// src/app/next_api/whatsapp/webhook/route.ts

import { GoogleGenerativeAI, GenerativeModel, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
// Importação da sua biblioteca de medicamentos.
// O caminho foi ajustado conforme a estrutura de pastas confirmada:
// `route.ts` em `src/app/next_api/whatsapp/webhook/`
// `medicamentos_data.ts` em `src/Lib/`
import { getMedicamentoInfo, medicamentosData } from '../../../../../Lib/medicamentos_data';

// =========================================================================
// CONFIGURAÇÃO DA API GEMINI
// =========================================================================

/**
 * Configurações de segurança para o modelo Gemini.
 *
 * A escolha de `BLOCK_NONE` para categorias existentes é uma decisão estratégica.
 * Ela permite que o modelo Gemini *tente* gerar uma resposta para prompts que, de outra forma,
 * seriam bloqueados por suas políticas internas. Isso é crucial para o nosso mecanismo de fallback,
 * pois nos dá a oportunidade de interceptar essas respostas (que geralmente contêm disclaimers)
 * e, em vez de simplesmente bloquear o usuário, acionar nossa base de dados interna.
 * No entanto, essa abordagem exige que a lógica do aplicativo seja robusta na identificação
 * e tratamento dessas respostas, sempre adicionando disclaimers adequados e direcionando o usuário
 * a fontes confiáveis, especialmente em tópicos de saúde, para garantir a segurança e a responsabilidade.
 *
 * NOTA: `HARM_CATEGORY_MEDICAL` e `HARM_CATEGORY_TOXICITY` não são categorias válidas no enum HarmCategory
 * do SDK do Google Generative AI e foram removidas para evitar erros de compilação.
 */
const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

// Inicializa a API do Google Generative AI com a chave de API.
// A chave da API do Gemini deve ser armazenada de forma segura em variáveis de ambiente
// (e.g., `.env.local` para desenvolvimento local, ou configurações de ambiente da plataforma de deploy como Vercel).
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Obtém o modelo generativo. O modelo `gemini-2.5-flash` é escolhido por ser otimizado
// para velocidade e custo, tornando-o ideal para interações de chatbot em tempo real
// onde a latência é crítica. Para cenários que exigem raciocínio mais complexo ou
// janelas de contexto maiores, modelos como `gemini-1.5-pro` poderiam ser considerados,
// mas com impacto na latência e custo.
const model: GenerativeModel = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  safetySettings, // Aplica as configurações de segurança definidas acima.
});

// =========================================================================
// FUNÇÃO AUXILIAR PARA PARSEAR MENSAGENS DO USUÁRIO
// =========================================================================

/**
 * Tenta extrair o nome do medicamento e o tipo de informação desejada da mensagem do usuário.
 * Esta função é crucial para o mecanismo de fallback, pois ela tenta identificar
 * a intenção do usuário para consultar a base de dados interna `medicamentosData`.
 *
 * Para uma robustez maior em cenários de produção, esta função pode ser expandida
 * com técnicas de Processamento de Linguagem Natural (NLP) mais avançadas.
 * Isso incluiria o uso de reconhecimento de entidades nomeadas (NER) para identificar
 * medicamentos e tipos de informação de forma mais precisa, ou modelos de intenção
 * para classificar a pergunta do usuário. Uma abordagem baseada em embeddings e
 * busca semântica também poderia melhorar a correspondência.
 *
 * @param message A mensagem de texto enviada pelo usuário.
 * @returns Um objeto contendo `drugName` (nome do medicamento) e `infoType` (tipo de informação),
 *          ambos opcionais, indicando se a extração foi bem-sucedida.
 */
function parseUserMessageForDrugInfo(message: string): { drugName?: string; infoType?: string } {
  const lowerMessage = message.toLowerCase();
  let drugName: string | undefined;
  let infoType: string | undefined;

  // Mapeamento de tipos de informação conhecidos e seus sinônimos.
  // Esta lista deve ser o mais abrangente possível para cobrir as diversas formas
  // como um usuário pode formular uma pergunta. A ordem dos sinônimos pode influenciar
  // a correspondência; é uma boa prática listar sinônimos mais específicos antes dos
  // mais genéricos para evitar falsos positivos. A manutenção e expansão desta lista
  // são contínuas, baseadas na análise das interações dos usuários.
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

  // 1. Tentar identificar o tipo de informação desejada.
  // Itera sobre os tipos de informação e seus sinônimos para encontrar uma correspondência na mensagem.
  for (const typeKey in infoTypeKeywords) {
    if (infoTypeKeywords[typeKey].some(keyword => lowerMessage.includes(keyword))) {
      infoType = typeKey;
      break; // Encontrou um tipo, pode parar de procurar.
    }
  }

  // 2. Tentar identificar o nome do medicamento.
  // Esta é uma abordagem robusta: percorre todos os medicamentos cadastrados na sua Lib
  // para encontrar o nome mais longo e específico que está contido na mensagem do usuário.
  // Isso ajuda a evitar correspondências parciais indesejadas (ex: "dor" em "dorflex")
  // e prioriza termos mais completos. Para medicamentos com nomes compostos ou abreviações
  // comuns, é importante que `medicamentosData` contenha essas variações ou que a lógica
  // de extração seja aprimorada para reconhecê-las.
  // Mapeamos os nomes para minúsculas para uma busca case-insensitive.
  const allDrugNames = medicamentosData.map(m => m["Nome do Medicamento"].toLowerCase());
  let bestMatchDrug: string | undefined;
  let bestMatchLength = 0;

  for (const drug of allDrugNames) {
    // Verifica se a mensagem contém o nome do medicamento e se é a correspondência mais longa encontrada até agora.
    // Correspondências mais longas são geralmente mais específicas e menos propensas a falsos positivos.
    if (lowerMessage.includes(drug) && drug.length > bestMatchLength) {
      bestMatchDrug = drug;
      bestMatchLength = drug.length;
    }
  }
  drugName = bestMatchDrug;

  // Retorna o nome do medicamento e o tipo de informação extraídos.
  return { drugName, infoType };
}

// =========================================================================
// FUNÇÃO PARA ENVIAR MENSAGENS VIA WHATSAPP BUSINESS API
// =========================================================================

/**
 * Envia uma mensagem de texto para um usuário do WhatsApp através da API do WhatsApp Business.
 * Utiliza as variáveis de ambiente WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID.
 *
 * @param to O número de telefone do destinatário no formato internacional (ex: "5511999998888").
 * @param message O conteúdo da mensagem a ser enviada.
 */
async function sendWhatsAppMessage(to: string, message: string) {
  const WHATSAPP_API_URL = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`; // Usando a nova variável WHATSAPP_PHONE_NUMBER_ID
  const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN; // Usando a nova variável WHATSAPP_ACCESS_TOKEN

  if (!ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    console.error("❌ Erro: Variáveis de ambiente WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_ACCESS_TOKEN não configuradas para envio de mensagem.");
    return;
  }

  try {
    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: {
          body: message,
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('❌ Erro ao enviar mensagem WhatsApp:', data);
    } else {
      console.log('✅ Mensagem WhatsApp enviada com sucesso:', data);
    }
  } catch (error) {
    console.error('❌ Falha na conexão ao enviar mensagem WhatsApp:', error);
  }
}

// =========================================================================
// FUNÇÃO PRINCIPAL DE PROCESSAMENTO DA MENSAGEM DO CHATBOT
// =========================================================================

/**
 * Processa uma mensagem do usuário, utilizando a IA Gemini para tentar responder.
 * Caso a IA retorne um disclaimer de política de conteúdo ou seja bloqueada,
 * a função tenta usar a base de dados interna de medicamentos (`Lib/medicamentos_data.ts`)
 * como um mecanismo de fallback.
 *
 * @param userMessage A mensagem de texto enviada pelo usuário.
 * @param from O identificador do remetente (geralmente o número de telefone do WhatsApp).
 * @returns Uma string contendo a resposta gerada para o usuário.
 */
async function processChatMessage(userMessage: string, from: string): Promise<string> {
  const chat = model.startChat({
    history: [], // Para um chat com memória, o histórico de mensagens anteriores seria preenchido aqui.
  });

  let rawLLMResponseText: string;

  try {
    const result = await chat.sendMessage(userMessage);
    rawLLMResponseText = result.response.text();
    console.log("🤖 Resposta inicial do Gemini:", rawLLMResponseText);
  } catch (error: any) {
    console.error("❌ Erro ao chamar a API do Gemini:", error);

    if (error.response && error.response.promptFeedback && error.response.promptFeedback.blockReason) {
      console.warn(`⚠️ Gemini API bloqueou o prompt: ${error.response.promptFeedback.blockReason}. Forçando fallback.`);
      rawLLMResponseText = "Atenção (Política de Conteúdo da IA)";
    } else if (error instanceof Error) {
      return `Desculpe, houve um erro interno ao processar sua solicitação (${error.message}). Por favor, tente novamente mais tarde.`;
    } else {
      return "Desculpe, houve um erro interno desconhecido ao processar sua solicitação. Por favor, tente novamente mais tarde.";
    }
  }

  // Padrão Regex para identificar o disclaimer de política de conteúdo.
  // Note que o regex para "\(política de conteúdo da ia\)" precisou de escapes duplos para funcionar no JavaScript em strings normais
  // e foi ajustado para `\\` para ser compatível com a forma como as strings são processadas pelo Vercel/Next.js no console.log
  // e potencialmente no corpo da resposta da API.
  const medicalDisclaimerPattern = /atenção \(política de conteúdo da ia\)|não posso fornecer informações médicas|não sou um profissional de saúde|não estou qualificado para dar conselhos médicos|consulte um médico ou farmacêutico/i;
  const isMedicalDisclaimer = medicalDisclaimerPattern.test(rawLLMResponseText.toLowerCase());

  // Lógica principal: se a IA retornou um disclaimer ou foi bloqueada, tenta o fallback.
  if (isMedicalDisclaimer) {
    console.log("➡️ LLM acionou o disclaimer médico ou foi bloqueado. Tentando consultar a Lib/medicamentos_data.ts como fallback.");

    const parsedInfo = parseUserMessageForDrugInfo(userMessage);

    if (parsedInfo.drugName && parsedInfo.infoType) {
      console.log(`🔎 Informação extraída para fallback: Medicamento: '${parsedInfo.drugName}', Tipo: '${parsedInfo.infoType}'`);
      const libResult = getMedicamentoInfo(parsedInfo.drugName, parsedInfo.infoType);

      if (libResult.includes("Não encontrei informações") || libResult.includes("Não tenho a informação")) {
        return `Atenção (Política de Conteúdo da IA) - Para sua segurança, por favor, consulte diretamente um farmacêutico em nossa loja ou um médico. Como assistente, não posso fornecer informações ou recomendações médicas. Tentei buscar em nossa base de dados interna, mas não encontrei a informação específica sobre '${parsedInfo.infoType}' para o medicamento '${parsedInfo.drugName}'. Por favor, procure um profissional de saúde para obter orientação.`;
      } else {
        // As quebras de linha `\n` foram escapadas para `\n` para garantir que funcionem corretamente
        // ao serem passadas como string JSON para a API do WhatsApp ou exibidas em consoles.
        return `De acordo com nossa base de dados interna:\n\n${libResult}\n\n**Importante:** Esta informação é para fins educacionais e informativos e não substitui o conselho, diagnóstico ou tratamento de um profissional de saúde qualificado. Sempre consulte um médico ou farmacêutico para orientações específicas sobre sua saúde e para a interpretação correta das informações.`;
      }
    } else {
      console.warn("⚠️ Não foi possível extrair nome do medicamento ou tipo de informação da mensagem do usuário para o fallback.");
      return "Atenção (Política de Conteúdo da IA) - Para sua segurança, por favor, consulte diretamente um farmacêutico em nossa loja ou um médico. Como assistente, não posso fornecer informações ou recomendações médicas. Tentei buscar em nossa base de dados interna, mas não consegui entender qual medicamento ou informação específica você procura. Por favor, tente perguntar de forma mais direta (ex: 'Qual a posologia da losartana?' ou 'Indicações do paracetamol?').";
    }
  } else {
    // Se o LLM deu uma resposta considerada "normal" (sem disclaimer médico),
    // a resposta é retornada diretamente ao usuário.
    return rawLLMResponseText;
  }
}

// =========================================================================
// ROTA NEXT.JS API - WEBHOOK PARA WHATSAPP BUSINESS API
// =========================================================================

/**
 * Handler para requisições POST do webhook do WhatsApp Business API.
 * Esta função é o ponto de entrada para todas as mensagens recebidas pelo seu número do WhatsApp.
 * Ela processa o payload, extrai a mensagem do usuário, chama a lógica de processamento
 * do chatbot (`processChatMessage`) e envia a resposta de volta ao usuário.
 *
 * @param req Objeto Request do Next.js, contendo o payload do webhook.
 * @returns Um objeto Response do Next.js, indicando o status do processamento.
 */
export async function POST(req: Request) {
  try {
    const payload = await req.json();
    console.log('📦 Payload recebido:', JSON.stringify(payload, null, 2));

    const messages = payload.entry?.[0]?.changes?.[0]?.value?.messages;

    if (messages && messages.length > 0) {
      console.log("➡️ Processando " + messages.length + " mensagem(ns)");

      for (const message of messages) {
        if (message.type === 'text') {
          const userMessage = message.text.body;
          const from = message.from;

          const responseText = await processChatMessage(userMessage, from);

          console.log(`💬 Resposta do bot gerada para ${from}: ${responseText}`);
          await sendWhatsAppMessage(from, responseText); // Agora com a chamada real para enviar a mensagem
        }
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error('❌ Erro no processamento do webhook:', error);
    return new Response(JSON.stringify({ error: 'Falha no processamento do webhook' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}