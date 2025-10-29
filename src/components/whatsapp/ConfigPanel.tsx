
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { WhatsAppStorage } from '@/lib/whatsapp-storage';
import { WhatsAppConfig } from '@/types/whatsapp';
import { api, ApiError } from '@/lib/api-client';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Loader2, Save, TestTube } from 'lucide-react';

export default function ConfigPanel() {
  const [config, setConfig] = useState<WhatsAppConfig>({
    phoneNumberId: '',
    accessToken: '',
    webhookVerifyToken: '',
    businessAccountId: '',
    apiVersion: 'v21.0',
  });

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('/next_api/whatsapp/webhook');

  useEffect(() => {
    const savedConfig = WhatsAppStorage.getConfig();
    if (savedConfig) {
      setConfig(savedConfig);
    }

    // Define a URL completa apenas no cliente
    if (typeof window !== 'undefined') {
      setWebhookUrl(`${window.location.origin}/next_api/whatsapp/webhook`);
    }
  }, []);

  const handleSave = () => {
    if (!config.phoneNumberId || !config.accessToken) {
      toast.error('Phone Number ID e Access Token são obrigatórios');
      return;
    }

    WhatsAppStorage.saveConfig(config);
    toast.success('Configuração salva com sucesso!');
  };

  const handleTest = async () => {
    if (!config.phoneNumberId || !config.accessToken) {
      toast.error('Phone Number ID e Access Token são obrigatórios');
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const result = await api.post('/whatsapp/test', {
        phoneNumberId: config.phoneNumberId,
        accessToken: config.accessToken,
        apiVersion: config.apiVersion,
      });

      setTestResult({
        success: true,
        message: `Conexão OK! Número: ${result.phoneNumber || 'N/A'}`,
      });
      toast.success('Teste de conexão bem-sucedido!');
    } catch (error) {
      if (error instanceof ApiError) {
        setTestResult({
          success: false,
          message: error.errorMessage,
        });
        toast.error(`Falha no teste: ${error.errorMessage}`);
      } else {
        setTestResult({
          success: false,
          message: 'Erro desconhecido',
        });
        toast.error('Erro ao testar conexão');
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuração da API do WhatsApp</CardTitle>
        <CardDescription>
          Configure suas credenciais da API do WhatsApp Business
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="phoneNumberId">Phone Number ID *</Label>
          <Input
            id="phoneNumberId"
            placeholder="123456789012345"
            value={config.phoneNumberId}
            onChange={(e) => setConfig({ ...config, phoneNumberId: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="accessToken">Access Token *</Label>
          <Input
            id="accessToken"
            type="password"
            placeholder="EAAxxxxxxxxxx..."
            value={config.accessToken}
            onChange={(e) => setConfig({ ...config, accessToken: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="webhookVerifyToken">Webhook Verify Token</Label>
          <Input
            id="webhookVerifyToken"
            placeholder="my_verify_token_123"
            value={config.webhookVerifyToken}
            onChange={(e) => setConfig({ ...config, webhookVerifyToken: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Use este token ao configurar o webhook no Meta for Developers
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="businessAccountId">Business Account ID (opcional)</Label>
          <Input
            id="businessAccountId"
            placeholder="123456789012345"
            value={config.businessAccountId}
            onChange={(e) => setConfig({ ...config, businessAccountId: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="apiVersion">Versão da API</Label>
          <Input
            id="apiVersion"
            placeholder="v21.0"
            value={config.apiVersion}
            onChange={(e) => setConfig({ ...config, apiVersion: e.target.value })}
          />
        </div>

        {testResult && (
          <Alert variant={testResult.success ? 'default' : 'destructive'}>
            <div className="flex items-center gap-2">
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertDescription>{testResult.message}</AlertDescription>
            </div>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button onClick={handleSave} className="flex-1">
            <Save className="mr-2 h-4 w-4" />
            Salvar Configuração
          </Button>
          <Button onClick={handleTest} variant="outline" disabled={testing}>
            {testing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <TestTube className="mr-2 h-4 w-4" />
            )}
            Testar Conexão
          </Button>
        </div>

        <div className="pt-4 border-t">
          <h4 className="text-sm font-semibold mb-2">Webhook URL</h4>
          <code className="text-xs bg-muted p-2 rounded block break-all">
            {webhookUrl}
          </code>
          <p className="text-xs text-muted-foreground mt-2">
            Configure esta URL no Meta for Developers para receber mensagens
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
