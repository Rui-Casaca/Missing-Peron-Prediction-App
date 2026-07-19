function mapDbTrackRow(row) {
  return {
    id: row.id,
    case_id: row.case_id,
    team_id: row.team_id,
    team_name: row.team_name,
    team_type: row.team_type,
    source: row.source,
    started_at: row.started_at,
    ended_at: row.ended_at,
    distance_meters: row.distance_meters !== null && row.distance_meters !== undefined ? Number(row.distance_meters) : null,
    metadata: row.metadata || {},
    geojson: row.geojson ? JSON.parse(row.geojson) : null,
    created_at: row.created_at
  };
}

function normalizeTrackGeoJson(value) {
  if (!value) throw new Error('geometry é obrigatório para trilho');
  let geojson = value;
  if (typeof value === 'string') {
    try {
      geojson = JSON.parse(value);
    } catch (error) {
      throw new Error('geometry GeoJSON inválido');
    }
  }

  if (geojson.type === 'Feature') geojson = geojson.geometry;
  if (!geojson || geojson.type !== 'LineString' || !Array.isArray(geojson.coordinates)) {
    throw new Error('geometry deve ser LineString');
  }
  if (geojson.coordinates.length < 2) throw new Error('trilho deve ter pelo menos 2 pontos');
  const invalid = geojson.coordinates.find(([lon, lat]) => !Number.isFinite(Number(lon)) || !Number.isFinite(Number(lat)));
  if (invalid) throw new Error('trilho contém coordenadas inválidas');
  return { type: 'LineString', coordinates: geojson.coordinates.map(([lon, lat]) => [Number(lon), Number(lat)]) };
}

function buildLineStringGeoJsonFromPoints(points) {
  if (!Array.isArray(points) || points.length < 2) throw new Error('points deve conter pelo menos 2 pontos');
  return normalizeTrackGeoJson({
    type: 'LineString',
    coordinates: points.map((point) => {
      if (Array.isArray(point)) return [point[0], point[1]];
      return [point.longitude ?? point.lon, point.latitude ?? point.lat];
    })
  });
}

async function createSearchTrackFromGeoJson(client, {
  caseId,
  teamId = null,
  source = 'manual',
  geojson,
  startedAt = null,
  endedAt = null,
  metadata = {}
}) {
  if (!caseId) throw new Error('caseId é obrigatório para criar trilho');
  const geometryJson = JSON.stringify(normalizeTrackGeoJson(geojson));

  const result = await client.query(`
    WITH input AS (
      SELECT ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)::geometry(LineString, 4326) AS track
    ), inserted AS (
      INSERT INTO search_tracks (
        case_id,
        team_id,
        source,
        track,
        started_at,
        ended_at,
        distance_meters,
        metadata
      )
      SELECT
        $1,
        $2,
        $3,
        input.track,
        $5::timestamptz,
        $6::timestamptz,
        ST_Length(input.track::geography),
        $7::jsonb
      FROM input
      RETURNING *
    )
    SELECT
      inserted.id,
      inserted.case_id,
      inserted.team_id,
      team.name AS team_name,
      team.team_type AS team_type,
      inserted.source,
      inserted.started_at,
      inserted.ended_at,
      inserted.distance_meters,
      inserted.metadata,
      ST_AsGeoJSON(inserted.track) AS geojson,
      inserted.created_at
    FROM inserted
    LEFT JOIN search_teams team ON team.id = inserted.team_id
  `, [caseId, teamId, String(source || 'manual').trim() || 'manual', geometryJson, startedAt, endedAt, JSON.stringify(metadata || {})]);

  return mapDbTrackRow(result.rows[0]);
}

async function listSearchTracksByCase(client, caseId) {
  const result = await client.query(`
    SELECT
      st.id,
      st.case_id,
      st.team_id,
      team.name AS team_name,
      team.team_type AS team_type,
      st.source,
      st.started_at,
      st.ended_at,
      st.distance_meters,
      st.metadata,
      ST_AsGeoJSON(st.track) AS geojson,
      st.created_at
    FROM search_tracks st
    LEFT JOIN search_teams team ON team.id = st.team_id
    WHERE st.case_id = $1
    ORDER BY COALESCE(st.started_at, st.created_at) DESC, st.created_at DESC
  `, [caseId]);
  return result.rows.map(mapDbTrackRow);
}

module.exports = {
  buildLineStringGeoJsonFromPoints,
  createSearchTrackFromGeoJson,
  listSearchTracksByCase,
  mapDbTrackRow,
  normalizeTrackGeoJson
};