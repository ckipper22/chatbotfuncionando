import { GoogleGenerativeAI } from '@google/generative-ai';

interface ChatMessage {
  role: 'user' | 'model';
  parts: string;
}

interface ConversationHistory {
  [phoneNumber: string]: ChatMessage[];
}

class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private conversationHistory: ConversationHistory = {};
  private readonly MAX_HISTORY = 10;

  constructor() {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    
    if (!apiKey) {
      throw new Error('GOOGLE_GEMINI_API_KEY não configurada');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: 0.9,
        topK: 1,
        topP: 1,
        maxOutputTokens: 2048,
      },
    });
  }

  async generateResponse(userMessage: string, phoneNumber: string): Promise<string> {
    try {
      if (!this.conversationHistory[phoneNumber]) {
        this.conversationHistory[phoneNumber] = [];
      }

      this.conversationHistory[phoneNumber].push({
        role: 'user',
        parts: userMessage,
      });

      if (this.conversationHistory[phoneNumber].length > this.MAX_HISTORY * 2) {
        this.conversationHistory[phoneNumber] = this.conversationHistory[phoneNumber].slice(-this.MAX_HISTORY * 2);
      }

      const history = this.conversationHistory[phoneNumber].map(msg => ({
        role: msg.role,
        parts: [{ text: msg.parts }],
      }));

      const chat = this.model.startChat({
        history: history.slice(0, -1),
        generationConfig: {
          temperature: 0.9,
          topK: 1,
          topP: 1,
          maxOutputTokens: 2048,
        },
      });

      const result = await chat.sendMessage(userMessage);
      const response = result.response;
      const responseText = response.text();

      this.conversationHistory[phoneNumber].push({
        role: 'model',
        parts: responseText,
      });

      return responseText;

    } catch (error: any) {
      console.error('❌ Erro ao gerar resposta do Gemini:', error);
      
      if (error.message?.includes('API key')) {
        return 'Desculpe, há um problema com a configuração da API. Por favor, contate o administrador.';
      }
      
      if (error.message?.includes('quota')) {
        return 'Desculpe, o limite de uso da API foi atingido. Tente novamente mais tarde.';
      }

      return 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.';
    }
  }

  clearHistory(phoneNumber: string): void {
    delete this.conversationHistory[phoneNumber];
    console.log(`🗑️ Histórico limpo para: ${phoneNumber}`);
  }

  getHistory(phoneNumber: string): ChatMessage[] {
    return this.conversationHistory[phoneNumber] || [];
  }

  hasHistory(phoneNumber: string): boolean {
    return !!this.conversationHistory[phoneNumber]?.length;
  }
}

let geminiServiceInstance: GeminiService | null = null;

export function getGeminiService(): GeminiService {
  if (!geminiServiceInstance) {
    geminiServiceInstance = new GeminiService();
  }
  return geminiServiceInstance;
}

export default GeminiService;