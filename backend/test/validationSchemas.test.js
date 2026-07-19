const assert = require('node:assert/strict');
const test = require('node:test');

const {
  caseStatusBodySchema,
  quickCaseBodySchema,
  searchAreaBodySchema,
  syncPushBodySchema,
  taskBodySchema,
  teamBodySchema
} = require('../validation/schemas');

test('quickCaseBodySchema aceita aliases oficiais e coerção segura', () => {
  const parsed = quickCaseBodySchema.parse({
    Nome_Completo: ' Maria Silva ',
    Idade_Exacta: '72',
    Latitude: 'ignored legacy field',
    latitude: '38.7223',
    longitude: '-9.1393',
    priority: 'urgent',
    risk_level: 'high'
  });

  assert.equal(parsed.Nome_Completo, 'Maria Silva');
  assert.equal(parsed.Idade_Exacta, 72);
  assert.equal(parsed.latitude, 38.7223);
  assert.equal(parsed.longitude, -9.1393);
});

test('quickCaseBodySchema rejeita coordenadas e enums inválidos', () => {
  assert.equal(quickCaseBodySchema.safeParse({ person_name: 'Teste', latitude: 95 }).success, false);
  assert.equal(quickCaseBodySchema.safeParse({ person_name: 'Teste', priority: 'alta' }).success, false);
});

test('caseStatusBodySchema exige estado válido e justificação', () => {
  assert.equal(caseStatusBodySchema.safeParse({ status: 'active_search', justification: 'Mobilização SAR' }).success, true);
  assert.equal(caseStatusBodySchema.safeParse({ status: 'invalid', justification: 'x' }).success, false);
  assert.equal(caseStatusBodySchema.safeParse({ status: 'triage' }).success, false);
});

test('taskBodySchema e teamBodySchema validam campos operacionais', () => {
  assert.equal(taskBodySchema.safeParse({ title: 'Validar pista', priority: 'routine', status: 'pending' }).success, true);
  assert.equal(taskBodySchema.safeParse({ title: 'Validar pista', status: 'feito' }).success, false);
  assert.equal(teamBodySchema.safeParse({ name: 'Equipa A', team_type: 'drone', status: 'available' }).success, true);
  assert.equal(teamBodySchema.safeParse({ name: 'Equipa A', team_type: 'aviation' }).success, false);
});

test('searchAreaBodySchema valida prioridade, estado e raio', () => {
  assert.equal(searchAreaBodySchema.safeParse({ name: 'Zona 1', priority: 'urgent', status: 'planned', radius_meters: 250 }).success, true);
  assert.equal(searchAreaBodySchema.safeParse({ name: 'Zona 1', priority: 'alta' }).success, false);
  assert.equal(searchAreaBodySchema.safeParse({ name: 'Zona 1', radius_meters: -1 }).success, false);
});

test('syncPushBodySchema valida operações offline idempotentes', () => {
  assert.equal(syncPushBodySchema.safeParse({
    operations: [{
      client_operation_id: 'op-1',
      source_device_id: 'tablet-1',
      entity_type: 'quick_case',
      operation_type: 'create',
      payload: { person_name: 'Teste' }
    }]
  }).success, true);

  assert.equal(syncPushBodySchema.safeParse({ operations: [] }).success, false);
  assert.equal(syncPushBodySchema.safeParse({ operations: [{ entity_type: 'quick_case', payload: {} }] }).success, false);
});
