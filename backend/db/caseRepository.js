const { buildOfficialCsvRowFromDbRecord, mapOfficialCsvRowToCaseRecord } = require('./caseMapper');

function mapDbCaseRow(row) {
  return {
    id: row.id,
    official_case_number: row.official_case_number,
    legacy_csv_id: row.legacy_csv_id,
    status: row.status,
    priority: row.priority,
    risk_level: row.risk_level,
    person_name: row.person_name,
    person_age: row.person_age,
    person_sex: row.person_sex,
    disappearance_type: row.disappearance_type,
    last_seen_at: row.last_seen_at,
    last_seen_location: row.last_seen_location,
    freguesia: row.freguesia,
    concelho: row.concelho,
    latitude: row.latitude !== null && row.latitude !== undefined ? Number(row.latitude) : null,
    longitude: row.longitude !== null && row.longitude !== undefined ? Number(row.longitude) : null,
    found_at: row.found_at,
    found_location: row.found_location,
    found_latitude: row.found_latitude !== null && row.found_latitude !== undefined ? Number(row.found_latitude) : null,
    found_longitude: row.found_longitude !== null && row.found_longitude !== undefined ? Number(row.found_longitude) : null,
    official_payload: row.official_payload || {},
    created_at: row.created_at,
    updated_at: row.updated_at,
    synced_at: row.synced_at
  };
}

function normalizeCaseStatus(value) {
  const allowed = new Set(['new', 'triage', 'mobilization', 'active_search', 'suspended', 'found_alive', 'found_deceased', 'closed']);
  const normalized = String(value || 'new').toLowerCase().trim();
  return allowed.has(normalized) ? normalized : null;
}

function normalizeCasePriority(value) {
  const normalized = String(value || 'routine').toLowerCase().trim();
  if (normalized === 'muito urgente' || normalized === 'very_urgent') return 'very_urgent';
  if (normalized === 'urgente' || normalized === 'urgent') return 'urgent';
  return 'routine';
}

function normalizeCaseRiskLevel(value) {
  const normalized = String(value || 'normal').toLowerCase().trim();
  if (normalized === 'elevado' || normalized === 'high') return 'high';
  if (normalized === 'moderado' || normalized === 'moderate') return 'moderate';
  return 'normal';
}

async function upsertOfficialCase(client, csvRow) {
  const record = mapOfficialCsvRowToCaseRecord(csvRow);

  const result = await client.query(`
    INSERT INTO cases (
      official_case_number,
      legacy_csv_id,
      status,
      priority,
      risk_level,
      person_name,
      person_age,
      person_sex,
      disappearance_type,
      last_seen_at,
      last_seen_location,
      freguesia,
      concelho,
      last_seen_point,
      found_at,
      found_location,
      found_point,
      official_payload,
      synced_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9,
      $10::timestamptz, $11, $12, $13,
      ST_GeomFromText($14, 4326),
      $15::timestamptz, $16,
      ST_GeomFromText($17, 4326),
      $18::jsonb,
      now()
    )
    ON CONFLICT (official_case_number) DO UPDATE SET
      legacy_csv_id = EXCLUDED.legacy_csv_id,
      status = EXCLUDED.status,
      priority = EXCLUDED.priority,
      risk_level = EXCLUDED.risk_level,
      person_name = EXCLUDED.person_name,
      person_age = EXCLUDED.person_age,
      person_sex = EXCLUDED.person_sex,
      disappearance_type = EXCLUDED.disappearance_type,
      last_seen_at = EXCLUDED.last_seen_at,
      last_seen_location = EXCLUDED.last_seen_location,
      freguesia = EXCLUDED.freguesia,
      concelho = EXCLUDED.concelho,
      last_seen_point = EXCLUDED.last_seen_point,
      found_at = EXCLUDED.found_at,
      found_location = EXCLUDED.found_location,
      found_point = EXCLUDED.found_point,
      official_payload = EXCLUDED.official_payload,
      updated_at = now(),
      synced_at = now()
    RETURNING *
  `, [
    record.officialCaseNumber,
    record.legacyCsvId,
    record.status,
    record.priority,
    record.riskLevel,
    record.personName,
    record.personAge,
    record.personSex,
    record.disappearanceType,
    record.lastSeenAt,
    record.lastSeenLocation,
    record.freguesia,
    record.concelho,
    record.lastSeenPointWkt,
    record.foundAt,
    record.foundLocation,
    record.foundPointWkt,
    JSON.stringify(record.officialPayload)
  ]);

  return result.rows[0];
}

