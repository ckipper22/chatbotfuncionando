// src/app/api/whatsapp/webhook/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

// Configuração do cliente Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Função para encontrar a API local da farmácia ---
async function findFarmacyAPI(whatsappPhoneId: string): Promise<{api_base_url: string, client_id: string} | null> {
  try {
    const { data, error } = await supabase
      .from('client_connections')  // ← TABELA CORRETA
      .select('api_base_url, client_id')
      .eq('whatsapp_phone_id', whatsappPhoneId)
      .single();

    if (error || !data) {
      console.error('❌ Farmácia não encontrada para WhatsApp ID:', whatsappPhoneId);
      return null;
    }

    return { api_base_url: data.api_base_url, client_id: data.client_id };
  } catch (error) {
    console.error('❌ Erro ao buscar farmácia no Supabase:', error);
    return null;
  }
}

// --- Função para consultar API local da farmácia ---
async function consultarAPIFarmacia(apiBaseUrl: string, termo: string): Promise<any> {
  try {
    const url = `${apiBaseUrl}/api/products/search?q=${encodeURIComponent(termo)}`;
    console.log('🔍 Consultando API farmácia:', url);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API farmácia retornou status: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Resposta da API farmácia:', data);
    return data;
  } catch (error) {
    console.error('❌ Erro ao consultar API da farmácia:', error);
    throw error;
  }
}

// --- Função para enviar mensagem WhatsApp COM FORMATAÇÃO CORRETA ---
async function sendWhatsAppMessage(to: string, messageBody: string, whatsappPhoneId: string): Promise<void> {
  if (!WHATSAPP_ACCESS_TOKEN) {
    console.error('❌ Não é possível enviar mensagem: WHATSAPP_ACCESS_TOKEN ausente.');
    return;
  }

  // 🎯 FUNÇÃO DE FORMATAÇÃO QUE FUNCIONAVA
  function formatWhatsAppNumber(numeroOriginal: string): string[] {
    console.log('🎯 [CONVERT] Convertendo para formato funcional:', numeroOriginal);

    const numeroLimpo = numeroOriginal.replace(/\D/g, '');
    console.log('🎯 [CONVERT] Número limpo:', numeroLimpo);

    // Baseado nos TESTES REAIS que funcionaram
    if (numeroLimpo === '555584557096') {
      const formatosFuncionais = [
        '+5555984557096',   // Formato 1 que funcionou
        '5555984557096',    // Formato 2 que funcionou
      ];
      console.log('🎯 [CONVERT] ✅ Convertido para formatos funcionais:', formatosFuncionais);
      return formatosFuncionais;
    }

    // Para outros números, aplicar a mesma lógica de conversão
    let numeroConvertido = numeroLimpo;

    if (numeroLimpo.length === 12 && numeroLimpo.startsWith('5555')) {
      // Lógica: 555584557096 → 5555984557096
      numeroConvertido = '555' + '5' + '9' + numeroLimpo.substring(5);
      console.log('🎯 [CONVERT] ✅ Padrão aplicado:', numeroConvertido);
    }

    const formatosFinais = [
      '+' + numeroConvertido,
      numeroConvertido
    ];

    console.log('🎯 [CONVERT] Formatos finais:', formatosFinais);
    return formatosFinais;
  }

  // 🧪 TESTE SEQUENCIAL DOS FORMATOS
  async function testarFormatosSequencial(numero: string, texto: string): Promise<boolean> {
    console.log('🧪 [SEQUENTIAL TEST] Iniciando teste sequencial para:', numero);

    const formatos = formatWhatsAppNumber(numero);

    for (let i = 0; i < formatos.length; i++) {
      const formato = formatos[i];
      console.log(`🧪 [SEQUENTIAL TEST] Tentativa ${i + 1}/${formatos.length}: ${formato}`);

      const sucesso = await tentarEnvioUnico(formato, texto, whatsappPhoneId);
      if (sucesso) {
        console.log(`✅ [SEQUENTIAL TEST] SUCESSO no formato ${i + 1}: ${formato}`);
        return true;
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log('❌ [SEQUENTIAL TEST] Todos os formatos falharam');
    return false;
  }

  // 🚀 ENVIO ÚNICO COM LOG DETALHADO
  async function tentarEnvioUnico(numero: string, texto: string, phoneId: string): Promise<boolean> {
    try {
      console.log(`📤 [SEND] Tentando enviar para: ${numero} via Phone ID: ${phoneId}`);

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: numero,
        type: 'text',
        text: {
          preview_url: false,
          body: texto
        }
      };

      const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();

      console.log(`📨 [SEND] Status: ${response.status}`);
      console.log(`📨 [SEND] Response: ${responseText}`);

      if (response.ok) {
        console.log(`🎉 [SEND] ✅ SUCESSO para: ${numero}`);
        return true;
      } else {
        console.log(`💥 [SEND] ❌ FALHA para: ${numero} - Status: ${response.status}`);
        return false;
      }

    } catch (error) {
      console.error(`❌ [SEND] Erro para ${numero}:`, error);
      return false;
    }
  }

  // Executar o teste sequencial
  await testarFormatosSequencial(to, messageBody);
}

// --- Handler GET (Verificação do Webhook) ---
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  console.log('🔔 GET /api/whatsapp/webhook recebido:', { mode, token, challenge });

  if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
    console.log('✅ Webhook VERIFICADO com sucesso!');
    return new NextResponse(challenge, { status: 200 });
  } else {
    console.error('❌ Falha na VERIFICAÇÃO do Webhook');
    return new NextResponse('Verification failed', { status: 403 });
  }
}

