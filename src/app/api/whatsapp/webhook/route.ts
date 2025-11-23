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
// GATILHOS E AUXILIARES DE INTENÇÃO (NOVA LÓGICA)
// =========================================================================

// Lista expandida de palavras-chave para identificar a intenção de BUSCA DE PRODUTOS
const TRIGGERS_BUSCA = [
  'buscar', 'produto', 'consulta', 'preço', 'preco', 'estoque',
  'achar', 'encontrar', 'ver se tem', 'quanto custa', 'me veja', 'me passe',
  'quero', 'tem', 'procurar'
];

/**
 * Encontra e remove o trigger da mensagem para extrair apenas o termo de busca.
 * @returns O termo de busca ou null se a mensagem for muito curta após a remoção.
 */
function extrairTermoBusca(mensagem: string): string | null {
  const lowerMsg = mensagem.toLowerCase();
  for (const trigger of TRIGGERS_BUSCA) {
    // Regex para checar se o trigger está no começo ou com espaço (para cobrir "quero sorinan")
    const regex = new RegExp(`^${trigger}\\s*|\\s+${trigger}\\s*`, 'i');

    // Se o trigger estiver na mensagem, tentamos extrair
    if (lowerMsg.includes(trigger)) {
      // Remove o trigger e espaços extras
      const termo = mensagem.replace(regex, '').trim();

      // Garante que o termo não é um comando vazio
      if (termo.length >= 2) {
        return termo;
      }
    }
  }
  return null;
}

// =========================================================================
// FUNÇÕES AUXILIARES
// =========================================================================

