'use client';
import { useEffect, useState } from 'react';
import { verificarStatusAPI, consultarProduto } from '@/lib/api-confere-nota';

export default function TesteAPI() {
  const [status, setStatus] = useState<any>(null);
  const [produtos, setProdutos] = useState<any>(null);

  useEffect(() => {
    async function testar() {
      console.log('🧪 Testando API Flask...');

      // Teste 1: Status
      const statusAPI = await verificarStatusAPI();
      setStatus(statusAPI);
      console.log('Status:', statusAPI);

      // Teste 2: Busca de produtos
      const resultado = await consultarProduto('paracetamol');
      setProdutos(resultado);
      console.log('Produtos:', resultado);
    }

    testar();
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <h1>🧪 Teste API Confere Nota</h1>

      <h2>Status da API:</h2>
      <pre>{JSON.stringify(status, null, 2)}</pre>

      <h2>Produtos encontrados:</h2>
      <pre>{JSON.stringify(produtos, null, 2)}</pre>
    </div>
  );
}