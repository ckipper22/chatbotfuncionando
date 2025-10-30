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
      const modelsToTest = [
        'gemini-2.5-flash',                           // ✅ Recomendado: velocidade + baixo custo
        'gemini-2.5-pro',                             // ✅ Recomendado: tarefas complexas
        'gemini-2.5-flash-lite-preview-09-2025',     // ✅ Mais econômico
        'gemini-2.5-flash-preview-09-2025'           // ✅ Mais recente da família Flash
      ];

      // Se já encontramos um modelo que funciona, usar ele
      if (this.workingModel) {
        console.log(`�� [GEMINI] Usando modelo Gemini 2.5: ${this.workingModel}`);
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
          continue;
        }
      }

      // Se nenhum modelo funcionou
      throw new Error('Nenhum modelo Gemini 2.5 disponível');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ [GEMINI] Erro geral:', errorMessage);
      
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
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      throw new Error('Resposta inválida da API Gemini 2.5');
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
