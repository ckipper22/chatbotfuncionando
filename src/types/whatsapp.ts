
export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  webhookVerifyToken: string;
  businessAccountId?: string;
  apiVersion?: string;
}

export interface WhatsAppMessage {
  id: string;
  from: string;
  to: string;
  timestamp: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'template';
  direction: 'inbound' | 'outbound';
  status?: 'sent' | 'delivered' | 'read' | 'failed';
  content: {
    text?: string;
    mediaUrl?: string;
    caption?: string;
    mimeType?: string;
    filename?: string;
  };
  error?: string;
}

export interface WhatsAppContact {
  phoneNumber: string;
  name?: string;
  lastMessageAt: string;
  messageCount: number;
  unreadCount: number;
}

export interface WebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: {
            name: string;
          };
          wa_id: string;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: {
            body: string;
          };
          image?: {
            id: string;
            mime_type: string;
            sha256: string;
            caption?: string;
          };
          video?: {
            id: string;
            mime_type: string;
            sha256: string;
            caption?: string;
          };
          audio?: {
            id: string;
            mime_type: string;
            sha256: string;
          };
          document?: {
            id: string;
            mime_type: string;
            sha256: string;
            filename?: string;
            caption?: string;
          };
        }>;
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: string;
          recipient_id: string;
          errors?: Array<{
            code: number;
            title: string;
            message: string;
          }>;
        }>;
      };
      field: string;
    }>;
  }>;
}

export interface MessageStats {
  totalSent: number;
  totalReceived: number;
  delivered: number;
  read: number;
  failed: number;
}