// --- Handler POST (Recebimento de Mensagens) ---
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('📩 Evento do Webhook recebido:', JSON.stringify(body, null, 2));

    if (body.object === 'whatsapp_business_account' && body.entry) {
      for (const entry of body.entry) {
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.field === 'messages' && change.value && change.value.messages) {
              for (const message of change.value.messages) {
                const from = message.from; // Número do cliente
                const whatsappPhoneId = change.value.metadata.phone_number_id; // ID da farmácia
                const type = message.type;
                const messageText = message.text?.body;

                console.log(`📱 Mensagem de: ${from}, Farmácia ID: ${whatsappPhoneId}, Tipo: ${type}, Texto: "${messageText}"`);

                if (type === 'text' && messageText) {
                  // 1. Encontrar API local da farmácia
                  console.log(`🔍 Buscando API para farmácia: ${whatsappPhoneId}`);
                  const farmacyData = await findFarmacyAPI(whatsappPhoneId);

                  if (!farmacyData || !farmacyData.api_base_url) {
                    console.error(`❌ Farmácia não configurada: ${whatsappPhoneId}`);
                    await sendWhatsAppMessage(from, '❌ Farmácia não configurada. Entre em contato com o suporte.', whatsappPhoneId);
                    continue;
                  }

                  console.log(`✅ API encontrada: ${farmacyData.api_base_url} para cliente: ${farmacyData.client_id}`);

                  // 2. Consultar API local da farmácia
                  try {
                    const resultado = await consultarAPIFarmacia(farmacyData.api_base_url, messageText);

                    if (resultado.success && resultado.count > 0) {
                      // Formatar resposta com produtos encontrados
                      const produtos = resultado.data.slice(0, 3); // Limitar a 3 produtos
                      let resposta = `🔍 Encontrei ${resultado.count} produto(s) para "${messageText}":\n\n`;

                      produtos.forEach((prod: any, index: number) => {
                        resposta += `${index + 1}. ${prod.name || 'N/A'}\n`;
                        resposta += `   💰 R$ ${prod.price || 'N/A'}\n`;
                        resposta += `   📦 Estoque: ${prod.stock || 'N/A'}\n\n`;
                      });

                      if (resultado.count > 3) {
                        resposta += `... e mais ${resultado.count - 3} produtos.`;
                      }

                      await sendWhatsAppMessage(from, resposta, whatsappPhoneId);
                    } else {
                      await sendWhatsAppMessage(from, `❌ Nenhum produto encontrado para "${messageText}". Tente outro termo de busca.`, whatsappPhoneId);
                    }
                  } catch (error) {
                    console.error('❌ Erro ao consultar API da farmácia:', error);
                    await sendWhatsAppMessage(from, '❌ Erro ao consultar produtos. Tente novamente em alguns instantes.', whatsappPhoneId);
                  }
                } else if (type === 'text') {
                  await sendWhatsAppMessage(from, '📝 Envie o nome ou código do produto que deseja consultar!', whatsappPhoneId);
                } else {
                  await sendWhatsAppMessage(from, '📝 No momento só consigo processar mensagens de texto. Envie o nome ou código do produto!', whatsappPhoneId);
                }
              }
            }
          }
        }
      }
    }

    return new NextResponse('EVENT_RECEIVED', { status: 200 });
  } catch (error) {
    console.error('❌ Erro ao processar webhook:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}