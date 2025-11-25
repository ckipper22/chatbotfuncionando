// src/app/admin/conversas/page.js
// ====================================================================================
// COMPONENTE SERVIDOR: Busca os dados no Supabase e renderiza a estrutura da página
// ====================================================================================

import { createClient } from '@supabase/supabase-js';
// IMPORTANTE: Ajuste este caminho se o seu alias '@' não estiver configurado.
// Se não usar alias, o caminho relativo seria: import DateDisplay from '../../../components/DateDisplay';
import DateDisplay from '@/components/DateDisplay';

// Inicialização do cliente Supabase
// (Usa NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY do .env.local)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Função para buscar os dados (Executada no Servidor)
async function fetchConversations() {
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Erro ao buscar conversas:', error);
    return [];
  }
  return data;
}

// Componente principal da página
export default async function ConversationsPage() {
  const messages = await fetchConversations();

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Dashboard de Conversas do Chatbot 💬</h1>
      <p style={styles.subtitle}>
        Exibindo as {messages.length} interações mais recentes.
      </p>

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableRowHeader}>
              <th style={styles.tableHeader}>ID Cliente (WA)</th>
              <th style={styles.tableHeader}>Direção</th>
              <th style={styles.tableHeader}>Mensagem</th>
              <th style={styles.tableHeader}>Farmácia ID</th>
              <th style={styles.tableHeader}>Data/Hora</th>
            </tr>
          </thead>
          <tbody>
            {messages.map((msg) => (
              <tr key={msg.id} style={styles.tableRow}>
                <td style={msg.direction === 'IN' ? styles.inCell : styles.outCell}>
                  {msg.from_number}
                </td>
                <td style={msg.direction === 'IN' ? styles.inCell : styles.outCell}>
                  {msg.direction}
                </td>
                <td style={msg.direction === 'IN' ? styles.inCell : styles.outCell}>
                  {/* Atenção: Texto do WhatsApp pode ser grande */}
                  <span style={styles.messageBody}>{msg.message_body}</span>
                </td>
                <td style={msg.direction === 'IN' ? styles.inCell : styles.outCell}>
                  {msg.whatsapp_phone_id}
                </td>
                <td style={msg.direction === 'IN' ? styles.inCell : styles.outCell}>
                  {/* CORREÇÃO DO ERRO DE HIDRATAÇÃO: Usando o componente cliente */}
                  <DateDisplay dateString={msg.created_at} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {messages.length === 0 && (
        <p style={styles.noData}>Nenhuma mensagem encontrada. Envie um "oi" para testar!</p>
      )}
    </div>
  );
}


// --- ESTILOS SIMPLES ---

const styles = {
  container: {
    padding: '20px',
    fontFamily: 'sans-serif',
    maxWidth: '1200px',
    margin: '0 auto'
  },
  header: {
    borderBottom: '2px solid #333',
    paddingBottom: '10px',
    marginBottom: '10px'
  },
  subtitle: {
    marginBottom: '20px',
    color: '#555'
  },
  tableContainer: {
    overflowX: 'auto',
    border: '1px solid #ddd',
    borderRadius: '4px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  tableHeader: {
    padding: '12px 8px',
    textAlign: 'left',
    backgroundColor: '#333',
    color: 'white',
    fontSize: '14px'
  },
  tableRowHeader: {
    borderBottom: '2px solid #ccc'
  },
  tableRow: {
    borderBottom: '1px solid #eee'
  },
  baseCell: {
    padding: '10px 8px',
    fontSize: '13px',
    lineHeight: '1.4',
    wordBreak: 'break-word', // Garante que mensagens longas não quebrem o layout
  },
  messageBody: {
    whiteSpace: 'pre-wrap', // Preserva quebras de linha e espaços do WhatsApp
    fontSize: '13px',
    display: 'block'
  },
  inCell: {
    padding: '10px 8px',
    fontSize: '13px',
    lineHeight: '1.4',
    backgroundColor: '#e6ffe6', // Verde Claro (Mensagem Recebida)
    color: '#006400',
  },
  outCell: {
    padding: '10px 8px',
    fontSize: '13px',
    lineHeight: '1.4',
    backgroundColor: '#f0f8ff', // Azul Claro (Mensagem Enviada)
    color: '#1e90ff',
  },
  noData: {
    marginTop: '30px',
    textAlign: 'center',
    color: '#aaa'
  }
};