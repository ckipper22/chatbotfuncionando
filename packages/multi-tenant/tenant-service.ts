// packages/multi-tenant/tenant-service.ts
import { SupabaseClient } from '@supabase/supabase-js';

export interface ClientConfig {
  id: string;
  name: string;
  whatsapp_phone_id: string;
}

export interface ClientConnectionConfig {
  id: string;
  client_id: string;
  db_host: string;
  db_name: string;
  db_user: string;
  db_password_encrypted: string; // Senha criptografada
}

export class TenantService {
  private supabase: SupabaseClient;

  constructor(supabaseClient: SupabaseClient) {
    this.supabase = supabaseClient;
  }

  async identifyClient(phoneNumberId: string): Promise<ClientConfig | null> {
    console.log(`[MULTI-TENANT] Buscando cliente para Phone ID: ${phoneNumberId}`);
    const { data, error } = await this.supabase
      .from('clients')
      .select('*')
      .eq('whatsapp_phone_id', phoneNumberId)
      .single();

    if (error) {
      console.error('[MULTI-TENANT] Erro ao identificar cliente:', error.message);
      return null;
    }
    if (!data) {
      console.log(`[MULTI-TENANT] Nenhum cliente encontrado para Phone ID: ${phoneNumberId}`);
      return null;
    }
    console.log(`[MULTI-TENANT] Cliente identificado: ${data.name} (ID: ${data.id})`);
    return data as ClientConfig;
  }

  async getClientDatabaseConfig(clientId: string): Promise<ClientConnectionConfig | null> {
    console.log(`[MULTI-TENANT] Buscando configuração de DB para cliente ID: ${clientId}`);
    const { data, error } = await this.supabase
      .from('client_connections')
      .select('*')
      .eq('client_id', clientId)
      .single();

    if (error) {
      console.error('[MULTI-TENANT] Erro ao buscar config de DB:', error.message);
      return null;
    }
    if (!data) {
      console.log(`[MULTI-TENANT] Nenhuma configuração de DB encontrada para cliente ID: ${clientId}`);
      return null;
    }
    console.log(`[MULTI-TENANT] Configuração de DB encontrada para cliente ID: ${clientId}`);
    return data as ClientConnectionConfig;
  }

  // TODO: Adicionar lógica de descriptografia da senha aqui
  async decrypt(encryptedPassword: string): Promise<string> {
    // Por enquanto, retorna a própria senha, mas aqui entraria a lógica real de descriptografia
    console.warn("[MULTI-TENANT] Aviso: Descriptografia de senha não implementada. Usando senha bruta.");
    return encryptedPassword;
  }
}