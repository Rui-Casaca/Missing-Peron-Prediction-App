const test = require('node:test');
const assert = require('node:assert/strict');

const { createTeam, normalizeTeamStatus, normalizeTeamType } = require('../db/teamRepository');

test('normaliza estado e tipo de equipa', () => {
  assert.equal(normalizeTeamStatus('active'), 'active');
  assert.equal(normalizeTeamStatus('x'), 'available');
  assert.equal(normalizeTeamType('Drone'), 'drone');
  assert.equal(normalizeTeamType(''), 'ground');
});

test('createTeam exige nome', async () => {
  await assert.rejects(() => createTeam({}, { name: '' }), /name é obrigatório/);
});

test('createTeam insere equipa operacional', async () => {
  const fakeClient = {
    async query(sql, params) {
      assert.equal(params[0], 'Equipa Alfa');
      assert.equal(params[1], 'ground');
      return { rows: [{ id: 'team-1', name: params[0], team_type: params[1], status: params[4], metadata: {} }] };
    }
  };

  const team = await createTeam(fakeClient, { name: 'Equipa Alfa' });
  assert.equal(team.id, 'team-1');
  assert.equal(team.name, 'Equipa Alfa');
});
