function mapDbSearchAreaRow(row) {
  return {
    id: row.id,
    case_id: row.case_id,
    team_id: row.team_id,
    team_name: row.team_name,
    team_type: row.team_type,
    name: row.name,
    status: row.status,
    priority: row.priority,
    notes: row.notes,
    area_m2: row.area_m2 !== null && row.area_m2 !== undefined ? Number(row.area_m2) : null,
    centroid_latitude: row.centroid_latitude !== null && row.centroid_latitude !== undefined ? Number(row.centroid_latitude) : null,
    centroid_longitude: row.centroid_longitude !== null && row.centroid_longitude !== undefined ? Number(row.centroid_longitude) : null,
    geojson: row.geojson ? JSON.parse(row.geojson) : null,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function normalizeAreaStatus(value) {
  const allowed = new Set(['planned', 'assigned', 'in_progress', 'searched', 'cancelled']);
  const normalized = String(value || 'planned').toLowerCase().trim();
  return allowed.has(normalized) ? normalized : 'planned';
}

function normalizeAreaPriority(value) {
  const normalized = String(value || 'routine').toLowerCase().trim();
  if (normalized === 'muito urgente' || normalized === 'very_urgent') return 'very_urgent';
  if (normalized === 'urgente' || normalized === 'urgent') return 'urgent';
  return 'routine';
}

function parseRadiusMeters(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(parsed, 50000);
}

function normalizeSearchAreaGeoJson(value) {
  if (!value) throw new Error('geometry é obrigatório para área de busca');
  let geojson = value;
  if (typeof value === 'string') {
    try {
      geojson = JSON.parse(value);
    } catch (error) {
      throw new Error('geometry GeoJSON inválido');
    }
  }

  if (!geojson || typeof geojson !== 'object') throw new Error('geometry GeoJSON inválido');
  if (geojson.type === 'Feature') geojson = geojson.geometry;
  if (geojson.type === 'FeatureCollection') {
    const geometries = (geojson.features || [])
      .map(feature => feature && feature.geometry)
      .filter(Boolean);
    if (geometries.length === 1) geojson = geometries[0];
    else geojson = { type: 'GeometryCollection', geometries };
  }

  const allowedTypes = new Set(['Polygon', 'MultiPolygon', 'GeometryCollection']);
  if (!geojson || !allowedTypes.has(geojson.type)) {
    throw new Error('geometry deve ser Polygon, MultiPolygon ou FeatureCollection de polígonos');
  }

  if (geojson.type === 'GeometryCollection') {
    const geometries = Array.isArray(geojson.geometries) ? geojson.geometries : [];
    if (geometries.length === 0) throw new Error('geometry não contém polígonos');
    const invalid = geometries.find(geometry => !geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type));
    if (invalid) throw new Error('geometry deve conter apenas Polygon ou MultiPolygon');
  }

  return geojson;
}

function stringifySearchAreaGeometry(value) {
  return JSON.stringify(normalizeSearchAreaGeoJson(value));
}

async function createCircularSearchArea(client, {
  caseId,
  teamId = null,
  name,
  status = 'planned',
  priority = 'routine',
  latitude,
  longitude,
  radiusMeters,
  notes = null,
  createdBy = null
}) {
  if (!caseId) throw new Error('caseId é obrigatório para criar área de busca');
  if (!name || String(name).trim() === '') throw new Error('name é obrigatório para criar área de busca');
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error('latitude inválida para área de busca');
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new Error('longitude inválida para área de busca');
  const radius = parseRadiusMeters(radiusMeters);
  if (!radius) throw new Error('radiusMeters inválido para área de busca');

  const result = await client.query(`
    INSERT INTO search_areas (
      case_id,
      team_id,
      name,
      status,
      priority,
      area,
      notes,
      created_by
    ) VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography, $8)::geometry),
      $9,
      $10
    )
    RETURNING
      id,
      case_id,
      team_id,
      (SELECT name FROM search_teams WHERE id = search_areas.team_id) AS team_name,
      (SELECT team_type FROM search_teams WHERE id = search_areas.team_id) AS team_type,
      name,
      status,
      priority,
      notes,
      ST_Area(area::geography) AS area_m2,
      ST_Y(ST_Centroid(area)) AS centroid_latitude,
      ST_X(ST_Centroid(area)) AS centroid_longitude,
      ST_AsGeoJSON(area) AS geojson,
      created_by,
      created_at,
      updated_at
  `, [
    caseId,
    teamId,
    String(name).trim(),
    normalizeAreaStatus(status),
    normalizeAreaPriority(priority),
    lon,
    lat,
    radius,
    notes || null,
    createdBy
  ]);

  return mapDbSearchAreaRow(result.rows[0]);
}

async function createSearchAreaFromGeoJson(client, {
  caseId,
  teamId = null,
  name,
  status = 'planned',
  priority = 'routine',
  geojson,
  notes = null,
  createdBy = null
}) {
  if (!caseId) throw new Error('caseId é obrigatório para criar área de busca');
  if (!name || String(name).trim() === '') throw new Error('name é obrigatório para criar área de busca');
  const geometryJson = stringifySearchAreaGeometry(geojson);

  const result = await client.query(`
    WITH input AS (
      SELECT ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($6), 4326)), 3))::geometry(MultiPolygon, 4326) AS area
    ), inserted AS (
      INSERT INTO search_areas (
        case_id,
        team_id,
        name,
        status,
        priority,
        area,
        notes,
        created_by
      )
      SELECT
        $1,
        $2,
        $3,
        $4,
        $5,
        input.area,
        $7,
        $8
      FROM input
      WHERE NOT ST_IsEmpty(input.area)
      RETURNING *
    )
    SELECT
      inserted.id,
      inserted.case_id,
      inserted.team_id,
      team.name AS team_name,
      team.team_type AS team_type,
      inserted.name,
      inserted.status,
      inserted.priority,
      inserted.notes,
      ST_Area(inserted.area::geography) AS area_m2,
      ST_Y(ST_Centroid(inserted.area)) AS centroid_latitude,
      ST_X(ST_Centroid(inserted.area)) AS centroid_longitude,
      ST_AsGeoJSON(inserted.area) AS geojson,
      inserted.created_by,
      inserted.created_at,
      inserted.updated_at
    FROM inserted
    LEFT JOIN search_teams team ON team.id = inserted.team_id
  `, [
    caseId,
    teamId,
    String(name).trim(),
    normalizeAreaStatus(status),
    normalizeAreaPriority(priority),
    geometryJson,
    notes || null,
    createdBy
  ]);

  if (!result.rows[0]) throw new Error('geometry inválida para área de busca');
  return mapDbSearchAreaRow(result.rows[0]);
}

async function listSearchAreasByCase(client, caseId) {
  const result = await client.query(`
    SELECT
      sa.id,
      sa.case_id,
      sa.team_id,
      team.name AS team_name,
      team.team_type AS team_type,
      sa.name,
      sa.status,
      sa.priority,
      sa.notes,
      ST_Area(sa.area::geography) AS area_m2,
      ST_Y(ST_Centroid(sa.area)) AS centroid_latitude,
      ST_X(ST_Centroid(sa.area)) AS centroid_longitude,
      ST_AsGeoJSON(sa.area) AS geojson,
      sa.created_by,
      sa.created_at,
      sa.updated_at
    FROM search_areas sa
    LEFT JOIN search_teams team ON team.id = sa.team_id
    WHERE sa.case_id = $1
    ORDER BY
      CASE sa.priority WHEN 'very_urgent' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END,
      CASE sa.status WHEN 'in_progress' THEN 1 WHEN 'assigned' THEN 2 WHEN 'planned' THEN 3 WHEN 'searched' THEN 4 ELSE 5 END,
      sa.created_at DESC
  `, [caseId]);

  return result.rows.map(mapDbSearchAreaRow);
}

async function findSearchAreaById(client, areaId) {
  const result = await client.query(`
    SELECT
      sa.id,
      sa.case_id,
      sa.team_id,
      team.name AS team_name,
      team.team_type AS team_type,
      sa.name,
      sa.status,
      sa.priority,
      sa.notes,
      ST_Area(sa.area::geography) AS area_m2,
      ST_Y(ST_Centroid(sa.area)) AS centroid_latitude,
      ST_X(ST_Centroid(sa.area)) AS centroid_longitude,
      ST_AsGeoJSON(sa.area) AS geojson,
      sa.created_by,
      sa.created_at,
      sa.updated_at
    FROM search_areas sa
    LEFT JOIN search_teams team ON team.id = sa.team_id
    WHERE sa.id::text = $1
    LIMIT 1
  `, [String(areaId)]);

  return result.rows[0] ? mapDbSearchAreaRow(result.rows[0]) : null;
}

async function updateSearchAreaStatus(client, areaId, status) {
  const result = await client.query(`
    UPDATE search_areas
    SET status = $2, updated_at = now()
    WHERE id::text = $1
    RETURNING
      id,
      case_id,
      team_id,
      (SELECT name FROM search_teams WHERE id = search_areas.team_id) AS team_name,
      (SELECT team_type FROM search_teams WHERE id = search_areas.team_id) AS team_type,
      name,
      status,
      priority,
      notes,
      ST_Area(area::geography) AS area_m2,
      ST_Y(ST_Centroid(area)) AS centroid_latitude,
      ST_X(ST_Centroid(area)) AS centroid_longitude,
      ST_AsGeoJSON(area) AS geojson,
      created_by,
      created_at,
      updated_at
  `, [String(areaId), normalizeAreaStatus(status)]);

  return result.rows[0] ? mapDbSearchAreaRow(result.rows[0]) : null;
}

async function updateSearchAreaGeometry(client, areaId, geojson) {
  const geometryJson = stringifySearchAreaGeometry(geojson);
  const result = await client.query(`
    WITH input AS (
      SELECT ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)), 3))::geometry(MultiPolygon, 4326) AS area
    ), updated AS (
      UPDATE search_areas
      SET area = input.area, updated_at = now()
      FROM input
      WHERE search_areas.id::text = $1
        AND NOT ST_IsEmpty(input.area)
      RETURNING search_areas.*
    )
    SELECT
      updated.id,
      updated.case_id,
      updated.team_id,
      team.name AS team_name,
      team.team_type AS team_type,
      updated.name,
      updated.status,
      updated.priority,
      updated.notes,
      ST_Area(updated.area::geography) AS area_m2,
      ST_Y(ST_Centroid(updated.area)) AS centroid_latitude,
      ST_X(ST_Centroid(updated.area)) AS centroid_longitude,
      ST_AsGeoJSON(updated.area) AS geojson,
      updated.created_by,
      updated.created_at,
      updated.updated_at
    FROM updated
    LEFT JOIN search_teams team ON team.id = updated.team_id
  `, [String(areaId), geometryJson]);

  return result.rows[0] ? mapDbSearchAreaRow(result.rows[0]) : null;
}

async function deleteSearchArea(client, areaId) {
  const result = await client.query(`
    WITH deleted AS (
      DELETE FROM search_areas
      WHERE id::text = $1
      RETURNING *
    )
    SELECT
      deleted.id,
      deleted.case_id,
      deleted.team_id,
      team.name AS team_name,
      team.team_type AS team_type,
      deleted.name,
      deleted.status,
      deleted.priority,
      deleted.notes,
      ST_Area(deleted.area::geography) AS area_m2,
      ST_Y(ST_Centroid(deleted.area)) AS centroid_latitude,
      ST_X(ST_Centroid(deleted.area)) AS centroid_longitude,
      ST_AsGeoJSON(deleted.area) AS geojson,
      deleted.created_by,
      deleted.created_at,
      deleted.updated_at
    FROM deleted
    LEFT JOIN search_teams team ON team.id = deleted.team_id
  `, [String(areaId)]);

  return result.rows[0] ? mapDbSearchAreaRow(result.rows[0]) : null;
}

module.exports = {
  createCircularSearchArea,
  createSearchAreaFromGeoJson,
  deleteSearchArea,
  findSearchAreaById,
  listSearchAreasByCase,
  mapDbSearchAreaRow,
  normalizeSearchAreaGeoJson,
  normalizeAreaPriority,
  normalizeAreaStatus,
  parseRadiusMeters,
  stringifySearchAreaGeometry,
  updateSearchAreaGeometry,
  updateSearchAreaStatus
};
