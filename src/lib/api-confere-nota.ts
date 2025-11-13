// src/lib/api-confere-nota.ts
import { cacheService } from './cache-service';

export async function consultarProduto(termo: string) {
  try {
    const cacheKey = `produto:${termo.toLowerCase().trim()}`;

    // Tenta cache primeiro
    const cachedResult = cacheService.get(cacheKey);
    if (cachedResult) {
      console.log(`🔍 [CACHE] Cache hit: "${termo}" - ${cachedResult.count} produtos`);
      return cachedResult;
    }

    console.log(`🔍 [API] Consultando API Flask: "${termo}"`);

    const response = await fetch(
      `${process.env.FLASK_API_URL}/api/products/search?q=${encodeURIComponent(termo)}`
    );

    if (!response.ok) {
      throw new Error(`Erro na API: ${response.status}`);
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
      console.log(`💾 [CACHE] ${resultado.count} produtos armazenados no cache`);
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