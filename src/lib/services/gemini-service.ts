export interface GeminiService {
  generateResponse(message: string, userId: string): Promise<string>;
  clearHistory(userId: string): void;
}

class GeminiServiceImpl implements GeminiService {
  private apiKey: string;
  // 💡 VISÃO GERAL: Este Map armazena apenas o histórico simples (userId -> Array de mensagens). 
  // O Gemini REST API é stateless (sem estado), então o histórico deve ser incluído em CADA chamada.
  private conversationHistory: Map<string, any[]> = new Map();
  private workingModel: string | null = null;
  private readonly MAX_HISTORY_MESSAGES = 10; // Limita o histórico para controle de tokens

  constructor() {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      // ❌ Problema: Variável de ambiente não definida
      throw new Error('❌ GEMINI_API_KEY não configurada. Verifique as variáveis no Vercel/Ambiente.');
    }

    this.apiKey = apiKey;
    console.log('🤖 [GEMINI] Inicializando com serviço Gemini (v2.5).');
  }

  // 1. Geração de Resposta Principal com Fallback de Modelo
  async generateResponse(message: string, userId: string): Promise<string> {
    try {
      console.log(`🤖 [GEMINI] Gerando resposta para: ${userId}`);

      // 🎯 MODELOS MAIS ESTÁVEIS: Focando em modelos canônicos para evitar instabilidade de 'previews'.
      const modelsToTest = [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
      ];

      // Tenta usar o modelo que funcionou anteriormente
      if (this.workingModel) {
        console.log(`⚡ [GEMINI] Usando modelo estável: ${this.workingModel}`);
        return await this.generateWithDirectAPI(this.workingModel, message, userId);
      }

      // 🧪 Testar modelos da família 2.5 até encontrar um que funcione
      for (const modelName of modelsToTest) {
        try {
          console.log(`🧪 [GEMINI] Testando modelo: ${modelName}`);

          const response = await this.generateWithDirectAPI(modelName, message, userId);

          // Se chegou aqui, o modelo funciona!
          this.workingModel = modelName;
          console.log(`✅ [GEMINI] Modelo ${modelName} funcionando.`);

          return response;

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log(`❌ [GEMINI] Modelo ${modelName} falhou:`, errorMessage);

          // 💡 Se a falha for a mensagem de bloqueio amigável, propaga imediatamente (não tenta outros modelos)
          if (errorMessage.includes('Atenção (Política de Conteúdo da IA)')) {
             throw error; 
          }
          continue; // Tenta o próximo modelo
        }
      }

      // Se nenhum modelo funcionou
      throw new new Error('Nenhum modelo Gemini 2.5 disponível após testes.');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ [GEMINI] Erro geral:', errorMessage);

      // Se o erro for a mensagem amigável de bloqueio (propagada do generateWithDirectAPI), retorna ela.
      if (errorMessage.includes('Atenção (Política de Conteúdo da IA)')) {
          return errorMessage;
      }
      
      // Fallback para erro de sistema (Chave, API, etc.)
      return `🤖 **Assistente Gemini 2.5**\n\n**Status:** 🚨 Falha Crítica na IA.\n\n*A IA não está conseguindo processar sua solicitação neste momento. Por favor, tente novamente mais tarde. (Erro: ${errorMessage.substring(0, 50)}...)*`;
    }
  }

  // 2. Chamada Direta à API REST com Histórico e Tratamento de Erro
  private async generateWithDirectAPI(modelName: string, message: string, userId: string): Promise<string> {
    // 💡 Prevenção: Carregar e atualizar o histórico
    const history = this.conversationHistory.get(userId) || [];
    
    // Adicionar a mensagem atual do usuário ao histórico (antes de enviar)
    history.push({ role: 'user', parts: [{ text: message }] });

    // 💡 Prevenção: O Gemini REST API usa 'user' e 'model' para conversação.
    const contents = history.slice(-this.MAX_HISTORY_MESSAGES); // Limitar o histórico

    // 🎯 Configuração do Sistema (Instrução Principal)
    const systemInstruction = `Você é um assistente inteligente de uma farmácia integrado ao WhatsApp. Sua principal função é fornecer informações gerais sobre produtos, horário de funcionamento e localização da loja. Você DEVE ser amigável, útil e conciso. Sob NENHUMA circunstância, você deve fornecer aconselhamento médico, diagnóstico, recomendações de dosagem ou listar medicamentos para tratamentos específicos, pois isso viola as políticas de conteúdo e segurança. Se for perguntado sobre um medicamento específico ou tratamento de saúde, use a mensagem de bloqueio padronizada.`;

    // 🎯 API REST v1 ESTÁVEL
    const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${this.apiKey}`;
    
    const payload = {
        // 💡 Adicionado a instrução do sistema (System Instruction)
        config: {
            systemInstruction: systemInstruction,
        },
        contents: contents, // Usa o histórico para o contexto
        generationConfig: {
            maxOutputTokens: 1000,
            temperature: 0.5, // ⬇️ Reduzido para maior factualidade (Farmácia)
            topP: 0.8,
            topK: 40
        }
    };

    console.log(`🌐 [GEMINI] Chamando API com ${contents.length} mensagens no histórico.`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      // ❌ Problema: Erro de Status HTTP (400, 403, 500)
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('🔍 [DEBUG] Resposta Completa da API Gemini:', JSON.stringify(data, null, 2));

    // 🚀 [CORREÇÃO ROBUSTA FINAL] Tratamento de Bloqueios e Estrutura Vazia
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

        // 2. Tratar Soft Block (Interrupção por MAX_TOKENS ou Estrutura Vazia em Tópico Sensível)
        const finishReason = firstCandidate ? firstCandidate.finishReason : 'NO_CANDIDATE';
        
        if (finishReason === 'MAX_TOKENS' || finishReason === 'RECITATION' || finishReason === 'SAFETY') {
            const friendlyMessage = `🤖 **Atenção (Política de Conteúdo da IA)**
              
*Ocorreu uma interrupção na geração da resposta devido à sensibilidade do tema (saúde/medicamentos). Para sua segurança, como assistente de IA, não posso fornecer informações ou recomendações diretas sobre medicamentos ou tratamentos.*
              
**Para sua segurança e orientações precisas, por favor, consulte diretamente um farmacêutico em nossa loja ou um médico.**`;
            
            throw new Error(friendlyMessage);
        }

        // 3. Falha genérica na estrutura
        throw new Error(`API Gemini: Resposta inválida ou incompleta. Motivo: ${finishReason}`);
    }

    // 4. Se a resposta for válida, extrair e adicionar ao histórico
    const aiResponse = firstCandidate.content.parts[0].text;
    
    // Adicionar a resposta do modelo ao histórico para o próximo turno
    history.push({ role: 'model', parts: [{ text: aiResponse }] });
    this.conversationHistory.set(userId, history);
    
    console.log(`✅ [GEMINI] Resposta Gemini 2.5 (${aiResponse.length} chars). Histórico atualizado.`);

    return aiResponse;
  }

  // 3. Limpeza do Histórico (Para iniciar um novo tópico)
  clearHistory(userId: string): void {
    console.log(`🗑️ [GEMINI] Histórico limpo: ${userId}`);
    this.conversationHistory.delete(userId);
  }
}

// 4. Instância Singleton
let geminiServiceInstance: GeminiService | null = null;

export function getGeminiService(): GeminiService {
  if (!geminiServiceInstance) {
    geminiServiceInstance = new GeminiServiceImpl();
  }
  return geminiServiceInstance;
}
