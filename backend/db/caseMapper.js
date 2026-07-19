function cleanString(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function nullIfEmpty(value) {
  const cleaned = cleanString(value);
  return cleaned === '' ? null : cleaned;
}

function parseInteger(value) {
  const cleaned = cleanString(value);
  if (!cleaned) return null;
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseCoordinate(value, min, max) {
  const cleaned = cleanString(value).replace(',', '.');
  if (!cleaned) return null;
  const parsed = Number.parseFloat(cleaned);
  if (Number.isNaN(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function buildPointWkt(latitude, longitude) {
  if (latitude === null || longitude === null) return null;
  return `POINT(${longitude} ${latitude})`;
}

function combineDateTime(dateValue, timeValue) {
  const date = cleanString(dateValue);
  if (!date) return null;
  const time = cleanString(timeValue) || '00:00:00';
  return `${date}T${time.length === 5 ? `${time}:00` : time}`;
}

function normalizeRiskLevel(value) {
  const risk = cleanString(value).toLowerCase();
  if (risk === 'elevado' || risk === 'high') return 'high';
  if (risk === 'moderado' || risk === 'moderate') return 'moderate';
  return 'normal';
}

function normalizePriority(value) {
  const priority = cleanString(value).toLowerCase();
  if (priority === 'muito urgente' || priority === 'very_urgent') return 'very_urgent';
  if (priority === 'urgente' || priority === 'urgent') return 'urgent';
  return 'routine';
}

function inferStatus(row) {
  const estadoEncontrado = cleanString(row.Estado_Pessoa_Encontrado || row.Estado_Pessoa).toLowerCase();
  const hasFoundData = Boolean(
    cleanString(row.Data_Encontrado) ||
    cleanString(row.Latitude_Encontrado) ||
    cleanString(row.Longitude_Encontrado)
  );

  if (!hasFoundData) return 'new';
  if (estadoEncontrado.includes('sem vida')) return 'found_deceased';
  return 'found_alive';
}

function mapOfficialCsvRowToCaseRecord(row) {
  const latitude = parseCoordinate(row.Latitude, -90, 90);
  const longitude = parseCoordinate(row.Longitude, -180, 180);
  const foundLatitude = parseCoordinate(row.Latitude_Encontrado, -90, 90);
  const foundLongitude = parseCoordinate(row.Longitude_Encontrado, -180, 180);
  const id = nullIfEmpty(row.ID_Caso);

  return {
    officialCaseNumber: id,
    legacyCsvId: id,
    status: inferStatus(row),
    priority: normalizePriority(row.Avaliacao_Prioridade),
    riskLevel: normalizeRiskLevel(row.Risco_Calculado),
    personName: nullIfEmpty(row.Nome_Completo || row.Nome) || 'N/D',
    personAge: parseInteger(row.Idade_Exacta || row.Idade),
    personSex: nullIfEmpty(row.Sexo),
    disappearanceType: nullIfEmpty(row.Tipo_Desaparecimento || row.Tipo_Desaparecimento_Oficial),
    lastSeenAt: combineDateTime(row.Data_Desaparecimento, row.Hora_Desaparecimento),
    lastSeenLocation: nullIfEmpty(row.Local_Ultimo_Avistamento),
    freguesia: nullIfEmpty(row.Freguesia),
    concelho: nullIfEmpty(row.Concelho),
    lastSeenPointWkt: buildPointWkt(latitude, longitude),
    foundAt: combineDateTime(row.Data_Encontrado, row.Hora_Encontrado),
    foundLocation: nullIfEmpty(row.Local_Encontrado),
    foundPointWkt: buildPointWkt(foundLatitude, foundLongitude),
    officialPayload: { ...row }
  };
}

function buildOfficialCsvRowFromDbRecord(record, headers) {
  const payload = record.official_payload || record.officialPayload || {};
  const row = {};

  headers.forEach((header) => {
    row[header] = payload[header] !== undefined && payload[header] !== null ? payload[header] : '';
  });

  if (headers.includes('ID_Caso') && !row.ID_Caso) row.ID_Caso = record.legacy_csv_id || record.official_case_number || '';
  if (headers.includes('Nome_Completo') && !row.Nome_Completo) row.Nome_Completo = record.person_name || '';
  if (headers.includes('Idade_Exacta') && !row.Idade_Exacta) row.Idade_Exacta = record.person_age || '';
  if (headers.includes('Sexo') && !row.Sexo) row.Sexo = record.person_sex || '';
  if (headers.includes('Tipo_Desaparecimento') && !row.Tipo_Desaparecimento) row.Tipo_Desaparecimento = record.disappearance_type || '';
  if (headers.includes('Local_Ultimo_Avistamento') && !row.Local_Ultimo_Avistamento) row.Local_Ultimo_Avistamento = record.last_seen_location || '';
  if (headers.includes('Freguesia') && !row.Freguesia) row.Freguesia = record.freguesia || '';
  if (headers.includes('Concelho') && !row.Concelho) row.Concelho = record.concelho || '';

  return row;
}

module.exports = {
  cleanString,
  nullIfEmpty,
  parseInteger,
  parseCoordinate,
  buildPointWkt,
  combineDateTime,
  normalizeRiskLevel,
  normalizePriority,
  inferStatus,
  mapOfficialCsvRowToCaseRecord,
  buildOfficialCsvRowFromDbRecord
};
