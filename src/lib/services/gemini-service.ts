export interface GeminiService {
  generateResponse(message: string, userId: string): Promise<string>;
  clearHistory(userId: string): void;
}

class GeminiServiceImpl implements GeminiService {
  private apiKey: string;
  // 💡 Implementação para salvar o histórico por usuário
  private conversationHistory: Map<string, any[]> = new Map(); 
  private workingModel: string | null = null;
  private readonly MAX_HISTORY_MESSAGES = 10; 
  
  // 🎯 INSTRUÇÃO DE SISTEMA (Injetada no prompt para compatibilidade com API V1)
  private readonly SYSTEM_INSTRUCTION = `Você é um assistente inteligente de uma farmácia integrado ao WhatsApp. Sua principal função é fornecer informações gerais sobre produtos, horário de funcionamento e localização. Você deve ser amigável, útil e conciso. Sob NENHUMA circunstância, forneça aconselhamento médico, diagnóstico ou recomendações de dosagem. Se for perguntado sobre um medicamento ou tratamento de saúde, sua resposta DEVE ser: "Atenção (Política de Conteúdo da IA) - Para sua segurança, por favor, consulte diretamente um farmacêutico em nossa loja ou um médico. Como assistente, não posso fornecer informações ou recomendações médicas."`;

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

      // 🎯 MODELOS ATUAIS E ESTÁVEIS GEMINI 2.5 (MANTIDO SUA LISTA)
      const modelsToTest = [
        'gemini-2.5-flash', 
        'gemini-2.5-pro',
        'gemini-2.5-flash-lite-preview-09-2025',
        'gemini-2.5-flash-preview-09-2025'
      ];

      // Se já encontramos um modelo que funciona, usar ele
      if (this.workingModel) {
        console.log(`⚡ [GEMINI] Usando modelo Gemini 2.5: ${this.workingModel}`);
        // 💡 userId adicionado para gerenciar histórico
        return await this.generateWithDirectAPI(this.workingModel, message, userId); 
      }

      // Testar modelos da família 2.5 até encontrar um que funcione
      for (const modelName of modelsToTest) {
        try {
          console.log(`🧪 [GEMINI] Testando modelo 2.5: ${modelName}`);
          
          // 💡 userId adicionado para gerenciar histórico
          const response = await this.generateWithDirectAPI(modelName, message, userId); 
          
          // Se chegou aqui, o modelo funciona!
          this.workingModel = modelName;
          console.log(`✅ [GEMINI] Modelo Gemini 2.5 funcionando: ${modelName}`);
          
          return response;
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log(`❌ [GEMINI] Modelo ${modelName} falhou:`, errorMessage);

          // 💡 Interrompe o teste de modelos se for um bloqueio de conteúdo
          if (errorMessage.includes('Atenção (Política de Conteúdo da IA)')) {
             throw error; 
          }
          
          continue;
        }
      }

      // Se nenhum modelo funcionou
      throw new Error('Nenhum modelo Gemini 2.5 disponível');

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
🔧 **IA**: 🧪 Testando Gemini 2.5
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
    const history = this.conversationHistory.get(userId) || [];
    
    // Adicionar a mensagem atual do usuário ao histórico (antes de enviar)
    history.push({ role: 'user', parts: [{ text: message }] });

    // 💡 2. Injeção da Instrução de Sistema no Prompt
    const fullPrompt = `${this.SYSTEM_INSTRUCTION} \n\n--- Mensagem do Usuário: ${message}`;
    
    // O histórico DEVE ser recriado para garantir que a instrução de sistema entre na última mensagem
    const contents = history.slice(-this.MAX_HISTORY_MESSAGES); 
    
    // Substitui a última mensagem do usuário pelo prompt completo com a instrução de sistema
    // Isso garante que a API V1 aceite o payload.
    if (contents.length > 0) {
        contents[contents.length - 1] = { role: 'user', parts: [{ text: fullPrompt }] };
    } else {
        contents.push({ role: 'user', parts: [{ text: fullPrompt }] });
    }
    
    // 🎯 API REST v1 ESTÁVEL COM MODELOS GEMINI 2.5
    const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${this.apiKey}`;
    
    const payload = {
      // 💡 Contents agora inclui o histórico e a instrução de sistema
      contents: contents, 
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.5, // ⬇️ Reduzido para maior factualidade e segurança
        topP: 0.8,
        topK: 40
      }
    };

    console.log(`🌐 [GEMINI] Chamando Gemini 2.5: ${modelName} com ${contents.length} mensagens no histórico.`);

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
    
    // 🚀 [CORREÇÃO ROBUSTA] Tratamento de Bloqueios e Estrutura Vazia
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
            // Retorna a mensagem amigável de bloqueio
            const friendlyMessage = `🤖 **Atenção (Política de Conteúdo da IA)**
              
*Ocorreu uma interrupção na geração da resposta devido à sensibilidade do tema (saúde/medicamentos). Para sua segurança, como assistente de IA, não posso fornecer informações ou recomendações diretas sobre medicamentos ou tratamentos.*
              
**Para sua segurança e orientações precisas, por favor, consulte diretamente um farmacêutico em nossa loja ou um médico.**`;
            
            throw new Error(friendlyMessage);
        }

        // 3. Falha genérica na estrutura
        throw new Error(`Resposta inválida ou incompleta da API Gemini 2.5. Motivo: ${finishReason}`);
    }


    const aiResponse = firstCandidate.content.parts[0].text;
    
    // 💡 3. Gerenciamento do Histórico: Adiciona a resposta do modelo e salva
    history.push({ role: 'model', parts: [{ text: aiResponse }] });
    this.conversationHistory.set(userId, history);

    console.log(`✅ [GEMINI] Resposta Gemini 2.5 (${aiResponse.length} chars). Histórico atualizado.`);
    
    return aiResponse;
  }

  clearHistory(userId: string): void {
    console.log(`🗑️ [GEMINI] Histórico limpo: ${userId}`);
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