async function listOfficialCasesForExport(client) {
  const result = await client.query(`
    SELECT *
    FROM cases
    ORDER BY COALESCE(NULLIF(regexp_replace(legacy_csv_id, '[^0-9]', '', 'g'), '')::integer, 0), created_at, id
  `);
  return result.rows;
}

async function listOfficialPayloadCases(client, headers, { limit = 500, offset = 0 } = {}) {
  const records = await listOfficialCasesForExport(client);
  const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 2000);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  return records
    .slice(safeOffset, safeOffset + safeLimit)
    .map(record => buildOfficialCsvRowFromDbRecord(record, headers));
}

async function listCases(client, { limit = 500, offset = 0 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 2000);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const result = await client.query(`
    SELECT
      id,
      official_case_number,
      legacy_csv_id,
      status,
      priority,
      risk_level,
      person_name,
      person_age,
      person_sex,
      disappearance_type,
      last_seen_at,
      last_seen_location,
      freguesia,
      concelho,
      ST_Y(last_seen_point) AS latitude,
      ST_X(last_seen_point) AS longitude,
      found_at,
      found_location,
      ST_Y(found_point) AS found_latitude,
      ST_X(found_point) AS found_longitude,
      official_payload,
      created_at,
      updated_at,
      synced_at
    FROM cases
    ORDER BY COALESCE(NULLIF(regexp_replace(legacy_csv_id, '[^0-9]', '', 'g'), '')::integer, 0), created_at, id
    LIMIT $1 OFFSET $2
  `, [safeLimit, safeOffset]);

  return result.rows.map(mapDbCaseRow);
}

async function findCaseByAnyId(client, id) {
  const result = await client.query(`
    SELECT
      id,
      official_case_number,
      legacy_csv_id,
      status,
      priority,
      risk_level,
      person_name,
      person_age,
      person_sex,
      disappearance_type,
      last_seen_at,
      last_seen_location,
      freguesia,
      concelho,
      ST_Y(last_seen_point) AS latitude,
      ST_X(last_seen_point) AS longitude,
      found_at,
      found_location,
      ST_Y(found_point) AS found_latitude,
      ST_X(found_point) AS found_longitude,
      official_payload,
      created_at,
      updated_at,
      synced_at
    FROM cases
    WHERE id::text = $1 OR official_case_number = $1 OR legacy_csv_id = $1
    LIMIT 1
  `, [String(id)]);

  return result.rows[0] ? mapDbCaseRow(result.rows[0]) : null;
}

async function updateCaseStatus(client, caseId, { status, justification }) {
  const normalizedStatus = normalizeCaseStatus(status);
  if (!normalizedStatus) throw new Error('status operacional inválido');
  if (!justification || String(justification).trim() === '') throw new Error('justification é obrigatória para alterar estado');

  const result = await client.query(`
    UPDATE cases
    SET status = $2, updated_at = now()
    WHERE id::text = $1 OR official_case_number = $1 OR legacy_csv_id = $1
    RETURNING
      id,
      official_case_number,
      legacy_csv_id,
      status,
      priority,
      risk_level,
      person_name,
      person_age,
      person_sex,
      disappearance_type,
      last_seen_at,
      last_seen_location,
      freguesia,
      concelho,
      ST_Y(last_seen_point) AS latitude,
      ST_X(last_seen_point) AS longitude,
      found_at,
      found_location,
      ST_Y(found_point) AS found_latitude,
      ST_X(found_point) AS found_longitude,
      official_payload,
      created_at,
      updated_at,
      synced_at
  `, [String(caseId), normalizedStatus]);

  return result.rows[0] ? mapDbCaseRow(result.rows[0]) : null;
}

