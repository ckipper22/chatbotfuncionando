// src/app/next_api/whatsapp/webhook/route.ts

import { GoogleGenerativeAI, GenerativeModel, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
// Importação da sua biblioteca de medicamentos.
// O caminho foi ajustado conforme a estrutura de pastas confirmada:
// `route.ts` em `src/app/next_api/whatsapp/webhook/`
// `medicamentos_data.ts` em `src/Lib/`
import { getMedicamentoInfo, medicamentosData } from '../../../../Lib/medicamentos_data';

// =========================================================================
// CONFIGURAÇÃO DA API GEMINI
// =========================================================================

/**
 * Configurações de segurança para o modelo Gemini.
 *
 * A escolha de `BLOCK_NONE` para categorias como `MEDICAL` e `TOXICITY` é uma decisão estratégica.
 * Ela permite que o modelo Gemini *tente* gerar uma resposta para prompts que, de outra forma,
 * seriam bloqueados por suas políticas internas. Isso é crucial para o nosso mecanismo de fallback,
 * pois nos dá a oportunidade de interceptar essas respostas (que geralmente contêm disclaimers)
 * e, em vez de simplesmente bloquear o usuário, acionar nossa base de dados interna.
 * No entanto, essa abordagem exige que a lógica do aplicativo seja robusta na identificação
 * e tratamento dessas respostas, sempre adicionando disclaimers adequados e direcionando o usuário
 * a fontes confiáveis, especialmente em tópicos de saúde, para garantir a segurança e a responsabilidade.
 */
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_MEDICAL, threshold: HarmBlockThreshold.BLOCK_NONE }, // Permite respostas médicas para posterior tratamento.
  { category: HarmCategory.HARM_CATEGORY_TOXICITY, threshold: HarmBlockThreshold.BLOCK_NONE }, // Permite respostas potencialmente tóxicas para tratamento.
];

