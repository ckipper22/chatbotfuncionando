export interface GeminiService {
  generateResponse(message: string, userId: string): Promise<string>;
  clearHistory(userId: string): void;
}

class GeminiServiceImpl implements GeminiService {
  private apiKey: string;
  // ­ƒÆí Implementa├º├úo para salvar o hist├│rico por usu├írio
  private conversationHistory: Map<string, any[]> = new Map(); 
  private workingModel: string | null = null;
  private readonly MAX_HISTORY_MESSAGES = 10; 
  
  // ­ƒÄ» INSTRU├ç├âO DE SISTEMA (Injetada no prompt para compatibilidade com API V1)
  private readonly SYSTEM_INSTRUCTION = `Voc├¬ ├® um assistente inteligente de uma farm├ícia integrado ao WhatsApp. Sua principal fun├º├úo ├® fornecer informa├º├Áes gerais sobre produtos, hor├írio de funcionamento e localiza├º├úo. Voc├¬ deve ser amig├ível, ├║til e conciso. Sob NENHUMA circunst├óncia, forne├ºa aconselhamento m├®dico, diagn├│stico ou recomenda├º├Áes de dosagem. Se for perguntado sobre um medicamento ou tratamento de sa├║de, sua resposta DEVE ser: "Aten├º├úo (Pol├¡tica de Conte├║do da IA) - Para sua seguran├ºa, por favor, consulte diretamente um farmac├¬utico em nossa loja ou um m├®dico. Como assistente, n├úo posso fornecer informa├º├Áes ou recomenda├º├Áes m├®dicas."`;

  constructor() {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY n├úo configurada');
    }
    
