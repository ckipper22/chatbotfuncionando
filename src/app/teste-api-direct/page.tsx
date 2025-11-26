'use client';
import { useEffect, useState } from 'react';

export default function TesteAPIDirect() {
  const [resultado, setResultado] = useState<any>(null);
  const [apiUrl, setApiUrl] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('paracetamol');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const testarAPI = async () => {
    if (!apiUrl) {
      setResultado({ success: false, error: 'URL da API não configurada' });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/products/search?q=${encodeURIComponent(searchTerm)}`, {
        method: 'GET',
        mode: 'cors',
        headers: {
          'Accept': 'application/json',
        }
      });

      if (response.ok) {
        const data = await response.json();
        setResultado({ success: true, data });
      } else {
        setResultado({ success: false, error: `HTTP ${response.status}` });
      }
    } catch (error) {
      setResultado({ success: false, error: String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const flaskUrl = process.env.NEXT_PUBLIC_FLASK_API_URL || '';
    setApiUrl(flaskUrl);
  }, []);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">🧪 Teste Direto da API</h1>
      
      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            URL da API Flask
          </label>
          <input
            type="text"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="http://sua-api.com ou deixe vazio para usar env"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Configure NEXT_PUBLIC_FLASK_API_URL no ambiente ou insira manualmente
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Termo de Busca
          </label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="paracetamol"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={testarAPI}
          disabled={isLoading || !apiUrl}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Testando...' : 'Testar API'}
        </button>
      </div>

      <div className="bg-gray-100 p-4 rounded-md">
        <h2 className="font-semibold mb-2">Resultado:</h2>
        <pre className="text-sm overflow-auto max-h-96">
          {resultado ? JSON.stringify(resultado, null, 2) : 'Clique em "Testar API" para ver o resultado'}
        </pre>
      </div>
    </div>
  );
}