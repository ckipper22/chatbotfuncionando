
# 🚀 Guia Completo: Como Testar o Webhook do WhatsApp

## 📌 O que você já tem

✅ **Projeto completo** com todos os arquivos criados
✅ **Interface web** para gerenciar mensagens
✅ **Webhook funcionando** pronto para receber mensagens
✅ **API de envio** configurada

---

## 🎯 O que você precisa fazer AGORA

### **Passo 1: Verificar se o servidor está rodando**

Abra o terminal e execute:

```bash
npm run dev
```

Você deve ver algo como:

```
▲ Next.js 15.x.x
- Local:        http://localhost:3000
- Ready in 2.3s
```

✅ **Deixe este terminal aberto!** O servidor precisa estar rodando o tempo todo.

---

### **Passo 2: Preencher as variáveis de ambiente**

Você já preencheu o arquivo `.env.local`? Se não:

1. **Copie o arquivo de exemplo:**
   ```bash
   cp .env.example .env.local
   ```

2. **Edite o `.env.local`** e preencha:

```env
# Token que VOCÊ escolhe (pode ser qualquer texto)
WHATSAPP_WEBHOOK_VERIFY_TOKEN=meu_token_secreto_123

# Token do Meta (pegar no painel do Meta)
WHATSAPP_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxxxx

# ID do número (pegar no painel do Meta)
WHATSAPP_PHONE_NUMBER_ID=123456789012345
```

3. **Reinicie o servidor** (Ctrl+C e `npm run dev` novamente)

---

### **Passo 3: Expor o servidor local para a internet**

O Meta precisa acessar seu servidor local. Use o **ngrok**:

#### **Instalar o ngrok:**

**Windows:**
```bash
choco install ngrok
```

**Mac:**
```bash
brew install ngrok
```

**Linux:**
```bash
snap install ngrok
```

Ou baixe em: https://ngrok.com/download

#### **Iniciar o ngrok:**

Abra um **NOVO terminal** (deixe o `npm run dev` rodando) e execute:

```bash
ngrok http 3000
```

Você verá algo assim:

```
Session Status                online
Forwarding                    https://abc123.ngrok-free.app -> http://localhost:3000
```

✅ **Copie a URL** que começa com `https://` (exemplo: `https://abc123.ngrok-free.app`)

⚠️ **Deixe este terminal aberto também!**

---

### **Passo 4: Configurar o webhook no Meta**

Agora vamos conectar o Meta ao seu servidor:

1. **Acesse:** https://developers.facebook.com/apps
2. **Selecione seu App** (ou crie um novo)
3. **Vá em:** WhatsApp → Configuration (Configuração)
4. **Na seção "Webhook"**, clique em **Edit** (Editar)

5. **Preencha:**
   - **Callback URL:** `https://abc123.ngrok-free.app/next_api/whatsapp/webhook`
     - ⚠️ Substitua `abc123.ngrok-free.app` pela URL do seu ngrok
     - ⚠️ Não esqueça o `/next_api/whatsapp/webhook` no final!
   
   - **Verify Token:** `meu_token_secreto_123`
     - ⚠️ Use o MESMO valor que você colocou no `.env.local`

6. **Clique em "Verify and Save"** (Verificar e Salvar)

---

### **Passo 5: Verificar se funcionou**

Se tudo estiver correto, você verá no **console do Next.js**:

```
🔍 Webhook verification request received: { mode: 'subscribe', token: 'meu_token_secreto_123', challenge: '...' }
🔑 Expected verify token: meu_token_secreto_123
✅ Webhook verified successfully!
```

E no painel do Meta aparecerá: **✓ Verificado**

---

### **Passo 6: Inscrever-se nos eventos**

Após verificar o webhook:

1. Na mesma página, clique em **"Manage"** (Gerenciar)
2. Selecione os campos:
   - ✅ `messages` (para receber mensagens)
   - ✅ `message_status` (para receber status de entrega)
3. Clique em **"Subscribe"** (Inscrever)

---

### **Passo 7: Testar o sistema**

#### **Opção 1: Enviar mensagem pela interface web**

1. Acesse: http://localhost:3000
2. Vá na seção **"Configuração da API do WhatsApp"**
3. Preencha:
   - Phone Number ID
   - Access Token
   - Webhook Verify Token
4. Clique em **"Testar Conexão"**
5. Se aparecer ✅ **"Conexão OK!"**, está funcionando!

#### **Opção 2: Receber mensagem no WhatsApp**

1. Envie uma mensagem do seu celular para o número do WhatsApp Business
2. Veja os logs no console do Next.js:

```
📩 Webhook received: { ... }
💬 New message received: { from: '5511999999999', text: 'Olá!' }
```

3. A mensagem aparecerá no **"Histórico de Mensagens"** na interface web

---

## ❌ Problemas Comuns

### **Erro: "Não foi possível validar a URL de callback"**

**Causas:**
- ❌ Ngrok não está rodando
- ❌ URL incorreta no painel do Meta
- ❌ Token diferente entre `.env.local` e painel do Meta
- ❌ Servidor Next.js não está rodando

**Solução:**
1. Verifique se `npm run dev` está rodando
2. Verifique se `ngrok http 3000` está ativo
3. Confirme que o token no `.env.local` é IGUAL ao do painel do Meta
4. Veja os logs no console para identificar o erro

---

### **Erro: "Token expirado"**

**Causa:** Tokens temporários do Meta expiram em 24 horas.

**Solução:**
1. Gere um novo token no painel do Meta
2. Atualize o `.env.local`
3. Reinicie o servidor

---

### **Ngrok mostra página de aviso**

**Causa:** Versão gratuita do ngrok mostra uma página de aviso.

**Solução:**
- Crie uma conta gratuita no ngrok para remover o aviso
- Ou use Vercel/Railway para deploy em produção

---

## 🎉 Pronto! Agora você pode:

✅ **Enviar mensagens** pela interface web
✅ **Receber mensagens** do WhatsApp
✅ **Ver o histórico** de todas as conversas
✅ **Monitorar estatísticas** em tempo real
✅ **Gerenciar contatos** que interagiram com o bot

---

## 🔄 Fluxo completo funcionando:

```
1. Usuário envia mensagem no WhatsApp
   ↓
2. WhatsApp envia para o webhook (ngrok → seu servidor)
   ↓
3. Seu servidor recebe e processa a mensagem
   ↓
4. Mensagem aparece no histórico da interface web
   ↓
5. Você pode responder pela interface web
   ↓
6. Mensagem é enviada via API do WhatsApp
   ↓
7. Usuário recebe a resposta no WhatsApp
```

---

## 📞 URLs Importantes

- **Interface Web:** http://localhost:3000
- **Webhook:** http://localhost:3000/next_api/whatsapp/webhook
- **Enviar Mensagem:** http://localhost:3000/next_api/whatsapp/send
- **Teste de Conexão:** http://localhost:3000/next_api/whatsapp/test

---

## 🚀 Próximos Passos

Agora que está funcionando, você pode:

1. **Adicionar respostas automáticas** no webhook
2. **Criar fluxos de conversação** com estados
3. **Integrar com IA** (OpenAI, Gemini, etc.)
4. **Fazer deploy em produção** (Vercel, Railway)

---

## 💡 Dica Final

Mantenha **3 terminais abertos**:

1. **Terminal 1:** `npm run dev` (servidor Next.js)
2. **Terminal 2:** `ngrok http 3000` (túnel público)
3. **Terminal 3:** Para comandos adicionais

---

**🎯 Agora é só testar! Qualquer dúvida, consulte os logs no console.**
