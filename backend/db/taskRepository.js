function mapDbTaskRow(row) {
  return {
    id: row.id,
    case_id: row.case_id,
    team_id: row.team_id,
    team_name: row.team_name,
    team_type: row.team_type,
    source_clue_id: row.source_clue_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    due_at: row.due_at,
    latitude: row.latitude !== null && row.latitude !== undefined ? Number(row.latitude) : null,
    longitude: row.longitude !== null && row.longitude !== undefined ? Number(row.longitude) : null,
    result: row.result,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function normalizeTaskStatus(value) {
  const allowed = new Set(['pending', 'assigned', 'in_progress', 'completed', 'cancelled']);
  const normalized = String(value || 'pending').toLowerCase().trim();
  return allowed.has(normalized) ? normalized : 'pending';
}

function normalizeTaskPriority(value) {
  const normalized = String(value || 'routine').toLowerCase().trim();
  if (normalized === 'muito urgente' || normalized === 'very_urgent') return 'very_urgent';
  if (normalized === 'urgente' || normalized === 'urgent') return 'urgent';
  return 'routine';
}

async function createTask(client, {
  caseId,
  teamId = null,
  sourceClueId = null,
  title,
  description = null,
  status = 'pending',
  priority = 'routine',
  dueAt = null,
  taskPointWkt = null,
  createdBy = null
}) {
  if (!caseId) throw new Error('caseId é obrigatório para criar tarefa');
  if (!title || String(title).trim() === '') throw new Error('title é obrigatório para criar tarefa');

  const result = await client.query(`
    INSERT INTO search_tasks (
      case_id,
      team_id,
      source_clue_id,
      title,
      description,
      status,
      priority,
      due_at,
      task_point,
      created_by
    ) VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8::timestamptz,
      ST_GeomFromText($9, 4326),
      $10
    )
    RETURNING
      id,
      case_id,
      team_id,
      NULL::text AS team_name,
      NULL::text AS team_type,
      source_clue_id,
      title,
      description,
      status,
      priority,
      due_at,
      ST_Y(task_point) AS latitude,
      ST_X(task_point) AS longitude,
      result,
      created_by,
      created_at,
      updated_at
  `, [
    caseId,
    teamId,
    sourceClueId,
    String(title).trim(),
    description || null,
    normalizeTaskStatus(status),
    normalizeTaskPriority(priority),
    dueAt,
    taskPointWkt,
    createdBy
  ]);

  return mapDbTaskRow(result.rows[0]);
}

async function listTasksByCase(client, caseId) {
  const result = await client.query(`
    SELECT
      id,
      case_id,
      team_id,
      (SELECT name FROM search_teams WHERE id = search_tasks.team_id) AS team_name,
      (SELECT team_type FROM search_teams WHERE id = search_tasks.team_id) AS team_type,
      source_clue_id,
      title,
      description,
      status,
      priority,
      due_at,
      ST_Y(task_point) AS latitude,
      ST_X(task_point) AS longitude,
      result,
      created_by,
      created_at,
      updated_at
    FROM search_tasks
    WHERE case_id = $1
    ORDER BY
      CASE priority WHEN 'very_urgent' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END,
      CASE status WHEN 'in_progress' THEN 1 WHEN 'assigned' THEN 2 WHEN 'pending' THEN 3 WHEN 'completed' THEN 4 ELSE 5 END,
      COALESCE(due_at, created_at) ASC,
      created_at DESC
  `, [caseId]);

  return result.rows.map(mapDbTaskRow);
}

async function findTaskById(client, taskId) {
  const result = await client.query(`
    SELECT
      id,
      case_id,
      team_id,
      (SELECT name FROM search_teams WHERE id = search_tasks.team_id) AS team_name,
      (SELECT team_type FROM search_teams WHERE id = search_tasks.team_id) AS team_type,
      source_clue_id,
      title,
      description,
      status,
      priority,
      due_at,
      ST_Y(task_point) AS latitude,
      ST_X(task_point) AS longitude,
      result,
      created_by,
      created_at,
      updated_at
    FROM search_tasks
    WHERE id::text = $1
    LIMIT 1
  `, [String(taskId)]);

  return result.rows[0] ? mapDbTaskRow(result.rows[0]) : null;
}

async function updateTaskStatus(client, taskId, { status, result = null } = {}) {
  const normalizedStatus = normalizeTaskStatus(status);
  const queryResult = await client.query(`
    UPDATE search_tasks
    SET
      status = $2,
      result = COALESCE($3, result),
      updated_at = now()
    WHERE id::text = $1
    RETURNING
      id,
      case_id,
      team_id,
      (SELECT name FROM search_teams WHERE id = search_tasks.team_id) AS team_name,
      (SELECT team_type FROM search_teams WHERE id = search_tasks.team_id) AS team_type,
      source_clue_id,
      title,
      description,
      status,
      priority,
      due_at,
      ST_Y(task_point) AS latitude,
      ST_X(task_point) AS longitude,
      result,
      created_by,
      created_at,
      updated_at
  `, [String(taskId), normalizedStatus, result || null]);

  return queryResult.rows[0] ? mapDbTaskRow(queryResult.rows[0]) : null;
}

async function assignTaskToTeam(client, taskId, teamId) {
  const queryResult = await client.query(`
    UPDATE search_tasks
    SET
      team_id = $2::uuid,
      status = CASE WHEN $2::uuid IS NOT NULL AND status = 'pending' THEN 'assigned' ELSE status END,
      updated_at = now()
    WHERE id::text = $1
    RETURNING
      id,
      case_id,
      team_id,
      (SELECT name FROM search_teams WHERE id = search_tasks.team_id) AS team_name,
      (SELECT team_type FROM search_teams WHERE id = search_tasks.team_id) AS team_type,
      source_clue_id,
      title,
      description,
      status,
      priority,
      due_at,
      ST_Y(task_point) AS latitude,
      ST_X(task_point) AS longitude,
      result,
      created_by,
      created_at,
      updated_at
  `, [String(taskId), teamId || null]);

  return queryResult.rows[0] ? mapDbTaskRow(queryResult.rows[0]) : null;
}

module.exports = {
  assignTaskToTeam,
  createTask,
  findTaskById,
  listTasksByCase,
  mapDbTaskRow,
  normalizeTaskPriority,
  normalizeTaskStatus,
  updateTaskStatus
};
