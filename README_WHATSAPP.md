
# WhatsApp Bot Backend - Guia de Configuração

Este é um sistema completo de backend para integração com a API do WhatsApp Business, permitindo testes e evolução para um chatbot completo.

## 🚀 Funcionalidades

- ✅ **Configuração da API**: Gerenciamento de credenciais (token, phone number ID, etc.)
- ✅ **Envio de Mensagens**: Interface para testar envio de mensagens (texto, imagem, vídeo, áudio, documento)
- ✅ **Webhook Receiver**: Endpoint para receber mensagens e eventos do WhatsApp
- ✅ **Histórico de Conversas**: Armazenamento local de todas as mensagens
- ✅ **Dashboard de Monitoramento**: Visualização de estatísticas em tempo real
- ✅ **Gerenciamento de Contatos**: Lista de pessoas que interagiram com o bot
- ✅ **Base para Chatbot**: Estrutura preparada para adicionar lógica de respostas automáticas

## 📋 Pré-requisitos

### 1. Criar uma Conta no Meta for Developers

1. Acesse: https://developers.facebook.com/
2. Crie uma conta ou faça login
3. Crie um novo App do tipo "Business"

### 2. Configurar o WhatsApp Business API

1. No painel do seu App, adicione o produto "WhatsApp"
2. Configure um número de telefone de teste (fornecido pelo Meta)
3. Anote as seguintes informações:
   - **Phone Number ID**: ID do número de telefone
   - **Access Token**: Token de acesso temporário (válido por 24h)
   - **Business Account ID**: ID da conta business (opcional)

### 3. Obter um Token Permanente (Produção)

Para produção, você precisará gerar um token permanente:

1. Vá em "Configurações do App" > "Básico"
2. Copie o "App ID" e "App Secret"
3. Use a ferramenta de geração de tokens do Meta
4. Configure permissões: `whatsapp_business_messaging`, `whatsapp_business_management`

## 🔧 Configuração do Sistema

### 1. Configurar Credenciais

1. Acesse a aplicação
2. Na seção "Configuração da API do WhatsApp", preencha:
   - **Phone Number ID**: Cole o ID do número
   - **Access Token**: Cole o token de acesso
   - **Webhook Verify Token**: Crie um token personalizado (ex: `meu_token_secreto_123`)
   - **API Version**: Mantenha `v21.0` ou use a versão mais recente

3. Clique em "Testar Conexão" para validar as credenciais
4. Clique em "Salvar Configuração"

### 2. Configurar o Webhook

O webhook permite que o WhatsApp envie mensagens recebidas para sua aplicação.

#### Desenvolvimento Local (usando ngrok)

1. Instale o ngrok: https://ngrok.com/download
2. Execute: `ngrok http 3000`
3. Copie a URL gerada (ex: `https://abc123.ngrok.io`)

#### Configurar no Meta for Developers

1. Vá em "WhatsApp" > "Configuração"
2. Na seção "Webhook", clique em "Configurar"
3. Cole a URL do webhook:
   ```
   https://seu-dominio.com/next_api/whatsapp/webhook
   ```
   (Para desenvolvimento local, use a URL do ngrok)

4. Cole o **Webhook Verify Token** que você definiu na configuração
5. Clique em "Verificar e salvar"
6. Inscreva-se nos seguintes campos:
   - `messages` (para receber mensagens)
   - `message_status` (para receber status de entrega)

### 3. Adicionar Números de Teste

1. No Meta for Developers, vá em "WhatsApp" > "Primeiros Passos"
2. Adicione números de telefone para teste
3. Os números receberão um código de verificação via WhatsApp
4. Após verificar, você poderá enviar mensagens para esses números

## 📱 Como Usar

### Enviar Mensagem de Teste

1. Vá para a seção "Enviar Mensagem de Teste"
2. Digite o número de destino (formato: `5511999999999`)
3. Escolha o tipo de mensagem:
   - **Texto**: Digite a mensagem
   - **Imagem/Vídeo/Áudio/Documento**: Cole a URL pública do arquivo
