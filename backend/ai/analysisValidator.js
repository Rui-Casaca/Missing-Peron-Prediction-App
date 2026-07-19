const {
  PROMPT_VERSION,
  REQUIRED_ARRAY_FIELDS,
  SENSITIVE_CLAIM_RULES,
  VALID_CONFIDENCE
} = require('./analysisSchema');

function extractJsonFromText(value) {
  if (!value || typeof value !== 'string') throw new Error('Resposta LLM vazia');
  let text = value.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) text = fenced[1].trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) throw new Error('Resposta LLM não contém JSON');
  return JSON.parse(text.slice(first, last + 1));
}

function normalizeText(value) {
  return String(value ?? '').toLowerCase();
}

function collectEvidence(dataPacket) {
  const entries = Array.isArray(dataPacket?.evidence_register) ? dataPacket.evidence_register : [];
  const byId = new Map();
  entries.forEach((entry) => {
    if (entry && entry.id) byId.set(entry.id, entry);
  });
  const evidenceText = entries
    .map(entry => `${entry.id || ''} ${entry.label || ''} ${typeof entry.value === 'object' ? JSON.stringify(entry.value) : entry.value || ''}`)
    .join('\n');
  const coordinates = entries
    .map(entry => ({ id: entry.id, value: entry.value }))
    .filter(entry => entry.value && typeof entry.value === 'object' && Number.isFinite(Number(entry.value.latitude)) && Number.isFinite(Number(entry.value.longitude)))
    .map(entry => ({ id: entry.id, latitude: Number(entry.value.latitude), longitude: Number(entry.value.longitude) }));
  return { byId, evidenceText, coordinates };
}

function validateEvidenceIds(item, path, evidence, errors) {
  const ids = item && Array.isArray(item.evidence_ids) ? item.evidence_ids : [];
  if (ids.length === 0) {
    errors.push(`${path}: evidence_ids é obrigatório e não pode estar vazio`);
    return;
  }
  ids.forEach((id) => {
    if (!evidence.byId.has(id)) errors.push(`${path}: evidence_id inválido (${id})`);
  });
}

function validateCommonItem(item, path, evidence, errors, flags) {
  if (!item || typeof item !== 'object') {
    errors.push(`${path}: item inválido`);
    return;
  }
  validateEvidenceIds(item, path, evidence, errors);

  const confidence = normalizeText(item.confidence || item.confianca || '');
  if (confidence && !VALID_CONFIDENCE.has(confidence)) errors.push(`${path}: confidence inválida (${item.confidence})`);
  if (confidence === 'alta' && (!Array.isArray(item.evidence_ids) || item.evidence_ids.length < 2)) {
    flags.push({ id: 'high_confidence_with_limited_evidence', path, message: 'Confiança alta com evidência limitada.' });
  }
  if (item.human_review_required !== true) errors.push(`${path}: human_review_required deve ser true`);
}

function objectIncludesUnsupportedCoordinates(value, evidenceCoordinates) {
  if (!value || typeof value !== 'object') return [];
  const found = [];
  const visit = (node, path) => {
    if (!node || typeof node !== 'object') return;
    const lat = node.latitude ?? node.lat;
    const lon = node.longitude ?? node.lon ?? node.lng;
    if (lat !== undefined || lon !== undefined) {
      const latitude = Number(lat);
      const longitude = Number(lon);
      const supported = evidenceCoordinates.some(coord => Math.abs(coord.latitude - latitude) < 0.000001 && Math.abs(coord.longitude - longitude) < 0.000001);
      if (!supported) found.push(`${path}: coordenadas não presentes na evidência (${lat}, ${lon})`);
    }
    Object.entries(node).forEach(([key, child]) => visit(child, `${path}.${key}`));
  };
  visit(value, '$');
  return found;
}

function validateSensitiveClaims(analysis, evidence, errors, flags) {
  const analysisText = JSON.stringify(analysis || {});
  SENSITIVE_CLAIM_RULES.forEach((rule) => {
    if (rule.pattern.test(analysisText) && !rule.evidencePattern.test(evidence.evidenceText)) {
      errors.push(`${rule.id}: ${rule.message}`);
      flags.push({ id: rule.id, message: rule.message });
    }
  });
}

function validateAnalysisObject(analysis, dataPacket = null) {
  const errors = [];
  const guardrailFlags = [];

  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) {
    return { status: 'failed', errors: ['Resposta validada não é um objeto JSON'], guardrail_flags: guardrailFlags, analysis };
  }
  if (typeof analysis.summary !== 'string' || analysis.summary.trim() === '') errors.push('summary é obrigatório');
  REQUIRED_ARRAY_FIELDS.forEach((field) => {
    if (!Array.isArray(analysis[field])) errors.push(`${field} deve ser array`);
  });

  const evidence = collectEvidence(dataPacket);
  if (!dataPacket || evidence.byId.size === 0) {
    guardrailFlags.push({ id: 'missing_evidence_packet', message: 'Validação de evidência foi ignorada por falta de pacote de evidência.' });
    return {
      status: errors.length > 0 ? 'failed' : 'warning',
      errors,
      guardrail_flags: guardrailFlags,
      analysis
    };
  }

  ['priorities', 'immediate_actions', 'hypotheses'].forEach((field) => {
    (analysis[field] || []).forEach((item, index) => validateCommonItem(item, `${field}[${index}]`, evidence, errors, guardrailFlags));
  });
  errors.push(...objectIncludesUnsupportedCoordinates(analysis, evidence.coordinates));
  validateSensitiveClaims(analysis, evidence, errors, guardrailFlags);

  return {
    status: errors.length > 0 ? 'failed' : (guardrailFlags.length > 0 ? 'warning' : 'passed'),
    errors,
    guardrail_flags: guardrailFlags,
    analysis
  };
}

function validateAnalysisResponse(responseText, dataPacket = null) {
  try {
    const analysis = extractJsonFromText(responseText);
    const result = validateAnalysisObject(analysis, dataPacket);
    return {
      prompt_version: dataPacket?.prompt_version || PROMPT_VERSION,
      ...result
    };
  } catch (error) {
    return {
      prompt_version: dataPacket?.prompt_version || PROMPT_VERSION,
      status: 'failed',
      errors: [error.message],
      guardrail_flags: [{ id: 'invalid_json', message: 'Resposta da IA não é JSON válido.' }],
      analysis: null
    };
  }
}

module.exports = {
  collectEvidence,
  extractJsonFromText,
  validateAnalysisObject,
  validateAnalysisResponse
};