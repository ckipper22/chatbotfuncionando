import crypto from 'crypto';
import path from 'path';
import url from 'url';

// A CHAVE DE CRIPTOGRAFIA deve ter 64 caracteres hexadecimais (32 bytes).
// Recomenda-se gerar uma chave aleatória e forte para cada ambiente.
// Exemplo de como gerar uma chave: crypto.randomBytes(32).toString('hex');
// Use a mesma chave no Vercel (variável de ambiente ENCRYPTION_KEY)
const ENCRYPTION_KEY = '5c648b912680248fb56f2c62586da018bd43b4560deded4828f8865a5f8faa79'; // Chave de exemplo, substitua por uma chave segura!

// O ALGORITMO de criptografia
const ALGORITHM = 'aes-256-cbc';

// Função para criptografar uma string
function encrypt(text: string): string {
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
    throw new Error('ENCRYPTION_KEY inválida. Deve ter 64 caracteres hexadecimais.');
  }
  const iv = crypto.randomBytes(16); // Vetor de inicialização (IV)
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted; // Retorna IV + texto criptografado
}

// Função para descriptografar uma string
// export function decrypt(text: string): string {
//   if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
//     throw new Error('ENCRYPTION_KEY inválida. Deve ter 64 caracteres hexadecimais.');
//   }
//   const textParts = text.split(':');
//   if (textParts.length !== 2) {
//     throw new Error('Formato de texto criptografado inválido.');
//   }
//   const iv = Buffer.from(textParts[0], 'hex');
//   const encryptedText = textParts[1];
//   const key = Buffer.from(ENCRYPTION_KEY, 'hex');
//   const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
//   let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
//   decrypted += decipher.final('utf8');
//   return decrypted;
// }


// Apenas executa a criptografia se este script for o módulo principal
// Isso evita que o script seja executado durante a fase de build do Next.js
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determina se o script está sendo executado diretamente
const mainScriptResolvedPath = path.resolve(__dirname, 'encryptPassword.ts');
const currentModuleResolvedPath = path.resolve(process.argv[1]);

if (currentModuleResolvedPath === mainScriptResolvedPath) {
  console.log('--------------------------------------------------------------------------------------------------------------------------------------------------------------------');
  console.log('-> MODO DE GERAÇÃO DE SENHA CRIPTOGRAFADA ATIVADO <-');
  console.log('   Usando a ENCRYPTION_KEY fixa neste script para garantir consistência na geração.');
  console.log('--------------------------------------------------------------------------------------------------------------------------------------------------------------------');

  // <--- ALTERE AQUI PARA A SENHA REAL QUE VOCÊ QUER CRIPTOGRAFAR!
  // ATENÇÃO: Nunca comite sua senha real aqui. Este é apenas para uso temporário.
  const databasePassword = 'postgres'; // Sua senha do banco de dados (ex: 'sua_senha_secreta')

  // REMOVIDO/COMENTADO APÓS GERAÇÃO DA SENHA CRIPTOGRAFADA PARA EVITAR ERRO DE COMPILAÇÃO NO VERCEL
  // if (databasePassword === 'SUA_SENHA_REAL_DO_DB') {
  //   console.error('\nERRO: Por favor, altere a variável databasePassword para a senha real do seu banco de dados.');
  //   process.exit(1); // Sai com erro
  // }

  console.log(`Senha original a ser criptografada: ${databasePassword}`);

  try {
    const encryptedPassword = encrypt(databasePassword);

    console.log('\n====================================================================================================================================================================');
    console.log(`   SENHA CRIPTOGRAFADA GERADA (COPIE E COLE ESTE VALOR NO SEU SUPABASE/DB):`);
    console.log(`    ${encryptedPassword}`);
    console.log('====================================================================================================================================================================\n');

    console.log('--------------------------------------------------------------------------------------------------------------------------------------------------------------------');
    console.log(`Lembre-se: Use esta ENCRYPTION_KEY (a de 64 caracteres) no Vercel e a Senha Criptografada (com :) no Supabase!`);
    console.log(`ENCRYPTION_KEY para Vercel: ${ENCRYPTION_KEY}`);
    console.log('--------------------------------------------------------------------------------------------------------------------------------------------------------------------');
  } catch (error: any) {
    console.error('\nERRO ao criptografar a senha:', error.message);
    process.exit(1);
  }
}

// Exporta a função de descriptografia para ser usada por outras partes da aplicação
// export { decrypt };