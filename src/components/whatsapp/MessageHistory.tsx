
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WhatsAppStorage } from '@/lib/whatsapp-storage';
import { WhatsAppMessage } from '@/types/whatsapp';
import { RefreshCw, Trash2, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function MessageHistory() {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);

  const loadMessages = () => {
    const msgs = WhatsAppStorage.getMessages(50);
    setMessages(msgs);
  };

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleClear = () => {
    if (confirm('Tem certeza que deseja limpar todo o histórico?')) {
      WhatsAppStorage.clearMessages();
      setMessages([]);
      toast.success('Histórico limpo com sucesso');
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'sent':
        return 'bg-blue-500';
      case 'delivered':
        return 'bg-green-500';
      case 'read':
        return 'bg-purple-500';
      case 'failed':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case 'sent':
        return 'Enviada';
      case 'delivered':
        return 'Entregue';
      case 'read':
        return 'Lida';
      case 'failed':
        return 'Falhou';
      default:
        return 'Desconhecido';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Histórico de Mensagens</CardTitle>
            <CardDescription>Últimas 50 mensagens enviadas e recebidas</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadMessages}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleClear}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          {messages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma mensagem no histórico
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-3 rounded-lg border ${
                    msg.direction === 'outbound' ? 'bg-blue-50 dark:bg-blue-950' : 'bg-green-50 dark:bg-green-950'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {msg.direction === 'outbound' ? (
                        <ArrowUpRight className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      ) : (
                        <ArrowDownLeft className="h-4 w-4 text-green-600 dark:text-green-400" />
                      )}
                      <span className="font-semibold text-sm">
                        {msg.direction === 'outbound' ? `Para: ${msg.to}` : `De: ${msg.from}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {msg.type}
                      </Badge>
                      {msg.status && (
                        <Badge className={`text-xs ${getStatusColor(msg.status)}`}>
                          {getStatusLabel(msg.status)}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="text-sm mb-2">
                    {msg.content.text && <p>{msg.content.text}</p>}
                    {msg.content.mediaUrl && (
                      <p className="text-muted-foreground">
                        Mídia: {msg.content.mediaUrl.substring(0, 50)}...
                      </p>
                    )}
                    {msg.content.caption && (
                      <p className="text-muted-foreground italic">{msg.content.caption}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{new Date(msg.timestamp).toLocaleString('pt-BR')}</span>
                    <span className="font-mono">{msg.id.substring(0, 20)}...</span>
                  </div>

                  {msg.error && (
                    <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                      Erro: {msg.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
