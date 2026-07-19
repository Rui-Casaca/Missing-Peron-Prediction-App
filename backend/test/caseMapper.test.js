const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildOfficialCsvRowFromDbRecord,
  buildPointWkt,
  combineDateTime,
  mapOfficialCsvRowToCaseRecord,
  normalizePriority,
  normalizeRiskLevel,
  parseCoordinate
} = require('../db/caseMapper');

test('normaliza risco e prioridade oficiais para enums operacionais', () => {
  assert.equal(normalizeRiskLevel('Elevado'), 'high');
  assert.equal(normalizeRiskLevel('Moderado'), 'moderate');
  assert.equal(normalizeRiskLevel('Normal'), 'normal');
  assert.equal(normalizePriority('Muito Urgente'), 'very_urgent');
  assert.equal(normalizePriority('Urgente'), 'urgent');
  assert.equal(normalizePriority('Rotina'), 'routine');
});

test('valida coordenadas e cria WKT em ordem longitude latitude', () => {
  assert.equal(parseCoordinate('40,123', -90, 90), 40.123);
  assert.equal(parseCoordinate('200', -90, 90), null);
  assert.equal(buildPointWkt(40.1, -8.2), 'POINT(-8.2 40.1)');
});

test('combina data e hora em valor ISO-like para timestamptz', () => {
  assert.equal(combineDateTime('2025-09-24', '10:30'), '2025-09-24T10:30:00');
  assert.equal(combineDateTime('2025-09-24', ''), '2025-09-24T00:00:00');
  assert.equal(combineDateTime('', '10:30'), null);
});

test('mapeia linha CSV oficial para registo operacional', () => {
  const record = mapOfficialCsvRowToCaseRecord({
    ID_Caso: '7',
    Nome_Completo: 'Maria Teste',
    Idade_Exacta: '82',
    Sexo: 'F',
    Data_Desaparecimento: '2025-09-24',
    Hora_Desaparecimento: '10:30',
    Local_Ultimo_Avistamento: 'Rua Central',
    Freguesia: 'Centro',
    Concelho: 'Coimbra',
    Latitude: '40.2033',
    Longitude: '-8.4103',
    Risco_Calculado: 'Elevado',
    Avaliacao_Prioridade: 'Muito Urgente',
    Tipo_Desaparecimento: 'Involuntário'
  });

  assert.equal(record.officialCaseNumber, '7');
  assert.equal(record.personName, 'Maria Teste');
  assert.equal(record.personAge, 82);
  assert.equal(record.riskLevel, 'high');
  assert.equal(record.priority, 'very_urgent');
  assert.equal(record.lastSeenPointWkt, 'POINT(-8.4103 40.2033)');
  assert.equal(record.status, 'new');
});

test('mapeia caso encontrado para estado found_alive', () => {
  const record = mapOfficialCsvRowToCaseRecord({
    ID_Caso: '8',
    Nome_Completo: 'Pessoa Encontrada',
    Data_Encontrado: '2025-09-25',
    Hora_Encontrado: '11:00',
    Latitude_Encontrado: '40.2',
    Longitude_Encontrado: '-8.4',
    Estado_Pessoa_Encontrado: 'Em bom estado'
  });

  assert.equal(record.status, 'found_alive');
  assert.equal(record.foundAt, '2025-09-25T11:00:00');
  assert.equal(record.foundPointWkt, 'POINT(-8.4 40.2)');
});

test('reconstrói linha CSV a partir de payload DB preservado', () => {
  const row = buildOfficialCsvRowFromDbRecord({
    official_case_number: '9',
    person_name: 'Fallback Name',
    official_payload: { ID_Caso: '9', Nome_Completo: 'Nome Oficial' }
  }, ['ID_Caso', 'Nome_Completo', 'Concelho']);

  assert.deepEqual(row, {
    ID_Caso: '9',
    Nome_Completo: 'Nome Oficial',
    Concelho: ''
  });
});
