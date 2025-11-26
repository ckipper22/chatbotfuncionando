// src/app/admin/conversas/page.js
// ====================================================================================
// COMPONENTE SERVIDOR: Dashboard de Conversas Profissional
// ====================================================================================

import { createClient } from '@supabase/supabase-js';
import DateDisplay from '@/components/DateDisplay'; // Componente Cliente para corrigir Hydration

// Inicialização do cliente Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Função de utilidade: Agrupa mensagens por cliente (from_number)
function groupMessagesByCustomer(messages) {
  const conversations = {};
  messages.forEach(msg => {
    const customerNumber = msg.from_number;
    if (!conversations[customerNumber]) {
      conversations[customerNumber] = {
        number: customerNumber,
        lastMessage: msg,
        messages: [],
        count: 0,
      };
    }
    // Adiciona a mensagem, mantendo a ordem (a lista já vem ordenada por 'created_at' DESC do Supabase)
    conversations[customerNumber].messages.push(msg);
    conversations[customerNumber].count++;
  });

  // Converte o objeto em array e ordena pelas conversas mais recentes
  return Object.values(conversations).sort((a, b) =>
    new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime()
  );
}

// Função para buscar os dados (Executada no Servidor)
async function fetchMessages() {
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100); // Aumentei o limite para ter mais histórico

  if (error) {
    console.error('Erro ao buscar conversas:', error);
    return [];
  }
  return data;
}

// Componente principal da página
export default async function ConversationsPage() {
  const rawMessages = await fetchMessages();
  const conversations = groupMessagesByCustomer(rawMessages);

  // Seleciona a primeira conversa para exibir o histórico por padrão
  const selectedConversation = conversations[0] || { messages: [] };
  const customerCount = conversations.length;

  return (
    // Layout Principal: Tela cheia, usando a fonte Geist (do seu layout)
    <div className="flex h-screen bg-gray-50 text-gray-800">

      {/* Coluna Esquerda: Lista de Clientes/Conversas */}
      <div className="w-1/4 min-w-80 border-r border-gray-200 bg-white shadow-xl flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-blue-600">Caixa de Entrada 💬</h2>
          <p className="text-sm text-gray-500 mt-1">{customerCount} conversas ativas</p>
        </div>

        {/* Lista de Conversas (Rolável) */}
        <div className="overflow-y-auto flex-1">
          {conversations.map((conv, index) => (
            <div
              key={conv.number}
              // Estilização para destacar a conversa 'selecionada' (a primeira)
              className={`p-4 border-b border-gray-100 cursor-pointer transition-all ${
                index === 0 ? 'bg-blue-50 border-l-4 border-blue-500' : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex justify-between items-start">
                <span className="font-semibold text-base">{conv.number}</span>
                <span className="text-xs text-gray-500">
                  {/* Usa a data da última mensagem */}
                  <DateDisplay dateString={conv.lastMessage.created_at} />
                </span>
              </div>
              <p className="text-sm text-gray-600 truncate mt-1">
                {conv.lastMessage.message_body.substring(0, 50)}...
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Coluna Direita: Visualização do Chat (simulando a conversa) */}
      <div className="flex-1 flex flex-col">
        <header className="p-4 border-b border-gray-200 bg-white shadow-sm">
          <h3 className="text-lg font-bold">Conversa com: {selectedConversation.number || 'Nenhum Cliente'}</h3>
          <p className="text-sm text-gray-500">Total de {selectedConversation.messages.length} mensagens</p>
        </header>

        {/* Área de Mensagens (Invertida e Rolável) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 flex flex-col-reverse bg-gray-100">
          {selectedConversation.messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.direction === 'IN' ? 'justify-start' : 'justify-end'}`}
            >
              {/* Bolha da Mensagem (Bubble) */}
              <div
                className={`max-w-xl p-3 rounded-xl shadow-md ${
                  msg.direction === 'IN'
                    ? 'bg-white text-gray-800 rounded-bl-sm' // Mensagem Recebida (IN)
                    : 'bg-blue-500 text-white rounded-br-sm' // Mensagem Enviada (OUT)
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">
                  {msg.message_body}
                </p>
                <div className={`text-xs mt-1 ${msg.direction === 'IN' ? 'text-gray-400' : 'text-blue-200'}`}>
                  {msg.direction === 'IN' ? 'RECEBIDA' : 'ENVIADA'} · <DateDisplay dateString={msg.created_at} />
                </div>
              </div>
            </div>
          )).reverse()} {/* Inverte a ordem para que a mais recente fique na parte de baixo da rolagem */}
        </div>

        {/* Rodapé (Simulação de Área de Resposta - Deixamos vazio por enquanto) */}
        <footer className="p-4 border-t border-gray-200 bg-white">
          <div className="text-sm text-gray-500 italic">
            Visualização de histórico (A área de resposta seria implementada aqui).
          </div>
        </footer>
      </div>

    </div>
  );
}

// Nota: Não precisamos mais do objeto 'styles' antigo, pois estamos usando Tailwind CSS.