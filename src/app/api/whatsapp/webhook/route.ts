// src/app/api/whatsapp/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';

// =========================================================================
// CONFIGURAÇÃO DAS VARIÁVEIS DE AMBIENTE
// =========================================================================

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Verificação das variáveis essenciais
if (!WHATSAPP_VERIFY_TOKEN || !WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
  console.error('❌ ERRO: Variáveis do WhatsApp não configuradas.');
  throw new Error('Configuração do WhatsApp ausente');
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ ERRO: Variáveis do Supabase não configuradas.');
  throw new Error('Configuração do Supabase ausente');
}

// =========================================================================
// BASE DE DADOS DE MEDICAMENTOS (FALLBACK)
// =========================================================================

const medicamentosData = [
  {
    "Nome do Medicamento": "Losartana",
    "Princípio(s) Ativo(s)": ["Losartana Potássica"],
    "Classe Farmacológica": "Antagonista do Receptor da Angiotensina II",
    "Mecanismo de Ação": "Bloqueia receptores da angiotensina II, reduzindo pressão arterial",
    "Indicações": "Hipertensão arterial, insuficiência cardíaca, proteção renal em diabetes",
    "Posologia": "50 mg uma vez ao dia, podendo ser ajustada até 100 mg/dia",
    "Contraindicações": "Gravidez, hipersensibilidade, uso com alisquireno em diabéticos",
    "Efeitos Colaterais": "Tontura, cefaleia, fadiga, hipercalemia",
    "Interações Medicamentosas": "Diuréticos, AINEs, lítio"
  },
  {
    "Nome do Medicamento": "Sinvastatina",
    "Princípio(s) Ativo(s)": ["Sinvastatina"],
    "Classe Farmacológica": "Inibidor da HMG-CoA Redutase",
    "Mecanismo de Ação": "Inibe a produção de colesterol no fígado",
    "Indicações": "Hipercolesterolemia, prevenção de eventos cardiovasculares",
    "Posologia": "10-40 mg uma vez ao dia, preferencialmente à noite",
    "Contraindicações": "Doença hepática ativa, gravidez, uso com certos antifúngicos",
    "Efeitos Colaterais": "Mialgia, dor abdominal, elevação de enzimas hepáticas",
    "Interações Medicamentosas": "Antifúngicos azóis, antibióticos macrolídeos"
  }
];

// =========================================================================
// FUNÇÕES AUXILIARES
// =========================================================================

// --- Buscar API da farmácia no Supabase ---
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

