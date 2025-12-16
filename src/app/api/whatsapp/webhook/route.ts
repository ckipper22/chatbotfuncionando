// src/app/api/whatsapp/webhook/route.ts
// ====================================================================================
// WEBHOOK FINAL: GEMINI + FALLBACK GOOGLE SEARCH (BUSCADORA)
// CORREÇÃO DE SINTAXE GEMINI INCLUÍDA.
// LÓGICA DO WHATSAPP ORIGINAL PRESERVADA.
// ====================================================================================

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// =========================================================================
// CONFIGURAÇÃO DAS VARIÁVEIS DE AMBIENTE
// =========================================================================

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const FLASK_API_URL = process.env.FLASK_API_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// NOVAS VARIÁVEIS PARA GOOGLE CUSTOM SEARCH (BUSCADORA)
const CUSTOM_SEARCH_API_KEY = process.env.CUSTOM_SEARCH_API_KEY;
const CUSTOM_SEARCH_CX = process.env.CUSTOM_SEARCH_CX;

// Flags para verificar configurações disponíveis
const hasWhatsAppConfig = !!(WHATSAPP_VERIFY_TOKEN && WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID);
const hasSupabaseConfig = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
const hasFlaskConfig = !!FLASK_API_URL;
const hasGeminiConfig = !!GEMINI_API_KEY;
const hasCustomSearchConfig = !!(CUSTOM_SEARCH_API_KEY && CUSTOM_SEARCH_CX);

// =========================================================================
// FUNÇÕES DE UTILIDADE (LÓGICA DO WHATSAPP ORIGINAL)
// =========================================================================

// Função para enviar mensagens ao WhatsApp (Lógica original e funcional)
async function enviarMensagem(to: string, whatsappPhoneId: string, text: string) {
    if (!hasWhatsAppConfig) {
        console.warn(`[MOCK] WhatsApp desabilitado. Mensagem para ${to}: ${text}`);
        return;
    }
    
    // Seu código REAL de envio de mensagem HTTP aqui
    const url = `https://graph.facebook.com/v19.0/${whatsappPhoneId}/messages`;
    const messagePayload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to, // O número de destino (que veio do message.from)
        type: "text",
        text: {
            body: text,
        },
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(messagePayload),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Erro ao enviar mensagem via WhatsApp API:', errorData); 
        }
    } catch (error) {
        console.error('Falha na requisição de envio de mensagem:', error);
    }
}

// Função simulada (MOCK) para enviar o menu inicial
async function enviarMenuInicial(from: string, whatsappPhoneId: string) {
    // Implemente a lógica do seu menu aqui
    const menuText = "Olá! Por favor, digite sua pergunta ou selecione uma opção.";
    await enviarMensagem(from, whatsappPhoneId, menuText);
}

// Função simulada (MOCK) para manipular respostas interativas
async function handleInteractiveReply(from: string, whatsappPhoneId: string, replyId: string) {
    let resposta = `Você selecionou a opção: ${replyId}.`;
    
    // Implemente sua lógica de roteamento/Supabase/Flask aqui
    if (replyId === "OPCAO_1") {
        resposta += " Processando Opção 1...";
    }

    await enviarMensagem(from, whatsappPhoneId, resposta);
}

// =========================================================================
// FUNÇÃO DE FALLBACK: GOOGLE CUSTOM SEARCH
// =========================================================================

/**
 * Busca uma query na Google Custom Search API.
 * @param query O termo de busca.
 * @returns Uma string formatada com o resultado da busca ou null.
 */
async function buscarComGoogle(query: string): Promise<string | null> {
    if (!hasCustomSearchConfig) {
        console.error("Variáveis de ambiente do Google Custom Search não configuradas.");
        return null;
    }

    const url = `https://www.googleapis.com/customsearch/v1?key=${CUSTOM_SEARCH_API_KEY}&cx=${CUSTOM_SEARCH_CX}&q=${encodeURIComponent(query)}`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Erro na API do Google Search: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.items && data.items.length > 0) {
            // Pega o snippet do primeiro resultado e formata
            const item = data.items[0];
            return `*Busca na Web (via Fallback):* ${item.snippet}\n\n*Título:* ${item.title}\n*Link:* ${item.link}`;
        }
        return null; // Nenhum resultado encontrado
    } catch (error) {
        console.error("Erro ao buscar com a API do Google:", error);
        return null;
    }
}

// =========================================================================
// ROTEAMENTO PRINCIPAL COM FALLBACK
// =========================================================================

/**
 * Tenta obter a resposta do Gemini e, em caso de falha/restrição, usa o Google Custom Search.
 */
async function processarMensagemCompleta(from: string, whatsappPhoneId: string, messageText: string) {
    let resposta: string | null = null;

    // 1. TENTATIVA COM GEMINI (Primary Route)
    if (hasGeminiConfig) {
        try {
            const ai = new GoogleGenerativeAI(GEMINI_API_KEY!);
            const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" }); 

            const result = await model.generateContent(messageText);
            
            // CORREÇÃO DE SINTAXE NECESSÁRIA PARA COMPILAR: result.response.text()
            const geminiResponse = result.response.text().trim(); 

            if (geminiResponse) {
                resposta = geminiResponse;
                console.log("Resposta obtida do Gemini.");
            }
        } catch (error) {
            // Loga o erro do Gemini, mas a execução continua para o fallback
            console.warn("RESTRIÇÃO OU ERRO NO GEMINI. Tentando fallback para Google Search...", error);
        }
    }

    // 2. FALLBACK COM GOOGLE CUSTOM SEARCH
    if (!resposta && hasCustomSearchConfig) {
        console.log("Gemini falhou ou estava restrito. Executando busca de fallback (Google Custom Search)...");
        resposta = await buscarComGoogle(messageText);
    }
    
    // 3. ENVIO DA RESPOSTA FINAL
    if (resposta) {
        await enviarMensagem(from, whatsappPhoneId, resposta); 
    } else {
        // Se ambos falharem ou estiverem desabilitados
        await enviarMensagem(from, whatsappPhoneId, "Desculpe, não consegui obter uma resposta no momento. Tente novamente mais tarde ou reformule sua pergunta.");
    }
}

// =========================================================================
// EXPORTS: GET (Verificação do Webhook) e POST (Recebimento de Mensagens)
// =========================================================================

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('hub.mode');
  const token = req.nextUrl.searchParams.get('hub.verify_token');
  const challenge = req.nextUrl.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
    console.log('WEBHOOK_VERIFIED');
    return new NextResponse(challenge, { status: 200 });
  } else {
    return new NextResponse('Forbidden', { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.object === 'whatsapp_business_account' && body.entry) {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.field === 'messages' && change.value?.messages) {
            for (const message of change.value.messages) {
              const from = message.from;
              const whatsappPhoneId = change.value.metadata.phone_number_id;

              const messageText = message.text?.body;
              const replyId = message.interactive?.list_reply?.id || message.interactive?.button_reply?.id;

              if (replyId) {
                await handleInteractiveReply(from, whatsappPhoneId, replyId);
              } else if (message.type === 'text' && messageText) {
                await processarMensagemCompleta(from, whatsappPhoneId, messageText);
              } else if (message.type === 'button') {
                await processarMensagemCompleta(from, whatsappPhoneId, message.button.text);
              } else {
                await enviarMenuInicial(from, whatsappPhoneId);
              }
            }
          }
        }
      }
    }

    return new NextResponse('EVENT_RECEIVED', { status: 200 });
  } catch (error) {
    console.error('Erro no POST do Webhook:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