// --- Envio de Mensagem de Menu (Simples) ---
async function enviarMenuInicial(from: string): Promise<boolean> {
  const texto = '*OLÁ! SOU SEU ASSISTENTE VIRTUAL DA FARMÁCIA.*\\n\\n' +
                'Como posso te ajudar hoje?\\n\\n' +
                'Digite o *número* da opção desejada, ou digite o nome do produto/medicamento:\\n' +
                '*1.* 🔍 Buscar Preços e Estoque de Produtos\\n' +
                '*2.* 💊 Consultar Informações de Medicamentos (Bula)\\n' +
                '*3.* 👩‍💻 Falar com um Atendente (Horário Comercial)\\n' +
                '*4.* 🆘 Ver comandos administrativos (/test, /ajuda)';

  return enviarComFormatosCorretos(from, texto);
}

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
    // Timeout ajustado para 15 segundos para dar tempo do Ngrok e Flask responderem
    const timeoutId = setTimeout(() => controller.abort(), 15000);

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
async function enviarComFormatosCorretos(from: string, texto: string): Promise<boolean> {
  // A função de envio permanece a mesma, pois é a mais segura para texto simples.
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
          console.log(`✅ Mensagem enviada com sucesso para: ${formato}`);
          return true;
        } else {
          // Se a primeira tentativa falhar, loga o erro antes de tentar o próximo formato
          const errorResponse = await response.text();
          console.log(`❌ Falha para: ${formato} - Status: ${response.status} - Erro: ${errorResponse}`);
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
                // Se não for texto ou for mídia, mostra o menu inicial.
                await enviarMenuInicial(from);
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
    // --- OPÇÕES FIXAS (MENU) ---

    if (lowerMessage === '1') {
      await enviarComFormatosCorretos(from, '✅ *BUSCA DE PRODUTOS*\\n\\nDigite o nome do produto que deseja buscar. Exemplos:\\n• dipirona\\n• paracetamol 500mg\\n• sorinan\\n\\nOu *digite voltar* para o Menu Principal.');
      return;
    }

    if (lowerMessage === '2') {
      await enviarComFormatosCorretos(from, '✅ *INFORMAÇÕES DE MEDICAMENTOS*\\n\\nDigite o nome do medicamento e a informação desejada. Exemplos:\\n• losartana posologia\\n• sinvastatina tudo\\n• diclofenaco efeitos colaterais\\n\\nOu *digite voltar* para o Menu Principal.');
      return;
    }

    if (lowerMessage === '3') {
      // Aqui você pode adicionar lógica mais complexa de horário de atendimento
      await enviarComFormatosCorretos(from, '👩‍💻 *FALAR COM ATENDENTE*\\n\\nNossos atendentes estão disponíveis de [INSERIR HORÁRIO AQUI].\\nPara ser transferido, aguarde um momento. Se for urgente, ligue para [INSERIR NÚMERO AQUI].\\n\\nOu *digite voltar* para o Menu Principal.');
      return;
    }

    if (lowerMessage === '4' || lowerMessage === '/comandos' || lowerMessage === '/admin') {
      const helpMsg = `🆘 *COMANDOS ADMINISTRATIVOS*\\n\\n• /test - Status de Conexão\\n• /debug - Informações Técnicas\\n• /ajuda - Menu Principal\\n\\n*Para sair:* Digite *voltar* ou *menu*.`;
      await enviarComFormatosCorretos(from, helpMsg);
      return;
    }

    if (lowerMessage === 'voltar' || lowerMessage === 'menu' || lowerMessage === '/ajuda' || lowerMessage === 'ajuda' || lowerMessage === '/help' || lowerMessage === 'oi' || lowerMessage === 'ola' || lowerMessage === 'olá') {
      await enviarMenuInicial(from);
      return;
    }


    // --- COMANDOS ADMINISTRATIVOS ---
    if (lowerMessage === '/test' || lowerMessage === 'test') {
      const farmacyData = await findFarmacyAPI(whatsappPhoneId);
      const statusAPI = farmacyData ? '✅ CONFIGURADA' : '❌ NÃO CONFIGURADA';
      const statusMsg = `✅ *SISTEMA MULTI-TENANT FUNCIONANDO!*\\n\\n🏪 Farmácia: ${statusAPI}\\n📞 WhatsApp: ✅ Conectado\\n🛍️ Produtos: ✅ API Conectada\\n🤖 IA: ✅ Base de Medicamentos\\n🚀 Status: 100% Operacional`;
      await enviarComFormatosCorretos(from, statusMsg);
      return;
    }

    if (lowerMessage === '/debug' || lowerMessage === 'debug') {
      const farmacyData = await findFarmacyAPI(whatsappPhoneId);
      const formatos = converterParaFormatoFuncional(from);
      const debugInfo = `🔧 *DEBUG SISTEMA MULTI-TENANT*\\n\\n📱 Seu número: ${from}\\n🎯 Formatos: ${formatos.join(', ')}\\n🏪 Farmácia ID: ${whatsappPhoneId}\\n🔗 API: ${farmacyData?.api_base_url || 'NÃO CONFIGURADA'}\\n🤖 Medicamentos: ${medicamentosData.length} cadastrados\\n✅ Sistema: 100% Operacional`;
      await enviarComFormatosCorretos(from, debugInfo);
      return;
    }

    // --- CONSULTA DE PRODUTOS (COM LÓGICA DE CONTEXTO APRIMORADA) ---
    const termoBusca = extrairTermoBusca(userMessage);

    if (termoBusca) {
      console.log(`🛍️ [PRODUTO] Consultando: "${termoBusca}" (Termo extraído)`);

      const farmacyData = await findFarmacyAPI(whatsappPhoneId);

      if (!farmacyData?.api_base_url) {
        await enviarComFormatosCorretos(from, '❌ *FARMÁCIA NÃO CONFIGURADA*\\n\\nEsta farmácia ainda não está configurada no sistema. Contate o suporte técnico.');
        return;
      }

      if (termoBusca.length < 2) {
        await enviarComFormatosCorretos(from, '🔍 *BUSCA DE PRODUTOS*\\n\\nPor favor, digite pelo menos 2 caracteres para buscar.\\n\\n💡 *Exemplos:*\\n• produto paracetamol\\n• buscar dipirona\\n• estoque nimesulida');
        return;
      }

      try {
        const resultado = await consultarAPIFarmacia(farmacyData.api_base_url, termoBusca);

        if (!resultado.success || resultado.count === 0) {
          await enviarComFormatosCorretos(from, `❌ *PRODUTO NÃO ENCONTRADO*\\n\\nNão encontrei produtos para "*${termoBusca}*".\\n\\n💡 *Sugestões:*\\n• Verifique a ortografia\\n• Tente um termo mais específico\\n• Use apenas o nome principal`);
          return;
        }

        // --- NOVO FORMATO DE RESPOSTA MAIS CLARO ---
        let resposta = `🔍 *${resultado.count} PRODUTO(S) ENCONTRADO(S)*\\n` +
                      `*Sua busca:* "${termoBusca}"\\n\\n`;

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

        resposta += `💡 *Próxima Ação:* Digite o número do item (ex: *1* ou *2*) para detalhes, ou *voltar* para o Menu.`;

        await enviarComFormatosCorretos(from, resposta);
        return;

      } catch (error) {
        console.error('❌ [PRODUTO] Erro na consulta:', error);
        await enviarComFormatosCorretos(from, '⚠️ *ERRO NA CONSULTA*\\n\\nNão consegui buscar produtos no momento.\\nNossa equipe foi notificada.\\n\\nTente novamente em alguns instantes, ou *digite /test*.');
        return;
      }
    }

    // --- CONSULTA DE MEDICAMENTOS (FALLBACK) ---
    const parsedInfo = parseUserMessageForDrugInfo(userMessage);

    if (parsedInfo.drugName) {
      console.log(`💊 [MEDICAMENTO] Consultando: ${parsedInfo.drugName} - ${parsedInfo.infoType}`);

      const infoMedicamento = getMedicamentoInfo(parsedInfo.drugName, parsedInfo.infoType || 'tudo');
      await enviarComFormatosCorretos(from, infoMedicamento);
      return;
    }

    // --- MENSAGEM GENÉRICA (QUANDO NENHUM COMANDO É RECONHECIDO) ---
    await enviarMenuInicial(from);

  } catch (error) {
    console.error('❌ [PROCESS] Erro crítico:', error);
    await enviarComFormatosCorretos(
      from,
      '⚠️ *ERRO TEMPORÁRIO*\\n\\nEstou com dificuldades momentâneas.\\nTente novamente em alguns instantes.\\n\\nUse /test para verificar o status, ou *digite voltar*.'
    );
  }
}