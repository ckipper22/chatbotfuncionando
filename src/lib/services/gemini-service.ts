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
    
    console.log('🤖 [GEMINI] Inicializando serviço com API key configurada');
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async generateResponse(message: string, userId: string): Promise<string> {
    try {
      console.log(`🤖 [GEMINI] Gerando resposta para usuário: ${userId}`);
      console.log(`🤖 [GEMINI] Mensagem: "${message}"`);

      // 🎯 USAR MODELO CORRETO - gemini-pro (modelo estável)
      const model = this.genAI.getGenerativeModel({ 
        model: 'gemini-pro' // ✅ Modelo que funciona!
      });

      // Obter histórico da conversa
      const history = this.conversationHistory.get(userId) || [];
      
      // Iniciar chat com histórico
      const chat = model.startChat({
        history: history,
        generationConfig: {
          maxOutputTokens: 1000,
          temperature: 0.7,
        },
      });

      console.log(`🤖 [GEMINI] Enviando mensagem para modelo gemini-pro...`);
      
      // Enviar mensagem
      const result = await chat.sendMessage(message);
      const response = await result.response;
      const aiResponse = response.text();

      console.log(`🤖 [GEMINI] Resposta recebida (${aiResponse.length} chars)`);

      // Atualizar histórico
      const updatedHistory = await chat.getHistory();
      this.conversationHistory.set(userId, updatedHistory);

      return aiResponse;

    } catch (error) {
      console.error('❌ [GEMINI] Erro ao gerar resposta:', error);
      
      // Resposta de fallback amigável
      return 'Desculpe, estou com dificuldades momentâneas. Pode reformular sua pergunta ou tentar novamente em alguns instantes?';
    }
  }

  clearHistory(userId: string): void {
    console.log(`🗑️ [GEMINI] Limpando histórico do usuário: ${userId}`);
    this.conversationHistory.delete(userId);
  }
}

let geminiServiceInstance: GeminiService | null = null;

export function getGeminiService(): GeminiService {
  if (!geminiServiceInstance) {
    console.log('🤖 [GEMINI] Criando nova instância do serviço');
    geminiServiceInstance = new GeminiServiceImpl();
  }
  return geminiServiceInstance;
}
