/**
 * EXAMPLE risk-assessment methodology (illustrative only).
 *
 * This file ships in the public repository so the project runs out of the
 * box. The weights, thresholds and recommendation texts below are generic
 * placeholders written for demonstration purposes — they are NOT the
 * author's real, organization-specific SAR risk-assessment doctrine.
 *
 * To reproduce a real deployment, copy this file to `riskManual.js` in the
 * same folder (that filename is gitignored, see backend/.gitignore) and
 * replace the values with your own domain expertise. `riskAssessment.js`
 * automatically prefers `riskManual.js` when present and falls back to
 * this example file otherwise.
 */

module.exports = {
  methodologyLabel: 'Example SAR risk-assessment methodology (illustrative, generic placeholder)',

  // Descriptive label + score weight for each risk indicator code.
  // NOTE: these weights are simplified placeholders (1-3 scale) chosen for
  // this example and do NOT reproduce the real deployment's scoring rubric.
  indicators: {
    MENOR_IDADE: { descricao: 'Missing person is a minor', peso: 3 },
    PESSOA_IDOSA: { descricao: 'Elderly person, potentially higher vulnerability', peso: 1 },
    INDICIOS_CRIME: { descricao: 'Possible indications of a crime', peso: 3 },
    RISCO_VIDA: { descricao: 'Possible imminent risk to life', peso: 3 },
    RISCO_INTEGRIDADE: { descricao: 'Risk to physical integrity', peso: 2 },
    CONTRADIZ_COMPORTAMENTO: { descricao: 'Disappearance contradicts usual behaviour', peso: 1 },
    SEM_EXPLICACAO: { descricao: 'No explanation found for the disappearance', peso: 1 },
    NAO_CHEGOU_DESTINO: { descricao: 'Did not arrive at the expected destination', peso: 1 },
    NAO_LEVOU_PERTENCES: { descricao: 'Did not take usual personal belongings/documents', peso: 1 },
    ABANDONOU_VEICULO: { descricao: 'Abandoned a vehicle without apparent reason', peso: 2 },
    PERIGO_TERCEIROS: { descricao: 'May pose a danger to third parties', peso: 2 },
    VIOLENCIA_DOMESTICA: { descricao: 'Domestic violence context reported', peso: 3 },
    CONDICOES_MEDICAS: { descricao: 'Critical medical condition reported', peso: 2 },
    MENOR_INSTITUICAO: { descricao: 'Minor left an institution/care facility', peso: 2 },
    ABANDONOU_MENORES: { descricao: 'Left dependent minors unattended', peso: 3 }
  },

  // Score cut-offs used to classify the overall risk level (placeholder values).
  thresholds: { elevado: 6, moderado: 3 },

  // Age boundaries used by a couple of age-based rules.
  ageThresholds: { minor: 18, elderly: 75 },

  // Indicator codes that force "Elevado" regardless of the accumulated score.
  alwaysElevado: ['INDICIOS_CRIME', 'RISCO_VIDA', 'VIOLENCIA_DOMESTICA'],

  // Indicator codes that force "Muito Urgente" / "Urgente" priority.
  priorityOverrides: {
    muitoUrgente: ['INDICIOS_CRIME', 'RISCO_VIDA', 'VIOLENCIA_DOMESTICA', 'ABANDONOU_MENORES', 'MENOR_IDADE'],
    urgente: ['CONTRADIZ_COMPORTAMENTO', 'NAO_CHEGOU_DESTINO', 'ABANDONOU_VEICULO', 'CONDICOES_MEDICAS']
  },

  // Free-text operational recommendations surfaced to the user in reports.
  recommendations: {
    muitoUrgente: [
      'Immediate action: mobilise all available search teams',
      'Contact the relevant authorities without delay',
      'Set up an operational command post'
    ],
    porIndicador: {
      RISCO_VIDA: [
        'Contact teams specialised in crisis/self-harm prevention',
        'Check locations that may pose a higher risk given the case context'
      ],
      MENOR_IDADE: [
        'Activate the minor-specific search protocol',
        'Check locations familiar to the child; contact school and close contacts'
      ],
      CONDICOES_MEDICAS: [
        'Check nearby hospitals and health centres',
        'Contact the treating physician if known'
      ]
    }
  }
};
