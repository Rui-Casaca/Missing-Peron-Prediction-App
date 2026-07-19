const test = require('node:test');
const assert = require('node:assert/strict');

const { assignTaskToTeam, createTask, normalizeTaskPriority, normalizeTaskStatus, updateTaskStatus } = require('../db/taskRepository');

test('normaliza estados e prioridades de tarefas', () => {
  assert.equal(normalizeTaskStatus('completed'), 'completed');
  assert.equal(normalizeTaskStatus('inválido'), 'pending');
  assert.equal(normalizeTaskPriority('Muito Urgente'), 'very_urgent');
  assert.equal(normalizeTaskPriority('Urgente'), 'urgent');
  assert.equal(normalizeTaskPriority('x'), 'routine');
});

test('createTask exige título', async () => {
  await assert.rejects(
    () => createTask({}, { caseId: 'case-1', title: '' }),
    /title é obrigatório/
  );
});

test('createTask insere tarefa operacional', async () => {
  const fakeClient = {
    async query(sql, params) {
      assert.equal(params[0], 'case-1');
      assert.equal(params[2], 'clue-1');
      assert.equal(params[3], 'Verificar margem do rio');
      assert.equal(params[6], 'urgent');
      return { rows: [{ id: 'task-1', case_id: params[0], source_clue_id: params[2], title: params[3], status: params[5], priority: params[6] }] };
    }
  };

  const task = await createTask(fakeClient, { caseId: 'case-1', sourceClueId: 'clue-1', title: 'Verificar margem do rio', priority: 'urgent' });
  assert.equal(task.id, 'task-1');
  assert.equal(task.source_clue_id, 'clue-1');
  assert.equal(task.priority, 'urgent');
});

test('updateTaskStatus atualiza estado e resultado', async () => {
  const fakeClient = {
    async query(sql, params) {
      assert.equal(params[0], 'task-1');
      assert.equal(params[1], 'completed');
      assert.equal(params[2], 'Sem vestígios');
      return { rows: [{ id: 'task-1', case_id: 'case-1', title: 'Tarefa', status: params[1], result: params[2] }] };
    }
  };

  const task = await updateTaskStatus(fakeClient, 'task-1', { status: 'completed', result: 'Sem vestígios' });
  assert.equal(task.status, 'completed');
  assert.equal(task.result, 'Sem vestígios');
});

test('assignTaskToTeam associa tarefa a equipa e marca pending como assigned', async () => {
  const fakeClient = {
    async query(sql, params) {
      assert.equal(params[0], 'task-1');
      assert.equal(params[1], 'team-1');
      return { rows: [{ id: 'task-1', case_id: 'case-1', team_id: params[1], team_name: 'Equipa Alfa', status: 'assigned', title: 'Tarefa' }] };
    }
  };

  const task = await assignTaskToTeam(fakeClient, 'task-1', 'team-1');
  assert.equal(task.team_id, 'team-1');
  assert.equal(task.team_name, 'Equipa Alfa');
  assert.equal(task.status, 'assigned');
});