    this.apiKey = apiKey;
    console.log('­ƒñû [GEMINI] Inicializando com modelos Gemini 2.5 (atuais) e l├│gica de seguran├ºa.');
  }

  async generateResponse(message: string, userId: string): Promise<string> {
    try {
      console.log(`­ƒñû [GEMINI] Gerando resposta para: ${userId}`);

      // ­ƒÄ» MODELOS ATUAIS E EST├üVEIS GEMINI 2.5 (MANTIDO SUA LISTA)
      const modelsToTest = [
        'gemini-2.5-flash', 
        'gemini-2.5-pro',
        'gemini-2.5-flash-lite-preview-09-2025',
        'gemini-2.5-flash-preview-09-2025'
      ];

      // Se j├í encontramos um modelo que funciona, usar ele
      if (this.workingModel) {
        console.log(`ÔÜí [GEMINI] Usando modelo Gemini 2.5: ${this.workingModel}`);
        // ­ƒÆí userId adicionado para gerenciar hist├│rico
        return await this.generateWithDirectAPI(this.workingModel, message, userId); 
      }

      // Testar modelos da fam├¡lia 2.5 at├® encontrar um que funcione
      for (const modelName of modelsToTest) {
        try {
          console.log(`­ƒº¬ [GEMINI] Testando modelo 2.5: ${modelName}`);
          
          // ­ƒÆí userId adicionado para gerenciar hist├│rico
          const response = await this.generateWithDirectAPI(modelName, message, userId); 
          
          // Se chegou aqui, o modelo funciona!
          this.workingModel = modelName;
          console.log(`Ô£à [GEMINI] Modelo Gemini 2.5 funcionando: ${modelName}`);
          
          return response;
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log(`ÔØî [GEMINI] Modelo ${modelName} falhou:`, errorMessage);

          // ­ƒÆí Interrompe o teste de modelos se for um bloqueio de conte├║do
          if (errorMessage.includes('Aten├º├úo (Pol├¡tica de Conte├║do da IA)')) {
             throw error; 
          }
          
          continue;
        }
      }

      // Se nenhum modelo funcionou
      throw new Error('Nenhum modelo Gemini 2.5 dispon├¡vel');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('ÔØî [GEMINI] Erro geral:', errorMessage);

      // ­ƒÆí Se for o erro de bloqueio, retorna a mensagem amig├ível
      if (errorMessage.includes('Aten├º├úo (Pol├¡tica de Conte├║do da IA)')) {
          return errorMessage;
      }
      
      // Fallback original para erro de sistema
      return `­ƒñû **Assistente Gemini 2.5**

**Status:** Configurando modelos mais recentes
**Fam├¡lia:** Gemini 2.5 (outubro 2025)

­ƒô▒ **WhatsApp**: Ô£à Funcionando perfeitamente
­ƒöº **IA**: ­ƒº¬ Testando Gemini 2.5
ÔÅ░ **Modelos**: Atualizados para fam├¡lia atual

**Gemini 2.5 testados:**
ÔÇó gemini-2.5-flash (recomendado)
ÔÇó gemini-2.5-pro (tarefas complexas)
ÔÇó gemini-2.5-flash-lite (econ├┤mico)

**Motivo da atualiza├º├úo:**
Modelos 1.x descontinuados em abril/2025

Use */status* para verificar progresso.`;
    }
  }

  // ­ƒÆí userId adicionado para hist├│rico de conversa├º├úo
  private async generateWithDirectAPI(modelName: string, message: string, userId: string): Promise<string> {
    
    // ­ƒÆí 1. Gerenciamento do Hist├│rico: Carrega o hist├│rico e adiciona a nova mensagem
    const history = this.conversationHistory.get(userId) || [];
    
    // Adicionar a mensagem atual do usu├írio ao hist├│rico (antes de enviar)
    history.push({ role: 'user', parts: [{ text: message }] });

    // ­ƒÆí 2. Inje├º├úo da Instru├º├úo de Sistema no Prompt
    const fullPrompt = `${this.SYSTEM_INSTRUCTION} \n\n--- Mensagem do Usu├írio: ${message}`;
    
    // O hist├│rico DEVE ser recriado para garantir que a instru├º├úo de sistema entre na ├║ltima mensagem
    const contents = history.slice(-this.MAX_HISTORY_MESSAGES); 
    
    // Substitui a ├║ltima mensagem do usu├írio pelo prompt completo com a instru├º├úo de sistema
    // Isso garante que a API V1 aceite o payload.
    if (contents.length > 0) {
        contents[contents.length - 1] = { role: 'user', parts: [{ text: fullPrompt }] };
    } else {
        contents.push({ role: 'user', parts: [{ text: fullPrompt }] });
    }
    
    // ­ƒÄ» API REST v1 EST├üVEL COM MODELOS GEMINI 2.5
    const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${this.apiKey}`;
    
    const payload = {
      // ­ƒÆí Contents agora inclui o hist├│rico e a instru├º├úo de sistema
      contents: contents, 
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.5, // Ô¼ç´©Å Reduzido para maior factualidade e seguran├ºa
        topP: 0.8,
        topK: 40
      }
    };

    console.log(`­ƒîÉ [GEMINI] Chamando Gemini 2.5: ${modelName} com ${contents.length} mensagens no hist├│rico.`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    // ­ƒÜÇ [CORRE├ç├âO ROBUSTA] Tratamento de Bloqueios e Estrutura Vazia
    const firstCandidate = data.candidates ? data.candidates[0] : null;

    if (!firstCandidate || !firstCandidate.content || !firstCandidate.content.parts || firstCandidate.content.parts.length === 0) {
        
        // 1. Tratar Hard Block (Feedback de seguran├ºa expl├¡cito)
        if (data.promptFeedback && data.promptFeedback.blockReason) {
            const reason = data.promptFeedback.blockReason;
            const friendlyMessage = `­ƒñû **Aten├º├úo (Pol├¡tica de Conte├║do da IA)**
              
*Ol├í! Como assistente de IA, n├úo posso fornecer informa├º├Áes ou recomenda├º├Áes diretas sobre medicamentos ou tratamentos de sa├║de. Isso ├® feito para sua seguran├ºa e para cumprir as diretrizes de conte├║do m├®dico da Google (Motivo: ${reason}).*
              
**Para sua seguran├ºa e orienta├º├Áes precisas, por favor, consulte diretamente um farmac├¬utico em nossa loja ou um m├®dico.**`;

            throw new Error(friendlyMessage); 
        }

        // 2. Tratar Soft Block (MAX_TOKENS, SAFETY, ou Estrutura Vazia)
        const finishReason = firstCandidate ? firstCandidate.finishReason : 'NO_CANDIDATE';
        
        if (finishReason === 'MAX_TOKENS' || finishReason === 'RECITATION' || finishReason === 'SAFETY') {
            // Retorna a mensagem amig├ível de bloqueio
            const friendlyMessage = `­ƒñû **Aten├º├úo (Pol├¡tica de Conte├║do da IA)**
              
*Ocorreu uma interrup├º├úo na gera├º├úo da resposta devido ├á sensibilidade do tema (sa├║de/medicamentos). Para sua seguran├ºa, como assistente de IA, n├úo posso fornecer informa├º├Áes ou recomenda├º├Áes diretas sobre medicamentos ou tratamentos.*
              
**Para sua seguran├ºa e orienta├º├Áes precisas, por favor, consulte diretamente um farmac├¬utico em nossa loja ou um m├®dico.**`;
            
            throw new Error(friendlyMessage);
        }

        // 3. Falha gen├®rica na estrutura
        throw new Error(`Resposta inv├ílida ou incompleta da API Gemini 2.5. Motivo: ${finishReason}`);
    }


    const aiResponse = firstCandidate.content.parts[0].text;
    
    // ­ƒÆí 3. Gerenciamento do Hist├│rico: Adiciona a resposta do modelo e salva
    history.push({ role: 'model', parts: [{ text: aiResponse }] });
    this.conversationHistory.set(userId, history);

    console.log(`Ô£à [GEMINI] Resposta Gemini 2.5 (${aiResponse.length} chars). Hist├│rico atualizado.`);
    
    return aiResponse;
  }

  clearHistory(userId: string): void {
    console.log(`­ƒùæ´©Å [GEMINI] Hist├│rico limpo: ${userId}`);
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
