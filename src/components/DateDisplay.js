// src/components/DateDisplay.js
'use client';

// Importe 'use client' para garantir que a formatação de data ocorra no navegador
export default function DateDisplay({ dateString }) {
  // Se a string da data não existir (caso de segurança), retorne vazio
  if (!dateString) return null;

  // A formatação da data usa o fuso horário e locale do CLIENTE
  const formattedDate = new Date(dateString).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false // Formato 24h
  });

  // O componente só retorna o resultado da formatação no cliente, resolvendo o Hydration Error
  return <>{formattedDate}</>;
}