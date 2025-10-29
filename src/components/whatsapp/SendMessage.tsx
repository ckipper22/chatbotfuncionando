
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WhatsAppStorage } from '@/lib/whatsapp-storage';
import { WhatsAppConfig } from '@/types/whatsapp';
import { api, ApiError } from '@/lib/api-client';
import { toast } from 'sonner';
import { Send, Loader2 } from 'lucide-react';

export default function SendMessage() {
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [sending, setSending] = useState(false);
  const [messageType, setMessageType] = useState<'text' | 'image' | 'video' | 'audio' | 'document'>('text');
  const [to, setTo] = useState('');
  const [text, setText] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [filename, setFilename] = useState('');

  useEffect(() => {
    const savedConfig = WhatsAppStorage.getConfig();
    setConfig(savedConfig);
  }, []);

  const handleSend = async () => {
    if (!config) {
      toast.error('Configure a API primeiro');
      return;
    }

    if (!to) {
      toast.error('Número de destino é obrigatório');
      return;
    }

    if (messageType === 'text' && !text) {
      toast.error('Texto da mensagem é obrigatório');
      return;
    }

    if (messageType !== 'text' && !mediaUrl) {
      toast.error('URL da mídia é obrigatória');
      return;
    }

    setSending(true);

    try {
      const content: any = {};

      if (messageType === 'text') {
        content.text = text;
      } else {
        content.mediaUrl = mediaUrl;
        if (caption) content.caption = caption;
        if (filename && messageType === 'document') content.filename = filename;
      }

      const result = await api.post('/whatsapp/send', {
        to,
        type: messageType,
        content,
        config,
      });

      const message = {
        id: result.messageId,
        from: config.phoneNumberId,
        to: to.replace(/\D/g, ''),
        timestamp: result.timestamp,
        type: messageType,
        direction: 'outbound' as const,
        status: 'sent' as const,
        content,
      };

      WhatsAppStorage.saveMessage(message);

      toast.success('Mensagem enviada com sucesso!');
      
      setText('');
      setMediaUrl('');
      setCaption('');
      setFilename('');
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(`Erro ao enviar: ${error.errorMessage}`);
      } else {
        toast.error('Erro ao enviar mensagem');
      }
    } finally {
      setSending(false);
    }
  };

  if (!config) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Enviar Mensagem</CardTitle>
          <CardDescription>Configure a API primeiro para enviar mensagens</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enviar Mensagem de Teste</CardTitle>
        <CardDescription>Envie mensagens via API do WhatsApp</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="to">Número de Destino *</Label>
          <Input
            id="to"
            placeholder="5511999999999"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Formato: código do país + DDD + número (sem espaços ou caracteres especiais)
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="messageType">Tipo de Mensagem</Label>
          <Select value={messageType} onValueChange={(value: any) => setMessageType(value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Texto</SelectItem>
              <SelectItem value="image">Imagem</SelectItem>
              <SelectItem value="video">Vídeo</SelectItem>
              <SelectItem value="audio">Áudio</SelectItem>
              <SelectItem value="document">Documento</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {messageType === 'text' ? (
          <div className="space-y-2">
            <Label htmlFor="text">Mensagem *</Label>
            <Textarea
              id="text"
              placeholder="Digite sua mensagem..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
            />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="mediaUrl">URL da Mídia *</Label>
              <Input
                id="mediaUrl"
                placeholder="https://exemplo.com/arquivo.jpg"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                A URL deve ser publicamente acessível
              </p>
            </div>

            {(messageType === 'image' || messageType === 'video' || messageType === 'document') && (
              <div className="space-y-2">
                <Label htmlFor="caption">Legenda (opcional)</Label>
                <Input
                  id="caption"
                  placeholder="Descrição da mídia"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                />
              </div>
            )}

            {messageType === 'document' && (
              <div className="space-y-2">
                <Label htmlFor="filename">Nome do Arquivo (opcional)</Label>
                <Input
                  id="filename"
                  placeholder="documento.pdf"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                />
              </div>
            )}
          </>
        )}

        <Button onClick={handleSend} disabled={sending} className="w-full">
          {sending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          Enviar Mensagem
        </Button>
      </CardContent>
    </Card>
  );
}
