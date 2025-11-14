// packages/multi-tenant/tenant-service.ts
import { Pool, PoolClient, QueryResult } from 'pg';
import { supabase } from './supabase-client';
import crypto from 'crypto';

// --- Variáveis de Ambiente e Configuração de Segurança ---
const ENCRYPTION_KEY_RAW = process.env.ENCRYPTION_KEY;
const IV_LENGTH = 16; // Para AES-256-CBC, o IV deve ter 16 bytes.
const AES_KEY_BYTES = 32; // AES-256 requer uma chave de 32 bytes.

let ENCRYPTION_KEY_BUFFER: Buffer;

// Validação e conversão da chave de criptografia
if (!ENCRYPTION_KEY_RAW) {
  console.warn(
    '⚠️ WARNING: ENCRYPTION_KEY environment variable is missing. ' +
    'Using a default key for demonstration. THIS IS INSECURE FOR PRODUCTION!'
  );
  // Chave de fallback para 32 bytes (ASCII/UTF-8)
  ENCRYPTION_KEY_BUFFER = Buffer.from('a_very_secret_key_for_demo_purposes_only'.padEnd(AES_KEY_BYTES, '\0').substring(0, AES_KEY_BYTES), 'utf8');
} else if (ENCRYPTION_KEY_RAW.length !== AES_KEY_BYTES * 2) { // Verifica se tem o comprimento esperado para HEX (32 bytes = 64 caracteres hexadecimais)
  console.warn(
    `⚠️ WARNING: ENCRYPTION_KEY has incorrect length (${ENCRYPTION_KEY_RAW.length}). ` +
    `Expected ${AES_KEY_BYTES * 2} hex characters for a ${AES_KEY_BYTES}-byte key. ` +
    `Attempting to use as raw string. THIS MAY LEAD TO DECRYPTION ISSUES OR INSECURITY!`
  );
  // Se a chave não tem o comprimento hexadecimal esperado, tenta usá-la como string UTF-8 e a ajusta para 32 bytes.
  ENCRYPTION_KEY_BUFFER = Buffer.from(ENCRYPTION_KEY_RAW.padEnd(AES_KEY_BYTES, '\0').substring(0, AES_KEY_BYTES), 'utf8');
} else {
  // Esta é a parte CRÍTICA: Converte a string HEX de 64 caracteres para um Buffer de 32 bytes.
  ENCRYPTION_KEY_BUFFER = Buffer.from(ENCRYPTION_KEY_RAW, 'hex');
  if (ENCRYPTION_KEY_BUFFER.length !== AES_KEY_BYTES) {
    console.error(`❌ ERROR: Converted ENCRYPTION_KEY_BUFFER has incorrect length (${ENCRYPTION_KEY_BUFFER.length}). Expected ${AES_KEY_BYTES} bytes. This is a critical error.`);
    // Em um ambiente de produção, você pode querer lançar um erro ou encerrar o processo aqui.
    // Para depuração, vamos forçar uma chave padrão para evitar que o serviço falhe completamente.
    ENCRYPTION_KEY_BUFFER = Buffer.from('default_fallback_key_for_errors'.padEnd(AES_KEY_BYTES, '\0').substring(0, AES_KEY_BYTES), 'utf8');
  }
}


// --- Interfaces para Tipagem ---
interface Client {
  id: string;
  name: string;
  whatsapp_phone_id: string;
  cod_rede: number;
  cod_filial: number;
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

interface ProductInfo {
  cod_reduzido: string;
  nom_produto: string;
  vlr_liquido: number | null;
  qtd_estoque: number | null;
  nom_laborat: string | null;
  vlr_venda: number;
}

// --- Função de Descriptografia ---
// IMPORTANTE: Esta função assume que a string criptografada está no formato "ivHex:encryptedTextHex".
function decrypt(text: string): string {
  if (!text || text.indexOf(':') === -1) {
    console.error('Invalid encrypted text format. Expected "iv:encryptedText".');
    throw new Error('Invalid encrypted text format.');
  }

  const textParts = text.split(':');
  if (textParts.length < 2) {
    console.error('Invalid encrypted text format: missing IV or encrypted text part.');
    throw new Error('Invalid encrypted text format.');
  }

  const ivHex = textParts.shift()!;
  const encryptedTextHex = textParts.join(':'); // Recompõe se houver ':' no texto criptografado

  try {
    const iv = Buffer.from(ivHex, 'hex');
    const encryptedBuffer = Buffer.from(encryptedTextHex, 'hex');

    if (iv.length !== IV_LENGTH) {
      console.error(`Invalid IV length. Expected ${IV_LENGTH} bytes, got ${iv.length}.`);
      throw new Error('Invalid IV length.');
    }

    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY_BUFFER, iv);
    let decrypted = decipher.update(encryptedBuffer);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8'); // Assumimos que o texto original era UTF-8
  } catch (e: any) {
    console.error('Decryption failed:', e.message || e);
    throw new Error(`Decryption failed: ${e.message || 'Unknown error'}`);
  }
}

// --- Serviço de Tenancy ---
export class TenantService {
  private clientDbPools: Map<string, Pool> = new Map();

  constructor() {
    // A inicialização da chave foi movida para fora do constructor para ser global e mais segura.
  }

