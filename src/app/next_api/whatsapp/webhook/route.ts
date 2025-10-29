async function processMessage(message: any, value: any) {
  const messageType = message.type;
  const from = message.from; // ✅ Definir 'from' no início da função
  const messageId = message.id;

  console.log(`📨 Processing message:`, {
    from,
    type: messageType,
    id: messageId,
    timestamp: message.timestamp
  });

  try {
    // Aceitar apenas mensagens de texto por enquanto
    if (messageType !== 'text') {
      console.log(`⚠️ Unsupported message type: ${messageType}`);
      await sendWhatsAppMessage(
        from, 
        `⚠️ No momento só consigo processar mensagens de texto. Tipo recebido: ${messageType}`
      );
      return;
    }

    const userMessage = message.text?.body;
    if (!userMessage) {
      console.log('❌ No text body in message');
      return;
    }

    console.log(`💬 User message: "${userMessage}"`);

    // Comandos especiais
    const lowerMessage = userMessage.toLowerCase();
    if (lowerMessage === '/limpar' || lowerMessage === 'limpar') {
      const geminiService = getGeminiService();
      geminiService.clearHistory(from);
      await sendWhatsAppMessage(from, '🗑️ Histórico de conversa limpo! Vamos começar uma nova conversa.');
      return;
    }

    if (lowerMessage === '/ajuda' || lowerMessage === 'ajuda') {
      const helpMessage = `🤖 *Comandos disponíveis:*\n\n` +
        `• /limpar - Limpa o histórico da conversa\n` +
        `• /ajuda - Mostra esta mensagem\n\n` +
        `Envie qualquer mensagem para conversar comigo!`;
      await sendWhatsAppMessage(from, helpMessage);
      return;
    }

    // Processar com IA
    console.log(`🤖 Generating AI response for message...`);
    const geminiService = getGeminiService();
    const aiResponse = await geminiService.generateResponse(userMessage, from);
    
    console.log(`🤖 AI Response: "${aiResponse}"`);
    
    await sendWhatsAppMessage(from, aiResponse);

  } catch (error) {
    console.error('❌ Error processing message:', error);
    // ✅ Agora 'from' está definida no escopo do catch
    await sendWhatsAppMessage(
      from, 
      '❌ Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente em alguns instantes.'
    );
  }
}
