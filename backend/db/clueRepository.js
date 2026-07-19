function mapDbClueRow(row) {
  return {
    id: row.id,
    case_id: row.case_id,
    clue_type: row.clue_type,
    description: row.description,
    reliability: row.reliability,
    latitude: row.latitude !== null && row.latitude !== undefined ? Number(row.latitude) : null,
    longitude: row.longitude !== null && row.longitude !== undefined ? Number(row.longitude) : null,
    observed_at: row.observed_at,
    reported_by: row.reported_by,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function normalizeReliability(value) {
  const allowed = new Set(['unknown', 'low', 'medium', 'high', 'confirmed']);
  const normalized = String(value || 'unknown').toLowerCase().trim();
  return allowed.has(normalized) ? normalized : 'unknown';
}

async function createClue(client, {
  caseId,
  clueType = 'observation',
  description,
  reliability = 'unknown',
  cluePointWkt = null,
  observedAt = null,
  reportedBy = null,
  createdBy = null
}) {
  if (!caseId) throw new Error('caseId é obrigatório para registar pista');
  if (!description || String(description).trim() === '') throw new Error('description é obrigatório para registar pista');

  const result = await client.query(`
    INSERT INTO clues (
      case_id,
      clue_type,
      description,
      reliability,
      clue_point,
      observed_at,
      reported_by,
      created_by
    ) VALUES (
      $1,
      $2,
      $3,
      $4,
      ST_GeomFromText($5, 4326),
      $6::timestamptz,
      $7,
      $8
    )
    RETURNING
      id,
      case_id,
      clue_type,
      description,
      reliability,
      ST_Y(clue_point) AS latitude,
      ST_X(clue_point) AS longitude,
      observed_at,
      reported_by,
      created_by,
      created_at,
      updated_at
  `, [
    caseId,
    String(clueType || 'observation').trim() || 'observation',
    String(description).trim(),
    normalizeReliability(reliability),
    cluePointWkt,
    observedAt,
    reportedBy || null,
    createdBy
  ]);

  return mapDbClueRow(result.rows[0]);
}

async function listCluesByCase(client, caseId) {
  const result = await client.query(`
    SELECT
      id,
      case_id,
      clue_type,
      description,
      reliability,
      ST_Y(clue_point) AS latitude,
      ST_X(clue_point) AS longitude,
      observed_at,
      reported_by,
      created_by,
      created_at,
      updated_at
    FROM clues
    WHERE case_id = $1
    ORDER BY COALESCE(observed_at, created_at) DESC, created_at DESC, id DESC
  `, [caseId]);

  return result.rows.map(mapDbClueRow);
}

module.exports = {
  createClue,
  listCluesByCase,
  mapDbClueRow,
  normalizeReliability
};
