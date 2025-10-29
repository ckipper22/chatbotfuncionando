
import { NextRequest } from 'next/server';
import { createSuccessResponse, createErrorResponse } from '@/lib/create-response';
import { requestMiddleware, validateRequestBody } from '@/lib/api-utils';

export const POST = requestMiddleware(async (request: NextRequest) => {
  const body = await validateRequestBody(request);

  const { to, type, content, config } = body;

  if (!to || !type || !content || !config) {
    return createErrorResponse({
      errorMessage: 'Campos obrigatórios: to, type, content, config',
      status: 400,
    });
  }

  if (!config.phoneNumberId || !config.accessToken) {
    return createErrorResponse({
      errorMessage: 'Configuração inválida: phoneNumberId e accessToken são obrigatórios',
      status: 400,
    });
  }

  try {
    const apiVersion = config.apiVersion || 'v21.0';
    const url = `https://graph.facebook.com/${apiVersion}/${config.phoneNumberId}/messages`;

    let payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to.replace(/\D/g, ''),
    };

    if (type === 'text') {
      payload.type = 'text';
      payload.text = {
        preview_url: false,
        body: content.text,
      };
    } else if (['image', 'video', 'audio', 'document'].includes(type)) {
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
    } else if (type === 'template') {
      payload.type = 'template';
      payload.template = {
        name: content.templateName,
        language: {
          code: content.languageCode || 'pt_BR',
        },
        components: content.components || [],
      };
    } else {
      return createErrorResponse({
        errorMessage: 'Tipo de mensagem não suportado',
        status: 400,
      });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json();
      return createErrorResponse({
        errorMessage: error.error?.message || 'Falha ao enviar mensagem',
        errorCode: error.error?.code?.toString(),
        status: response.status,
      });
    }

    const result = await response.json();

    return createSuccessResponse({
      messageId: result.messages[0].id,
      to: to.replace(/\D/g, ''),
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return createErrorResponse({
      errorMessage: error.message || 'Erro ao enviar mensagem',
      status: 500,
    });
  }
});
