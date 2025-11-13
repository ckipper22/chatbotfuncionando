export class TenantService {
  async identifyClient(phoneNumberId: string) {
    // Identifica cliente pelo WhatsApp Phone ID
    return await this.findClientByPhoneId(phoneNumberId);
  }
  
  async getClientDatabaseConfig(clientId: string) {
    // Retorna configuração do banco do cliente
    return await this.findClientConnection(clientId);
  }
}
