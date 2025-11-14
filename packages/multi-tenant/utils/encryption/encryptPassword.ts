import crypto from 'crypto';
import dotenv from 'dotenv'; // Mantido para compatibilidade, mas a ENCRYPTION_KEY será hardcoded aqui.
import path from 'path';
import { fileURLToPath } from 'url';

// =======================================================
// CONFIGURAÇÃO CRÍTICA
// =======================================================

// !!! ATENÇÃO !!!
// Esta é a ENCRYPTION_KEY SECRETA que você gerou no PASSO 1.
// Ela DEVE ser uma string hexadecimal de 64 caracteres.
// COPIE ESTA CHAVE PARA AS VARIÁVEIS DE AMBIENTE DO SEU VERCEl (ENCRYPTION_KEY)!
const ENCRYPTION_KEY_HEX = '5c648b912680248fb56f2c62586da018bd43b4560deded4828f8865a5f8faa79';

// =======================================================
// VARIÁVEIS GLOBAIS E FUNÇÕES AUXILIARES DE CRIPTOGRAFIA
// =======================================================

const IV_LENGTH = 16; // Tamanho do Initialization Vector (IV) em bytes. Padrão para AES.
const ALGORITHM = 'aes-256-cbc'; // Algoritmo de criptografia

// Validação da chave de criptografia
if (!ENCRYPTION_KEY_HEX || ENCRYPTION_KEY_HEX.length !== 64) {
  console.error('\n--------------------------------------------------------------------------------------------------------------------------------------------------------------------');
  console.error('ERRO CRÍTICO: ENCRYPTION_KEY_HEX não está definida ou com formato inválido neste script.');
  console.error('Ela deve ser uma string hexadecimal de 64 caracteres (equivalente a 32 bytes para AES-256).');
  // Linha CORRIGIDA para usar template literals (crases)
  console.error(`Para gerar uma chave segura, execute no seu terminal (ou Node.js REPL): node -e "console.log(crypto.randomBytes(32).toString('hex'))"`);
  console.error('--------------------------------------------------------------------------------------------------------------------------------------------------------------------');
  throw new Error('ENCRYPTION_KEY_HEX is not defined or invalid.');
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
      throw new Error('Formato de texto criptografado inválido. Esperado "iv:encryptedData".');
    }
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedData = parts[1];

    if (iv.length !== IV_LENGTH) {
      throw new Error('IV inválido ou com tamanho incorreto. Esperado 16 bytes.');
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
// FERRAMENTA DE GERAÇÃO DE SENHA CRIPTOGRAFADA (EXECUÇÃO DIRETA)
// =======================================================
// ESTA SEÇÃO SÓ É EXECUTADA QUANDO O ARQUIVO É EXECUTADO DIRETAMENTE
// Ex: npx ts-node packages/multi-tenant/utils/encryption/encryptPassword.ts
// =======================================================

const currentModuleResolvedPath = path.resolve(fileURLToPath(import.meta.url));
const mainScriptResolvedPath = path.resolve(process.argv[1]);

if (currentModuleResolvedPath === mainScriptResolvedPath) {
  console.log('--------------------------------------------------------------------------------------------------------------------------------------------------------------------');
  console.log('-> MODO DE GERAÇÃO DE SENHA CRIPTOGRAFADA ATIVADO <-');
  console.log('   Usando a ENCRYPTION_KEY fixa neste script para garantir consistência na geração.');
  console.log('--------------------------------------------------------------------------------------------------------------------------------------------------------------------');

  // !!!!! AQUI VOCÊ DEVE ALTERAR !!!!!
  // Substitua 'postgres' pela SENHA REAL (em texto puro) do SEU banco de dados.
  // Exemplo: 'MinhaSenhaSegura123'
const databasePassword = 'postgres';
  // !!!!! AQUI VOCÊ DEVE ALTERAR !!!!!


  if (databasePassword === 'SUA_SENHA_REAL_DO_DB') {
    console.error('\nERRO: Por favor, altere a variável databasePassword para a senha real do seu banco de dados.');
    process.exit(1); // Sai com erro
  }

  console.log('Senha original a ser criptografada:', databasePassword);

  try {
    const encryptedPassword = encrypt(databasePassword);
    console.log('\n====================================================================================================================================================================');
    console.log('   SENHA CRIPTOGRAFADA GERADA (COPIE E COLE ESTE VALOR NO SEU SUPABASE/DB):');
    console.log('   ', encryptedPassword);
    console.log('====================================================================================================================================================================');

  } catch (e) {
    console.error('\nOcorreu um erro durante a criptografia:', e);
  } finally {
      console.log('\n--------------------------------------------------------------------------------------------------------------------------------------------------------------------');
      console.log('Lembre-se: Use esta ENCRYPTION_KEY (a de 64 caracteres) no Vercel e a Senha Criptografada (com :) no Supabase!');
      console.log('ENCRYPTION_KEY para Vercel: ' + ENCRYPTION_KEY_HEX);
      console.log('--------------------------------------------------------------------------------------------------------------------------------------------------------------------');
  }
}