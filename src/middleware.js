// src/middleware.js
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';

export async function middleware(req) {
  const res = NextResponse.next();
  // Usa a chave de serviço do Vercel/env para criar o cliente
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

  return res;
}

// Protege todas as sub-rotas de /admin
export const config = {
  matcher: ['/admin/:path*'],
};