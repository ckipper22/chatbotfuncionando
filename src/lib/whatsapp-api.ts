
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

  async sendTextMessage(to: string, text: string): Promise<WhatsAppMessage> {
    const url = `${this.getBaseUrl()}/messages`;
    
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to.replace(/\D/g, ''),
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
      throw new Error(error.error?.message || 'Failed to send message');
    }

    const result = await response.json();

    return {
      id: result.messages[0].id,
      from: this.config.phone_number_id,
      to: to.replace(/\D/g, ''),
      timestamp: new Date().toISOString(),
      type: 'text',
      direction: 'outbound',
      status: 'sent',
      content: {
        text,
      },
    };
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
