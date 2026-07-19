#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { parseCsvFile } = require('../csvUtil');
const { withClient, closePool } = require('../db');
const { listOfficialCasesForExport } = require('../db/caseRepository');
const { buildOfficialCsvRowFromDbRecord } = require('../db/caseMapper');

const defaultSourceCsvPath = path.join(__dirname, '../../historico_casos_pdgnr_oficial.csv');
const defaultOutputPath = path.join(__dirname, '../../historico_casos_pdgnr_oficial_export.csv');

function parseArgs(argv) {
  const args = { sourceCsvPath: defaultSourceCsvPath, outputPath: defaultOutputPath };
  argv.forEach((arg, index) => {
    if (arg === '--source-csv' && argv[index + 1]) args.sourceCsvPath = path.resolve(argv[index + 1]);
    if (arg === '--out' && argv[index + 1]) args.outputPath = path.resolve(argv[index + 1]);
  });
  return args;
}

function escapeCsvValue(value) {
  if (value === undefined || value === null) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function getHeadersFromCsv(csvPath) {
  const raw = fs.readFileSync(csvPath, 'utf8');
  const firstLine = raw.split(/\r?\n/)[0] || '';
  return firstLine.split(',').map(header => header.trim()).filter(Boolean);
}

async function exportOfficialCsv({ sourceCsvPath = defaultSourceCsvPath, outputPath = defaultOutputPath } = {}) {
  const headers = getHeadersFromCsv(sourceCsvPath);
  const records = await withClient((client) => listOfficialCasesForExport(client));
  const rows = records.map(record => buildOfficialCsvRowFromDbRecord(record, headers));

  const lines = [headers.join(',')];
  rows.forEach((row) => {
    lines.push(headers.map(header => escapeCsvValue(row[header])).join(','));
  });
  fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');

  return {
    outputPath,
    totalRows: rows.length,
    totalHeaders: headers.length
  };
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  exportOfficialCsv(args)
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
    })
    .catch((error) => {
      console.error('Erro ao exportar CSV oficial:', error.message || error);
      process.exitCode = 1;
    })
    .finally(() => closePool());
}

module.exports = {
  exportOfficialCsv,
  escapeCsvValue,
  getHeadersFromCsv,
  parseArgs
};
