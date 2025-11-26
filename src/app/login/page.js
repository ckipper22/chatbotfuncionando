// src/app/login/page.js
'use client';

import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function LoginPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();

  // Redireciona para /admin/conversas se o usuário já estiver logado
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Redireciona para o dashboard após o login
        router.push('/admin/conversas');
      }
    });
  }, [router, supabase]);

  return (
    <div className="flex justify-center items-center h-screen bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-8 bg-white shadow-lg rounded-xl">
        <h2 className="text-2xl font-bold text-center text-gray-900">
          Acesso Restrito ao Dashboard
        </h2>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          // A URL de redirecionamento DEVE ser a do Vercel
          redirectTo={`https://chatbotfuncionando.vercel.app/admin/conversas`}
          view="sign_in"
        />
      </div>
    </div>
  );
}