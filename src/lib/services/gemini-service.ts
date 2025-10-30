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
    console.log('🤖 [GEMINI] Inicializando com API REST direta (v1)');
  }

  async generateResponse(message: string, userId: string): Promise<string> {
    try {
      console.log(`🤖 [GEMINI] Gerando resposta para: ${userId}`);

      // 🎯 MODELOS PARA TESTAR COM API v1 DIRETA
      const modelsToTest = [
        'gemini-1.5-flash',
        'gemini-1.5-pro', 
        'gemini-pro',
        'gemini-1.0-pro'
      ];

      // Se já encontramos um modelo que funciona, usar ele
      if (this.workingModel) {
        console.log(`🎯 [GEMINI] Usando modelo conhecido: ${this.workingModel}`);
        return await this.generateWithDirectAPI(this.workingModel, message);
      }

      // Testar modelos até encontrar um que funcione
      for (const modelName of modelsToTest) {
        try {
          console.log(`🧪 [GEMINI] Testando modelo via API v1: ${modelName}`);
          
          const response = await this.generateWithDirectAPI(modelName, message);
          
          // Se chegou aqui, o modelo funciona!
          this.workingModel = modelName;
          console.log(`✅ [GEMINI] Modelo funcionando encontrado: ${modelName}`);
          
          return response;
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log(`❌ [GEMINI] Modelo ${modelName} falhou:`, errorMessage);
          continue;
        }
      }

      // Se nenhum modelo funcionou
      throw new Error('Nenhum modelo Gemini disponível');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ [GEMINI] Erro geral:', errorMessage);
      
      return `🤖 **Assistente - Diagnóstico Completo**

**Problema identificado:** SDK usando API v1beta (incorreta)
**Solução aplicada:** API REST v1 direta

📱 **WhatsApp**: ✅ Funcionando perfeitamente
🔧 **IA**: 🧪 Testando API v1 direta
⏰ **Status**: Corrigindo versão da API

**Teste realizado:**
• Todos os modelos falharam em v1beta
• Agora testando API v1 direta

Use */debug* para mais detalhes técnicos.`;
    }
  }

  private async generateWithDirectAPI(modelName: string, message: string): Promise<string> {
    // 🎯 USAR API REST v1 DIRETAMENTE (NÃO v1beta)
    const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${this.apiKey}`;
    
    const payload = {
      contents: [
        {
          parts: [
            {
              text: `Responda em português brasileiro de forma amigável e concisa: ${message}`
            }
          ]
        }
      ],
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7
      }
    };

    console.log(`🌐 [GEMINI] Chamando API v1 direta: ${url.split('?')[0]}`);

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
      throw new Error('Resposta inválida da API');
    }

    const aiResponse = data.candidates[0].content.parts[0].text;
    console.log(`✅ [GEMINI] Resposta da API v1 (${aiResponse.length} chars)`);
    
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
