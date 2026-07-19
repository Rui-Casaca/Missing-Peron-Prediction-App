const csv = require('csv-parse/sync');
const { parseCsvSafe, parseCsvFile } = require('./csvUtil');

/**
 * PROMPT BUILDER OFICIAL CONFORME MANUAL PDGNR M 1-04-02
 * Implementação limpa e consistente: helpers declarados e exportação correta.
 */

// Helpers simples para casos especiais (podem ser enriquecidos posteriormente)
function gerarPromptRiscoElevado(casoAtual) {
  return `\nCASO DE RISCO ELEVADO: Nível ${casoAtual.Risco_Calculado || 'Elevado'}. Ação imediata recomendada.`;
}

function gerarPromptIndicadoresCriticos(casoAtual) {
  return `\nINDICADORES CRÍTICOS: ${casoAtual.Indicadores_Risco_Activos || 'Não especificado'}. Priorizar investigação.`;
}

function gerarPromptSuicidioOficial(casoAtual) {
  return `\nINDICADORES DETECTADOS:\n${casoAtual.Indicadores_Risco_Activos || 'Indicadores críticos identificados'}\n\nANÁLISE REQUERIDA:\n1. Padrões comportamentais específicos ao tipo de risco\n2. Locais de maior probabilidade baseados no perfil de risco\n`;
}

function gerarPromptMenor(casoAtual) {
  return `\n### ANÁLISE ESPECIALIZADA - MENOR DESAPARECIDO ###\nPessoa menor de idade (${casoAtual.Idade_Exacta || 'N/D'} anos) - protocolo especial.`;
}

function gerarPromptIdoso(casoAtual) {
  return `\n### ANÁLISE ESPECIALIZADA - PESSOA IDOSA ###\nPessoa idosa (${casoAtual.Idade_Exacta || 'N/D'} anos) - vulnerabilidade aumentada.`;
}

// Função central para decidir qual prompt especializado aplicar
function gerarPromptEspecializadoOficial(casoAtual) {
  const risco = (casoAtual.Risco_Calculado || '').toString().toLowerCase();
  const prioridade = (casoAtual.Avaliacao_Prioridade || '').toString().toLowerCase();
  const indicadores = (casoAtual.Indicadores_Risco_Activos || '').toString().toLowerCase();
  const motivacao = (casoAtual.Motivacao_Provavel || '').toString().toLowerCase();
  const estadoMental = (casoAtual.Possui_Perturbacoes_Mentais || '').toString().toLowerCase();
  const observacoes = (casoAtual.Observacoes_Adicionais || '').toString().toLowerCase();
  const verbalizouSuicidio = (casoAtual.Verbalizou_Intencao_Suicidio || '').toString().toLowerCase();

  // Novo indicador: fugiu de lar / centro de dia (pode vir em campo específico ou nas observações)
  const fugiuLarField = (casoAtual.Fugiu_Lar_CentroDia || casoAtual.Fugiu_Lar || casoAtual.Fugiu_CentroDia || '').toString().toLowerCase();
  const fugiuLar = fugiuLarField.includes('sim') || observacoes.includes('fugiu lar') || observacoes.includes('fugiu centro') || motivacao.includes('fugiu');

  // Detectar sinais de suicídio
  const indicadoresSuicidio = [
    motivacao.includes('suicid'),
    motivacao.includes('autoexterm'),
    estadoMental.includes('depress'),
    estadoMental.includes('ansioso'),
    observacoes.includes('despedida'),
    verbalizouSuicidio === 'sim',
    indicadores.includes('intenção suicida')
  ];
  if (indicadoresSuicidio.some(Boolean)) return gerarPromptSuicidioOficial(casoAtual);

  if (risco === 'elevado' || prioridade === 'muito urgente') return gerarPromptRiscoElevado(casoAtual);

  const indicadoresCriticos = [
    'indícios de crime',
    'risco iminente de vida',
    'manifestou intenção suicida',
    'vítima de violência doméstica',
    'abandonou menores',
    'fugiu lar',
    'fugiu centro'
  ];
  if (indicadoresCriticos.some(ind => indicadores.includes(ind))) return gerarPromptIndicadoresCriticos(casoAtual);

  const idade = parseInt(casoAtual.Idade_Exacta) || 0;
  if (idade > 0 && idade < 18) return gerarPromptMenor(casoAtual);
  if (idade > 75) return gerarPromptIdoso(casoAtual);

  return '';
}

