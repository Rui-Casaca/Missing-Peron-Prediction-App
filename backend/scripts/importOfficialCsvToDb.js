#!/usr/bin/env node
const path = require('path');
const { parseCsvFile } = require('../csvUtil');
const { withClient, closePool } = require('../db');
const { mapOfficialCsvRowToCaseRecord } = require('../db/caseMapper');
const { upsertOfficialCase } = require('../db/caseRepository');

const defaultCsvPath = path.join(__dirname, '../../historico_casos_pdgnr_oficial.csv');

function parseArgs(argv) {
  const args = { dryRun: false, csvPath: defaultCsvPath };
  argv.forEach((arg, index) => {
    if (arg === '--dry-run') args.dryRun = true;
    if (arg === '--csv' && argv[index + 1]) args.csvPath = path.resolve(argv[index + 1]);
  });
  return args;
}

async function importOfficialCsv({ csvPath = defaultCsvPath, dryRun = false } = {}) {
  const rows = parseCsvFile(csvPath, { columns: true, skip_empty_lines: true, trim: true });
  const mapped = rows.map(mapOfficialCsvRowToCaseRecord);

  const summary = {
    csvPath,
    dryRun,
    totalRows: rows.length,
    mappedRows: mapped.length,
    missingCaseIds: mapped.filter(row => !row.legacyCsvId).length,
    missingNames: mapped.filter(row => row.personName === 'N/D').length,
    withLastSeenPoint: mapped.filter(row => row.lastSeenPointWkt).length,
    withFoundPoint: mapped.filter(row => row.foundPointWkt).length,
    importedRows: 0
  };

  if (dryRun) return summary;

  await withClient(async (client) => {
    for (const row of rows) {
      await upsertOfficialCase(client, row);
      summary.importedRows += 1;
    }
  });

  return summary;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  importOfficialCsv(args)
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
    })
    .catch((error) => {
      console.error('Erro ao importar CSV oficial:', error.message || error);
      process.exitCode = 1;
    })
    .finally(() => closePool());
}

module.exports = { importOfficialCsv, parseArgs };
