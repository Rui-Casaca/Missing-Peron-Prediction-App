function mapDbTeamRow(row) {
  return {
    id: row.id,
    name: row.name,
    team_type: row.team_type,
    contact: row.contact,
    unit_id: row.unit_id,
    status: row.status,
    metadata: row.metadata || {},
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function normalizeTeamStatus(value) {
  const allowed = new Set(['available', 'assigned', 'active', 'resting', 'unavailable']);
  const normalized = String(value || 'available').toLowerCase().trim();
  return allowed.has(normalized) ? normalized : 'available';
}

function normalizeTeamType(value) {
  const normalized = String(value || 'ground').toLowerCase().trim();
  return normalized || 'ground';
}

async function createTeam(client, {
  name,
  teamType = 'ground',
  contact = null,
  unitId = null,
  status = 'available',
  metadata = {}
}) {
  if (!name || String(name).trim() === '') throw new Error('name é obrigatório para criar equipa');

  const result = await client.query(`
    INSERT INTO search_teams (
      name,
      team_type,
      contact,
      unit_id,
      status,
      metadata
    ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    RETURNING id, name, team_type, contact, unit_id, status, metadata, created_at, updated_at
  `, [
    String(name).trim(),
    normalizeTeamType(teamType),
    contact || null,
    unitId || null,
    normalizeTeamStatus(status),
    JSON.stringify(metadata || {})
  ]);

  return mapDbTeamRow(result.rows[0]);
}

async function listTeams(client, { status = null } = {}) {
  const params = [];
  const where = [];
  if (status) {
    params.push(normalizeTeamStatus(status));
    where.push(`status = $${params.length}`);
  }

  const result = await client.query(`
    SELECT id, name, team_type, contact, unit_id, status, metadata, created_at, updated_at
    FROM search_teams
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY
      CASE status WHEN 'active' THEN 1 WHEN 'assigned' THEN 2 WHEN 'available' THEN 3 WHEN 'resting' THEN 4 ELSE 5 END,
      name ASC
  `, params);

  return result.rows.map(mapDbTeamRow);
}

async function findTeamById(client, teamId) {
  const result = await client.query(`
    SELECT id, name, team_type, contact, unit_id, status, metadata, created_at, updated_at
    FROM search_teams
    WHERE id::text = $1
    LIMIT 1
  `, [String(teamId)]);

  return result.rows[0] ? mapDbTeamRow(result.rows[0]) : null;
}

async function updateTeamStatus(client, teamId, status) {
  const result = await client.query(`
    UPDATE search_teams
    SET status = $2, updated_at = now()
    WHERE id::text = $1
    RETURNING id, name, team_type, contact, unit_id, status, metadata, created_at, updated_at
  `, [String(teamId), normalizeTeamStatus(status)]);

  return result.rows[0] ? mapDbTeamRow(result.rows[0]) : null;
}

module.exports = {
  createTeam,
  findTeamById,
  listTeams,
  mapDbTeamRow,
  normalizeTeamStatus,
  normalizeTeamType,
  updateTeamStatus
};