/**
 * CONSTRUIR PROMPT PRINCIPAL PARA LLM - VERSÃO OFICIAL PDGNR M 1-04-02
 */
function buildPromptOficial(csvData) {
  try {
    const records = parseCsvSafe(csvData, { columns: true });
    if (!records || records.length === 0) return 'Nenhum caso encontrado para análise.';

    const casoAtual = records[records.length - 1] || {};
    const casosHistoricos = records.slice(0, -1);
    const promptEspecializado = gerarPromptEspecializadoOficial(casoAtual) || '';

    // Extrair campos chave que ajudam a orientar prioridades
    const nome = casoAtual.Nome_Completo || casoAtual.Nome || 'N/D';
    const idade = casoAtual.Idade_Exacta || casoAtual.Idade || 'N/D';
    const sexo = casoAtual.Sexo || casoAtual.Sexo_Sexo || 'N/D';
    const condicao = casoAtual.Estado_Mental || casoAtual.Condicao || casoAtual.Condicao_Fisica || '';
    const sinais = casoAtual.Sinais_Distintivos || casoAtual.Observacoes || '';
    const local = casoAtual.Local_Ultimo_Avistamento || casoAtual.Local || 'N/D';
    const dataRegisto = casoAtual.Data_Registo || casoAtual.Data_Desaparecimento || 'N/D';

    // Construir instrução clara para o LLM: formato restrito e conciso
    const lines = [];
    lines.push('Você é um assistente que gera orientações operacionais concisas para equipas de procura e autoridades (GNR/UEPS/PSP/Bombeiros/Cães/SNS).');
    lines.push('Recebeu os dados do caso abaixo e deve devolver SOMENTE um texto em Português com:');
    lines.push('1) Uma secção intitulada "Prioridades:" com uma lista numerada (1., 2., ...) por ordem de prioridade. Cada item deve ser curto (1-2 linhas) e justificar brevemente a prioridade.');
    lines.push('2) Uma secção intitulada "O que fazer imediatamente:" contendo uma tabela Markdown com as colunas: | Área | Ação | Responsável | Frequência / Prazo |. A tabela deve listar ações práticas, atribuíveis e ordenadas por prioridade. Use prazos concretos (ex.: "Dentro de 24 horas", "Dentro de 7 dias úteis").');
    lines.push('3) Opcionalmente, uma secção final "Notas rápidas" com até 3 bullets se houver riscos adicionais ou recomendações táticas.');
    lines.push('Regras de formatação: NÃO inclua análise longa, não explique o raciocínio passo-a-passo. Responda apenas com as secções pedidas em Português, usando Markdown para a tabela. Se alguma informação não estiver disponível, escreva "N/D" nesse campo.');
    lines.push('Se o caso descreve vulnerabilidade (ex.: demência, idade avançada, fragilidade), priorize ações de proteção imediata e busca focada em locais de habitação, instituições de saúde, ambulâncias, e trajetos habituais.');

    // Incluir resumo do caso para contexto (mantê-lo curto)
    lines.push('---');
    lines.push(`Caso: ${nome}`);
    lines.push(`Idade: ${idade} | Sexo: ${sexo} | Condição mental/saúde relevante: ${condicao || 'N/D'}`);
    lines.push(`Sinais/Observações: ${sinais || 'N/D'}`);
    lines.push(`Último avistamento / Local: ${local} | Data/Registo: ${dataRegisto}`);
    // Incluir estatísticas históricas e casos similares como referência
    if (casosHistoricos && casosHistoricos.length > 0) {
      const estat = gerarEstatisticasHistoricas(casosHistoricos);
      const similares = encontrarCasosSimilares(casoAtual, casosHistoricos);
      lines.push('---');
      lines.push('Contexto histórico:');
      lines.push(estat);
      if (similares && similares.length > 0) {
        lines.push('Casos históricos similares (top 3):');
        similares.forEach((s, i) => {
          const nomeS = s.Nome_Completo || s.Nome || 'N/D';
          const locS = s.Local_Ultimo_Avistamento || s.Local || 'N/D';
          const dataS = s.Data_Desaparecimento || s.Data_Registo || 'N/D';
          const distS = (s.Latitude && s.Longitude && casoAtual.Latitude && casoAtual.Longitude) ? ` (coords: ${s.Latitude},${s.Longitude})` : '';
          lines.push(`${i+1}. ${nomeS} | ${dataS} | Local: ${locS}${distS}`);
        });
      }
      lines.push('---');
      lines.push('Use o histórico acima como EVIDÊNCIA ponderada para inferir possíveis locais da pessoa desaparecida atual. Dê mais peso a casos com características semelhantes (idade, sexo, problemas mentais, motivações, mobilidade, risco) e a distâncias geográficas curtas se houver coordenadas.');
    }
    if (promptEspecializado) {
      lines.push('---');
      lines.push(promptEspecializado);
    }
    lines.push('---');
    lines.push('Agora gere a saída seguindo estritamente o formato pedido (Prioridades, O que fazer imediatamente [tabela], Notas rápidas).');

    return lines.join('\n');
  } catch (error) {
    console.error('Erro ao construir prompt oficial:', error);
    return `Erro ao processar dados do CSV oficial: ${error.message}`;
  }
}

