/**
 * MÓDULO DE CÁLCULO DE RISCO
 * SARIA - Sistema de Pessoas Desaparecidas
 *
 * O motor de avaliação (condições, pontuação, classificação) é genérico.
 * Os indicadores, pesos, limiares e recomendações concretas vêm de
 * backend/config/riskManual.js (privado, não incluído no repositório) com
 * fallback para backend/config/riskManual.example.js (público, ilustrativo).
 */

function loadRiskManual() {
  try {
    // eslint-disable-next-line global-require
    return require('./config/riskManual');
  } catch (error) {
    // eslint-disable-next-line global-require
    return require('./config/riskManual.example');
  }
}

const RISK_MANUAL = loadRiskManual();

// Condições que ativam cada indicador, com base nos campos do formulário oficial.
const INDICATOR_CONDITIONS = {
  MENOR_IDADE: (d) => !!(d.Idade_Exacta && parseInt(d.Idade_Exacta) < RISK_MANUAL.ageThresholds.minor),
  PESSOA_IDOSA: (d) => !!(d.Idade_Exacta && parseInt(d.Idade_Exacta) > RISK_MANUAL.ageThresholds.elderly),
  INDICIOS_CRIME: (d) => d.Indicios_Crime === 'Sim',
  RISCO_VIDA: (d) => d.Risco_Iminente_Vida === 'Sim' ||
    d.Verbalizou_Intencao_Suicidio === 'Sim' ||
    d.Tentou_Suicidio_Anteriormente === 'Sim' ||
    d.Deixou_Nota_Despedida === 'Sim',
  RISCO_INTEGRIDADE: (d) => d.Risco_Integridade_Fisica === 'Sim',
  CONTRADIZ_COMPORTAMENTO: (d) => d.Ausencia_Contradiz_Comportamento === 'Sim',
  SEM_EXPLICACAO: (d) => d.Ausencia_Sem_Explicacao === 'Sim',
  NAO_CHEGOU_DESTINO: (d) => d.Nao_Chegou_Destino === 'Sim',
  NAO_LEVOU_PERTENCES: (d) => d.Nao_Levou_Pertences === 'Sim' || d.Levou_Documentacao === 'Não',
  ABANDONOU_VEICULO: (d) => d.Abandonou_Veiculo === 'Sim',
  PERIGO_TERCEIROS: (d) => d.Perigo_Para_Terceiros === 'Sim',
  VIOLENCIA_DOMESTICA: (d) => d.Vitima_Violencia_Domestica === 'Sim',
  CONDICOES_MEDICAS: (d) => (d.Medicamentos_Vitais_Necessarios === 'Sim' && d.Transporta_Medicamentos === 'Não') ||
    d.Possui_Doencas_Neurodegenerativas === 'Sim' ||
    (d.Possui_Anomalia_Psiquica === 'Sim' && d.Falta_Autonomia === 'Sim'),
  MENOR_INSTITUICAO: (d) => d.Fugiu_Centro_Educativo === 'Sim',
  ABANDONOU_MENORES: (d) => d.Abandonou_Menores_Cargo === 'Sim'
};

/**
 * Calcula o nível de risco a partir dos indicadores configurados.
 * @param {Object} dados - Dados completos do caso
 * @returns {Object} - {nivel: string, indicadores: array, pontuacao: number, total_indicadores: number}
 */
function calcularRiscoOficial(dados) {
  const indicadoresAtivos = [];
  let pontuacaoRisco = 0;

  Object.entries(INDICATOR_CONDITIONS).forEach(([codigo, isActive]) => {
    if (!isActive(dados)) return;
    const meta = RISK_MANUAL.indicators[codigo] || { descricao: codigo, peso: 0 };
    indicadoresAtivos.push({ codigo, descricao: meta.descricao, peso: meta.peso });
    pontuacaoRisco += meta.peso;
  });

  let nivelRisco = 'Normal';
  if (pontuacaoRisco >= RISK_MANUAL.thresholds.elevado) {
    nivelRisco = 'Elevado';
  } else if (pontuacaoRisco >= RISK_MANUAL.thresholds.moderado) {
    nivelRisco = 'Moderado';
  } else if (indicadoresAtivos.some(ind => RISK_MANUAL.alwaysElevado.includes(ind.codigo))) {
    nivelRisco = 'Elevado';
  }

  return {
    nivel: nivelRisco,
    indicadores: indicadoresAtivos,
    pontuacao: pontuacaoRisco,
    total_indicadores: indicadoresAtivos.length
  };
}

/**
 * Determina a prioridade da busca a partir do risco calculado e dos indicadores ativos.
 * @param {string} nivelRisco - Nível de risco calculado
 * @param {Object} dados - Dados do caso
 * @returns {string} - 'Muito Urgente', 'Urgente', ou 'Rotina'
 */
function determinarPrioridadeOficial(nivelRisco, dados) {
  const { indicadores } = calcularRiscoOficial(dados);
  const codigosAtivos = indicadores.map(ind => ind.codigo);
  const overrides = RISK_MANUAL.priorityOverrides;

  if (nivelRisco === 'Elevado') return 'Muito Urgente';
  if (codigosAtivos.some(codigo => overrides.muitoUrgente.includes(codigo))) return 'Muito Urgente';

  const idosoSemAutonomia = dados.Idade_Exacta &&
    parseInt(dados.Idade_Exacta) > RISK_MANUAL.ageThresholds.elderly &&
    dados.Falta_Autonomia === 'Sim';
  if (idosoSemAutonomia) return 'Muito Urgente';

  if (nivelRisco === 'Moderado') return 'Urgente';
  if (codigosAtivos.some(codigo => overrides.urgente.includes(codigo))) return 'Urgente';

  return 'Rotina';
}

/**
 * Gera um relatório detalhado da avaliação de risco
 * @param {Object} avaliacaoRisco - Resultado do cálculo de risco
 * @param {string} prioridade - Prioridade determinada
 * @returns {Object} - Relatório formatado
 */
function gerarRelatorioRisco(avaliacaoRisco, prioridade) {
  return {
    resumo: {
      nivel: avaliacaoRisco.nivel,
      prioridade: prioridade,
      pontuacao: avaliacaoRisco.pontuacao,
      total_indicadores: avaliacaoRisco.total_indicadores
    },
    indicadores_ativos: avaliacaoRisco.indicadores,
    recomendacoes: gerarRecomendacoes(avaliacaoRisco, prioridade),
    timestamp: new Date().toISOString()
  };
}

/**
 * Gera recomendações operacionais a partir da configuração de risco.
 * @param {Object} avaliacaoRisco - Resultado do cálculo
 * @param {string} prioridade - Prioridade da busca
 * @returns {Array} - Array de recomendações
 */
function gerarRecomendacoes(avaliacaoRisco, prioridade) {
  const recomendacoes = [];
  const { recommendations } = RISK_MANUAL;

  if (prioridade === 'Muito Urgente') {
    recomendacoes.push(...(recommendations.muitoUrgente || []));
  }

  avaliacaoRisco.indicadores.forEach((indicador) => {
    const extra = recommendations.porIndicador && recommendations.porIndicador[indicador.codigo];
    if (extra) recomendacoes.push(...extra);
  });

  return recomendacoes;
}

module.exports = {
  calcularRiscoOficial,
  determinarPrioridadeOficial,
  gerarRelatorioRisco,
  gerarRecomendacoes
};
