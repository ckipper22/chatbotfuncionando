import { GoogleGenerativeAI } from '@google/generative-ai';

export interface GeminiService {
  generateResponse(message: string, userId: string): Promise<string>;
  clearHistory(userId: string): void;
}

class GeminiServiceImpl implements GeminiService {
  private genAI: GoogleGenerativeAI;
  private conversationHistory: Map<string, any[]> = new Map();

  constructor() {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY não configurada');
    }
    
    console.log('🤖 [GEMINI] Inicializando com modelo correto');
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async generateResponse(message: string, userId: string): Promise<string> {
    try {
      console.log(`🤖 [GEMINI] Gerando resposta para: ${userId}`);

      // ✅ MODELO CORRETO QUE FUNCIONA
      const model = this.genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        generationConfig: {
          maxOutputTokens: 1000,
          temperature: 0.7,
        },
      });

      console.log('🤖 [GEMINI] Usando modelo: gemini-1.5-flash');

      // Gerar resposta simples (sem histórico complexo)
      const result = await model.generateContent([
        { text: `Responda em português brasileiro de forma amigável: ${message}` }
      ]);
      
      const response = await result.response;
      const aiResponse = response.text();

      console.log(`🤖 [GEMINI] ✅ Resposta gerada (${aiResponse.length} chars)`);
      return aiResponse;

    } catch (error) {
      console.error('❌ [GEMINI] Erro:', error);
      return 'Olá! Estou com dificuldades momentâneas. Pode tentar novamente em alguns instantes?';
    }
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
