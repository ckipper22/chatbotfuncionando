import { NextRequest, NextResponse } from 'next/server';

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;
const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v22.0';

export async function POST(request: NextRequest) {
  try {
    console.log('📤 Send endpoint called');
    
    // Verificação das variáveis de ambiente
    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
      console.error('❌ Missing environment variables in send endpoint');
      return NextResponse.json(
        { 
          success: false,
          error: 'Configuration error - check environment variables' 
        }, 
        { status: 500 }
      );
    }

    const body = await request.json();
    console.log('📦 Send request body:', JSON.stringify(body, null, 2));

    const { to, type, content, config } = body;

    // Validações básicas
    if (!to) {
      return NextResponse.json(
        { success: false, error: 'Campo "to" é obrigatório' },
        { status: 400 }
      );
    }

    if (!type) {
      return NextResponse.json(
        { success: false, error: 'Campo "type" é obrigatório' },
        { status: 400 }
      );
    }

    const cleanedTo = to.replace(/\D/g, '');
    const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

    console.log('🔧 Send endpoint details:', {
      to: cleanedTo,
      type,
      phoneNumberId: PHONE_NUMBER_ID,
      apiVersion: API_VERSION,
      tokenPreview: ACCESS_TOKEN ? `${ACCESS_TOKEN.substring(0, 15)}...` : 'NO_TOKEN'
    });

    let payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanedTo,
    };

    // Construir payload baseado no tipo
    if (type === 'text') {
      if (!content?.text) {
        return NextResponse.json(
          { success: false, error: 'Campo "content.text" é obrigatório para tipo text' },
          { status: 400 }
        );
      }
      
      payload.type = 'text';
      payload.text = {
        preview_url: content.preview_url || false,
        body: content.text,
      };
    } 
    else if (['image', 'video', 'audio', 'document'].includes(type)) {
      if (!content?.mediaUrl) {
        return NextResponse.json(
          { success: false, error: `Campo "content.mediaUrl" é obrigatório para tipo ${type}` },
          { status: 400 }
        );
      }
      
      payload.type = type;
      const mediaPayload: any = {
        link: content.mediaUrl,
      };

      if (content.caption && ['image', 'video', 'document'].includes(type)) {
        mediaPayload.caption = content.caption;
      }

      if (content.filename && type === 'document') {
        mediaPayload.filename = content.filename;
      }

      payload[type] = mediaPayload;
    } 
    else if (type === 'template') {
      if (!content?.templateName) {
        return NextResponse.json(
          { success: false, error: 'Campo "content.templateName" é obrigatório para tipo template' },
          { status: 400 }
        );
      }
      
      payload.type = 'template';
      payload.template = {
        name: content.templateName,
        language: {
          code: content.languageCode || 'pt_BR',
        },
        components: content.components || [],
      };
    } 
    else {
      return NextResponse.json(
        { success: false, error: `Tipo de mensagem não suportado: ${type}` },
        { status: 400 }
      );
    }

    console.log('📝 Send payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    console.log('📨 Send API response:', {
      status: response.status,
      statusText: response.statusText,
      body: responseText
    });

    if (!response.ok) {
      let errorDetails = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData = JSON.parse(responseText);
        errorDetails += ` - ${JSON.stringify(errorData)}`;
      } catch {
        errorDetails += ` - ${responseText}`;
      }
      
      return NextResponse.json(
        { 
          success: false, 
          error: 'Falha ao enviar mensagem',
          details: errorDetails
        },
        { status: response.status }
      );
    }

    const result = JSON.parse(responseText);

    return NextResponse.json({
      success: true,
      messageId: result.messages?.[0]?.id,
      to: cleanedTo,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ Send endpoint error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Erro interno ao enviar mensagem',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
