const test = require('node:test');
const assert = require('node:assert/strict');

const { parseArgs } = require('../scripts/backfillCaseCreatedEvents');

test('parseArgs interpreta dry-run e limit', () => {
  const args = parseArgs(['--dry-run', '--limit', '25']);
  assert.deepEqual(args, { dryRun: true, limit: 25 });
});

test('parseArgs usa defaults conservadores', () => {
  const args = parseArgs([]);
  assert.deepEqual(args, { dryRun: false, limit: 1000 });
});
