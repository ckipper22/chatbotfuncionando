import { GoogleGenerativeAI } from '@google/generative-ai';

export interface GeminiService {
  generateResponse(message: string, userId: string): Promise<string>;
  clearHistory(userId: string): void;
}

class GeminiServiceImpl implements GeminiService {
  private genAI: GoogleGenerativeAI;
  private conversationHistory: Map<string, any[]> = new Map();
  private workingModel: string | null = null;

  constructor() {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY não configurada');
    }
    
    console.log('🤖 [GEMINI] Inicializando com teste automático de modelos');
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async generateResponse(message: string, userId: string): Promise<string> {
    try {
      console.log(`🤖 [GEMINI] Gerando resposta para: ${userId}`);

      // 🧪 LISTA DE MODELOS PARA TESTAR (DO MAIS NOVO PARA O MAIS ANTIGO)
      const modelsToTest = [
        'gemini-1.5-pro-latest',
        'gemini-1.5-flash-latest', 
        'gemini-1.5-pro',
        'gemini-1.5-flash',
        'gemini-pro',
        'gemini-1.0-pro',
        'gemini-1.0-pro-latest'
      ];

      // Se já encontramos um modelo que funciona, usar ele
      if (this.workingModel) {
        console.log(`🎯 [GEMINI] Usando modelo conhecido: ${this.workingModel}`);
        return await this.generateWithModel(this.workingModel, message);
      }

      // Testar modelos até encontrar um que funcione
      for (const modelName of modelsToTest) {
        try {
          console.log(`🧪 [GEMINI] Testando modelo: ${modelName}`);
          
          const response = await this.generateWithModel(modelName, message);
          
          // Se chegou aqui, o modelo funciona!
          this.workingModel = modelName;
          console.log(`✅ [GEMINI] Modelo funcionando encontrado: ${modelName}`);
          
          return response;
          
        } catch (error) {
          // 🔧 CORREÇÃO TYPESCRIPT: Cast do error para Error
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log(`❌ [GEMINI] Modelo ${modelName} falhou:`, errorMessage);
          continue;
        }
      }

      // Se nenhum modelo funcionou
      throw new Error('Nenhum modelo Gemini disponível');

    } catch (error) {
      // 🔧 CORREÇÃO TYPESCRIPT: Cast do error para Error
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ [GEMINI] Erro geral:', errorMessage);
      
      return `🤖 **Assistente em Configuração**

Estou testando diferentes modelos de IA para encontrar o melhor disponível.

📱 **WhatsApp**: ✅ Funcionando
🔧 **IA**: 🧪 Testando modelos
⏰ **Status**: Configuração automática

**Modelos testados:**
• gemini-1.5-pro-latest
• gemini-1.5-flash-latest  
• gemini-1.5-pro
• gemini-1.5-flash
• gemini-pro

Use */test* para verificar progresso.`;
    }
  }

  private async generateWithModel(modelName: string, message: string): Promise<string> {
    const model = this.genAI.getGenerativeModel({ 
      model: modelName,
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7,
      },
    });

    const result = await model.generateContent([
      { text: `Responda em português brasileiro de forma amigável e concisa: ${message}` }
    ]);
    
    const response = await result.response;
    const aiResponse = response.text();

    console.log(`✅ [GEMINI] Resposta de ${modelName} (${aiResponse.length} chars)`);
    return aiResponse;
  }

  clearHistory(userId: string): void {
    console.log(`🗑️ [GEMINI] Histórico limpo: ${userId}`);
    this.conversationHistory.delete(userId);
    // Não limpar o modelo funcionando
  }
}

let geminiServiceInstance: GeminiService | null = null;

export function getGeminiService(): GeminiService {
  if (!geminiServiceInstance) {
    geminiServiceInstance = new GeminiServiceImpl();
  }
  return geminiServiceInstance;
}
