const { createQuickCase, findCaseByAnyId, listOfficialPayloadCases, normalizeCaseStatus, updateCaseStatus } = require('../db/caseRepository');
const test = require('node:test');
const assert = require('node:assert/strict');

test('findCaseByAnyId procura por id, official_case_number ou legacy_csv_id', async () => {
  const fakeClient = {
    async query(sql, params) {
      assert.match(sql, /id::text = \$1 OR official_case_number = \$1 OR legacy_csv_id = \$1/);
      assert.deepEqual(params, ['42']);
      return {
        rows: [{
          id: 'uuid-42',
          official_case_number: '42',
          legacy_csv_id: '42',
          status: 'new',
          priority: 'routine',
          risk_level: 'normal',
          person_name: 'Caso Teste',
          official_payload: {}
        }]
      };
    }
  };

  const caso = await findCaseByAnyId(fakeClient, 42);
  assert.equal(caso.id, 'uuid-42');
  assert.equal(caso.official_case_number, '42');
});

test('normalizeCaseStatus limita estados operacionais', () => {
  assert.equal(normalizeCaseStatus('active_search'), 'active_search');
  assert.equal(normalizeCaseStatus('x'), null);
});

test('updateCaseStatus exige justificação e atualiza caso', async () => {
  await assert.rejects(() => updateCaseStatus({}, 'case-1', { status: 'active_search', justification: '' }), /justification/);
  const fakeClient = {
    async query(sql, params) {
      assert.match(sql, /UPDATE cases/);
      assert.equal(params[0], 'case-1');
      assert.equal(params[1], 'active_search');
      return { rows: [{ id: 'case-1', status: 'active_search', priority: 'urgent', risk_level: 'high', person_name: 'Ana' }] };
    }
  };
  const caso = await updateCaseStatus(fakeClient, 'case-1', { status: 'active_search', justification: 'Mobilização validada' });
  assert.equal(caso.status, 'active_search');
});

test('createQuickCase insere ocorrência em triage', async () => {
  const fakeClient = {
    async query(sql, params) {
      assert.match(sql, /INSERT INTO cases/);
      assert.equal(params[2], 'Ana Rápida');
      return { rows: [{ id: 'case-quick-1', status: 'triage', priority: params[0], risk_level: params[1], person_name: params[2], official_payload: JSON.parse(params[9]) }] };
    }
  };
  const caso = await createQuickCase(fakeClient, { personName: 'Ana Rápida', reporterName: 'Teste', priority: 'urgent' });
  assert.equal(caso.status, 'triage');
  assert.equal(caso.official_payload.Tipo_Registo, 'quick_sar');
});
