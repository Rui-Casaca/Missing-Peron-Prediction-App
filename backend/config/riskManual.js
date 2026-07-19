/**
 * REAL risk-assessment methodology used by this deployment.
 * PRIVATE FILE — gitignored, do not publish. See riskManual.example.js
 * for the public/illustrative counterpart shipped in the repository.
 */

module.exports = {
  methodologyLabel: 'Metodologia oficial de avaliação de risco (manual interno GNR/PDGNR M 1-04-02)',

  indicators: {
    MENOR_IDADE: { descricao: 'Pessoa menor de idade', peso: 4 },
    PESSOA_IDOSA: { descricao: 'Pessoa idosa com vulnerabilidade especial', peso: 2 },
    INDICIOS_CRIME: { descricao: 'Indícios de crime (rapto, sequestro, subtração de menor, homicídio, tráfico)', peso: 5 },
    RISCO_VIDA: { descricao: 'Risco iminente para a vida (indícios de suicídio, condições climatéricas adversas)', peso: 5 },
    RISCO_INTEGRIDADE: { descricao: 'Risco para a integridade física', peso: 3 },
    CONTRADIZ_COMPORTAMENTO: { descricao: 'Ausência em total contradição com comportamento habitual', peso: 2 },
    SEM_EXPLICACAO: { descricao: 'Ausência de qualquer explicação para o desaparecimento', peso: 2 },
    NAO_CHEGOU_DESTINO: { descricao: 'Não chegou ao destino presumível sem deixar informação', peso: 2 },
    NAO_LEVOU_PERTENCES: { descricao: 'Não levou pertences pessoais/documentação habitual', peso: 2 },
    ABANDONOU_VEICULO: { descricao: 'Abandonou veículo sem razão aparente', peso: 3 },
    PERIGO_TERCEIROS: { descricao: 'Pode constituir perigo para terceiros', peso: 3 },
    VIOLENCIA_DOMESTICA: { descricao: 'Vítima de violência doméstica/de género', peso: 4 },
    CONDICOES_MEDICAS: { descricao: 'Condições médicas críticas (sem medicação vital, doenças neurodegenerativas, falta de autonomia)', peso: 3 },
    MENOR_INSTITUICAO: { descricao: 'Menor fugiu de centro educativo/acolhimento', peso: 3 },
    ABANDONOU_MENORES: { descricao: 'Abandonou menores a seu cargo', peso: 4 }
  },

  thresholds: { elevado: 5, moderado: 3 },

  ageThresholds: { minor: 18, elderly: 75 },

  alwaysElevado: ['INDICIOS_CRIME', 'RISCO_VIDA', 'VIOLENCIA_DOMESTICA'],

  priorityOverrides: {
    muitoUrgente: ['INDICIOS_CRIME', 'RISCO_VIDA', 'VIOLENCIA_DOMESTICA', 'ABANDONOU_MENORES', 'MENOR_IDADE'],
    urgente: ['CONTRADIZ_COMPORTAMENTO', 'NAO_CHEGOU_DESTINO', 'ABANDONOU_VEICULO', 'CONDICOES_MEDICAS']
  },

  recommendations: {
    muitoUrgente: [
      'AÇÃO IMEDIATA: Mobilizar todas as equipas disponíveis',
      'Contactar imediatamente autoridades competentes',
      'Estabelecer posto de comando operacional'
    ],
    porIndicador: {
      RISCO_VIDA: [
        'ALERTA SUICÍDIO: Contactar equipas especializadas em prevenção',
        'Verificar locais de risco (pontes, penhascos, linhas férreas, propriedades, locais ou trilhos habituais ou com apego emocional)'
      ],
      MENOR_IDADE: [
        'Procedimento para menores: Ativar protocolos específicos',
        'Procurar locais conhecidos onde costuma brincar, locais que lhe são familiares, contactar escola e amigos próximos'
      ],
      CONDICOES_MEDICAS: [
        'EMERGÊNCIA MÉDICA: Verificar hospitais e centros de saúde',
        'Contactar médico assistente, ou estabelecer contato telefónico a questionar se deu entrada no hospital ou clinica'
      ]
    }
  }
};
