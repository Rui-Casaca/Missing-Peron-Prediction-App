const PROMPT_VERSION = 'sar-ai-guardrails-v1';

const VALID_CONFIDENCE = new Set(['baixa', 'media', 'alta']);

const REQUIRED_ARRAY_FIELDS = [
  'priorities',
  'immediate_actions',
  'hypotheses',
  'missing_information',
  'safety_warnings',
  'limitations',
  'guardrail_flags'
];

const ANALYSIS_RESPONSE_SCHEMA = {
  type: 'object',
  required: ['summary', ...REQUIRED_ARRAY_FIELDS],
  properties: {
    summary: { type: 'string' },
    priorities: { type: 'array' },
    immediate_actions: { type: 'array' },
    hypotheses: { type: 'array' },
    missing_information: { type: 'array' },
    safety_warnings: { type: 'array' },
    limitations: { type: 'array' },
    guardrail_flags: { type: 'array' }
  }
};

const SENSITIVE_CLAIM_RULES = [
  {
    id: 'invented_witness_or_sighting',
    pattern: /\b(testemunha\s+confirmou|testemunha\s+viu|foi\s+vist[oa]|avistad[oa]|avistamento\s+confirmado)\b/i,
    evidencePattern: /\b(testemunh|avist|observad|reportad)\b/i,
    message: 'Avistamento/testemunho referido sem evidência explícita.'
  },
  {
    id: 'unsupported_crime_claim',
    pattern: /\b(crime|criminal|rapto|sequestro|homic[ií]dio|suspeito|agressor)\b/i,
    evidencePattern: /\b(crime|criminal|rapto|sequestro|homic[ií]dio|suspeito|agressor|ind[ií]cios\s+de\s+crime)\b/i,
    message: 'Indício criminal referido sem evidência explícita.'
  },
  {
    id: 'unsupported_suicide_claim',
    pattern: /\b(suic[ií]dio|suicida|autoexterm|autoles[aã]o)\b/i,
    evidencePattern: /\b(suic[ií]dio|suicida|autoexterm|autoles[aã]o|inten[cç][aã]o\s+suicida)\b/i,
    message: 'Risco suicida referido sem evidência explícita.'
  },
  {
    id: 'unsupported_vital_status_claim',
    pattern: /\b(morto|morta|morte|falecid[oa]|sem\s+vida|[óo]bito)\b/i,
    evidencePattern: /\b(morto|morta|morte|falecid[oa]|sem\s+vida|[óo]bito|found_deceased|encontrad[oa])\b/i,
    message: 'Estado vital referido sem evidência explícita.'
  }
];

module.exports = {
  ANALYSIS_RESPONSE_SCHEMA,
  PROMPT_VERSION,
  REQUIRED_ARRAY_FIELDS,
  SENSITIVE_CLAIM_RULES,
  VALID_CONFIDENCE
};