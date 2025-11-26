import { createClient } from '@supabase/supabase-js';
import ConversationsClient from './conversas-client';

const hasSupabaseConfig = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const supabase = hasSupabaseConfig 
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  : null;

async function fetchMessages() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1000);

    if (error) {
      console.error('Erro ao buscar conversas:', error);
      return [];
    }
    return data || [];
  } catch (error) {
    console.error('Erro ao conectar com Supabase:', error);
    return [];
  }
}

export default async function ConversationsPage() {
  if (!hasSupabaseConfig) {
    return (
      <div className="flex h-screen bg-gray-50 text-gray-800 items-center justify-center">
        <div className="max-w-md p-8 bg-white rounded-xl shadow-lg text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Configuração Necessária
          </h2>
          <p className="text-gray-600 mb-4">
            O Supabase não está configurado. Configure as variáveis de ambiente para visualizar as conversas:
          </p>
          <ul className="text-left text-sm text-gray-500 space-y-2 mb-4">
            <li>• NEXT_PUBLIC_SUPABASE_URL</li>
            <li>• NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
          </ul>
          <a 
            href="/"
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Voltar ao Chat
          </a>
        </div>
      </div>
    );
  }

  const messages = await fetchMessages();
  return <ConversationsClient initialMessages={messages} />;
}
