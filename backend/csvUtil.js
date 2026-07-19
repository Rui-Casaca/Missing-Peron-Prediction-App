const fs = require('fs');
const parse = require('csv-parse/sync');

/**
 * Parse CSV robusto: tenta parse normal, depois tenta detectar delimitador,
 * e por fim faz um split simples e padding para evitar erros de "Invalid Record Length".
 */
function parseCsvSafe(raw, options = {}) {
  if (!raw || raw.toString().trim().length === 0) return [];
  const baseOpts = {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    ...options
  };

  try {
    return parse.parse(raw, baseOpts);
  } catch (err) {
    // tentar detectar delimitador
    const sample = raw.split(/\r?\n/).slice(0, 5).join('\n');
    const commaCount = (sample.match(/,/g) || []).length;
    const semicolonCount = (sample.match(/;/g) || []).length;
    const delimiter = semicolonCount > commaCount ? ';' : ',';
    try {
      return parse.parse(raw, { ...baseOpts, delimiter });
    } catch (err2) {
      // último recurso: fazer um parse tolerante por linhas, com padding/trimming
      const lines = raw.split(/\r?\n/).filter(l => l.trim() !== '');
      if (lines.length === 0) return [];
      const hdr = lines[0];
      const headers = hdr.split(delimiter).map(h => h.trim());
      const headerLen = headers.length;
      const rows = lines.slice(1).map(line => {
        // tentar split simples (não perfeito para campos com separadores dentro de aspas)
        const parts = line.split(delimiter).map(p => p.trim());
        // ajustar comprimento
        if (parts.length < headerLen) {
          while (parts.length < headerLen) parts.push('');
        } else if (parts.length > headerLen) {
          parts.length = headerLen;
        }
        const obj = {};
        headers.forEach((h, i) => { obj[h] = parts[i] || ''; });
        return obj;
      });
      return rows;
    }
  }
}

function parseCsvFile(filePath, options = {}) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8');
  return parseCsvSafe(raw, options);
}

module.exports = { parseCsvSafe, parseCsvFile };
