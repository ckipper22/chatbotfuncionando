// 📁 /lib/services/bula-service.ts

const BULA_API_BASE = 'https://bula.vercel.app';

/**
 * Funções de busca de informações de medicamentos (A Tool para o Gemini).
 * Esta função consulta a API de Bulário baseada em scraping da ANVISA.
 */
export async function buscarInformacaoDeBula(nomeOuPrincipioAtivo: string): Promise<string> {
    const termoBusca = nomeOuPrincipioAtivo.trim();
    
    try {
        // 1. PESQUISA INICIAL
        let response = await fetch(`${BULA_API_BASE}/pesquisar?nome=${encodeURIComponent(termoBusca)}`);
        
        if (!response.ok) {
            return `Falha ao conectar à base de dados ANVISA (Status: ${response.status}).`;
        }

        const resultados = await response.json();

        if (!Array.isArray(resultados) || resultados.length === 0) {
            return `A busca na ANVISA não retornou resultados para "${termoBusca}".`;
        }

        // 2. BUSCA DETALHADA DO PRIMEIRO RESULTADO
        const numProcesso = resultados[0].numProcesso;

        response = await fetch(`${BULA_API_BASE}/medicamento/${numProcesso}`);

        if (!response.ok) {
             return `Falha ao buscar detalhes do medicamento (Status: ${response.status}).`;
        }

        const detalhes = await response.json();

        // 3. ESTRUTURAÇÃO DA RESPOSTA SEGURA PARA O GEMINI
        // Extrai e limpa os campos essenciais para o Guardrail.
        const nome = detalhes.nome_medicamento || resultados[0].nomeProduto;
        const principios = detalhes.princípios_ativos || resultados[0].principioAtivo;
        const indicacoes = detalhes.indicação || 'Não especificada.';
        // Pega a dose recomendada, se existir, para mostrar um uso padrão
        const posologiaPadrao = detalhes.posologia_e_modo_de_uso?.dose_recomendada || 'Consultar bula/profissional.';
        
        // Pega as contraindicações e resume
        const contraIndicacoes = detalhes.contra_indicações?.slice(0, 3).join('; ') || 'Sem detalhes de contraindicações imediatas.';

        return `
            INFORMAÇÃO OFICIAL ANVISA (Fonte Bula.vercel.app - Scraping):
            - Nome Comercial: ${nome}
            - Princípios Ativos: ${principios}
            - Indicações: ${indicacoes}
            - Posologia Padrão: ${posologiaPadrao}
            - Contraindicações Chave: ${contraIndicacoes}...
            ---
            O Farmassistente DEVE usar esta informação apenas para formular uma resposta GENÉRICA e segura, adicionando o aviso legal. Não deve recomendar ou dar doses específicas ao cliente.
        `;

    } catch (error) {
        // Em um sistema real, você registraria este erro em um serviço de logs
        console.error('❌ Erro no crawler da ANVISA/bulario-api:', error);
        return 'Erro interno ao processar a busca de medicamentos. Tente um nome diferente ou informe que a função de busca falhou.';
    }
}

// ⚠️ Mapeamento de Ferramentas (Tools)
export const ferramentasFarmacia = [
    {
        functionDeclarations: [
            {
                name: "buscarInformacaoDeBula",
                description: "Busca informações objetivas de bula de medicamentos (princípio ativo, indicações, e posologia padrão). Use APENAS quando o usuário perguntar 'para que serve', 'qual é o princípio ativo' ou 'informação' sobre um medicamento.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        nomeOuPrincipioAtivo: {
                            type: "STRING",
                            description: "O nome comercial ou princípio ativo do medicamento para buscar na base de bulas da ANVISA."
                        }
                    },
                    required: ["nomeOuPrincipioAtivo"]
                }
            }
        ],
    }
];
