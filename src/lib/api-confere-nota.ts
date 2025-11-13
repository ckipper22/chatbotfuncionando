// src/lib/api-confere-nota.ts
import { cacheService } from './cache-service';

export async function consultarProduto(termo: string) {
  try {
    // Chave do cache baseada no termo de busca
    const cacheKey = produto:;
    
    // Tenta buscar do cache primeiro
    const cachedResult = cacheService.get(cacheKey);
    if (cachedResult) {
      console.log( [CACHE] Produtos recuperados do cache: "");
      return cachedResult;
    }

    console.log( [API] Consultando API Flask: "");
    
    const response = await fetch(
      \/api/products/search?q=\
    );
    
    if (!response.ok) {
      throw new Error(Erro na API: \);
    }
    
    const data = await response.json();
    
    const resultado = {
      success: data.success,
      count: data.count,
      data: data.data
    };

    // Armazena no cache por 2 minutos (consultas frequentes)
    if (resultado.success && resultado.count > 0) {
      cacheService.set(cacheKey, resultado, 2 * 60 * 1000);
      console.log( [CACHE] \ produtos armazenados no cache);
    }

    return resultado;
    
  } catch (error: any) {
    console.error('Erro ao consultar produto:', error);
    return {
      success: false,
      count: 0,
      data: [],
      error: error.message
    };
  }
}

// Função para limpar cache específico (útil para atualizações)
export function limparCacheProduto(termo: string): void {
  const cacheKey = produto:;
  cacheService.delete(cacheKey);
  console.log( [CACHE] Cache limpo para: "");
}

// Limpa todo o cache de produtos
export function limparTodoCacheProdutos(): void {
  for (const key of Array.from(cacheService['cache'].keys())) {
    if (key.startsWith('produto:')) {
      cacheService.delete(key);
    }
  }
  console.log(' [CACHE] Todo o cache de produtos foi limpo');
}
