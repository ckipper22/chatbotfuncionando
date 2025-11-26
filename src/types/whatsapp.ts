// src/types/whatsapp.ts

export interface WhatsAppConfig {
  id?: string;
  phone_number_id: string;
  access_token: string;
  webhook_verify_token: string;
  business_account_id?: string;
  waba_id?: string;
  app_id?: string;
  is_active: boolean;
  webhook_url: string;
  created_at?: string;
  updated_at?: string;
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppEntry[];
}

export interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppChange {
  value: WhatsAppValue;
  field: string;
}

export interface WhatsAppValue {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
}

export interface WhatsAppContact {
  profile: {
    name: string;
  };
  wa_id: string;
}

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: {
    body: string;
  };
  button?: {
    text: string;
  };
  interactive?: {
    type: string;
    button_reply?: {
      id: string;
      title: string;
    };
    list_reply?: {
      id: string;
      title: string;
      description: string;
    };
  };
  context?: {
    from: string;
    id: string;
  };
}

export interface WhatsAppStatus {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
  conversation?: {
    id: string;
    expiration_timestamp?: string;
    origin?: {
      type: string;
    };
  };
  pricing?: {
    billable: boolean;
    pricing_model: string;
    category: string;
  };
}

export interface WhatsAppMessageResponse {
  messaging_product: string;
  contacts: Array<{
    input: string;
    wa_id: string;
  }>;
  messages: Array<{
    id: string;
  }>;
}

export interface WhatsAppTemplate {
  name: string;
  language: {
    code: string;
  };
  components?: any[];
}

export interface WebhookVerificationResult {
  success: boolean;
  message: string;
  details?: any;
}

export interface WhatsAppTestResult {
  success: boolean;
  message: string;
  details?: any;
}

export interface WhatsAppConnectionStatus {
  is_connected: boolean;
  phone_number: string;
  business_name?: string;
  webhook_status: 'active' | 'inactive' | 'pending';
  last_webhook_received?: string;
  message_limit?: {
    tier: string;
    usage: number;
  };
}

export interface MessageStats {
  totalSent: number;
  totalReceived: number;
  delivered: number;
  read: number;
  failed: number;
}