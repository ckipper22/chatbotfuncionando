// src/components/whatsapp/ConfigPanel.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { WhatsAppStorage } from '@/lib/whatsapp-storage';
import { api, ApiError } from '@/lib/api-client';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Loader2, Save, TestTube } from 'lucide-react';

// Interface local se ainda houver problemas com a importação
interface WhatsAppConfig {
  id?: string;
  phone_number_id: string;
  access_token: string;
  webhook_verify_token: string;
  business_account_id?: string;
  waba_id?: string;
  app_id?: string;
  is_active: boolean;
  webhook_url: string;
  created_at?: string;
  updated_at?: string;
}

interface ConfigPanelProps {
  onConfigUpdate?: () => void;
}

export function ConfigPanel({ onConfigUpdate }: ConfigPanelProps) {
  const [config, setConfig] = useState<WhatsAppConfig>({
    phone_number_id: '',
    access_token: '',
    webhook_verify_token: '',
    is_active: true,
    webhook_url: `${typeof window !== 'undefined' ? window.location.origin : ''}/api/whatsapp/webhook`
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{success: boolean; message: string} | null>(null);

  useEffect(() => {
    loadStoredConfig();
  }, []);

  const loadStoredConfig = () => {
    const storedConfig = WhatsAppStorage.getConfig();
    if (storedConfig) {
      setConfig(storedConfig);
    }
  };

  const handleInputChange = (field: keyof WhatsAppConfig, value: string | boolean) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      // Validação básica
      if (!config.phone_number_id || !config.access_token || !config.webhook_verify_token) {
        toast.error('Preencha todos os campos obrigatórios');
        return;
      }

      WhatsAppStorage.saveConfig(config);
      toast.success('Configuração salva com sucesso!');
      onConfigUpdate?.();
    } catch (error) {
      console.error('Erro ao salvar configuração:', error);
      toast.error('Erro ao salvar configuração');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await api.post<{success: boolean; message: string}>('/whatsapp/test-connection', config);

      setTestResult(result);
      if (result.success) {
        toast.success('Conexão testada com sucesso!');
      } else {
        toast.error('Falha no teste de conexão');
      }
    } catch (error) {
      console.error('Erro ao testar conexão:', error);
      const message = error instanceof ApiError
        ? error.message
        : 'Erro ao testar conexão com WhatsApp';

      setTestResult({ success: false, message });
      toast.error('Erro ao testar conexão');
    } finally {
      setIsTesting(false);
    }
  };

  const handleWebhookVerification = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await api.post<{success: boolean; message: string}>('/whatsapp/verify-webhook', {
        verify_token: config.webhook_verify_token
      });

      setTestResult(result);
      if (result.success) {
        toast.success('Webhook verificado com sucesso!');
      } else {
        toast.error('Falha na verificação do webhook');
      }
    } catch (error) {
      console.error('Erro ao verificar webhook:', error);
      const message = error instanceof ApiError
        ? error.message
        : 'Erro ao verificar webhook';

      setTestResult({ success: false, message });
      toast.error('Erro ao verificar webhook');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Configuração do WhatsApp Business API</CardTitle>
          <CardDescription>
            Configure as credenciais para integração com a Meta WhatsApp Business API
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Phone Number ID */}
          <div className="space-y-2">
            <Label htmlFor="phone_number_id">Phone Number ID *</Label>
            <Input
              id="phone_number_id"
              value={config.phone_number_id}
              onChange={(e) => handleInputChange('phone_number_id', e.target.value)}
              placeholder="Ex: 123456789012345"
            />
            <p className="text-sm text-muted-foreground">
              ID do número de telefone da Meta
            </p>
          </div>

          {/* Access Token */}
          <div className="space-y-2">
            <Label htmlFor="access_token">Access Token *</Label>
            <Input
              id="access_token"
              type="password"
              value={config.access_token}
              onChange={(e) => handleInputChange('access_token', e.target.value)}
              placeholder="Ex: EAAG... (Token de acesso permanente)"
            />
            <p className="text-sm text-muted-foreground">
              Token de acesso permanente da Meta
            </p>
          </div>

          {/* Webhook Verify Token */}
          <div className="space-y-2">
            <Label htmlFor="webhook_verify_token">Webhook Verify Token *</Label>
            <Input
              id="webhook_verify_token"
              value={config.webhook_verify_token}
              onChange={(e) => handleInputChange('webhook_verify_token', e.target.value)}
              placeholder="Ex: meu_token_secreto_123"
            />
            <p className="text-sm text-muted-foreground">
              Token para verificação do webhook
            </p>
          </div>

          {/* Webhook URL */}
          <div className="space-y-2">
            <Label htmlFor="webhook_url">Webhook URL</Label>
            <Input
              id="webhook_url"
              value={config.webhook_url}
              onChange={(e) => handleInputChange('webhook_url', e.target.value)}
              placeholder="URL do webhook"
            />
            <p className="text-sm text-muted-foreground">
              URL para receber mensagens do WhatsApp
            </p>
          </div>

          {/* Status */}
          <div className="flex items-center space-x-2">
            <Switch
              id="is_active"
              checked={config.is_active}
              onCheckedChange={(checked) => handleInputChange('is_active', checked)}
            />
            <Label htmlFor="is_active">Integração ativa</Label>
          </div>

          {/* Test Results */}
          {testResult && (
            <Alert variant={testResult.success ? "default" : "destructive"}>
              <div className="flex items-center">
                {testResult.success ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                <AlertDescription className="ml-2">
                  {testResult.message}
                </AlertDescription>
              </div>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4">
            <Button
              onClick={handleSave}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar Configuração
            </Button>

            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={isTesting || isLoading}
              className="flex items-center gap-2"
            >
              {isTesting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4" />
              )}
              Testar Conexão
            </Button>

            <Button
              variant="outline"
              onClick={handleWebhookVerification}
              disabled={isTesting || isLoading}
              className="flex items-center gap-2"
            >
              {isTesting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4" />
              )}
              Verificar Webhook
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Information Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Informações Importantes</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• Certifique-se de que o webhook está configurado na Meta com a URL acima</p>
          <p>• O Verify Token deve ser exatamente o mesmo configurado no painel da Meta</p>
          <p>• Mantenha o Access Token seguro e nunca o compartilhe</p>
          <p>• Teste a conexão após salvar as configurações</p>
        </CardContent>
      </Card>
    </div>
  );
}