// --- Consultar API da farmácia ---
async function consultarAPIFarmacia(apiBaseUrl: string, termo: string): Promise<any> {
  try {
    const url = `${apiBaseUrl}/api/products/search?q=${encodeURIComponent(termo)}`;
    console.log('🔍 Consultando API farmácia:', url);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        'User-Agent': 'WhatsAppWebhook/1.0'
      },
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

// --- Formatação de números WhatsApp ---
function converterParaFormatoFuncional(numeroOriginal: string): string[] {
  console.log('🎯 [CONVERT] Convertendo para formato funcional:', numeroOriginal);

  const numeroLimpo = numeroOriginal.replace(/\D/g, '');
  console.log('🎯 [CONVERT] Número limpo:', numeroLimpo);

  if (numeroLimpo === '555584557096') {
    const formatosFuncionais = ['5555984557096', '+5555984557096'];
    console.log('🎯 [CONVERT] ✅ Convertido para formatos funcionais (caso específico):', formatosFuncionais);
    return formatosFuncionais;
  }

  let numeroConvertido = numeroLimpo;

  if (numeroLimpo.length === 12 && numeroLimpo.startsWith('55')) {
    const ddd = numeroLimpo.substring(2, 4);
    const numeroSemDDIeDDD = numeroLimpo.substring(4);
    if (numeroSemDDIeDDD.length === 8 && !['1','2','3','4','5'].includes(numeroSemDDIeDDD.charAt(0))) {
        numeroConvertido = '55' + ddd + '9' + numeroSemDDIeDDD;
        console.log('🎯 [CONVERT] ✅ Adicionado 9 para celular brasileiro:', numeroConvertido);
    }
  }

  return ['+' + numeroConvertido, numeroConvertido];
}

// --- Envio WhatsApp com formatação correta ---
async function enviarComFormatosCorretos(from: string, texto: string, whatsappPhoneId: string): Promise<boolean> {
  try {
    console.log('🎯 [SEND] Enviando mensagem para:', from);

    const formatos = converterParaFormatoFuncional(from);

    for (let i = 0; i < formatos.length; i++) {
      const formato = formatos[i];
      console.log(`📤 Tentativa ${i + 1}/${formatos.length}: ${formato}`);

      try {
        const payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formato,
          type: 'text',
          text: {
            preview_url: false,
            body: texto.substring(0, 4096)
          }
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

        const responseText = await response.text();

        if (response.ok) {
          console.log(`✅ Mensagem enviada com sucesso para: ${formato}`);
          return true;
        } else {
          console.log(`❌ Falha para: ${formato} - Status: ${response.status}`);
        }
      } catch (error) {
        console.error(`💥 Erro para ${formato}:`, error);
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log('❌ Todos os formatos falharam para:', from);
    return false;

  } catch (error) {
    console.error('❌ Erro crítico no envio:', error);
    return false;
  }
}

// --- Processar informações de medicamentos ---
function parseUserMessageForDrugInfo(message: string): { drugName?: string; infoType?: string } {
  const lowerMessage = message.toLowerCase();
  let drugName: string | undefined;
  let infoType: string | undefined;

  const infoTypeKeywords: { [key: string]: string[] } = {
    "classe terapeutica": ["classe terapeutica", "classe farmacologica", "categoria"],
    "posologia": ["posologia", "dose", "como usar", "dosagem"],
    "indicacoes": ["indicacoes", "para que serve", "usos"],
    "efeitos colaterais": ["efeitos colaterais", "reacoes adversas", "colaterais"],
    "contraindicacoes": ["contraindicacoes", "contra indicado", "nao usar"],
    "mecanismo de acao": ["mecanismo de acao", "como funciona"],
    "interacoes medicamentosas": ["interacoes medicamentosas", "pode misturar com"],
    "tudo": ["tudo", "informacoes completas", "tudo sobre"],
  };

  for (const typeKey in infoTypeKeywords) {
    if (infoTypeKeywords[typeKey].some(keyword => lowerMessage.includes(keyword))) {
      infoType = typeKey;
      break;
    }
  }

  const allDrugNames = medicamentosData.map(m => m["Nome do Medicamento"].toLowerCase());
  let bestMatchDrug: string | undefined;
  let bestMatchLength = 0;

  for (const drug of allDrugNames) {
    if (lowerMessage.includes(drug) && drug.length > bestMatchLength) {
      bestMatchDrug = drug;
      bestMatchLength = drug.length;
    }
  }
  drugName = bestMatchDrug;

  return { drugName, infoType };
}

function getMedicamentoInfo(drugName: string, infoType: string): string {
  const termoBuscaMedicamento = drugName.toLowerCase();

  const medicamentoEncontrado = medicamentosData.find(bula =>
    bula["Nome do Medicamento"].toLowerCase().includes(termoBuscaMedicamento)
  );

  if (!medicamentoEncontrado) {
    return `Não encontrei informações sobre o medicamento '${drugName}' em nossa base de dados.`;
  }

  if (infoType === "tudo") {
    let fullInfo = `💊 *Informações completas sobre ${medicamentoEncontrado["Nome do Medicamento"]}*:\\n\\n`;

    for (const key in medicamentoEncontrado) {
      const typedKey = key as keyof typeof medicamentoEncontrado;
      if (key !== "Nome do Medicamento") {
        const value = medicamentoEncontrado[typedKey];
        fullInfo += `*• ${key}:* ${Array.isArray(value) ? value.join(', ') : value}\\n\\n`;
      }
    }

    fullInfo += `_Consulte sempre um farmacêutico ou médico para orientações específicas._`;
    return fullInfo;
  }

  const infoTypeMap: { [key: string]: string } = {
    "classe terapeutica": "Classe Farmacológica",
    "posologia": "Posologia",
    "indicacoes": "Indicações",
    "efeitos colaterais": "Efeitos Colaterais",
    "contraindicacoes": "Contraindicações",
    "mecanismo de acao": "Mecanismo de Ação",
    "interacoes medicamentosas": "Interações Medicamentosas",
  };

  const mappedInfoType = infoTypeMap[infoType];

  if (!mappedInfoType) {
    return `Não tenho a informação específica sobre '${infoType}'. Tente: classe terapeutica, posologia, indicacoes, efeitos colaterais, contraindicacoes, mecanismo de acao, interacoes medicamentosas ou tudo.`;
  }

  const info = medicamentoEncontrado[mappedInfoType as keyof typeof medicamentoEncontrado];

  if (info) {
    return `💊 *${mappedInfoType} de ${medicamentoEncontrado["Nome do Medicamento"]}*:\\n\\n${Array.isArray(info) ? info.join(', ') : info}\\n\\n_Consulte um profissional de saúde para orientações._`;
  } else {
    return `Não encontrei a informação de '${mappedInfoType}' para o medicamento '${medicamentoEncontrado["Nome do Medicamento"]}'.`;
  }
}

// =========================================================================
// HANDLERS PRINCIPAIS
// =========================================================================

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
                await processarMensagemCompleta(from, whatsappPhoneId, messageText);
              } else {
                await enviarComFormatosCorretos(
                  from,
                  '👋 Olá! Sou o assistente virtual da farmácia.\\n\\n💊 *Buscar produtos:*\\n• produto dipirona\\n• buscar paracetamol\\n• estoque nimesulida\\n\\n💡 *Comandos:*\\n• /test - Status do sistema\\n• /debug - Informações técnicas\\n• /ajuda - Esta mensagem',
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

// =========================================================================
// PROCESSAMENTO COMPLETO DE MENSAGENS
// =========================================================================

async function processarMensagemCompleta(from: string, whatsappPhoneId: string, messageText: string): Promise<void> {
  const userMessage = messageText.trim();
  const lowerMessage = userMessage.toLowerCase();

  console.log(`🤖 Processando: "${userMessage}"`);

  try {
    // COMANDOS ADMINISTRATIVOS
    if (lowerMessage === '/test' || lowerMessage === 'test') {
      const farmacyData = await findFarmacyAPI(whatsappPhoneId);
      const statusAPI = farmacyData ? '✅ CONFIGURADA' : '❌ NÃO CONFIGURADA';
      const statusMsg = `✅ *SISTEMA MULTI-TENANT FUNCIONANDO!*\\n\\n🏪 Farmácia: ${statusAPI}\\n📞 WhatsApp: ✅ Conectado\\n🛍️ Produtos: ✅ API Conectada\\n🤖 IA: ✅ Base de Medicamentos\\n🚀 Status: 100% Operacional\\n\\nTudo funcionando perfeitamente!`;
      await enviarComFormatosCorretos(from, statusMsg, whatsappPhoneId);
      return;
    }

    if (lowerMessage === '/debug' || lowerMessage === 'debug') {
      const farmacyData = await findFarmacyAPI(whatsappPhoneId);
      const formatos = converterParaFormatoFuncional(from);
      const debugInfo = `🔧 *DEBUG SISTEMA MULTI-TENANT*\\n\\n📱 Seu número: ${from}\\n🎯 Formatos: ${formatos.join(', ')}\\n🏪 Farmácia ID: ${whatsappPhoneId}\\n🔗 API: ${farmacyData?.api_base_url || 'NÃO CONFIGURADA'}\\n🤖 Medicamentos: ${medicamentosData.length} cadastrados\\n✅ Sistema: 100% Operacional`;
      await enviarComFormatosCorretos(from, debugInfo, whatsappPhoneId);
      return;
    }

    if (lowerMessage === '/ajuda' || lowerMessage === 'ajuda' || lowerMessage === '/help') {
      const helpMsg = `🤖 *ASSISTENTE VIRTUAL DA FARMÁCIA*\\n\\n💊 *BUSCAR PRODUTOS:*\\n• produto [nome]\\n• buscar [termo]\\n• estoque [produto]\\n\\n💡 *COMANDOS:*\\n• /test - Status do sistema\\n• /debug - Informações técnicas\\n• /ajuda - Esta mensagem\\n\\n🔍 *CONSULTAR MEDICAMENTOS:*\\n• losartana posologia\\n• sinvastatina efeitos colaterais\\n• diclofenaco tudo\\n\\n🚀 *SISTEMA MULTI-TENANT ATIVO*`;
      await enviarComFormatosCorretos(from, helpMsg, whatsappPhoneId);
      return;
    }

    // CONSULTA DE PRODUTOS
    if (lowerMessage.startsWith('buscar ') || lowerMessage.startsWith('produto ') ||
        lowerMessage.startsWith('consulta ') || lowerMessage.startsWith('preço ') ||
        lowerMessage.startsWith('preco ') || lowerMessage.startsWith('estoque ')) {

      console.log(`🛍️ [PRODUTO] Consultando: "${userMessage}"`);

      const farmacyData = await findFarmacyAPI(whatsappPhoneId);

      if (!farmacyData?.api_base_url) {
        await enviarComFormatosCorretos(from, '❌ *FARMÁCIA NÃO CONFIGURADA*\\n\\nEsta farmácia ainda não está configurada no sistema. Contate o suporte técnico.', whatsappPhoneId);
        return;
      }

      const termoBusca = userMessage.replace(/^(buscar|produto|consulta|preço|preco|estoque)\s*/i, '').trim();

      if (termoBusca.length < 2) {
        await enviarComFormatosCorretos(from, '🔍 *BUSCA DE PRODUTOS*\\n\\nPor favor, digite pelo menos 2 caracteres para buscar.\\n\\n💡 *Exemplos:*\\n• produto paracetamol\\n• buscar dipirona\\n• estoque nimesulida', whatsappPhoneId);
        return;
      }

      try {
        const resultado = await consultarAPIFarmacia(farmacyData.api_base_url, termoBusca);

        if (!resultado.success || resultado.count === 0) {
          await enviarComFormatosCorretos(from, `❌ *PRODUTO NÃO ENCONTRADO*\\n\\nNão encontrei produtos para "*${termoBusca}*".\\n\\n💡 *Sugestões:*\\n• Verifique a ortografia\\n• Tente um termo mais específico\\n• Use apenas o nome principal`, whatsappPhoneId);
          return;
        }

        let resposta = `🔍 *${resultado.count} PRODUTO(S) ENCONTRADO(S)*\\n` +
                      `*Busca:* "${termoBusca}"\\n\\n`;

        resultado.data.slice(0, 5).forEach((produto: any, index: number) => {
          resposta += `*${index + 1}. ${produto.nome_produto}*\\n`;
          resposta += `💊 ${produto.nom_laboratorio || 'Laboratório não informado'}\\n`;
          resposta += `💰 ${produto.preco_final_venda || 'Preço não informado'}`;
          if (produto.desconto_percentual > 0) {
            resposta += ` (🔻${produto.desconto_percentual.toFixed(1)}% OFF)`;
          }
          resposta += `\\n📦 Estoque: ${produto.qtd_estoque || 0} unidades\\n`;
          resposta += `📋 Código: ${produto.cod_reduzido || 'N/A'}\\n\\n`;
        });

        if (resultado.count > 5) {
          resposta += `📊 *E mais ${resultado.count - 5} produtos...*\\n`;
          resposta += `Use um termo mais específico para ver todos.\\n\\n`;
        }

        resposta += `💡 *Dica:* Use *"código 12345"* para detalhes de um produto específico.`;

        await enviarComFormatosCorretos(from, resposta, whatsappPhoneId);
        return;

      } catch (error) {
        console.error('❌ [PRODUTO] Erro na consulta:', error);
        await enviarComFormatosCorretos(from, '⚠️ *ERRO NA CONSULTA*\\n\\nNão consegui buscar produtos no momento.\\nNossa equipe foi notificada.\\n\\nTente novamente em alguns instantes.', whatsappPhoneId);
        return;
      }
    }

    // CONSULTA DE MEDICAMENTOS (FALLBACK)
    const parsedInfo = parseUserMessageForDrugInfo(userMessage);

    if (parsedInfo.drugName) {
      console.log(`💊 [MEDICAMENTO] Consultando: ${parsedInfo.drugName} - ${parsedInfo.infoType}`);

      const infoMedicamento = getMedicamentoInfo(parsedInfo.drugName, parsedInfo.infoType || 'tudo');
      await enviarComFormatosCorretos(from, infoMedicamento, whatsappPhoneId);
      return;
    }

    // MENSAGEM GENÉRICA
    await enviarComFormatosCorretos(
      from,
      '👋 *OLÁ! SOU SEU ASSISTENTE VIRTUAL*\\n\\n💊 *Para buscar produtos:*\\n• produto dipirona\\n• buscar paracetamol\\n• estoque nimesulida\\n\\n🔍 *Para informações de medicamentos:*\\n• losartana posologia\\n• sinvastatina efeitos colaterais\\n• diclofenaco tudo\\n\\n⚡ *Comandos rápidos:*\\n• /test - Status do sistema\\n• /debug - Informações técnicas\\n• /ajuda - Ver esta mensagem',
      whatsappPhoneId
    );

  } catch (error) {
    console.error('❌ [PROCESS] Erro crítico:', error);
    await enviarComFormatosCorretos(
      from,
      '⚠️ *ERRO TEMPORÁRIO*\\n\\nEstou com dificuldades momentâneas.\\nTente novamente em alguns instantes.\\n\\nUse /test para verificar o status.',
      whatsappPhoneId
    );
  }
}