
# 🔧 Guia de Configuração do Webhook WhatsApp

## 📋 Pré-requisitos

1. **Conta Meta for Developers** criada
2. **App configurado** no painel do Meta
3. **Número de telefone** do WhatsApp Business vinculado
4. **Ngrok ou URL pública** funcionando

---

## 🚀 Passo a Passo

### 1️⃣ Configure as Variáveis de Ambiente

Crie o arquivo `.env.local` na raiz do projeto:

```bash
cp .env.example .env.local
```

Edite o arquivo `.env.local` e configure:

```env
WHATSAPP_WEBHOOK_VERIFY_TOKEN=meu_token_secreto_123
WHATSAPP_ACCESS_TOKEN=seu_token_aqui
WHATSAPP_PHONE_NUMBER_ID=seu_id_aqui
```

> ⚠️ **Importante:** O `WHATSAPP_WEBHOOK_VERIFY_TOKEN` pode ser qualquer texto que você escolher. Use o mesmo valor no painel do Meta.

---

### 2️⃣ Inicie o Servidor

```bash
npm run dev
```

Certifique-se que está rodando em `http://localhost:3000`

---

### 3️⃣ Inicie o Ngrok

Em outro terminal:

```bash
ngrok http 3000
```

Copie a URL gerada (exemplo: `https://abc123.ngrok-free.app`)

---

### 4️⃣ Configure no Painel do Meta

1. Acesse: [Meta for Developers](https://developers.facebook.com/apps)
2. Selecione seu app
3. Vá em **WhatsApp > Configuration**
4. Na seção **Webhook**, clique em **Edit**

Configure:

- **URL de callback:** `https://sua-url-ngrok.ngrok-free.app/next_api/whatsapp/webhook`
- **Verificar token:** `meu_token_secreto_123` (mesmo valor do `.env.local`)

5. Clique em **Verificar e Salvar**

---

## ✅ Verificação

Se tudo estiver correto, você verá no console do Next.js:

```
🔍 Webhook verification request received: { mode: 'subscribe', token: 'meu_token_secreto_123', challenge: '...' }
🔑 Expected verify token: meu_token_secreto_123
✅ Webhook verified successfully!
```

E no painel do Meta aparecerá: **✓ Verificado**

---

## 🔔 Inscrever-se em Eventos

Após verificar o webhook, inscreva-se nos eventos:

1. Na mesma página de configuração do webhook
2. Clique em **Manage** (Gerenciar)
3. Selecione os campos:
   - ✅ `messages` (mensagens recebidas)
   - ✅ `message_status` (status de entrega)
4. Clique em **Subscribe** (Inscrever)

---

## 🧪 Teste o Webhook

### Opção 1: Enviar mensagem de teste

1. Envie uma mensagem para o número do WhatsApp Business
2. Verifique os logs no console do Next.js:

```
📩 Webhook received: { ... }
💬 New message received: { from: '5511999999999', text: 'Olá!' }
```

### Opção 2: Usar o endpoint de teste

Acesse no navegador:
```
http://localhost:3000/next_api/whatsapp/test
```

---

## ❌ Problemas Comuns

### Erro: "Não foi possível validar a URL de callback"

**Causas:**
- Ngrok não está rodando
- URL incorreta no painel do Meta
- Token verificador diferente entre `.env.local` e painel do Meta
- Servidor Next.js não está rodando

**Solução:**
1. Verifique se o Next.js está rodando: `npm run dev`
2. Verifique se o ngrok está ativo
3. Confirme que o token no `.env.local` é igual ao do painel do Meta
4. Veja os logs no console para identificar o erro

---

### Erro: "Unsupported get request"

**Causa:** O endpoint está tentando fazer uma requisição à API do Graph durante a verificação.

**Solução:** Já corrigido na versão atual do código. O endpoint GET agora apenas valida o token e retorna o challenge.

---

### Ngrok mostra página de aviso

**Causa:** Versão gratuita do ngrok mostra uma página de aviso antes de redirecionar.

**Solução:**
- Crie uma conta gratuita no ngrok para remover o aviso
- Ou use Vercel/Railway para deploy em produção

---

## 📞 URLs Importantes

- **Webhook:** `/next_api/whatsapp/webhook`
- **Enviar mensagem:** `/next_api/whatsapp/send`
- **Teste de conexão:** `/next_api/whatsapp/test`
- **Dashboard:** `/` (página inicial)

---

## 🔐 Segurança

⚠️ **NUNCA** compartilhe ou commite:
- `.env.local`
- Tokens de acesso
- Tokens verificadores

Sempre use variáveis de ambiente para credenciais sensíveis.

---

## 📚 Documentação Oficial

- [WhatsApp Business API](https://developers.facebook.com/docs/whatsapp)
- [Webhooks](https://developers.facebook.com/docs/graph-api/webhooks)
- [Ngrok](https://ngrok.com/docs)
