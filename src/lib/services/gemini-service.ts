// src/lib/services/gemini-service.ts

import { GoogleGenerativeAI } from '@google/generative-ai'; // Manter o import, embora não usemos diretamente o objeto genAI para chamadas fetch diretas

export interface GeminiService {
  generateResponse(message: string, userId: string): Promise<string>;
  clearHistory(userId: string): void;
}

class GeminiServiceImpl implements GeminiService {
  private apiKey: string;
  private conversationHistory: Map<string, any[]> = new Map();
  private workingModel: string | null = null;
  private readonly MAX_HISTORY_MESSAGES = 10;

  // 🎯 INSTRUÇÃO DE SISTEMA ATUALIZADA
  private readonly SYSTEM_INSTRUCTION = `Você é um assistente farmacêutico amigável e prestativo, integrado ao WhatsApp, especializado em fornecer informações sobre medicamentos (bulas) e status de estoque da farmácia.

Sua prioridade é a segurança. Sob NENHUMA circunstância, forneça aconselhamento médico, diagnóstico, recomendações de dosagem ou interprete sintomas. Se for perguntado sobre um medicamento ou tratamento de saúde que envolva indicação, dosagem, ou conselho médico, sua resposta DEVE ser: "Atenção (Política de Conteúdo da IA) - Para sua segurança, por favor, consulte diretamente um farmacêutico em nossa loja ou um médico. Como assistente, não posso fornecer informações ou recomendações médicas."

**Instruções Específicas de Resposta (MUITO IMPORTANTE):**

1.  **Se a pergunta do usuário for CLARAMENTE sobre as informações de bula de um medicamento** (como posologia, indicações, efeitos colaterais, contraindicações, mecanismo de ação, interações medicamentosas, classe farmacológica, ou "tudo" sobre ele), você DEVE responder EXCLUSIVAMENTE no formato JSON, **sem texto adicional antes ou depois**.
    *   **Formato JSON para Bula:**
        \`\`\`json
        {
          "action": "get_bula_info",
          "drug": "Nome do Medicamento",
          "info_type": "tipo_de_informacao"
        }
        \`\`\`
    *   **Exemplos (e como Gemini deve responder):**
        *   Usuário: "Qual a posologia da Losartana?" -> \`{ "action": "get_bula_info", "drug": "Losartana", "info_type": "posologia" }\`
        *   Usuário: "Me diga as indicações da Sinvastatina." -> \`{ "action": "get_bula_info", "drug": "Sinvastatina", "info_type": "indicacoes" }\`
        *   Usuário: "Quais os efeitos colaterais do Diclofenaco?" -> \`{ "action": "get_bula_info", "drug": "Diclofenaco", "info_type": "efeitos colaterais" }\`
        *   Usuário: "Gostaria de saber tudo sobre o Esomeprazol." -> \`{ "action": "get_bula_info", "drug": "Esomeprazol", "info_type": "tudo" }\`
        *   Usuário: "Losartana, classe terapeutica?" -> \`{ "action": "get_bula_info", "drug": "Losartana", "info_type": "classe terapeutica" }\`
        *   Usuário: "Mecanismo de acao da Nimesulida." -> \`{ "action": "get_bula_info", "drug": "Nimesulida", "info_type": "mecanismo de acao" }\`

2.  **Se a pergunta do usuário for CLARAMENTE sobre o estoque de um medicamento**, você DEVE responder EXCLUSIVAMENTE no formato JSON, **sem texto adicional antes ou depois**.
    *   **Formato JSON para Estoque:**
        \`\`\`json
        {
          "action": "get_stock_info",
          "drug": "Nome do Medicamento"
        }
        \`\`\`
    *   **Exemplos (e como Gemini deve responder):**
        *   Usuário: "Tem Losartana em estoque?" -> \`{ "action": "get_stock_info", "drug": "Losartana" }\`
        *   Usuário: "Verificar estoque de Sinvastatina." -> \`{ "action": "get_stock_info", "drug": "Sinvastatina" }\`

3.  **Para todas as outras perguntas** que não se encaixam nas categorias acima (e não violam a política de segurança), responda de forma natural e amigável como um assistente de farmácia.`;


  constructor() {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY não configurada');
    }

