// src/lib/api-confere-nota.ts
import { cacheService } from './cache-service';

export async function consultarProduto(termo: string) {
  try {
    const cacheKey = produto:\;
    
    // Tenta cache primeiro
    const cachedResult = cacheService.get(cacheKey);
    if (cachedResult) {
      console.log( [CACHE] Cache hit: \"\\" - \ produtos);
      return cachedResult;
    }

    console.log( [API] Consultando API Flask: \"\\");
    
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

    // Cache apenas se tiver resultados
    if (resultado.success && resultado.count > 0) {
      cacheService.set(cacheKey, resultado, 2 * 60 * 1000); // 2 minutos
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