function gerarEstatisticasHistoricas(casosHistoricos) {
  const total = casosHistoricos.length;
  const porRisco = {
    Normal: casosHistoricos.filter(c => c.Risco_Calculado === 'Normal').length,
    Moderado: casosHistoricos.filter(c => c.Risco_Calculado === 'Moderado').length,
    Elevado: casosHistoricos.filter(c => c.Risco_Calculado === 'Elevado').length
  };
  const porIdade = {
    menores: casosHistoricos.filter(c => parseInt(c.Idade_Exacta) < 18).length,
    adultos: casosHistoricos.filter(c => parseInt(c.Idade_Exacta) >= 18 && parseInt(c.Idade_Exacta) <= 65).length,
    idosos: casosHistoricos.filter(c => parseInt(c.Idade_Exacta) > 65).length
  };
  return `- Total de casos: ${total} - Por risco: Normal (${porRisco.Normal}), Moderado (${porRisco.Moderado}), Elevado (${porRisco.Elevado})`;
}

function encontrarCasosSimilares(casoAtual, casosHistoricos) {
  return casosHistoricos.filter(caso => {
    const idadeSimilar = Math.abs(parseInt(caso.Idade_Exacta) - parseInt(casoAtual.Idade_Exacta)) <= 10;
    const sexoIgual = caso.Sexo === casoAtual.Sexo;
    const riscoIgual = caso.Risco_Calculado === casoAtual.Risco_Calculado;
    return idadeSimilar && (sexoIgual || riscoIgual);
  }).slice(0,3);
}

function obterTiposMaisComuns(casos) {
  const tipos = {};
  casos.forEach(caso => { const tipo = caso.Tipo_Desaparecimento || 'Desconhecido'; tipos[tipo] = (tipos[tipo]||0)+1; });
  return Object.entries(tipos).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t,c])=>`${t} (${c})`).join(', ');
}

module.exports = {
  ...require('./ai/promptPacketBuilder'),
  buildPrompt: require('./ai/promptPacketBuilder').buildPrompt,
  buildPromptOficial: require('./ai/promptPacketBuilder').buildPrompt
};