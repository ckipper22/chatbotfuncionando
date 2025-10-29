
# 🤖 WhatsApp Bot Backend

Sistema completo de backend para integração com WhatsApp Business API, desenvolvido com Next.js 15, TypeScript e Tailwind CSS.

## ✨ Funcionalidades

- ✅ **Webhook configurável** para receber mensagens do WhatsApp
- ✅ **Envio de mensagens** (texto, imagens, vídeos, áudios, documentos)
- ✅ **Dashboard em tempo real** com estatísticas
- ✅ **Histórico de mensagens** armazenado localmente
- ✅ **Lista de contatos** com contador de mensagens não lidas
- ✅ **Painel de configuração** para credenciais da API
- ✅ **Modo claro/escuro** com tema personalizável
- ✅ **Interface responsiva** para desktop e mobile

---

## 🚀 Início Rápido

### 1. Instalar dependências

```bash
npm install
# ou
pnpm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env.local
```

Edite `.env.local` e configure suas credenciais:

```env
WHATSAPP_WEBHOOK_VERIFY_TOKEN=meu_token_secreto_123
WHATSAPP_ACCESS_TOKEN=seu_token_aqui
WHATSAPP_PHONE_NUMBER_ID=seu_id_aqui
```

### 3. Iniciar o servidor de desenvolvimento

```bash
npm run dev
```

