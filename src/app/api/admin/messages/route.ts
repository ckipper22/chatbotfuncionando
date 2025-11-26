import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function GET(request: NextRequest) {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: 'Supabase não configurado' },
        { status: 500 }
      );
    }

    // Obter timestamp da query string para polling incremental
    const timestamp = request.nextUrl.searchParams.get('timestamp');
    const limit = 1000;

    const url = new URL(`${SUPABASE_URL}/rest/v1/whatsapp_messages`);
    url.searchParams.set('select', '*');
    url.searchParams.set('order', 'created_at.asc');
    url.searchParams.set('limit', limit.toString());

    // Se timestamp foi passado, buscar apenas mensagens mais recentes
    if (timestamp) {
      const date = new Date(parseInt(timestamp));
      url.searchParams.set('created_at', `gt.${date.toISOString()}`);
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Erro Supabase:', error);
      return NextResponse.json(
        { error: 'Erro ao buscar mensagens' },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Cache-Control para evitar problemas no Replit
    const responseHeaders = new Headers({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    return new NextResponse(JSON.stringify(data), {
      status: 200,
      headers: responseHeaders
    });

  } catch (error) {
    console.error('❌ Erro ao buscar mensagens:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
