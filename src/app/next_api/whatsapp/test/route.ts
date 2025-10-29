import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { phoneNumber, message } = await request.json();
    
    // Use as mesmas variáveis de ambiente do seu webhook
    const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
    const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;
    const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v22.0';

    console.log('🔧 [TEST] Environment check:', {
      hasPhoneNumberId: !!PHONE_NUMBER_ID,
      hasAccessToken: !!ACCESS_TOKEN,
      phoneNumberId: PHONE_NUMBER_ID,
      tokenPreview: ACCESS_TOKEN ? `${ACCESS_TOKEN.substring(0, 15)}...` : 'NO_TOKEN',
      apiVersion: API_VERSION
    });

    // Verificar se as variáveis existem
    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
      return NextResponse.json({
        success: false,
        error: 'Missing environment variables',
        details: {
          WHATSAPP_PHONE_NUMBER_ID: PHONE_NUMBER_ID ? '✅ Present' : '❌ Missing',
          WHATSAPP_ACCESS_TOKEN: ACCESS_TOKEN ? '✅ Present' : '❌ Missing'
        }
      }, { status: 500 });
    }

    const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;
    
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phoneNumber.replace(/\D/g, ''),
      type: 'text',
      text: {
        preview_url: false,
        body: message || 'Test message from debug endpoint',
      },
    };

    console.log('📤 [TEST] Sending payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    console.log('📨 [TEST] WhatsApp API response:', {
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

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      response: result
    });

  } catch (error) {
    console.error('❌ [TEST] Endpoint error:', error);
    return NextResponse.json(
      { 
        error: 'Test failed', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}