async function createQuickCase(client, {
  personName,
  approximateAge = null,
  personSex = null,
  reporterName = null,
  reporterContact = null,
  lastSeenLocation = null,
  lastSeenAt = null,
  latitude = null,
  longitude = null,
  riskLevel = 'normal',
  priority = 'urgent',
  notes = null,
  createdBy = null
}) {
  if (!personName || String(personName).trim() === '') throw new Error('personName é obrigatório para registo rápido');

  const result = await client.query(`
    INSERT INTO cases (
      status,
      priority,
      risk_level,
      person_name,
      person_age,
      person_sex,
      last_seen_at,
      last_seen_location,
      last_seen_point,
      official_payload,
      created_by,
      synced_at
    ) VALUES (
      'triage',
      $1,
      $2,
      $3,
      $4,
      $5,
      $6::timestamptz,
      $7,
      CASE WHEN $8::double precision IS NULL OR $9::double precision IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($9, $8), 4326) END,
      $10::jsonb,
      $11,
      now()
    )
    RETURNING
      id,
      official_case_number,
      legacy_csv_id,
      status,
      priority,
      risk_level,
      person_name,
      person_age,
      person_sex,
      disappearance_type,
      last_seen_at,
      last_seen_location,
      freguesia,
      concelho,
      ST_Y(last_seen_point) AS latitude,
      ST_X(last_seen_point) AS longitude,
      found_at,
      found_location,
      ST_Y(found_point) AS found_latitude,
      ST_X(found_point) AS found_longitude,
      official_payload,
      created_at,
      updated_at,
      synced_at
  `, [
    normalizeCasePriority(priority),
    normalizeCaseRiskLevel(riskLevel),
    String(personName).trim(),
    approximateAge !== null && approximateAge !== undefined && approximateAge !== '' ? Number(approximateAge) : null,
    personSex || null,
    lastSeenAt || null,
    lastSeenLocation || null,
    latitude !== null && latitude !== undefined && latitude !== '' ? Number(latitude) : null,
    longitude !== null && longitude !== undefined && longitude !== '' ? Number(longitude) : null,
    JSON.stringify({
      Tipo_Registo: 'quick_sar',
      Nome_Completo: String(personName).trim(),
      Idade_Exacta: approximateAge || '',
      Sexo: personSex || '',
      Denunciante_Nome: reporterName || '',
      Denunciante_Contacto: reporterContact || '',
      Local_Ultimo_Avistamento: lastSeenLocation || '',
      DataHora_Ultimo_Avistamento: lastSeenAt || '',
      Latitude: latitude || '',
      Longitude: longitude || '',
      Observacoes_Adicionais: notes || ''
    }),
    createdBy
  ]);

  return mapDbCaseRow(result.rows[0]);
}

async function getCaseStatistics(client) {
  const result = await client.query(`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE created_at >= now() - interval '30 days')::int AS last_30_days,
      count(*) FILTER (WHERE risk_level = 'normal')::int AS risk_normal,
      count(*) FILTER (WHERE risk_level = 'moderate')::int AS risk_moderate,
      count(*) FILTER (WHERE risk_level = 'high')::int AS risk_high,
      count(*) FILTER (WHERE priority = 'routine')::int AS priority_routine,
      count(*) FILTER (WHERE priority = 'urgent')::int AS priority_urgent,
      count(*) FILTER (WHERE priority = 'very_urgent')::int AS priority_very_urgent,
      count(*) FILTER (WHERE status IN ('found_alive', 'found_deceased'))::int AS found_total,
      count(last_seen_point)::int AS with_last_seen_point,
      count(found_point)::int AS with_found_point
    FROM cases
  `);

  const byStatus = await client.query(`
    SELECT status, count(*)::int AS count
    FROM cases
    GROUP BY status
    ORDER BY status
  `);

  const row = result.rows[0] || {};
  return {
    total: row.total || 0,
    ultimos_30_dias: row.last_30_days || 0,
    por_risco: {
      Normal: row.risk_normal || 0,
      Moderado: row.risk_moderate || 0,
      Elevado: row.risk_high || 0
    },
    por_prioridade: {
      Rotina: row.priority_routine || 0,
      Urgente: row.priority_urgent || 0,
      'Muito Urgente': row.priority_very_urgent || 0
    },
    por_estado: byStatus.rows.reduce((acc, statusRow) => {
      acc[statusRow.status] = statusRow.count;
      return acc;
    }, {}),
    encontrados: row.found_total || 0,
    com_coordenadas_ultimo_avistamento: row.with_last_seen_point || 0,
    com_coordenadas_encontrado: row.with_found_point || 0
  };
}

module.exports = {
  createQuickCase,
  findCaseByAnyId,
  getCaseStatistics,
  listCases,
  listOfficialPayloadCases,
  normalizeCasePriority,
  normalizeCaseRiskLevel,
  normalizeCaseStatus,
  upsertOfficialCase,
  updateCaseStatus,
  listOfficialCasesForExport,
  mapDbCaseRow
};
