// src/app/page.tsx
'use client'; // Importante para componentes no App Router

import { useState } from 'react';

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot';
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false); // Para indicar quando o bot está pensando

  const handleSend = async () => { // Torne a função assíncrona
    if (!input.trim() || isLoading) return // Impede envio duplicado ou enquanto está carregando

    const userMessage: Message = {
      id: Date.now(),
      text: input,
      sender: 'user'
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true) // Define o estado de carregamento

    try {
      // Faz a requisição POST para a nova API route
      const response = await fetch('/api/chat', { // Chama a nova rota /api/chat
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userMessage.text, userId: "web_chat_user_123" }), // Envia a mensagem do usuário e um ID
      })

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao obter resposta do bot.');
      }

      const data = await response.json()
      const botReplyText = data.response // A resposta do bot vem da propriedade 'response'

      const botMessage: Message = {
        id: Date.now() + 1,
        text: botReplyText,
        sender: 'bot'
      }
      setMessages(prev => [...prev, botMessage])

    } catch (error) {
      console.error('Erro ao enviar mensagem para o chatbot:', error)
      const errorMessage: Message = {
        id: Date.now() + 1,
        text: 'Desculpe, não consegui obter uma resposta. Tente novamente mais tarde.',
        sender: 'bot'
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false) // Remove o estado de carregamento
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      <header className="bg-gray-800 text-white p-4 shadow-lg">
        <h1 className="text-2xl font-bold">🤖 Meu Chatbot</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs md:max-w-md px-4 py-2 rounded-lg ${
                msg.sender === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-100'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {/* Indicador de digitação/carregamento do bot */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-xs md:max-w-md px-4 py-2 rounded-lg bg-gray-700 text-gray-100 animate-pulse">
              Digitando...
            </div>
          </div>
        )}
      </div>

      <div className="bg-gray-800 p-4 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Digite sua mensagem..."
            className="flex-1 px-4 py-2 rounded-lg bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-blue-500"
            disabled={isLoading} // Desabilita o input enquanto está carregando
          />
          <button
            onClick={handleSend}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading} // Desabilita o botão enquanto está carregando
          >
            {isLoading ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  )
}