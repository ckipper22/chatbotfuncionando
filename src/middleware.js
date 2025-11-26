// src/middleware.js
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';

export async function middleware(req) {
  const res = NextResponse.next();

  // Verificar se Supabase está configurado
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    // Se Supabase não está configurado, permite acesso sem autenticação
    // As páginas individuais mostrarão mensagem de configuração necessária
    return res;
  }

  try {
    const supabase = createMiddlewareClient({ req, res });

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const adminRoute = req.nextUrl.pathname.startsWith('/admin');

    // Redireciona para /login se não houver sessão na rota /admin
    if (adminRoute && !session) {
      const redirectUrl = new URL('/login', req.url);
      return NextResponse.redirect(redirectUrl);
    }
  } catch (error) {
    console.error('Erro no middleware de autenticação:', error);
    // Em caso de erro, permite acesso (a página mostrará erro apropriado)
  }

  return res;
}

// Protege todas as sub-rotas de /admin
export const config = {
  matcher: ['/admin/:path*'],
};