import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url'; // Adicionado para auxiliar na normalização de URLs para caminhos

// Carregar variáveis de ambiente do .env.multi-tenant
const pathToEnv = path.resolve(process.cwd(), '.env.multi-tenant');
dotenv.config({ path: pathToEnv });

// Tamanho do Initialization Vector (IV) em bytes. 16 bytes é o padrão para AES.
const IV_LENGTH = 16;
// Algoritmo de criptografia. AES-256-CBC é uma escolha comum e segura.
const ALGORITHM = 'aes-256-cbc';

// Pega a chave de criptografia do ambiente.
const ENCRYPTION_KEY_HEX = process.env.ENCRYPTION_KEY;

// LOG PARA DEPURAR: Mostra o que foi lido para ENCRYPTION_KEY_HEX
console.log('Valor lido para ENCRYPTION_KEY_HEX:', ENCRYPTION_KEY_HEX ? 'Disponível' : 'Não disponível', ENCRYPTION_KEY_HEX?.length || 0, 'caracteres');

if (!ENCRYPTION_KEY_HEX || ENCRYPTION_KEY_HEX.length !== 64) {
  console.error('ERRO: Variável de ambiente ENCRYPTION_KEY não encontrada ou com formato inválido. Deve ser uma string hexadecimal de 64 caracteres.');
  throw new Error('ENCRYPTION_KEY is not defined or invalid.');
}

const ENCRYPTION_KEY = Buffer.from(ENCRYPTION_KEY_HEX, 'hex');

/**
 * Criptografa uma string usando AES-256-CBC.
 * O IV é gerado aleatoriamente para cada criptografia e pré-anexado ao resultado criptografado.
 * @param text A string a ser criptografada.
 * @returns A string criptografada no formato 'iv:encryptedData'.
 */
export function encrypt(text: string): string {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Erro ao criptografar:', error);
    throw new Error('Falha na criptografia');
  }
}

/**
 * Descriptografa uma string criptografada usando AES-256-CBC.
 * Espera que a string criptografada esteja no formato 'iv:encryptedData'.
 * @param encryptedText A string criptografada para descriptografar.
 * @returns A string descriptografada.
 */
export function decrypt(encryptedText: string): string {
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 2) {
      throw new Error('Formato de texto criptografado inválido.');
    }
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedData = parts[1];

    if (iv.length !== IV_LENGTH) {
      throw new Error('IV inválido ou com tamanho incorreto.');
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Erro ao descriptografar:', error);
    throw new Error('Falha na descriptografia');
  }
}

// =======================================================
// EXECUTAR ESTA SEÇÃO APENAS PARA GERAR A SENHA CRIPTOGRAFADA
// REMOVA OU COMENTE EM PRODUÇÃO!
// =======================================================

// Debugando a condição de execução direta em ESM
const currentModulePath = fileURLToPath(import.meta.url);
const mainScriptPath = path.resolve(process.argv[1]); // Normaliza para um caminho absoluto do sistema de arquivos

// Logs para verificação
console.log('--- Debug de Execução Direta (tentativa 3) ---');
console.log('Caminho do módulo atual (normalizado):', currentModulePath);
console.log('Caminho do script principal (normalizado):', mainScriptPath);
console.log('Comparação (currentModulePath === mainScriptPath):', currentModulePath === mainScriptPath);
console.log('--- Fim do Debug ---');

// Usamos a comparação de caminhos normalizados para compatibilidade com ES Modules no Node.js
if (currentModulePath === mainScriptPath) {
  console.log('-> Executando bloco de geração de senha...'); // Indicador de execução
  // Substitua 'SUA_SENHA_DO_BANCO_DE_DADOS_DO_CLIENTE_AQUI' pela senha REAL e em texto puro do DB do cliente.
  const databasePassword = 'postgres'; // <--- ALTERE AQUI!
  console.log('Senha original:', databasePassword);

  try {
    const encryptedPassword = encrypt(databasePassword);
    console.log('Senha Criptografada (para Supabase):', encryptedPassword);

    // Você pode testar a descriptografia aqui se quiser, mas o foco é gerar a senha criptografada.
    // const decryptedPassword = decrypt(encryptedPassword);
    // console.log('Senha Descriptografada:', decryptedPassword);
    // if (databasePassword === decryptedPassword) {
    //   console.log('Criptografia e Descriptografia bem-sucedidas!');
    // } else {
    //   console.log('ERRO: O texto descriptografado não corresponde ao original.');
    // }

  } catch (e) {
    console.error('Ocorreu um erro durante a criptografia:', e);
  }
} else {
  console.log('-> Script não executado diretamente (provavelmente importado).');
}