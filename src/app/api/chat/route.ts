// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getGeminiService } from '@/lib/services/gemini-service';
import { getMedicamentoInfo } from '@/lib/medicamentos_data'; // Importa sua função de dados de medicamentos

export async function POST(req: NextRequest) {
  try {
    const { message, userId } = await req.json();

    if (!message || !userId) {
      return NextResponse.json({ error: 'Mensagem e userId são obrigatórios' }, { status: 400 });
    }

    const geminiService = getGeminiService();
    // Gemini agora pode retornar texto natural OU um JSON de "comando" como string
    let aiResponseText = await geminiService.generateResponse(message, userId);

    let finalResponse = aiResponseText; // Por padrão, a resposta final é o que o Gemini gerou

    // --- NOVA LÓGICA: Tentar extrair e processar JSON de um bloco de código Markdown ---
    // Expressão regular para encontrar um bloco de código JSON: ```json ... ```
    const jsonMatch = aiResponseText.match(/```json\s*([\s\S]*?)\s*```/);

    if (jsonMatch && jsonMatch[1]) {
      const rawJsonString = jsonMatch[1]; // Pega a parte que está DENTRO do bloco JSON
      try {
        const parsedResponse = JSON.parse(rawJsonString); // Agora o JSON.parse deve funcionar

        // --- Lógica para Bula de Medicamento (medicamentos_data.ts) ---
        if (parsedResponse.action === 'get_bula_info' && parsedResponse.drug && parsedResponse.info_type) {
          finalResponse = getMedicamentoInfo(parsedResponse.drug, parsedResponse.info_type);
        }
        // --- Lógica para Estoque de Medicamento (Ainda não implementada) ---
        else if (parsedResponse.action === 'get_stock_info' && parsedResponse.drug) {
          // Aqui você chamaria uma função como getEstoqueInfo(parsedResponse.drug);
          // Por enquanto, vamos retornar uma mensagem indicando que não está pronto.
          finalResponse = `Funcionalidade de estoque para '${parsedResponse.drug}' ainda não implementada.`;
        }
        // Caso o JSON seja válido, mas a ação ou os campos não sejam os esperados
        else {
            console.warn('Gemini retornou JSON de ação, mas com formato ou ação desconhecida:', parsedResponse);
            finalResponse = "Desculpe, não consegui processar a informação específica do medicamento. Por favor, tente reformular.";
        }
      } catch (jsonParseError) {
        // Se o JSON extraído for malformado (ex: sintaxe JSON inválida)
        console.error('Erro ao parsear JSON extraído do Gemini:', jsonParseError);
        finalResponse = "Desculpe, houve um problema ao interpretar a informação do medicamento. Por favor, tente novamente.";
      }
    } else {
      // Se não houver um bloco ```json```, então `aiResponseText` já é a resposta final em texto natural.
      // `finalResponse` já está com `aiResponseText`, então não precisamos fazer nada aqui.
      console.log('Gemini respondeu com texto natural.');
    }
    // --- FIM DA NOVA LÓGICA ---


    // Retorna a resposta final para o frontend
    return NextResponse.json({ response: finalResponse });

  } catch (error) {
    console.error('Erro na API /api/chat:', error);
    // Se o erro for a mensagem de política de conteúdo da IA, retorne-a de forma amigável
    if (typeof error === 'string' && error.includes('Atenção (Política de Conteúdo da IA)')) {
        return NextResponse.json({ response: error }, { status: 200 }); // Retorna 200 para mostrar a mensagem ao usuário
    }
    // Para outros erros internos
    return NextResponse.json({ error: 'Erro interno do servidor ao processar sua requisição.' }, { status: 500 });
  }
}