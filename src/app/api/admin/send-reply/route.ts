import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

// Converter número para formatos funcionais
function converterParaFormatoFuncional(numeroOriginal: string): string[] {
  const numeroLimpo = numeroOriginal.replace(/\D/g, '');
  let numeroConvertido = numeroLimpo;

  if (numeroLimpo.length === 12 && numeroLimpo.startsWith('55')) {
    const ddd = numeroLimpo.substring(2, 4);
    const numeroSemDDIeDDD = numeroLimpo.substring(4);
    if (numeroSemDDIeDDD.length === 8 && !['1', '2', '3', '4', '5'].includes(numeroSemDDIeDDD.charAt(0))) {
      numeroConvertido = '55' + ddd + '9' + numeroSemDDIeDDD;
    }
  }
  return ['+' + numeroConvertido, numeroConvertido];
}

// Enviar mensagem via WhatsApp
async function enviarMensagemWhatsApp(to: string, message: string): Promise<boolean> {
  try {
    const formatos = converterParaFormatoFuncional(to);

    for (let i = 0; i < formatos.length; i++) {
      const formato = formatos[i];

      try {
        const payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formato,
          type: 'text',
          text: {
            preview_url: false,
            body: message.substring(0, 4096).replace(/\\n/g, '\n')
          }
        };

        const url = `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          console.log(`✅ Mensagem enviada para ${formato}`);
          return true;
        } else {
          const errorResponse = await response.text();
          console.log(`❌ Falha para: ${formato} - Status: ${response.status}`);
        }
      } catch (error) {
        console.error(`💥 Erro para ${formato}:`, error);
      }
    }

    return false;

  } catch (error) {
    console.error('❌ Erro ao enviar mensagem:', error);
    return false;
  }
}

// Salvar mensagem no Supabase
async function salvarMensagemNoSupabase(
  whatsappPhoneId: string,
  to: string,
  messageBody: string
): Promise<boolean> {
  try {
    const insertUrl = `${SUPABASE_URL}/rest/v1/whatsapp_messages`;
    const headers = new Headers({
      'apikey': SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    });

    const payload = {
      whatsapp_phone_id: whatsappPhoneId,
      from_number: to,
      message_body: messageBody,
      direction: 'OUT'
    };

    const response = await fetch(insertUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Erro ao salvar mensagem:', error);
      return false;
    }

    console.log('✅ Mensagem salva no Supabase');
    return true;

  } catch (error) {
    console.error('❌ Erro crítico ao salvar mensagem:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Validar que as variáveis de ambiente existem
    if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error('❌ Variáveis de ambiente não configuradas');
      return NextResponse.json(
        { error: 'Configuração incompleta' },
        { status: 500 }
      );
    }

    // Parsear request body
    const body = await request.json();
    const { to, message, whatsappPhoneId } = body;

    // Validar campos obrigatórios
    if (!to || !message) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: to, message' },
        { status: 400 }
      );
    }

    console.log(`📤 Enviando resposta para ${to}: ${message.substring(0, 50)}...`);

    // Enviar mensagem via WhatsApp
    const enviado = await enviarMensagemWhatsApp(to, message);

    if (!enviado) {
      return NextResponse.json(
        { error: 'Falha ao enviar mensagem' },
        { status: 500 }
      );
    }

    // Salvar no Supabase (usar whatsappPhoneId passado ou usar como fallback)
    const phoneId = whatsappPhoneId || WHATSAPP_PHONE_NUMBER_ID;
    await salvarMensagemNoSupabase(phoneId, to, message);

    return NextResponse.json(
      { success: true, message: 'Mensagem enviada com sucesso' },
      { status: 200 }
    );

  } catch (error) {
    console.error('❌ Erro no endpoint:', error);
    return NextResponse.json(
      { error: 'Erro ao processar requisição' },
      { status: 500 }
    );
  }
}
