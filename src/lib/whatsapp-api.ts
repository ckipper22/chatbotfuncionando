import { WhatsAppConfig, WhatsAppMessage } from '@/types/whatsapp';

const API_VERSION = 'v21.0';

export class WhatsAppAPI {
  private config: WhatsAppConfig;
  private apiVersion: string;

  constructor(config: WhatsAppConfig) {
    this.config = config;
    this.apiVersion = config.apiVersion || API_VERSION;
  }

  private getBaseUrl(): string {
    return `https://graph.facebook.com/${this.apiVersion}/${this.config.phone_number_id}`;
  }

  private getHeaders(): HeadersInit {
    return {
      'Authorization': `Bearer ${this.config.access_token}`,
      'Content-Type': 'application/json',
    };
  }

  private normalizePhoneNumber(phone: string): string[] {
    const numeroLimpo = phone.replace(/\D/g, '');
    const formatos = new Set<string>();
    formatos.add(numeroLimpo);

    if (numeroLimpo.length === 12 && numeroLimpo.startsWith('55')) {
      const ddd = numeroLimpo.substring(2, 4);
      const numeroSemDDIeDDD = numeroLimpo.substring(4);
      if (numeroSemDDIeDDD.length === 8 && !['1', '2', '3', '4', '5'].includes(numeroSemDDIeDDD.charAt(0))) {
        const numeroComNove = '55' + ddd + '9' + numeroSemDDIeDDD;
        formatos.add(numeroComNove);
      }
    }
    return Array.from(formatos);
  }

  // --- MÉTODO NOVO PARA BOTÕES (CORRIGIDO) ---
  async sendInteractiveButtons(
    to: string, 
    bodyText: string, 
    buttons: { id: string, title: string }[]
  ): Promise<WhatsAppMessage> {
    const formats = this.normalizePhoneNumber(to);
    let lastError: any;

    for (const phone of formats) {
      try {
        const url = `${this.getBaseUrl()}/messages`;
        const payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phone,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: bodyText },
            action: {
              buttons: buttons.map(btn => ({
                type: 'reply',
                reply: { id: btn.id, title: btn.title }
              }))
            }
          }
        };

        const response = await fetch(url, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || 'Failed to send interactive message');
        }

        const result = await response.json();
        return {
          id: result.messages[0].id,
          from: this.config.phone_number_id,
          to: phone,
          timestamp: new Date().toISOString(),
          type: 'interactive',
          direction: 'outbound',
          status: 'sent',
          content: { text: bodyText }
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  // --- SEUS MÉTODOS ORIGINAIS ABAIXO ---
  async sendTextMessage(to: string, text: string): Promise<WhatsAppMessage> {
    const formats = this.normalizePhoneNumber(to);
    let lastError: any;
    for (const phone of formats) {
      try {
        const url = `${this.getBaseUrl()}/messages`;
        const response = await fetch(url, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: phone,
            type: 'text',
            text: { preview_url: false, body: text },
          }),
        });
        if (!response.ok) throw new Error('Failed to send');
        const result = await response.json();
        return {
          id: result.messages[0].id,
          from: this.config.phone_number_id,
          to: phone,
          timestamp: new Date().toISOString(),
          type: 'text',
          direction: 'outbound',
          status: 'sent',
          content: { text },
        };
      } catch (error) { lastError = error; }
    }
    throw lastError;
  }

  async markAsRead(messageId: string): Promise<void> {
    const url = `${this.getBaseUrl()}/messages`;
    await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId }),
    });
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.getBaseUrl()}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      return { success: response.ok, message: response.ok ? 'Sucesso' : 'Erro' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
}