    this.apiKey = apiKey;
    console.log('🤖 [GEMINI] Inicializando com modelos Gemini 2.5 (atuais) e lógica de segurança.');
  }

  async generateResponse(message: string, userId: string): Promise<string> {
    try {
      console.log(`🤖 [GEMINI] Gerando resposta para: ${userId}`);

      const modelsToTest = [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        // Estes nomes são placeholders e causaram 404.
        // Se gemini-2.5-flash e gemini-2.5-pro não funcionarem com a API v1,
        // você pode precisar de 'gemini-pro' ou 'gemini-1.0-pro'
        // 'gemini-2.5-flash-lite-preview-09-2025',
        // 'gemini-2.5-flash-preview-09-2025'
      ];
      
      // Se esta é a primeira interação, vamos tentar o gemini-pro como fallback inicial,
      // já que flash/pro 2.5 podem ser problemáticos com a v1.
      // Ou, se o workingModel já foi definido, use-o.
      let effectiveModelsToTest = [...modelsToTest]; // Usar cópia para não alterar a original

      if (!this.workingModel) {
        effectiveModelsToTest = ['gemini-pro', 'gemini-1.0-pro', ...modelsToTest];
        console.log(`⚠️ [GEMINI] Nenhum modelo funcionando ainda, expandindo lista de teste para: ${effectiveModelsToTest.join(', ')}`);
      }


      // Se já encontramos um modelo que funciona, usar ele
      if (this.workingModel) {
        console.log(`⚡ [GEMINI] Usando modelo Gemini 2.5: ${this.workingModel}`);
        return await this.generateWithDirectAPI(this.workingModel, message, userId);
      }

      // Testar modelos até encontrar um que funcione
      for (const modelName of effectiveModelsToTest) {
        try {
          console.log(`�� [GEMINI] Tentando modelo: ${modelName}`);

          const response = await this.generateWithDirectAPI(modelName, message, userId);

          // Se chegou aqui, o modelo funciona!
          this.workingModel = modelName;
          console.log(`✅ [GEMINI] Modelo Gemini funcionando: ${modelName}`);

          return response;

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log(`❌ [GEMINI] Modelo ${modelName} falhou:`, errorMessage);

          // 💡 Interrompe o teste de modelos se for um bloqueio de conteúdo
          if (errorMessage.includes('Atenção (Política de Conteúdo da IA)')) {
             throw error;
          }

          continue; // Tenta o próximo modelo
        }
      }

      // Se nenhum modelo funcionou
      throw new Error('Nenhum modelo Gemini disponível');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ [GEMINI] Erro geral:', errorMessage);

      // 💡 Se for o erro de bloqueio, retorna a mensagem amigável
      if (errorMessage.includes('Atenção (Política de Conteúdo da IA)')) {
          return errorMessage;
      }

      // Fallback original para erro de sistema
      return `🤖 **Assistente Gemini 2.5**

**Status:** Configurando modelos mais recentes
**Família:** Gemini 2.5 (outubro 2025)

📱 **WhatsApp**: ✅ Funcionando perfeitamente
⚙️ **IA**: �� Testando Gemini 2.5
⏰ **Modelos**: Atualizados para família atual

**Gemini 2.5 testados:**
• gemini-2.5-flash (recomendado)
• gemini-2.5-pro (tarefas complexas)
• gemini-2.5-flash-lite (econômico)

**Motivo da atualização:**
Modelos 1.x descontinuados em abril/2025

Use */status* para verificar progresso.`;
    }
  }

  // 💡 userId adicionado para histórico de conversação
  private async generateWithDirectAPI(modelName: string, message: string, userId: string): Promise<string> {

    // 💡 1. Gerenciamento do Histórico: Carrega o histórico e adiciona a nova mensagem
    let history = this.conversationHistory.get(userId) || []; // Use 'let' para reatribuir se necessário

    // Adicionar a mensagem atual do usuário ao histórico (antes de enviar)
    history.push({ role: 'user', parts: [{ text: message }] });

    // 💡 2. Injeção da Instrução de Sistema no Prompt
    const fullPrompt = `${this.SYSTEM_INSTRUCTION} \n\n--- Mensagem do Usuário: ${message}`;

    // Prepara o array de 'contents' para enviar à API
    // As últimas mensagens do histórico, com a instrução de sistema na última mensagem do usuário
    const contents = history.slice(-this.MAX_HISTORY_MESSAGES).map(entry => ({...entry}));
    if (contents.length > 0) {
        contents[contents.length - 1] = { role: 'user', parts: [{ text: fullPrompt }] };
    } else {
        // Isso não deve acontecer se history.push foi chamado, mas é um fallback
        contents.push({ role: 'user', parts: [{ text: fullPrompt }] });
    }


    // 🎯 API REST v1 ESTÁVEL
    const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${this.apiKey}`;

    const payload = {
      contents: contents,
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.5,
        topP: 0.8,
        topK: 40
      }
    };

    console.log(`🌐 [GEMINI] Chamando Gemini API v1: ${modelName} com ${contents.length} mensagens no histórico.`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Tentativa de parsear o erro para uma mensagem mais legível
      let parsedError = errorText;
      try {
          const errorJson = JSON.parse(errorText);
          parsedError = errorJson.error.message || errorText;
      } catch (parseError) {
          // Não foi JSON, usa o texto puro
      }
      throw new Error(`API Error ${response.status}: ${parsedError}`);
    }

    const data = await response.json();

    // �� [CORREÇÃO ROBUSTA] Tratamento de Bloqueios e Estrutura Vazia
    const firstCandidate = data.candidates ? data.candidates[0] : null;

    if (!firstCandidate || !firstCandidate.content || !firstCandidate.content.parts || firstCandidate.content.parts.length === 0) {

        // 1. Tratar Hard Block (Feedback de segurança explícito)
        if (data.promptFeedback && data.promptFeedback.blockReason) {
            const reason = data.promptFeedback.blockReason;
            const friendlyMessage = `🤖 **Atenção (Política de Conteúdo da IA)**

*Olá! Como assistente de IA, não posso fornecer informações ou recomendações diretas sobre medicamentos ou tratamentos de saúde. Isso é feito para sua segurança e para cumprir as diretrizes de conteúdo médico da Google (Motivo: ${reason}).*

**Para sua segurança e orientações precisas, por favor, consulte diretamente um farmacêutico em nossa loja ou um médico.**`;

            throw new Error(friendlyMessage);
        }

        // 2. Tratar Soft Block (MAX_TOKENS, SAFETY, ou Estrutura Vazia)
        const finishReason = firstCandidate ? firstCandidate.finishReason : 'NO_CANDIDATE';

        if (finishReason === 'MAX_TOKENS' || finishReason === 'RECITATION' || finishReason === 'SAFETY') {
            const friendlyMessage = `�� **Atenção (Política de Conteúdo da IA)**

*Ocorreu uma interrupção na geração da resposta devido à sensibilidade do tema (saúde/medicamentos). Para sua segurança, como assistente de IA, não posso fornecer informações ou recomendações diretas sobre medicamentos ou tratamentos.*

**Para sua segurança e orientações precisas, por favor, consulte diretamente um farmacêutico em nossa loja ou um médico.**`;

            throw new Error(friendlyMessage);
        }

        // 3. Falha genérica na estrutura
        throw new Error(`Resposta inválida ou incompleta da API Gemini. Motivo: ${finishReason}`);
    }


    const aiResponse = firstCandidate.content.parts[0].text;

    // 💡 3. Gerenciamento do Histórico: Adiciona a resposta do modelo e salva
    // Adiciona a resposta do modelo à variável local 'history' (que já contém a mensagem do usuário original)
    history.push({ role: 'model', parts: [{ text: aiResponse }] });

    // Atualiza o Map com o histórico completo e garante que não exceda o limite
    if (history.length > this.MAX_HISTORY_MESSAGES) {
      this.conversationHistory.set(userId, history.slice(-this.MAX_HISTORY_MESSAGES));
    } else {
      this.conversationHistory.set(userId, history);
    }

    console.log(`✅ [GEMINI] Resposta Gemini (${aiResponse.length} chars). Histórico atualizado.`);

    return aiResponse;
  }

  clearHistory(userId: string): void {
    console.log(`��️ [GEMINI] Histórico limpo: ${userId}`);
    this.conversationHistory.delete(userId);
  }
}

let geminiServiceInstance: GeminiService | null = null;

export function getGeminiService(): GeminiService {
  if (!geminiServiceInstance) {
    geminiServiceInstance = new GeminiServiceImpl();
  }
  return geminiServiceInstance;
}