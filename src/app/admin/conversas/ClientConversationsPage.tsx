'use client';

import { useEffect, useState, useRef } from 'react';
import DateDisplay from '@/components/DateDisplay';

interface Message {
  id: string;
  created_at: string;
  from_number: string;
  message_body: string;
  direction: 'IN' | 'OUT';
}

interface Conversation {
  number: string;
  messages: Message[];
  lastMessage: Message;
  count: number;
}

export default function ClientConversationsPage({ initialMessages }: { initialMessages: Message[] }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Agrupar mensagens por cliente
  useEffect(() => {
    const grouped: { [key: string]: Conversation } = {};
    
    messages.forEach(msg => {
      if (!grouped[msg.from_number]) {
        grouped[msg.from_number] = {
          number: msg.from_number,
          messages: [],
          lastMessage: msg,
          count: 0
        };
      }
      grouped[msg.from_number].messages.push(msg);
      grouped[msg.from_number].lastMessage = msg;
      grouped[msg.from_number].count++;
    });

    const convArray = Object.values(grouped).sort((a, b) =>
      new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime()
    );

    setConversations(convArray);
    
    if (convArray.length > 0 && !selectedConversation) {
      setSelectedConversation(convArray[0]);
    }
  }, [messages, selectedConversation]);

  // Auto-scroll para a mensagem mais recente
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedConversation?.messages]);

  // Recarregar mensagens a cada 5 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      // Em produção, isso seria uma chamada à API
      // Por enquanto, apenas usar as mensagens iniciais
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedConversation) return;

    setLoading(true);
    try {
      // Aqui você pode adicionar a lógica para enviar a mensagem via API
      const response = await fetch('/api/admin/send-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selectedConversation.number,
          message: replyText
        })
      });

      if (response.ok) {
        setReplyText('');
        // Adicionar mensagem à lista local
        const newMessage: Message = {
          id: Date.now().toString(),
          created_at: new Date().toISOString(),
          from_number: selectedConversation.number,
          message_body: replyText,
          direction: 'OUT'
        };
        setMessages([...messages, newMessage]);
      }
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
    }
    setLoading(false);
  };

  if (conversations.length === 0) {
    return (
      <div className="flex h-screen bg-gray-100 items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-gray-600">Nenhuma conversa encontrada</p>
        </div>
      </div>
    );
  }

  // Ordenar mensagens da conversa selecionada por data (mais recentes no final)
  const sortedMessages = selectedConversation?.messages.sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  ) || [];

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar - Lista de Conversas */}
      <div className="w-80 border-r border-gray-200 flex flex-col bg-white">
        <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          <h2 className="text-xl font-bold">💬 Conversas</h2>
          <p className="text-sm text-blue-100 mt-1">{conversations.length} cliente(s) ativo(s)</p>
        </div>

        <div className="overflow-y-auto flex-1">
          {conversations.map((conv) => (
            <div
              key={conv.number}
              onClick={() => setSelectedConversation(conv)}
              className={`p-4 border-b border-gray-100 cursor-pointer transition-all ${
                selectedConversation?.number === conv.number
                  ? 'bg-blue-50 border-l-4 border-blue-600'
                  : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex justify-between items-start">
                <span className="font-semibold text-gray-800">{conv.number}</span>
                <span className="text-xs text-gray-500">
                  <DateDisplay dateString={conv.lastMessage.created_at} />
                </span>
              </div>
              <p className="text-sm text-gray-600 truncate mt-1 line-clamp-2">
                {conv.lastMessage.message_body.replace(/\\n/g, ' ')}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 bg-white shadow-sm">
          <h3 className="text-lg font-bold text-gray-800">
            💬 {selectedConversation?.number}
          </h3>
          <p className="text-sm text-gray-500">
            {selectedConversation?.count} mensagens
          </p>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {sortedMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.direction === 'IN' ? 'justify-start' : 'justify-end'}`}
            >
              <div
                className={`max-w-lg p-3 rounded-2xl ${
                  msg.direction === 'IN'
                    ? 'bg-white text-gray-800 border border-gray-200'
                    : 'bg-blue-600 text-white'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap break-words">
                  {msg.message_body.replace(/\\n/g, '\n')}
                </p>
                <div
                  className={`text-xs mt-2 ${
                    msg.direction === 'IN' ? 'text-gray-500' : 'text-blue-200'
                  }`}
                >
                  <DateDisplay dateString={msg.created_at} />
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-gray-200 bg-white">
          <form onSubmit={handleSendReply} className="flex gap-3">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Digite sua resposta..."
              disabled={loading}
              className="flex-1 px-4 py-3 rounded-full border border-gray-300 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 disabled:bg-gray-100"
            />
            <button
              type="submit"
              disabled={loading || !replyText.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:bg-gray-300 transition-colors font-semibold"
            >
              {loading ? '...' : '📤'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
