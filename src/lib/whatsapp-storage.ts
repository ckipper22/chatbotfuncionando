
import { WhatsAppConfig, WhatsAppMessage, WhatsAppContact, MessageStats } from '@/types/whatsapp';

const STORAGE_KEYS = {
  CONFIG: 'whatsapp_config',
  MESSAGES: 'whatsapp_messages',
  CONTACTS: 'whatsapp_contacts',
  STATS: 'whatsapp_stats',
};

export class WhatsAppStorage {
  static saveConfig(config: WhatsAppConfig): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
    }
  }

  static getConfig(): WhatsAppConfig | null {
    if (typeof window === 'undefined') return null;
    const data = localStorage.getItem(STORAGE_KEYS.CONFIG);
    return data ? JSON.parse(data) : null;
  }

  static clearConfig(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEYS.CONFIG);
    }
  }

  static saveMessage(message: WhatsAppMessage): void {
    if (typeof window === 'undefined') return;
    const messages = this.getMessages();
    messages.unshift(message);
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
    this.updateStats(message);
    this.updateContact(message);
  }

  static getMessages(limit?: number): WhatsAppMessage[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.MESSAGES);
    const messages = data ? JSON.parse(data) : [];
    return limit ? messages.slice(0, limit) : messages;
  }

  static getMessagesByContact(phoneNumber: string): WhatsAppMessage[] {
    const messages = this.getMessages();
    return messages.filter(
      (msg) => msg.from === phoneNumber || msg.to === phoneNumber
    );
  }

  static updateMessageStatus(messageId: string, status: string): void {
    if (typeof window === 'undefined') return;
    const messages = this.getMessages();
    const message = messages.find((msg) => msg.id === messageId);
    if (message) {
      message.status = status as any;
      localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
      this.updateStats(message);
    }
  }

  static clearMessages(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEYS.MESSAGES);
    }
  }

  static getContacts(): WhatsAppContact[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.CONTACTS);
    return data ? JSON.parse(data) : [];
  }

  static updateContact(message: WhatsAppMessage): void {
    if (typeof window === 'undefined') return;
    const contacts = this.getContacts();
    const phoneNumber = message.direction === 'inbound' ? message.from : message.to;
    
    let contact = contacts.find((c) => c.phoneNumber === phoneNumber);
    
    if (!contact) {
      contact = {
        phoneNumber,
        lastMessageAt: message.timestamp,
        messageCount: 1,
        unreadCount: message.direction === 'inbound' ? 1 : 0,
      };
      contacts.push(contact);
    } else {
      contact.lastMessageAt = message.timestamp;
      contact.messageCount = (contact.messageCount || 0) + 1;
      if (message.direction === 'inbound') {
        contact.unreadCount = (contact.unreadCount || 0) + 1;
      }
    }

    contacts.sort((a, b) => 
      new Date(b.lastMessageAt || '').getTime() - new Date(a.lastMessageAt || '').getTime()
    );

    localStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
  }

  static markContactAsRead(phoneNumber: string): void {
    if (typeof window === 'undefined') return;
    const contacts = this.getContacts();
    const contact = contacts.find((c) => c.phoneNumber === phoneNumber);
    if (contact) {
      contact.unreadCount = 0;
      localStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
    }
  }

  static clearContacts(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEYS.CONTACTS);
    }
  }

  static getStats(): MessageStats {
    if (typeof window === 'undefined') {
      return { totalSent: 0, totalReceived: 0, delivered: 0, read: 0, failed: 0 };
    }
    const data = localStorage.getItem(STORAGE_KEYS.STATS);
    return data ? JSON.parse(data) : { totalSent: 0, totalReceived: 0, delivered: 0, read: 0, failed: 0 };
  }

  private static updateStats(message: WhatsAppMessage): void {
    if (typeof window === 'undefined') return;
    const stats = this.getStats();

    if (message.direction === 'outbound') {
      stats.totalSent += 1;
    } else {
      stats.totalReceived += 1;
    }

    if (message.status === 'delivered') {
      stats.delivered += 1;
    } else if (message.status === 'read') {
      stats.read += 1;
    } else if (message.status === 'failed') {
      stats.failed += 1;
    }

    localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(stats));
  }

  static clearStats(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEYS.STATS);
    }
  }

  static clearAll(): void {
    this.clearConfig();
    this.clearMessages();
    this.clearContacts();
    this.clearStats();
  }
}