  // Novo método para descriptografar a senha - útil no webhook
  async decryptPassword(encryptedPassword: string): Promise<string> {
    return decrypt(encryptedPassword);
  }

  /**
   * Busca um cliente pelo ID de telefone do WhatsApp.
   * @param whatsappPhoneId O ID do telefone do WhatsApp.
   * @returns O objeto Client ou null se não encontrado ou ocorrer um erro.
   */
  async findClientByPhoneId(whatsappPhoneId: string): Promise<Client | null> {
    const { data, error } = await supabase
      .from('clients')
      .select('id, name, whatsapp_phone_id, cod_rede, cod_filial')
      .eq('whatsapp_phone_id', whatsappPhoneId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 é "no rows found"
      console.error('Error fetching client by phone ID:', error);
      return null;
    }

    // Se nenhum cliente for encontrado, data será null
    return data as Client | null;
  }

  /**
   * Busca as configurações de conexão de banco de dados para um cliente.
   * @param clientId O ID do cliente.
   * @returns O objeto ClientConnection ou null se não encontrado ou ocorrer um erro.
   */
  async findClientConnection(clientId: string): Promise<ClientConnection | null> {
    const { data, error } = await supabase
      .from('client_connections')
      .select('*')
      .eq('client_id', clientId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 é "no rows found"
      console.error('Error fetching client connection:', error);
      return null;
    }
    // Se nenhuma conexão for encontrada, data será null
    return data as ClientConnection | null;
  }

  /**
   * Obtém um pool de conexão com o banco de dados de um cliente específico.
   * O pool é armazenado em cache para reutilização.
   * @param clientId O ID do cliente.
   * @returns Um objeto Pool do pg ou null se não for possível estabelecer a conexão.
   */
  async getClientDbConnectionPool(clientId: string): Promise<Pool | null> {
    // Retorna o pool do cache se já existir
    if (this.clientDbPools.has(clientId)) {
      return this.clientDbPools.get(clientId)!;
    }

    const connectionConfig = await this.findClientConnection(clientId);
    if (!connectionConfig) {
      console.error(`No database connection config found for client ${clientId}`);
      return null;
    }

    // Descriptografa a senha do banco de dados do cliente
    let decryptedPassword;
    try {
      decryptedPassword = decrypt(connectionConfig.db_password_encrypted);
    } catch (e) {
      console.error(`Failed to decrypt password for client ${clientId}:`, e);
      return null;
    }

    const pool = new Pool({
      host: connectionConfig.db_host,
      database: connectionConfig.db_name,
      user: connectionConfig.db_user,
      password: decryptedPassword,
      port: 5432, // Porta padrão do PostgreSQL
      max: 20, // Pool de 20 conexões
      idleTimeoutMillis: 30000, // Fecha conexões inativas após 30 segundos
      connectionTimeoutMillis: 5000, // Tempo limite para adquirir uma conexão (5 segundos)
    });

    // Testar a conexão
    try {
      await pool.query('SELECT 1');
      console.log(`✅ Database connection pool created and tested for client ${clientId}`);
      this.clientDbPools.set(clientId, pool);
      return pool;
    } catch (testError) {
      console.error(`❌ Failed to connect to client ${clientId} database:`, testError);
      // Destruir o pool recém-criado em caso de falha na conexão inicial
      await pool.end(); // Libera os recursos do pool
      return null;
    }
  }

  /**
   * Busca informações de produtos no banco de dados do cliente pelo termo de busca.
   * @param clientId O ID do cliente.
   * @param searchTerm O termo de busca para o nome do produto.
   * @param codRede O código da rede do cliente para filtrar produtos.
   * @param codFilial O código da filial do cliente para filtrar o estoque.
   * @returns Uma lista de objetos ProductInfo ou null em caso de erro.
   */
  async getProductInfo(clientId: string, searchTerm: string, codRede: number, codFilial: number): Promise<ProductInfo[] | null> {
    const pool = await this.getClientDbConnectionPool(clientId);
    if (!pool) {
      return null;
    }

    try {
      const result: QueryResult<ProductInfo> = await pool.query(`
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
      `, [codRede, codFilial, `%${searchTerm}%`]);

      return result.rows;
    } catch (queryError) {
      console.error(`Error querying product for client ${clientId}:`, queryError);
      return null;
    }
  }

  /**
   * Busca informações de um produto específico pelo código reduzido.
   * @param clientId O ID do cliente.
   * @param productCode O código reduzido do produto.
   * @param codRede O código da rede do cliente para filtrar produtos.
   * @param codFilial O código da filial do cliente para filtrar o estoque.
   * @returns Um objeto ProductInfo ou null se não encontrado ou em caso de erro.
   */
  async getProductByCode(clientId: string, productCode: string, codRede: number, codFilial: number): Promise<ProductInfo | null> {
    const pool = await this.getClientDbConnectionPool(clientId);
    if (!pool) {
      return null;
    }

    try {
      const result: QueryResult<ProductInfo> = await pool.query(`
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

// Exporta uma única instância do TenantService para ser usada em toda a aplicação.
// Isso garante que o cache de pools de conexão seja compartilhado.
export const tenantService = new TenantService();