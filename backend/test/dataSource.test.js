const test = require('node:test');
const assert = require('node:assert/strict');

const { listOfficialPayloadCases } = require('../db/caseRepository');

test('listOfficialPayloadCases devolve linhas no formato oficial preservado', async () => {
  const fakeClient = {
    async query() {
      return {
        rows: [{
          official_case_number: '11',
          legacy_csv_id: '11',
          person_name: 'Nome Fallback',
          official_payload: {
            ID_Caso: '11',
            Nome_Completo: 'Nome Oficial',
            Risco_Calculado: 'Elevado'
          }
        }]
      };
    }
  };

  const rows = await listOfficialPayloadCases(fakeClient, ['ID_Caso', 'Nome_Completo', 'Risco_Calculado']);

  assert.deepEqual(rows, [{
    ID_Caso: '11',
    Nome_Completo: 'Nome Oficial',
    Risco_Calculado: 'Elevado'
  }]);
});
