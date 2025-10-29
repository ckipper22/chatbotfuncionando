
import { NextRequest } from 'next/server';
import { createSuccessResponse, createErrorResponse } from '@/lib/create-response';
import { requestMiddleware, validateRequestBody } from '@/lib/api-utils';

export const POST = requestMiddleware(async (request: NextRequest) => {
  const body = await validateRequestBody(request);

  const { phoneNumberId, accessToken, apiVersion } = body;

  if (!phoneNumberId || !accessToken) {
    return createErrorResponse({
      errorMessage: 'phoneNumberId e accessToken são obrigatórios',
      status: 400,
    });
  }

  try {
    const version = apiVersion || 'v21.0';
    const url = `https://graph.facebook.com/${version}/${phoneNumberId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      return createErrorResponse({
        errorMessage: error.error?.message || 'Falha ao conectar com a API',
        errorCode: error.error?.code?.toString(),
        status: response.status,
      });
    }

    const result = await response.json();

    return createSuccessResponse({
      success: true,
      message: 'Conexão estabelecida com sucesso!',
      phoneNumber: result.display_phone_number,
      verifiedName: result.verified_name,
      quality: result.quality_rating,
    });
  } catch (error: any) {
    return createErrorResponse({
      errorMessage: error.message || 'Erro ao testar conexão',
      status: 500,
    });
  }
});