4. Clique em "Enviar Mensagem"

### Receber Mensagens

1. Envie uma mensagem do WhatsApp para o número configurado
2. A mensagem aparecerá automaticamente no "Histórico de Mensagens"
3. O contato será adicionado à lista de "Contatos"

### Monitorar Estatísticas

O Dashboard mostra em tempo real:
- Total de mensagens enviadas
- Total de mensagens recebidas
- Mensagens entregues
- Mensagens lidas
- Falhas no envio

## 🤖 Próximos Passos: Criar um Chatbot

Para transformar este sistema em um chatbot com respostas automáticas:

### 1. Criar Lógica de Respostas

Edite o arquivo `src/app/next_api/whatsapp/webhook/route.ts` e adicione lógica de resposta:

```typescript
// Exemplo de resposta automática
if (value.messages) {
  for (const message of value.messages) {
    const userMessage = message.text?.body?.toLowerCase();
    
    // Lógica de resposta
    if (userMessage?.includes('oi') || userMessage?.includes('olá')) {
      // Enviar resposta automática
      await sendAutoReply(message.from, 'Olá! Como posso ajudar?');
    }
  }
}
```

### 2. Implementar Fluxos de Conversação

Crie um sistema de estados para gerenciar conversas:

```typescript
// Exemplo de fluxo
const conversationState = {
  [phoneNumber]: {
    step: 'greeting',
    data: {}
  }
};
```

### 3. Integrar com IA (Opcional)

Integre com serviços de IA como OpenAI GPT para respostas inteligentes:

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getAIResponse(userMessage: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: userMessage }],
  });
  
  return completion.choices[0].message.content;
}
```

## 🔒 Segurança

### Validação de Webhook

O webhook já inclui validação do token. Para produção, adicione:

1. Validação de assinatura do Meta
2. Rate limiting
3. Logs de auditoria

### Proteção de Credenciais

- Nunca commite tokens no Git
- Use variáveis de ambiente para produção
- Rotacione tokens regularmente

## 📊 Estrutura de Dados

### Armazenamento Local (localStorage)

O sistema usa localStorage para armazenar:
- Configurações da API
- Histórico de mensagens
- Lista de contatos
- Estatísticas

Para produção, considere migrar para um banco de dados.

## 🐛 Troubleshooting

### Erro: "Failed to send message"

- Verifique se o token está válido
- Confirme que o número de destino está no formato correto
- Verifique se o número foi adicionado como número de teste

### Webhook não recebe mensagens

- Confirme que a URL do webhook está acessível publicamente
- Verifique se o verify token está correto
- Veja os logs no Meta for Developers

### Token expirado

- Tokens temporários expiram em 24h
- Gere um token permanente para produção

## 📚 Recursos Úteis

- [Documentação WhatsApp Business API](https://developers.facebook.com/docs/whatsapp)
- [Guia de Webhooks](https://developers.facebook.com/docs/whatsapp/webhooks)
- [Referência da API](https://developers.facebook.com/docs/whatsapp/cloud-api/reference)

## 🎯 Roadmap

- [ ] Suporte a mensagens interativas (botões, listas)
- [ ] Templates de mensagens
- [ ] Integração com CRM
- [ ] Analytics avançado
- [ ] Suporte a múltiplos atendentes
- [ ] Chatbot com IA integrada

## 💡 Dicas

1. **Teste primeiro**: Use o número de teste fornecido pelo Meta antes de ir para produção
2. **Monitore os logs**: Acompanhe o console do navegador e os logs do webhook
3. **Documente fluxos**: Mantenha documentação dos fluxos de conversação do seu bot
4. **Backup de dados**: Exporte regularmente o histórico de mensagens

---

**Desenvolvido com Next.js, TypeScript e WhatsApp Business API**