// Inicializa a API do Google Generative AI com a chave de API.
// A chave da API do Gemini deve ser armazenada de forma segura em variáveis de ambiente
// (e.g., `.env.local` para desenvolvimento local, ou configurações de ambiente da plataforma de deploy como Vercel).
// A verificação `process.env.GEMINI_API_KEY || ''` é uma boa prática para evitar falhas em tempo de execução
// se a variável não estiver definida, embora as chamadas à API falhem neste caso.
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
  const allDrugNames = medicamentosData.map(m => m.nome.toLowerCase());
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
// FUNÇÃO PRINCIPAL DE PROCESSAMENTO DA MENSAGEM
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
  // Em um sistema de chat real, o histórico de conversas para o 'from'
  // seria persistido em um banco de dados (ex: Redis para cache de curto prazo,
  // MongoDB ou PostgreSQL para histórico de longo prazo) e carregado aqui para
  // que a IA possa manter o contexto da conversa. Isso é feito passando um array
  // de `GenerativeContent` para o parâmetro `history` do `startChat`.
  // Para este exemplo simplificado, o chat é stateless (cada mensagem é processada isoladamente).
  const chat = model.startChat({
    history: [], // Para um chat com memória, o histórico de mensagens anteriores seria preenchido aqui.
  });

  let rawLLMResponseText: string;

  try {
    const result = await chat.sendMessage(userMessage);
    rawLLMResponseText = result.response.text();
    console.log("[AI PROCESS] Resposta inicial do Gemini:", rawLLMResponseText);
  } catch (error: any) { // Captura qualquer tipo de erro que possa ocorrer na chamada da API do Gemini.
    // O bloco `try...catch` é fundamental para lidar com falhas na comunicação com a API do Gemini.
    // Isso pode incluir erros de rede, problemas de autenticação (chave de API inválida),
    // limites de taxa excedidos ou timeouts. É crucial logar esses erros de forma estruturada
    // (e.g., com ferramentas como Sentry, DataDog, ou um logger como Winston) para monitoramento
    // e depuração em produção.
    console.error("[AI PROCESS] Erro ao chamar a API do Gemini:", error);

    // A verificação `error.response && error.response.promptFeedback && error.response.promptFeedback.blockReason`
    // é específica para identificar bloqueios de segurança explícitos do Gemini. Se o prompt do usuário
    // for categorizado como `HARASSMENT`, `HATE_SPEECH`, `SEXUALLY_EXPLICIT`, `DANGEROUS_CONTENT`, `MEDICAL`,
    // ou `TOXICITY` e o `safetySettings` não permitir, a API pode retornar um erro antes mesmo de gerar texto.
    // Nesses casos, forçamos o fallback.
    if (error.response && error.response.promptFeedback && error.response.promptFeedback.blockReason) {
      console.warn(`[AI PROCESS] Gemini API bloqueou o prompt: ${error.response.promptFeedback.blockReason}. Forçando fallback.`);
      // Se a API bloqueou, tratamos isso como um "disclaimer" e forçamos o fallback.
      rawLLMResponseText = "Atenção (Política de Conteúdo da IA)";
    } else if (error instanceof Error) {
      // Captura e informa sobre erros genéricos da API (rede, autenticação, timeouts, etc.).
      return `Desculpe, houve um erro interno ao processar sua solicitação (${error.message}). Por favor, tente novamente mais tarde.`;
    } else {
      // Captura erros de tipo desconhecido.
      return "Desculpe, houve um erro interno desconhecido ao processar sua solicitação. Por favor, tente novamente mais tarde.";
    }
  }

  // Padrão Regex para identificar o disclaimer de política de conteúdo.
  // É CRÍTICO que este regex capture EXATAMENTE as frases que sua IA (ou o Gemini)
  // usa para indicar que não pode fornecer aconselhamento médico. Durante os testes,
  // monitore as respostas da IA para identificar novas variações de disclaimers e
  // atualize este regex para garantir uma cobertura completa. Um regex bem construído
  // é a chave para o acionamento confiável do fallback.
  const medicalDisclaimerPattern = /atenção $política de conteúdo da ia$|não posso fornecer informações médicas|não sou um profissional de saúde|não estou qualificado para dar conselhos médicos|consulte um médico ou farmacêutico/i;
  const isMedicalDisclaimer = medicalDisclaimerPattern.test(rawLLMResponseText.toLowerCase());

  // Lógica principal: se a IA retornou um disclaimer ou foi bloqueada, tenta o fallback.
  if (isMedicalDisclaimer) {
    console.log("[AI PROCESS] LLM acionou o disclaimer médico ou foi bloqueado. Tentando consultar a Lib/medicamentos_data.ts como fallback.");

    // Tenta extrair o nome do medicamento e o tipo de informação da mensagem original do usuário.
    const parsedInfo = parseUserMessageForDrugInfo(userMessage);

    if (parsedInfo.drugName && parsedInfo.infoType) {
      console.log(`[AI PROCESS] Informação extraída para fallback: Medicamento: '${parsedInfo.drugName}', Tipo: '${parsedInfo.infoType}'`);
      // Consulta a base de dados interna usando a função `getMedicamentoInfo`.
      const libResult = getMedicamentoInfo(parsedInfo.drugName, parsedInfo.infoType);

      // Verifica se a Lib encontrou a informação específica ou retornou uma mensagem de "não encontrado".
      if (libResult.includes("Não encontrei informações") || libResult.includes("Não tenho a informação")) {
        // Quando o `libResult` indica que a informação específica não foi encontrada,
        // a mensagem de retorno é ajustada para ser mais concisa, mas ainda informativa.
        // Ela reforça o disclaimer médico da IA e explica que a busca interna também não
        // foi frutífera, guiando o usuário sobre como proceder.
        return `Atenção (Política de Conteúdo da IA) - Para sua segurança, por favor, consulte diretamente um farmacêutico em nossa loja ou um médico. Como assistente, não posso fornecer informações ou recomendações médicas. Tentei buscar em nossa base de dados interna, mas não encontrei a informação específica sobre '${parsedInfo.infoType}' para o medicamento '${parsedInfo.drugName}'. Por favor, procure um profissional de saúde para obter orientação.`;
      } else {
        // Sucesso na consulta da Lib. A informação é apresentada *sempre* acompanhada de um disclaimer robusto.
        // Este disclaimer é legal e eticamente necessário para qualquer sistema que forneça informações
        // relacionadas à saúde, pois a IA não é um profissional médico e as informações são apenas para fins informativos.
        return `De acordo com nossa base de dados interna:\n\n${libResult}\n\n**Importante:** Esta informação é para fins educacionais e informativos e não substitui o conselho, diagnóstico ou tratamento de um profissional de saúde qualificado. Sempre consulte um médico ou farmacêutico para orientações específicas sobre sua saúde e para a interpretação correta das informações.`;
      }
    } else {
      // Se não for possível extrair informações suficientes para o fallback, a mensagem
      // orienta o usuário a refinar sua pergunta, fornecendo exemplos de formatos mais diretos.
      // Isso melhora a experiência do usuário e a probabilidade de sucesso em futuras interações.
      console.warn("[AI PROCESS] Não foi possível extrair nome do medicamento ou tipo de informação da mensagem do usuário para o fallback.");
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
    const payload = await req.json(); // Analisa o corpo da requisição como JSON.
    // `console.log` é útil para depuração em desenvolvimento. Em ambientes de produção,
    // considere usar uma solução de logging estruturado (e.g., Winston, Pino) que permita
    // filtrar, pesquisar e analisar logs de forma eficiente. É uma boa prática também
    // redigir informações sensíveis (como números de telefone completos ou dados pessoais) dos logs.
    console.log('📦 [WEBHOOK] Payload recebido:', JSON.stringify(payload, null, 2));

    // A estrutura do payload do webhook do WhatsApp é aninhada.
    // Navegamos pelo objeto para encontrar as mensagens.
    const messages = payload.entry?.[0]?.changes?.[0]?.value?.messages;

    if (messages && messages.length > 0) {
      // console.log("[WEBHOOK]Processando" +messages.length+ "mensagem(ns)");
      // O webhook pode enviar múltiplas mensagens em um único payload,
      // embora seja mais comum uma por vez.