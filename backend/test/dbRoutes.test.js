const test = require('node:test');
const assert = require('node:assert/strict');

const { compareCsvAndDb } = require('../dbRoutes');
const { recordClueAddedEvent } = require('../dbRoutes');
const { recordTaskEvent } = require('../dbRoutes');
const { recordSearchAreaEvent } = require('../dbRoutes');
const { recordCaseStatusEvent, recordQuickCaseEvent } = require('../dbRoutes');

test('compareCsvAndDb identifica contagens e IDs coincidentes', () => {
  const result = compareCsvAndDb([
    { ID_Caso: '1', Nome_Completo: 'Ana', Risco_Calculado: 'Normal' }
  ], [
    { legacy_csv_id: '1', person_name: 'Ana', risk_level: 'normal' }
  ]);

  assert.equal(result.csv_total, 1);
  assert.equal(result.db_total, 1);
  assert.equal(result.matches_total_count, true);
  assert.equal(result.matches_ids, true);
  assert.deepEqual(result.divergent_ids, []);
});

test('compareCsvAndDb identifica faltas e divergências simples', () => {
  const result = compareCsvAndDb([
    { ID_Caso: '1', Nome_Completo: 'Ana', Risco_Calculado: 'Elevado' },
    { ID_Caso: '2', Nome_Completo: 'Bruno', Risco_Calculado: 'Normal' }
  ], [
    { legacy_csv_id: '1', person_name: 'Ana Maria', risk_level: 'normal' },
    { legacy_csv_id: '3', person_name: 'Carlos', risk_level: 'normal' }
  ]);

  assert.deepEqual(result.missing_in_db, ['2']);
  assert.deepEqual(result.missing_in_csv, ['3']);
  assert.deepEqual(result.divergent_ids, ['1']);
  assert.equal(result.matches_ids, false);
});

test('recordClueAddedEvent cria evento clue_added com payload operacional', async () => {
  const fakeClient = {
    async query(sql, params) {
      return { rows: [{ id: 'event-1', case_id: params[0], event_type: params[1], payload: params[3] }] };
    }
  };

  const event = await recordClueAddedEvent(fakeClient, 'case-1', {
    id: 'clue-1',
    clue_type: 'sighting',
    description: 'Avistamento',
    reliability: 'medium',
    observed_at: null,
    reported_by: 'Testemunha'
  }, 'POINT(-8 40)');

  assert.equal(event.event_type, 'clue_added');
});

test('recordTaskEvent cria evento de tarefa com payload operacional', async () => {
  const fakeClient = {
    async query(sql, params) {
      return { rows: [{ id: 'event-1', case_id: params[0], event_type: params[1], payload: params[3] }] };
    }
  };

  const event = await recordTaskEvent(fakeClient, 'case-1', {
    id: 'task-1',
    source_clue_id: 'clue-1',
    title: 'Procurar setor A',
    description: 'Varredura inicial',
    status: 'pending',
    priority: 'urgent',
    due_at: null,
    result: null
  }, 'task_created', 'Tarefa criada: Procurar setor A', null);

  assert.equal(event.event_type, 'task_created');
  assert.match(event.payload, /"source_clue_id":"clue-1"/);
});

test('recordSearchAreaEvent cria evento de área de busca', async () => {
  const fakeClient = {
    async query(sql, params) {
      return { rows: [{ id: 'event-1', case_id: params[0], event_type: params[1], payload: params[3] }] };
    }
  };

  const event = await recordSearchAreaEvent(fakeClient, 'case-1', {
    id: 'area-1',
    name: 'Setor A',
    status: 'planned',
    priority: 'urgent',
    team_id: null,
    team_name: null,
    area_m2: 1000,
    centroid_latitude: 40,
    centroid_longitude: -8
  }, 'search_area_created', 'Área criada');

  assert.equal(event.event_type, 'search_area_created');
  assert.match(event.payload, /"search_area_id":"area-1"/);
});

test('recordCaseStatusEvent cria evento de mudança de estado', async () => {
  const fakeClient = {
    async query(sql, params) {
      return { rows: [{ id: 'event-1', case_id: params[0], event_type: params[1], payload: params[3] }] };
    }
  };
  const event = await recordCaseStatusEvent(fakeClient, 'case-1', 'triage', 'active_search', 'Operação iniciada');
  assert.equal(event.event_type, 'case_status_changed');
  assert.match(event.payload, /active_search/);
});

test('recordQuickCaseEvent cria evento de registo rápido', async () => {
  const fakeClient = {
    async query(sql, params) {
      return { rows: [{ id: 'event-1', case_id: params[0], event_type: params[1], payload: params[3] }] };
    }
  };
  const event = await recordQuickCaseEvent(fakeClient, { id: 'case-1', person_name: 'Ana', status: 'triage', priority: 'urgent', risk_level: 'normal', latitude: null, longitude: null });
  assert.equal(event.event_type, 'quick_case_created');
});
