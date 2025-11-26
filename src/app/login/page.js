// src/app/login/page.js
'use client';

import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function LoginPage() {
  const [hasSupabase, setHasSupabase] = useState(true);
  const [supabase, setSupabase] = useState(null);
  const [redirectUrl, setRedirectUrl] = useState('');
  const router = useRouter();

  useEffect(() => {
    // Verificar se Supabase está configurado
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      setHasSupabase(false);
      return;
    }

    // Criar cliente Supabase
    const client = createClientComponentClient();
    setSupabase(client);

    // Definir URL de redirecionamento dinamicamente
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    setRedirectUrl(`${baseUrl}/admin/conversas`);

    // Verificar sessão existente
    client.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.push('/admin/conversas');
      }
    });
  }, [router]);

  // Se Supabase não estiver configurado
  if (!hasSupabase) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <div className="w-full max-w-md p-8 space-y-8 bg-white shadow-lg rounded-xl text-center">
          <h2 className="text-2xl font-bold text-gray-900">
            Configuração Necessária
          </h2>
          <p className="text-gray-600">
            O Supabase não está configurado. Configure as variáveis de ambiente:
          </p>
          <ul className="text-left text-sm text-gray-500 space-y-2">
            <li>• NEXT_PUBLIC_SUPABASE_URL</li>
            <li>• NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
          </ul>
        </div>
      </div>
    );
  }

  // Aguardar inicialização do cliente
  if (!supabase) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center h-screen bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-8 bg-white shadow-lg rounded-xl">
        <h2 className="text-2xl font-bold text-center text-gray-900">
          Acesso Restrito ao Dashboard
        </h2>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          redirectTo={redirectUrl}
          view="sign_in"
        />
      </div>
    </div>
  );
}