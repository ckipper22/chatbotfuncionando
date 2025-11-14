// packages/multi-tenant/tenant-service.ts
import { createPool, Pool } from 'pg'; // Biblioteca para conectar ao PostgreSQL
import { supabase } from './supabase-client'; // Nosso cliente Supabase
import crypto from 'crypto'; // Para criptografia/decriptografia de senhas

// Interfaces para tipagem dos dados dos clientes
interface Client {
  id: string;
  name: string;
  whatsapp_phone_id: string;
  cod_rede: number; // <-- NOVO: Código da rede do cliente
  cod_filial: number; // <-- NOVO: Código da filial padrão do cliente
  // Adicione outros campos da tabela 'clients' aqui se necessário
}

interface ClientConnection {
  id: string;
  client_id: string;
  db_host: string;
  db_name: string;
  db_user: string;
  db_password_encrypted: string;
  // Adicione outros campos da tabela 'client_connections' aqui se necessário
}

// Chave de criptografia/decriptografia (usar uma variável de ambiente REAL em produção!)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a_very_secret_key_for_demo_purposes_only';
const IV_LENGTH = 16; // Para AES-256-CBC

// Função simples de descriptografia (APENAS PARA DEMONSTRAÇÃO)
// Em produção, você usaria um serviço de gerenciamento de segredos mais robusto.
function decrypt(text: string): string {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift()!, 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32, ' ')), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

export class TenantService {
  private clientDbPools: Map<string, Pool> = new Map(); // Cache de conexões com bancos de clientes

  constructor() {
    if (ENCRYPTION_KEY === 'a_very_secret_key_for_demo_purposes_only') {
      console.warn('⚠️ WARNING: Using default encryption key. Please set ENCRYPTION_KEY environment variable for production!');
    }
  }

  // Novo método para descriptografar a senha - útil no webhook
  async decryptPassword(encryptedPassword: string): Promise<string> {
    return decrypt(encryptedPassword);
  }

  async findClientByPhoneId(whatsappPhoneId: string): Promise<Client | null> {
    // 💡 ATENÇÃO: Adicionei 'cod_rede' e 'cod_filial' ao SELECT
    const { data, error } = await supabase
      .from('clients')
      .select('id, name, whatsapp_phone_id, cod_rede, cod_filial')
      .eq('whatsapp_phone_id', whatsappPhoneId)
      .single();

    if (error) {
      console.error('Error fetching client by phone ID:', error);
      return null;
    }
    return data as Client;
  }

  async findClientConnection(clientId: string): Promise<ClientConnection | null> {
    const { data, error } = await supabase
      .from('client_connections')
      .select('*')
      .eq('client_id', clientId)
      .single();

    if (error) {
      console.error('Error fetching client connection:', error);
      return null;
    }
    return data as ClientConnection;
  }

  async getClientDbConnectionPool(clientId: string): Promise<Pool | null> {
    if (this.clientDbPools.has(clientId)) {
      return this.clientDbPools.get(clientId)!;
    }

    const connectionConfig = await this.findClientConnection(clientId);
    if (!connectionConfig) {
      console.error(`No database connection config found for client ${clientId}`);
      return null;
    }

    // Descriptografa a senha do banco de dados do cliente
    const decryptedPassword = decrypt(connectionConfig.db_password_encrypted);

    const pool = new Pool({
      host: connectionConfig.db_host,
      database: connectionConfig.db_name,
      user: connectionConfig.db_user,
      password: decryptedPassword,
      port: 5432, // Porta padrão do PostgreSQL
      max: 20, // Pool de 20 conexões
      idleTimeoutMillis: 30000, // Fecha conexões inativas após 30 segundos
      connectionTimeoutMillis: 2000, // Tempo limite para adquirir uma conexão
    });

    // Testar a conexão
    try {
      await pool.query('SELECT 1');
      console.log(`✅ Database connection pool created and tested for client ${clientId}`);
      this.clientDbPools.set(clientId, pool);
      return pool;
    } catch (testError) {
      console.error(`❌ Failed to connect to client ${clientId} database:`, testError);
      return null;
    }
  }

  // 💡 MODIFICADO: Agora recebe codRede e codFilial como parâmetros
  async getProductInfo(clientId: string, searchTerm: string, codRede: number, codFilial: number): Promise<any[] | null> {
    const pool = await this.getClientDbConnectionPool(clientId);
    if (!pool) {
      return null;
    }

    try {
      const result = await pool.query(`
        SELECT
          t1.cod_reduzido,
          t1.nom_produto,
          t4.vlr_liquido,
          t3.qtd_estoque,
          t5.nom_laborat,
          t1.vlr_venda
        FROM cadprodu t1
        LEFT JOIN cadestoq t3 ON t1.cod_reduzido = t3.cod_reduzido
          AND t3.cod_rede = $1
          AND t3.cod_filial = $2
        LEFT JOIN desconto_produto_vw AS t4 ON t4.cod_reduzido = t1.cod_reduzido
        LEFT JOIN public.cadlabor t5 ON t1.cod_laborat = t5.cod_laborat
        WHERE t1.nom_produto ILIKE $3 AND t1.cod_rede = $1
        ORDER BY
          CASE WHEN t3.qtd_estoque > 0 THEN 0 ELSE 1 END,
          t1.nom_produto
        LIMIT 10;
      `, [codRede, codFilial, `%${searchTerm}%`]); // Use os novos parâmetros aqui

      return result.rows;
    } catch (queryError) {
      console.error(`Error querying product for client ${clientId}:`, queryError);
      return null;
    }
  }

  // �� NOVO MÉTODO: Para buscar produtos por código
  async getProductByCode(clientId: string, productCode: string, codRede: number, codFilial: number): Promise<any | null> {
    const pool = await this.getClientDbConnectionPool(clientId);
    if (!pool) {
      return null;
    }

    try {
      const result = await pool.query(`
        SELECT
          t1.cod_reduzido,
          t1.nom_produto,
          t4.vlr_liquido,
          t3.qtd_estoque,
          t5.nom_laborat,
          t1.vlr_venda
        FROM cadprodu t1
        LEFT JOIN cadestoq t3 ON t1.cod_reduzido = t3.cod_reduzido
          AND t3.cod_rede = $1
          AND t3.cod_filial = $2
        LEFT JOIN desconto_produto_vw AS t4 ON t4.cod_reduzido = t1.cod_reduzido
        LEFT JOIN public.cadlabor t5 ON t1.cod_laborat = t5.cod_laborat
        WHERE t1.cod_reduzido = $3 AND t1.cod_rede = $1
        LIMIT 1;
      `, [codRede, codFilial, productCode]);

      return result.rows[0] || null; // Retorna o primeiro produto encontrado ou null
    } catch (queryError) {
      console.error(`Error querying product by code for client ${clientId}:`, queryError);
      return null;
    }
  }
}

export const tenantService = new TenantService();