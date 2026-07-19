#!/usr/bin/env node
const { closePool, withTransaction } = require('../db');
const { listCasesMissingEvent, recordCaseEvent } = require('../db/caseEventRepository');

function parseArgs(argv) {
  const args = { dryRun: false, limit: 1000 };
  argv.forEach((arg, index) => {
    if (arg === '--dry-run') args.dryRun = true;
    if (arg === '--limit' && argv[index + 1]) args.limit = Number(argv[index + 1]);
  });
  return args;
}

async function backfillCaseCreatedEvents({ dryRun = false, limit = 1000 } = {}) {
  const summary = {
    dryRun,
    limit,
    candidates: 0,
    inserted: 0,
    skipped: 0,
    caseIds: []
  };

  await withTransaction(async (client) => {
    const cases = await listCasesMissingEvent(client, 'case_created', { limit });
    summary.candidates = cases.length;
    summary.caseIds = cases.map(caso => caso.legacy_csv_id || caso.official_case_number || caso.id);

    if (dryRun) {
      summary.skipped = cases.length;
      return;
    }

    for (const caso of cases) {
      await recordCaseEvent(client, {
        caseId: caso.id,
        eventType: 'case_created',
        summary: `Caso importado do CSV: ${caso.person_name || caso.legacy_csv_id || caso.id}`,
        payload: {
          source: 'imported_csv',
          official_case_number: caso.official_case_number || '',
          legacy_csv_id: caso.legacy_csv_id || '',
          person_name: caso.person_name || '',
          risk_level: caso.risk_level || '',
          priority: caso.priority || ''
        },
        eventPointWkt: caso.last_seen_point_wkt || null,
        eventAt: caso.created_at || null
      });
      summary.inserted += 1;
    }
  });

  return summary;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  backfillCaseCreatedEvents(args)
    .then((summary) => console.log(JSON.stringify(summary, null, 2)))
    .catch((error) => {
      console.error('Erro ao criar eventos retroativos:', error.message || error);
      process.exitCode = 1;
    })
    .finally(() => closePool());
}

module.exports = {
  backfillCaseCreatedEvents,
  parseArgs
};
