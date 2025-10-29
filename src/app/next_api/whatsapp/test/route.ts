import { NextRequest, NextResponse } from 'next/server';

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;
const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v22.0';

export async function POST(request: NextRequest) {
  try {
    console.log('🧪 Test endpoint called');
    
    // Verificação das variáveis de ambiente
    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
      console.error('❌ Missing environment variables in test endpoint');
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing environment variables',
          details: {
            WHATSAPP_PHONE_NUMBER_ID: PHONE_NUMBER_ID ? '✅ Present' : '❌ Missing',
            WHATSAPP_ACCESS_TOKEN: ACCESS_TOKEN ? '✅ Present' : '❌ Missing'
          }
        }, 
        { status: 500 }
      );
    }

    const body = await request.json();
    const { phoneNumber, message } = body;

    if (!phoneNumber) {
      return NextResponse.json(
        { success: false, error: 'Campo "phoneNumber" é obrigatório' },
        { status: 400 }
      );
    }

    console.log('🔧 Test endpoint environment check:', {
      hasPhoneNumberId: !!PHONE_NUMBER_ID,
      hasAccessToken: !!ACCESS_TOKEN,
      phoneNumberId: PHONE_NUMBER_ID,
      tokenPreview: ACCESS_TOKEN ? `${ACCESS_TOKEN.substring(0, 15)}...` : 'NO_TOKEN',
      apiVersion: API_VERSION,
      to: phoneNumber
    });

    const cleanedTo = phoneNumber.replace(/\D/g, '');
    const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;
    
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanedTo,
      type: 'text',
      text: {
        preview_url: false,
        body: message || 'Test message from WhatsApp bot',
      },
    };

    console.log('📤 Test payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    console.log('📨 Test API response:', {
      status: response.status,
      statusText: response.statusText,
      body: responseText
    });

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { raw: responseText };
    }

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        status: response.status,
        error: 'Falha no teste',
        response: result
      }, { status: response.status });
    }

    return NextResponse.json({
      success: true,
      status: response.status,
      response: result
    });

  } catch (error) {
    console.error('❌ Test endpoint error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Test failed', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}

// Endpoint GET para debug das variáveis
export async function GET(request: NextRequest) {
  const debugInfo = {
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || '❌ MISSING',
    WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN 
      ? `✅ PRESENT (${process.env.WHATSAPP_ACCESS_TOKEN.length} chars)` 
      : '❌ MISSING',
    WHATSAPP_API_VERSION: process.env.WHATSAPP_API_VERSION || 'v22.0 (default)',
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    timestamp: new Date().toISOString()
  };

  console.log('🔍 Debug endpoint called:', debugInfo);

  return NextResponse.json(debugInfo);
}
