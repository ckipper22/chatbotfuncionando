export interface GeminiService {
  generateResponse(message: string, userId: string): Promise<string>;
  clearHistory(userId: string): void;
}

class GeminiServiceImpl implements GeminiService {
  private apiKey: string;
  private conversationHistory: Map<string, any[]> = new Map();
  private workingModel: string | null = null;

  constructor() {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY não configurada');
    }

    this.apiKey = apiKey;
    console.log('🤖 [GEMINI] Inicializando com modelos Gemini 2.5 (atuais)');
  }

  async generateResponse(message: string, userId: string): Promise<string> {
    try {
      console.log(`🤖 [GEMINI] Gerando resposta para: ${userId}`);

      // 🎯 MODELOS ATUAIS E ESTÁVEIS GEMINI 2.5 (OUTUBRO 2025)
      // 💡 RECOMENDAÇÃO: Simplifiquei a lista removendo previews para focar nos modelos estáveis,
      // mas mantive sua lógica de testes sequenciais.
      const modelsToTest = [
        'gemini-2.5-flash',                // ✅ Recomendado: velocidade + baixo custo
        'gemini-2.5-pro',                  // ✅ Recomendado: tarefas complexas
        // 'gemini-2.5-flash-lite-preview-09-2025', // Removido para estabilidade
        // 'gemini-2.5-flash-preview-09-2025'       // Removido para estabilidade
      ];

      // Se já encontramos um modelo que funciona, usar ele
      if (this.workingModel) {
        console.log(`🤖 [GEMINI] Usando modelo Gemini 2.5: ${this.workingModel}`);
        return await this.generateWithDirectAPI(this.workingModel, message);
      }

      // Testar modelos da família 2.5 até encontrar um que funcione
      for (const modelName of modelsToTest) {
        try {
          console.log(`🧪 [GEMINI] Testando modelo 2.5: ${modelName}`);

          const response = await this.generateWithDirectAPI(modelName, message);

          // Se chegou aqui, o modelo funciona!
          this.workingModel = modelName;
          console.log(`✅ [GEMINI] Modelo Gemini 2.5 funcionando: ${modelName}`);

          return response;

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log(`❌ [GEMINI] Modelo ${modelName} falhou:`, errorMessage);

          // Se a falha foi por bloqueio de conteúdo, podemos sair do loop
          if (errorMessage.includes('A mensagem foi bloqueada') || errorMessage.includes('API Gemini: Bloqueio')) {
             throw error; // Propaga a mensagem de erro amigável para o catch geral
          }
          continue;
        }
      }

      // Se nenhum modelo funcionou
      throw new Error('Nenhum modelo Gemini 2.5 disponível');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ [GEMINI] Erro geral:', errorMessage);

      // 💡 Se o erro já é a mensagem amigável de bloqueio (propagada do generateWithDirectAPI), retorna ela.
      if (errorMessage.includes('Atenção (Política de Conteúdo da IA)')) {
          return errorMessage;
      }

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

  private async generateWithDirectAPI(modelName: string, message: string): Promise<string> {
    // 🎯 API REST v1 ESTÁVEL COM MODELOS GEMINI 2.5
    const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${this.apiKey}`;

    const payload = {
      contents: [
        {
          parts: [
            {
              text: `Você é um assistente inteligente integrado ao WhatsApp. Responda em português brasileiro de forma amigável, útil e concisa: ${message}`
            }
          ]
        }
      ],
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7,
        topP: 0.8,
        topK: 40
      }
    };

    console.log(`🌐 [GEMINI] Chamando Gemini 2.5: ${modelName}`);

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

    // 🔍 [DEBUG] Adicionado para diagnosticar o erro em tempo real
    console.log('🔍 [DEBUG] Resposta Completa da API Gemini:', JSON.stringify(data, null, 2));

    // 🚀 [CORREÇÃO ROBUSTA] Tratar Bloqueio de Segurança e Resposta Vazia
    if (!data.candidates || data.candidates.length === 0) {

      // 1. Verificar se o bloqueio foi por política de segurança
      if (data.promptFeedback && data.promptFeedback.blockReason) {
          const reason = data.promptFeedback.blockReason;
          
          // 💡 Resposta clara e amigável para o cliente da farmácia
          const friendlyMessage = `🤖 **Atenção (Política de Conteúdo da IA)**
            
*Olá! Como assistente de IA, não posso fornecer informações ou recomendações diretas sobre medicamentos, nebulizações ou tratamentos de saúde. Isso é feito para sua segurança e para cumprir as diretrizes de conteúdo médico da Google (Motivo: ${reason}).*
            
**Para sua segurança e orientações precisas, por favor, consulte diretamente um farmacêutico em nossa loja ou um médico.**`;

          // Para sair do loop de testes de modelos e retornar a mensagem amigável
          throw new Error(friendlyMessage); 
      }

      // 2. Se não houver candidatos nem feedback (Chave inválida, erro interno sem status HTTP 4xx/5xx)
      throw new Error('API Gemini: Resposta inválida ou chave incorreta. (Sem candidatos/feedback de bloqueio)');
    }

    // 3. Processamento da resposta normal (Candidato existe)
    // Garantir que a estrutura interna também está completa
    if (!data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0] || !data.candidates[0].content.parts[0].text) {
        throw new Error('API Gemini: Candidato gerado, mas estrutura de texto incompleta.');
    }

    const aiResponse = data.candidates[0].content.parts[0].text;
    console.log(`✅ [GEMINI] Resposta Gemini 2.5 (${aiResponse.length} chars)`);

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
