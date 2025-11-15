// packages/multi-tenant/supabase-server.ts (Para uso EXCLUSIVO no lado do servidor)
import { createClient, SupabaseClient } from '@supabase/supabase-js'; // Use createClient padrão para o servidor

// Obtenha as variáveis de ambiente (URL pode ser pública, mas a chave service_role é SECRETA)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Verificação de segurança: garantir que as variáveis estão configuradas
if (!supabaseUrl) {
  console.error('ERRO: Variável de ambiente NEXT_PUBLIC_SUPABASE_URL não configurada.');
  throw new Error('Configuração Supabase do servidor ausente: NEXT_PUBLIC_SUPABASE_URL');
}

if (!supabaseServiceRoleKey) {
  console.error('ERRO: Variável de ambiente SUPABASE_SERVICE_ROLE_KEY não configurada.');
  throw new Error('Configuração Supabase do servidor ausente: SUPABASE_SERVICE_ROLE_KEY');
}

// Interface para tipagem da conexão do cliente
interface ClientConnection {
  usid: string;
  db_password_encrypted: string;
  // Adicione outras colunas que você possa querer buscar no futuro
}

// Inicialize o cliente Supabase para o lado do servidor
const supabaseServer: SupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false, // Sessões não são persistidas em ambientes de servidor puro
  },
});

/**
 * Busca a senha criptografada de um cliente no Supabase usando o USID.
 * Esta função usa o cliente Supabase com a chave de service_role.
 * @param usid O USID do cliente.
 * @returns A senha criptografada (string) ou null se não encontrada/erro.
 */
async function getClientEncryptedPasswordByUsid(usid: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseServer
      .from('client_connections') // Sua tabela no Supabase
      .select('db_password_encrypted') // A coluna que você quer retornar
      .eq('usid', usid) // Filtra pela coluna 'usid'
      .single(); // Espera no máximo um resultado

    if (error) {
      console.error('Erro ao buscar conexão do cliente no Supabase (servidor):', error.message);
      return null;
    }

    if (!data) {
      console.warn(`Nenhuma conexão encontrada para o USID: ${usid} (servidor)`);
      return null;
    }

    return data.db_password_encrypted;

  } catch (generalError: any) {
    console.error('Erro inesperado ao tentar obter senha criptografada (servidor):', generalError.message);
    return null;
  }
}

export { supabaseServer, getClientEncryptedPasswordByUsid };