'use client';
import { useEffect, useState } from 'react';

export default function TesteAPIDirect() {
  const [resultado, setResultado] = useState<any>(null);

  useEffect(() => {
    async function testarDireto() {
      try {
        // Teste DIRETO sem intermediário
        const response = await fetch('http://10.157.211.236:5000/api/products/search?q=paracetamol', {
          method: 'GET',
          mode: 'cors', // Tenta forçar CORS
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
      }
    }

    testarDireto();
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <h1>🧪 Teste DIRETO API</h1>
      <pre>{JSON.stringify(resultado, null, 2)}</pre>
    </div>
  );
}