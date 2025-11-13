// src/lib/api-confere-nota.ts
export async function consultarProduto(termo: string) {
  try {
    const response = await fetch(
      `${process.env.FLASK_API_URL}/api/products/search?q=${encodeURIComponent(termo)}`
    );

    if (!response.ok) {
      throw new Error(`Erro na API: ${response.status}`);
    }

    const data = await response.json();
    return {
      success: data.success,
      count: data.count,
      data: data.data
    };
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