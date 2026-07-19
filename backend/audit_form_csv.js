const fs = require('fs');
const path = require('path');

// Script simples para auditar campos do formulário React vs headers CSV oficial
// Gera backend/audit_form_csv_report.json

const frontendFormPath = path.join(__dirname, '..', 'frontend', 'src', 'CaseRegistrationOfficial.js');
const registoPath = path.join(__dirname, 'registoCasosOficial.js');
const outPath = path.join(__dirname, 'audit_form_csv_report.json');

function extractFormFieldsFromFrontend(src) {
  const fields = new Set();
  // Procurar handleInputChange('Campo') e formData.Campo e formData['Campo']
  const reHandle = /handleInputChange\(\s*['"`]([A-Za-z0-9_\- ]+)['"`]/g;
  let m;
  while ((m = reHandle.exec(src)) !== null) fields.add(m[1]);

  const reFormDot = /formData\.([A-Za-z0-9_]+)/g;
  while ((m = reFormDot.exec(src)) !== null) fields.add(m[1]);

  const reFormBracket = /formData\[\s*['"`]([A-Za-z0-9_\- ]+)['"`]\s*\]/g;
  while ((m = reFormBracket.exec(src)) !== null) fields.add(m[1]);

  return Array.from(fields).sort();
}

function loadCsvHeadersFromRegisto() {
  // Importar o módulo e extrair csvHeadersOficial
  const mod = require('./registoCasosOficial');
  const headers = (mod && mod.csvHeadersOficial) ? mod.csvHeadersOficial.map(h => h.id) : [];
  return headers.sort();
}

function runAudit() {
  if (!fs.existsSync(frontendFormPath)) {
    console.error('Frontend form file não encontrado:', frontendFormPath);
    process.exit(2);
  }
  const src = fs.readFileSync(frontendFormPath, 'utf8');
  const formFields = extractFormFieldsFromFrontend(src);

  const csvHeaders = loadCsvHeadersFromRegisto();

  const missingInCSV = formFields.filter(f => !csvHeaders.includes(f));
  const missingInForm = csvHeaders.filter(h => !formFields.includes(h));

  const report = {
    generatedAt: new Date().toISOString(),
    frontendFormPath,
    registoPath,
    counts: {
      formFields: formFields.length,
      csvHeaders: csvHeaders.length
    },
    formFields,
    csvHeaders,
    missingInCSV,
    missingInForm
  };

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log('Audit complete. Report written to', outPath);
}

runAudit();
