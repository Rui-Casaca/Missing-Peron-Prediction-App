const test = require('node:test');
const assert = require('node:assert/strict');

const { listCasesMissingEvent, recordCaseEvent } = require('../db/caseEventRepository');

test('recordCaseEvent exige campos mínimos', async () => {
  await assert.rejects(
    () => recordCaseEvent({}, { eventType: 'case_created', summary: 'Criado' }),
    /caseId é obrigatório/
  );
});

test('recordCaseEvent insere evento com payload serializado', async () => {
  const queries = [];
  const fakeClient = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rows: [{ id: 'event-1', case_id: params[0], event_type: params[1] }] };
    }
  };

  const event = await recordCaseEvent(fakeClient, {
    caseId: 'case-1',
    eventType: 'case_created',
    summary: 'Caso criado',
    payload: { ID_Caso: '1' },
    eventPointWkt: 'POINT(-8 40)'
  });

  assert.equal(event.id, 'event-1');
  assert.equal(queries.length, 1);
  assert.equal(queries[0].params[0], 'case-1');
  assert.equal(queries[0].params[1], 'case_created');
  assert.equal(queries[0].params[3], JSON.stringify({ ID_Caso: '1' }));
  assert.equal(queries[0].params[4], 'POINT(-8 40)');
});

test('listCasesMissingEvent procura casos sem evento específico', async () => {
  const fakeClient = {
    async query(sql, params) {
      assert.match(sql, /NOT EXISTS/);
      assert.deepEqual(params, ['case_created', 50]);
      return { rows: [{ id: 'case-1', legacy_csv_id: '1' }] };
    }
  };

  const cases = await listCasesMissingEvent(fakeClient, 'case_created', { limit: 50 });
  assert.deepEqual(cases, [{ id: 'case-1', legacy_csv_id: '1' }]);
});

test('listCasesMissingEvent exige eventType', async () => {
  await assert.rejects(
    () => listCasesMissingEvent({}, ''),
    /eventType é obrigatório/
  );
});
