async function recordCaseEvent(client, {
  caseId,
  eventType,
  summary,
  payload = {},
  eventPointWkt = null,
  eventAt = null,
  createdBy = null,
  sourceDeviceId = null,
  offlineOperationId = null
}) {
  if (!caseId) throw new Error('caseId é obrigatório para registar evento');
  if (!eventType) throw new Error('eventType é obrigatório para registar evento');
  if (!summary) throw new Error('summary é obrigatório para registar evento');

  const result = await client.query(`
    INSERT INTO case_events (
      case_id,
      event_type,
      summary,
      payload,
      event_point,
      event_at,
      created_by,
      source_device_id,
      offline_operation_id
    ) VALUES (
      $1,
      $2,
      $3,
      $4::jsonb,
      ST_GeomFromText($5, 4326),
      COALESCE($6::timestamptz, now()),
      $7,
      $8,
      $9
    )
    RETURNING *
  `, [
    caseId,
    eventType,
    summary,
    JSON.stringify(payload || {}),
    eventPointWkt,
    eventAt,
    createdBy,
    sourceDeviceId,
    offlineOperationId
  ]);

  return result.rows[0];
}

async function listCaseEvents(client, caseId) {
  const result = await client.query(`
    SELECT
      id,
      case_id,
      event_type,
      summary,
      payload,
      ST_Y(event_point) AS latitude,
      ST_X(event_point) AS longitude,
      event_at,
      created_by,
      source_device_id,
      offline_operation_id,
      created_at
    FROM case_events
    WHERE case_id = $1
    ORDER BY event_at ASC, created_at ASC, id ASC
  `, [caseId]);

  return result.rows.map(row => ({
    ...row,
    latitude: row.latitude !== null && row.latitude !== undefined ? Number(row.latitude) : null,
    longitude: row.longitude !== null && row.longitude !== undefined ? Number(row.longitude) : null
  }));
}

async function listCasesMissingEvent(client, eventType, { limit = 1000 } = {}) {
  if (!eventType) throw new Error('eventType é obrigatório');
  const safeLimit = Math.min(Math.max(Number(limit) || 1000, 1), 10000);
  const result = await client.query(`
    SELECT
      c.id,
      c.official_case_number,
      c.legacy_csv_id,
      c.person_name,
      c.risk_level,
      c.priority,
      c.created_at,
      ST_AsText(c.last_seen_point) AS last_seen_point_wkt
    FROM cases c
    WHERE NOT EXISTS (
      SELECT 1
      FROM case_events e
      WHERE e.case_id = c.id
        AND e.event_type = $1
    )
    ORDER BY COALESCE(NULLIF(regexp_replace(c.legacy_csv_id, '[^0-9]', '', 'g'), '')::integer, 0), c.created_at, c.id
    LIMIT $2
  `, [eventType, safeLimit]);

  return result.rows;
}

module.exports = {
  recordCaseEvent,
  listCaseEvents,
  listCasesMissingEvent
};
