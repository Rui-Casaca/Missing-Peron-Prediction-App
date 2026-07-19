const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeSyncOperation } = require('../syncRoutes');

test('normalizeSyncOperation aceita nomes camelCase e snake_case', () => {
  const operation = normalizeSyncOperation({
    clientOperationId: '11111111-1111-4111-8111-111111111111',
    sourceDeviceId: 'tablet-1',
    entityType: 'quick_case',
    operationType: 'create',
    payload: { person_name: 'Ana' }
  });

  assert.equal(operation.clientOperationId, '11111111-1111-4111-8111-111111111111');
  assert.equal(operation.sourceDeviceId, 'tablet-1');
  assert.equal(operation.entityType, 'quick_case');
  assert.equal(operation.operationType, 'create');
  assert.equal(operation.payload.person_name, 'Ana');
});

test('normalizeSyncOperation aplica defaults conservadores', () => {
  const operation = normalizeSyncOperation({
    id: '22222222-2222-4222-8222-222222222222',
    entity_type: 'quick_case'
  });

  assert.equal(operation.clientOperationId, '22222222-2222-4222-8222-222222222222');
  assert.equal(operation.sourceDeviceId, 'unknown-device');
  assert.equal(operation.operationType, 'create');
});
