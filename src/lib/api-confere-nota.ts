const API_BASE_URL = process.env.FLASK_API_URL || 'http://10.157.211.236:5000';

/**
 * Consulta produtos na API Confere Nota
 */
export async function consultarProduto(termo: string) {
  try {
    console.log('🔍 Consultando produto:', termo);

    const response = await fetch(`${API_BASE_URL}/api/products/search?q=${encodeURIComponent(termo)}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Erro API: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('✅ Resposta API - Produtos encontrados:', data.count);
    return data;
  } catch (error) {
    console.error('❌ Erro consulta produto:', error);
    return {
      success: false,
      error: 'Erro ao consultar produtos',
      data: []
    };
  }
}

/**
 * Busca produto específico por código
 */
export async function buscarProdutoPorCodigo(codigo: string) {
  try {
    const response = await fetch(`${API_BASE_URL}/produto?ean_code=${codigo}`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Erro: ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    console.error('Erro busca por código:', error);
    return null;
  }
}

/**
 * Verifica status da API
 */
export async function verificarStatusAPI() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/status`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Status API: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('❌ API Flask offline:', error);
    return {
      status: 'offline',
      database: 'offline'
    };
  }
}