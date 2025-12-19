async sendInteractiveButtons(
    to: string, 
    bodyText: string, 
    buttons: { id: string, title: string }[]
  ): Promise<WhatsAppMessage> {
    const formats = this.normalizePhoneNumber(to);
    let lastError: any;

    for (const phone of formats) {
      try {
        const url = `${this.getBaseUrl()}/messages`;

        const payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phone,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: bodyText },
            action: {
              buttons: buttons.map(btn => ({
                type: 'reply',
                reply: {
                  id: btn.id,
                  title: btn.title,
                }
              }))
            }
          }
        };

        const response = await fetch(url, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || 'Failed to send interactive message');
        }

        const result = await response.json();

        return {
          id: result.messages[0].id,
          from: this.config.phone_number_id,
          to: phone,
          timestamp: new Date().toISOString(),
          type: 'interactive',
          direction: 'outbound',
          status: 'sent',
          content: {
            text: bodyText,
            buttons: buttons
          },
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }
