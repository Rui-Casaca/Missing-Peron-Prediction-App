const test = require('node:test');
const assert = require('node:assert/strict');

const { createClue, normalizeReliability } = require('../db/clueRepository');

test('normalizeReliability limita valores desconhecidos', () => {
  assert.equal(normalizeReliability('high'), 'high');
  assert.equal(normalizeReliability('CONFIRMED'), 'confirmed');
  assert.equal(normalizeReliability('invalido'), 'unknown');
});

test('createClue exige descrição', async () => {
  await assert.rejects(
    () => createClue({}, { caseId: 'case-1', description: '' }),
    /description é obrigatório/
  );
});

test('createClue insere pista com geometria opcional', async () => {
  const queries = [];
  const fakeClient = {
    async query(sql, params) {
      queries.push({ sql, params });
      return {
        rows: [{
          id: 'clue-1',
          case_id: params[0],
          clue_type: params[1],
          description: params[2],
          reliability: params[3],
          latitude: 40.1,
          longitude: -8.2,
          observed_at: params[5],
          reported_by: params[6],
          created_by: params[7]
        }]
      };
    }
  };

  const clue = await createClue(fakeClient, {
    caseId: 'case-1',
    clueType: 'sighting',
    description: 'Avistamento junto ao rio',
    reliability: 'high',
    cluePointWkt: 'POINT(-8.2 40.1)',
    reportedBy: 'Testemunha'
  });

  assert.equal(clue.id, 'clue-1');
  assert.equal(clue.description, 'Avistamento junto ao rio');
  assert.equal(queries[0].params[4], 'POINT(-8.2 40.1)');
});