Acesse: [http://localhost:3000](http://localhost:3000)

---

## 📖 Guias de Configuração

### 🎯 **[GUIA_COMPLETO.md](./GUIA_COMPLETO.md)** ← **COMECE AQUI!**
Guia passo a passo completo em português para configurar e testar o webhook.

### 📋 **[README_WEBHOOK_SETUP.md](./README_WEBHOOK_SETUP.md)**
Guia técnico detalhado de configuração do webhook.

### 📚 **[README_WHATSAPP.md](./README_WHATSAPP.md)**
Documentação completa sobre a integração com WhatsApp Business API.

---

## 🏗️ Estrutura do Projeto

```
src/
├── app/
│   ├── next_api/
│   │   └── whatsapp/
│   │       ├── webhook/route.ts    # Recebe mensagens do WhatsApp
│   │       ├── send/route.ts       # Envia mensagens
│   │       └── test/route.ts       # Testa a conexão
│   ├── page.tsx                    # Página principal
│   └── layout.tsx                  # Layout global
├── components/
│   └── whatsapp/
│       ├── Dashboard.tsx           # Estatísticas
│       ├── ConfigPanel.tsx         # Configuração de credenciais
│       ├── SendMessage.tsx         # Formulário de envio
│       ├── MessageHistory.tsx      # Histórico de mensagens
│       └── ContactList.tsx         # Lista de contatos
├── lib/
│   ├── whatsapp-api.ts            # Cliente da API do WhatsApp
│   ├── whatsapp-storage.ts        # Armazenamento local
│   └── api-client.ts              # Cliente HTTP
└── types/
    └── whatsapp.ts                # Tipos TypeScript
```

---

## 🔌 Endpoints da API

### `GET /next_api/whatsapp/webhook`
Verificação do webhook pelo Meta.

**Query params:**
- `hub.mode=subscribe`
- `hub.verify_token=seu_token`
- `hub.challenge=valor_aleatorio`

**Resposta:** Retorna o `challenge` se o token estiver correto.

---

### `POST /next_api/whatsapp/webhook`
Recebe mensagens e atualizações de status do WhatsApp.

**Body:** Payload do webhook do Meta (automático)

---

### `POST /next_api/whatsapp/send`
Envia mensagens via WhatsApp.

**Body:**
```json
{
  "to": "5511999999999",
  "type": "text",
  "content": {
    "text": "Olá! Esta é uma mensagem de teste."
  },
  "config": {
    "phoneNumberId": "seu_phone_number_id",
    "accessToken": "seu_access_token"
  }
}
```

**Tipos suportados:**
- `text` - Mensagem de texto
- `image` - Imagem com URL
- `video` - Vídeo com URL
- `audio` - Áudio com URL
- `document` - Documento com URL
- `template` - Template pré-aprovado

---

### `POST /next_api/whatsapp/test`
Testa a conexão com a API do WhatsApp.

**Body:**
```json
{
  "phoneNumberId": "seu_phone_number_id",
  "accessToken": "seu_access_token",
  "apiVersion": "v21.0"
}
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Conexão estabelecida com sucesso!",
    "phoneNumber": "+55 11 99999-9999",
    "verifiedName": "Sua Empresa",
    "quality": "GREEN"
  }
}
```

---

## 💾 Armazenamento de Dados

O sistema usa **localStorage** para armazenar:

- ✅ Configurações da API (tokens, IDs)
- ✅ Histórico de mensagens
- ✅ Lista de contatos
- ✅ Estatísticas de uso

> ⚠️ **Nota:** Os dados são armazenados apenas no navegador. Para produção, considere usar um banco de dados.

---

## 🎨 Tecnologias Utilizadas

- **[Next.js 15](https://nextjs.org/)** - Framework React
- **[TypeScript](https://www.typescriptlang.org/)** - Tipagem estática
- **[Tailwind CSS v4](https://tailwindcss.com/)** - Estilização
- **[shadcn/ui](https://ui.shadcn.com/)** - Componentes UI
- **[Lucide React](https://lucide.dev/)** - Ícones
- **[Sonner](https://sonner.emilkowal.ski/)** - Notificações toast

---

## 🧪 Testando o Sistema

### 1. Teste de conexão

Use o painel de configuração na interface web ou faça uma requisição:

```bash
curl -X POST http://localhost:3000/next_api/whatsapp/test \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumberId": "seu_id",
    "accessToken": "seu_token",
    "apiVersion": "v21.0"
  }'
```

### 2. Enviar mensagem de teste

Use o painel "Enviar Mensagem" na interface web ou faça uma requisição:

```bash
curl -X POST http://localhost:3000/next_api/whatsapp/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "5511999999999",
    "type": "text",
    "content": { "text": "Teste" },
    "config": {
      "phoneNumberId": "seu_id",
      "accessToken": "seu_token"
    }
  }'
```

### 3. Receber mensagens

1. Configure o webhook no painel do Meta (veja [GUIA_COMPLETO.md](./GUIA_COMPLETO.md))
2. Envie uma mensagem para o número do WhatsApp Business
3. Veja os logs no console do Next.js

---

## 🔒 Segurança

⚠️ **Importante:**

- Nunca commite o arquivo `.env.local`
- Não compartilhe seus tokens de acesso
- Use HTTPS em produção (ngrok ou deploy)
- Valide sempre o token do webhook

---

## 🚀 Deploy em Produção

### Vercel (Recomendado)

```bash
npm install -g vercel
vercel
```

Configure as variáveis de ambiente no painel da Vercel.

### Outras opções

- Railway
- Render
- DigitalOcean App Platform
- AWS Amplify

---

## 📚 Documentação Adicional

- **[GUIA_COMPLETO.md](./GUIA_COMPLETO.md)** - Guia passo a passo em português
- **[README_WEBHOOK_SETUP.md](./README_WEBHOOK_SETUP.md)** - Configuração técnica do webhook
- **[README_WHATSAPP.md](./README_WHATSAPP.md)** - Documentação completa da API
- [WhatsApp Business API Docs](https://developers.facebook.com/docs/whatsapp)
- [Next.js Docs](https://nextjs.org/docs)

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues ou pull requests.

---

## 📄 Licença

MIT License - veja o arquivo [LICENSE](./LICENSE) para detalhes.

---

## 💬 Suporte

Se encontrar problemas:

1. Consulte o **[GUIA_COMPLETO.md](./GUIA_COMPLETO.md)**
2. Verifique os logs no console do Next.js
3. Consulte o [guia de configuração do webhook](./README_WEBHOOK_SETUP.md)
4. Abra uma issue no GitHub

---

## 🎯 Checklist de Configuração

- [ ] Instalar dependências (`npm install`)
- [ ] Criar arquivo `.env.local` com as credenciais
- [ ] Iniciar servidor (`npm run dev`)
- [ ] Iniciar ngrok (`ngrok http 3000`)
- [ ] Configurar webhook no painel do Meta
- [ ] Testar conexão na interface web
- [ ] Enviar mensagem de teste
- [ ] Receber mensagem do WhatsApp

---

**Desenvolvido com ❤️ usando Next.js e WhatsApp Business API**
