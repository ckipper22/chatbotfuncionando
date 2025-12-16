
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

    // 1. Adiciona o número limpo original
    formatos.add(numeroLimpo);

    // 2. Lógica para adicionar 9º dígito em números BR (55 + DDD + 8 dígitos)
    if (numeroLimpo.length === 12 && numeroLimpo.startsWith('55')) {
      const ddd = numeroLimpo.substring(2, 4);
      const numeroSemDDIeDDD = numeroLimpo.substring(4);

      // Se tiver 8 dígitos e NÃO começar com fixo (1-5), assume que é celular e adiciona o 9
      if (numeroSemDDIeDDD.length === 8 && !['1', '2', '3', '4', '5'].includes(numeroSemDDIeDDD.charAt(0))) {
        const numeroComNove = '55' + ddd + '9' + numeroSemDDIeDDD;
        formatos.add(numeroComNove);
      }
    }

    // 3. Caso o número já tenha 13 dígitos (55 + DDD + 9 + 8), tenta versão sem o 9 também (alguns sistemas antigos)
    if (numeroLimpo.length === 13 && numeroLimpo.startsWith('55')) {
      // Opcional, mas seguro
      // formatos.add(numeroLimpo); // já adicionado
    }

    return Array.from(formatos);
  }

  async sendTextMessage(to: string, text: string): Promise<WhatsAppMessage> {
    const formats = this.normalizePhoneNumber(to);
    let lastError: any;

    for (const phone of formats) {
      try {
        const url = `${this.getBaseUrl()}/messages`;

        const payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phone,
          type: 'text',
          text: {
            preview_url: false,
            body: text,
          },
        };

        const response = await fetch(url, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const error = await response.json();
          // Se for erro de destinatário (131030), lançamos para tentar o próximo formato
          throw new Error(error.error?.message || 'Failed to send message');
        }

        const result = await response.json();

        return {
          id: result.messages[0].id,
          from: this.config.phone_number_id,
          to: phone,
          timestamp: new Date().toISOString(),
          type: 'text',
          direction: 'outbound',
          status: 'sent',
          content: {
            text,
          },
        };
      } catch (error) {
        // Guarda erro e tenta próximo formato
        lastError = error;
      }
    }

    // Se saiu do loop, todos falharam
    throw lastError;
  }

  async sendMediaMessage(
    to: string,
    mediaType: 'image' | 'video' | 'audio' | 'document',
    mediaUrl: string,
    caption?: string,
    filename?: string
  ): Promise<WhatsAppMessage> {
    const url = `${this.getBaseUrl()}/messages`;

    const mediaPayload: any = {
      link: mediaUrl,
    };

    if (caption && (mediaType === 'image' || mediaType === 'video' || mediaType === 'document')) {
      mediaPayload.caption = caption;
    }

    if (filename && mediaType === 'document') {
      mediaPayload.filename = filename;
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to.replace(/\D/g, ''),
      type: mediaType,
      [mediaType]: mediaPayload,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to send media message');
    }

    const result = await response.json();

    return {
      id: result.messages[0].id,
      from: this.config.phone_number_id,
      to: to.replace(/\D/g, ''),
      timestamp: new Date().toISOString(),
      type: mediaType,
      direction: 'outbound',
      status: 'sent',
      content: {
        mediaUrl,
        caption,
        filename,
      },
    };
  }

  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string = 'pt_BR',
    components?: any[]
  ): Promise<WhatsAppMessage> {
    const url = `${this.getBaseUrl()}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to.replace(/\D/g, ''),
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: languageCode,
        },
        components: components || [],
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to send template message');
    }

    const result = await response.json();

    return {
      id: result.messages[0].id,
      from: this.config.phone_number_id,
      to: to.replace(/\D/g, ''),
      timestamp: new Date().toISOString(),
      type: 'template',
      direction: 'outbound',
      status: 'sent',
      content: {
        text: `Template: ${templateName}`,
      },
    };
  }

  async markAsRead(messageId: string): Promise<void> {
    const url = `${this.getBaseUrl()}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to mark message as read');
    }
  }

  async getMediaUrl(mediaId: string): Promise<string> {
    const url = `https://graph.facebook.com/${this.apiVersion}/${mediaId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.config.access_token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to get media URL');
    }

    const result = await response.json();
    return result.url;
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const url = `${this.getBaseUrl()}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.access_token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          message: error.error?.message || 'Falha na conexão com a API',
        };
      }

      return {
        success: true,
        message: 'Conexão estabelecida com sucesso!',
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Erro ao testar conexão',
      };
    }
  }
}
