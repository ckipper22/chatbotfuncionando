// src/app/api/whatsapp/webhook/route.ts

import { NextRequest, NextResponse } from 'next/server';

// Configuração das variáveis de ambiente
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Verificação das variáveis essenciais
if (!WHATSAPP_VERIFY_TOKEN) {
  console.error('ERRO: WHATSAPP_WEBHOOK_VERIFY_TOKEN não configurado.');
  throw new Error('Configuração do Webhook WhatsApp ausente');
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('ERRO: Variáveis do Supabase não configuradas.');
  throw new Error('Configuração do Supabase ausente');
}

// --- Função para encontrar a API local da farmácia ---
async function findFarmacyAPI(whatsappPhoneId: string): Promise<{api_base_url: string, client_id: string} | null> {
  try {
    console.log('🔍 Buscando farmácia:', whatsappPhoneId);

    const url = `${SUPABASE_URL}/rest/v1/client_connections?whatsapp_phone_id=eq.${whatsappPhoneId}&select=api_base_url,client_id`;

    const headers = new Headers({
      'apikey': SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    });

    const response = await fetch(url, { method: 'GET', headers });

    if (!response.ok) {
      throw new Error(`Supabase status: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Farmácia encontrada:', data[0] || 'Nenhuma');

    return data && data.length > 0 ? {
      api_base_url: data[0].api_base_url,
      client_id: data[0].client_id
    } : null;

  } catch (error) {
    console.error('❌ Erro ao buscar farmácia:', error);
    return null;
  }
}

// --- Função para consultar SUA API específica ---
async function consultarAPIFarmacia(apiBaseUrl: string, termo: string): Promise<any> {
  try {
    // USANDO SEU ENDPOINT REAL: /api/products/search
    const url = `${apiBaseUrl}/api/products/search?q=${encodeURIComponent(termo)}`;
    console.log('🔍 Consultando API farmácia:', url);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API retornou status: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Resposta da API:', data);

    return data;

  } catch (error) {
    console.error('❌ Erro ao consultar API:', error);
    throw error;
  }
}

// --- Função para enviar mensagem WhatsApp ---
async function sendWhatsAppMessage(to: string, messageBody: string, whatsappPhoneId: string): Promise<void> {
  if (!WHATSAPP_ACCESS_TOKEN) {
    console.error('❌ WHATSAPP_ACCESS_TOKEN ausente');
    return;
  }

  // Função para formatar número
  function formatWhatsAppNumber(numero: string): string[] {
    const numeroLimpo = numero.replace(/\D/g, '');

    if (numeroLimpo === '555584557096') {
      return ['5555984557096', '+5555984557096'];
    }

    let numeroConvertido = numeroLimpo;
    if (numeroLimpo.length === 12 && numeroLimpo.startsWith('5555')) {
      numeroConvertido = '5555' + '9' + numeroLimpo.substring(4);
    }

    return [numeroConvertido, '+' + numeroConvertido];
  }

  // Tentar envio sequencial
  async function tentarEnvioSequencial(): Promise<boolean> {
    const formatos = formatWhatsAppNumber(to);

    for (const formato of formatos) {
      console.log(`📤 Tentando enviar para: ${formato}`);

      try {
        const payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formato,
          type: 'text',
          text: { preview_url: false, body: messageBody }
        };

        const url = `https://graph.facebook.com/v19.0/${whatsappPhoneId}/messages`;

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          console.log(`✅ Mensagem enviada para: ${formato}`);
          return true;
        } else {
          console.log(`❌ Falha para: ${formato} - Status: ${response.status}`);
        }
      } catch (error) {
        console.error(`💥 Erro para ${formato}:`, error);
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    }

    return false;
  }

  await tentarEnvioSequencial();
}

// --- Handler GET (Verificação do Webhook) ---
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  console.log('🔔 Webhook verification:', { mode, token });

  if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
    console.log('✅ Webhook VERIFICADO!');
    return new NextResponse(challenge, { status: 200 });
  } else {
    console.error('❌ Falha na verificação');
    return new NextResponse('Verification failed', { status: 403 });
  }
}

// --- Handler POST (Recebimento de Mensagens) ---
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('📩 Mensagem recebida:', JSON.stringify(body, null, 2));

    if (body.object === 'whatsapp_business_account' && body.entry) {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.field === 'messages' && change.value?.messages) {
            for (const message of change.value.messages) {
              const from = message.from;
              const whatsappPhoneId = change.value.metadata.phone_number_id;
              const messageText = message.text?.body;

              console.log(`📱 De: ${from}, Farmácia: ${whatsappPhoneId}, Texto: "${messageText}"`);

              if (message.type === 'text' && messageText) {
                // 1. Buscar API da farmácia
                const farmacyData = await findFarmacyAPI(whatsappPhoneId);

                if (!farmacyData?.api_base_url) {
                  console.error(`❌ Farmácia não configurada: ${whatsappPhoneId}`);
                  await sendWhatsAppMessage(from, '❌ Farmácia não configurada. Contate o suporte.', whatsappPhoneId);
                  continue;
                }

                console.log(`✅ API: ${farmacyData.api_base_url}`);

                // 2. Consultar SUA API
                try {
                  const resultado = await consultarAPIFarmacia(farmacyData.api_base_url, messageText);

                  if (resultado.success && resultado.count > 0) {
                    // FORMATAR RESPOSTA COM SEUS DADOS ESPECÍFICOS
                    const produtos = resultado.data.slice(0, 3);
                    let resposta = `🔍 Encontrei ${resultado.count} produto(s) para "${messageText}":\n\n`;

                    produtos.forEach((prod: any, index: number) => {
                      resposta += `🏷️ *${prod.nome_produto}*\n`;
                      resposta += `💊 Laboratório: ${prod.nom_laboratorio || 'N/A'}\n`;
                      resposta += `💰 Preço: ${prod.preco_final_venda || 'R$ N/A'}\n`;
                      resposta += `📦 Estoque: ${prod.qtd_estoque || 0} unidades\n`;

                      if (prod.desconto_percentual > 0) {
                        resposta += `🎯 *${prod.desconto_percentual}% OFF!*\n`;
                      }

                      resposta += `🆔 Código: ${prod.cod_reduzido}\n\n`;
                    });

                    if (resultado.count > 3) {
                      resposta += `📋 E mais ${resultado.count - 3} produtos...`;
                    }

                    resposta += `\n💬 *Dica:* Use o código do produto para busca mais rápida!`;

                    await sendWhatsAppMessage(from, resposta, whatsappPhoneId);
                  } else {
                    await sendWhatsAppMessage(
                      from,
                      `❌ Nenhum produto encontrado para "${messageText}".\n\n💡 Tente:\n• Nome do produto\n• Código de barras\n• Código reduzido`,
                      whatsappPhoneId
                    );
                  }
                } catch (error) {
                  console.error('❌ Erro na consulta:', error);
                  await sendWhatsAppMessage(
                    from,
                    '⚠️ Serviço temporariamente indisponível. Tente novamente em alguns instantes.',
                    whatsappPhoneId
                  );
                }
              } else {
                await sendWhatsAppMessage(
                  from,
                  '👋 Olá! Sou o assistente virtual da farmácia.\n\n📝 Digite o *nome*, *código de barras* ou *código do produto* que deseja consultar!',
                  whatsappPhoneId
                );
              }
            }
          }
        }
      }
    }

    return new NextResponse('EVENT_RECEIVED', { status: 200 });
  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}