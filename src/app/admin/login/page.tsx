'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!supabase) {
        setError('❌ Supabase não está configurado');
        setLoading(false);
        return;
      }

      // Autenticar com Supabase
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim()
      });

      if (authError || !data.user) {
        setError('❌ Email ou senha incorretos');
        setLoading(false);
        return;
      }

      // Autenticação bem-sucedida - salvar sessão
      sessionStorage.setItem('admin_authenticated', 'true');
      sessionStorage.setItem('admin_user_id', data.user.id);
      sessionStorage.setItem('admin_email', data.user.email || '');
      sessionStorage.setItem('admin_login_time', new Date().toISOString());

      // Redirecionar para painel
      router.push('/admin/conversas');

    } catch (err) {
      console.error('Erro ao fazer login:', err);
      setError('❌ Erro ao fazer login. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = () => {
    // Demo: Login simplificado para testes
    sessionStorage.setItem('admin_authenticated', 'true');
    sessionStorage.setItem('admin_user_id', 'demo-user');
    sessionStorage.setItem('admin_email', 'demo@admin.local');
    sessionStorage.setItem('admin_login_time', new Date().toISOString());
    router.push('/admin/conversas');
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-blue-600 to-blue-800 items-center justify-center">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Logo/Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-blue-600 mb-2">💊</h1>
            <h2 className="text-2xl font-bold text-gray-800">Painel Administrativo</h2>
            <p className="text-gray-600 text-sm mt-2">Farmácia Virtual - WhatsApp Bot</p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                disabled={loading}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent disabled:bg-gray-100 transition"
                required
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent disabled:bg-gray-100 transition"
                required
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="animate-spin">⏳</span> Entrando...
                </>
              ) : (
                <>🔐 Entrar</>
              )}
            </button>
          </form>

          {/* Demo Login */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-center text-xs text-gray-500 mb-3">Modo Desenvolvimento</p>
              <button
                onClick={handleDemoLogin}
                className="w-full py-2 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 transition-colors text-sm"
              >
                🧪 Login Demo
              </button>
            </div>
          )}

          {/* Info */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xs text-blue-700 text-center">
              ℹ️ Este é um painel administrativo restrito. Use suas credenciais de acesso.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <a
            href="/"
            className="text-white hover:text-blue-200 transition text-sm font-medium"
          >
            ← Voltar ao Chat
          </a>
        </div>
      </div>
    </div>
  );
}
