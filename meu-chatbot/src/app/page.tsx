'use client'

import { useState } from 'react'

interface Message {
  id: number
  text: string
  sender: 'user' | 'bot'
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, text: '👋 Olá! Como posso ajudar você hoje?', sender: 'bot' }
  ])
  const [input, setInput] = useState('')

  const handleSend = () => {
    if (!input.trim()) return

    const userMessage: Message = {
      id: Date.now(),
      text: input,
      sender: 'user'
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')

    setTimeout(() => {
      const botMessage: Message = {
        id: Date.now() + 1,
        text: `Você disse: "${input}". Como posso ajudar?`,
        sender: 'bot'
      }
      setMessages(prev => [...prev, botMessage])
    }, 1000)
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
          />
          <button
            onClick={handleSend}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  )
}