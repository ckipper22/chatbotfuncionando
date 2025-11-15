// packages/multi-tenant/supabase-client.ts (Para uso no lado do cliente/navegador)
import { createBrowserClient } from '@supabase/ssr'; // Importa createBrowserClient para o lado do cliente

// Obtenha as variáveis de ambiente com o prefixo NEXT_PUBLIC_
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Verificação de segurança: garantir que as variáveis estão configuradas
if (!supabaseUrl) {
  console.error('ERRO: Variável de ambiente NEXT_PUBLIC_SUPABASE_URL não configurada.');
  throw new Error('Configuração Supabase do cliente ausente: NEXT_PUBLIC_SUPABASE_URL');
}

if (!supabaseAnonKey) {
  console.error('ERRO: Variável de ambiente NEXT_PUBLIC_SUPABASE_ANON_KEY não configurada.');
  throw new Error('Configuração Supabase do cliente ausente: NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

// Inicialize o cliente Supabase para o lado do cliente (navegador)
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);