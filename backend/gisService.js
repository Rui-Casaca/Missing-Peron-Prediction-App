const { XMLBuilder } = require('fast-xml-parser');

function hasPoint(latitude, longitude) {
  if (latitude === null || latitude === undefined || latitude === '') return false;
  if (longitude === null || longitude === undefined || longitude === '') return false;
  return Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
}

function buildPointGeometry(latitude, longitude) {
  if (!hasPoint(latitude, longitude)) return null;
  return { type: 'Point', coordinates: [Number(longitude), Number(latitude)] };
}

function createFeature({ id, geometry, properties }) {
  if (!geometry) return null;
  return { type: 'Feature', id, geometry, properties: properties || {} };
}

function buildCaseFeatureCollection(caso, { areas = [], clues = [], tasks = [], tracks = [] } = {}) {
  if (!caso) throw new Error('caso é obrigatório para export GIS');
  const features = [];
  const caseLabel = caso.person_name || caso.official_payload?.Nome_Completo || caso.official_case_number || caso.legacy_csv_id || caso.id;

  const lastSeenFeature = createFeature({
    id: `case:${caso.id}:last_seen`,
    geometry: buildPointGeometry(caso.latitude, caso.longitude),
    properties: {
      entity_type: 'case_last_seen',
      case_id: caso.id,
      case_number: caso.official_case_number || caso.legacy_csv_id,
      name: `Último avistamento - ${caseLabel}`,
      person_name: caso.person_name,
      location: caso.last_seen_location,
      observed_at: caso.last_seen_at,
      status: caso.status,
      priority: caso.priority,
      risk_level: caso.risk_level
    }
  });
  if (lastSeenFeature) features.push(lastSeenFeature);

  const foundFeature = createFeature({
    id: `case:${caso.id}:found`,
    geometry: buildPointGeometry(caso.found_latitude, caso.found_longitude),
    properties: {
      entity_type: 'case_found',
      case_id: caso.id,
      case_number: caso.official_case_number || caso.legacy_csv_id,
      name: `Pessoa encontrada - ${caseLabel}`,
      person_name: caso.person_name,
      location: caso.found_location,
      observed_at: caso.found_at,
      status: caso.status
    }
  });
  if (foundFeature) features.push(foundFeature);

  areas.forEach((area) => {
    if (!area.geojson) return;
    features.push(createFeature({
      id: `search_area:${area.id}`,
      geometry: area.geojson,
      properties: {
        entity_type: 'search_area',
        case_id: area.case_id,
        search_area_id: area.id,
        name: area.name,
        status: area.status,
        priority: area.priority,
        team_id: area.team_id,
        team_name: area.team_name,
        area_m2: area.area_m2,
        centroid_latitude: area.centroid_latitude,
        centroid_longitude: area.centroid_longitude,
        notes: area.notes
      }
    }));
  });

  clues.forEach((clue) => {
    const feature = createFeature({
      id: `clue:${clue.id}`,
      geometry: buildPointGeometry(clue.latitude, clue.longitude),
      properties: {
        entity_type: 'clue',
        case_id: clue.case_id,
        clue_id: clue.id,
        name: `Pista - ${clue.clue_type}`,
        clue_type: clue.clue_type,
        description: clue.description,
        reliability: clue.reliability,
        observed_at: clue.observed_at,
        reported_by: clue.reported_by
      }
    });
    if (feature) features.push(feature);
  });

  tasks.forEach((task) => {
    const feature = createFeature({
      id: `task:${task.id}`,
      geometry: buildPointGeometry(task.latitude, task.longitude),
      properties: {
        entity_type: 'task',
        case_id: task.case_id,
        task_id: task.id,
        source_clue_id: task.source_clue_id,
        name: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        due_at: task.due_at,
        team_id: task.team_id,
        team_name: task.team_name
      }
    });
    if (feature) features.push(feature);
  });

  tracks.forEach((track) => {
    if (!track.geojson) return;
    features.push(createFeature({
      id: `track:${track.id}`,
      geometry: track.geojson,
      properties: {
        entity_type: 'track',
        case_id: track.case_id,
        track_id: track.id,
        team_id: track.team_id,
        team_name: track.team_name,
        source: track.source,
        name: track.metadata?.name || `Trilho ${track.id}`,
        started_at: track.started_at,
        ended_at: track.ended_at,
        distance_meters: track.distance_meters,
        notes: track.metadata?.notes
      }
    }));
  });

  return { type: 'FeatureCollection', name: `Caso ${caso.official_case_number || caso.legacy_csv_id || caso.id}`, features };
}

function cleanXmlValue(value) {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function buildDescription(properties) {
  return Object.entries(properties || {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}: ${cleanXmlValue(value)}`)
    .join('\n');
}

function toKmlCoordinates(coordinates) {
  return coordinates.map(([longitude, latitude, altitude = 0]) => `${longitude},${latitude},${altitude}`).join(' ');
}

function polygonToKml(polygonCoordinates) {
  const outer = polygonCoordinates[0] || [];
  const inner = polygonCoordinates.slice(1).filter(ring => Array.isArray(ring) && ring.length > 0);
  const result = { outerBoundaryIs: { LinearRing: { coordinates: toKmlCoordinates(outer) } } };
  if (inner.length > 0) result.innerBoundaryIs = inner.map(ring => ({ LinearRing: { coordinates: toKmlCoordinates(ring) } }));
  return result;
}

function geometryToKml(geometry) {
  if (!geometry) return null;
  if (geometry.type === 'Point') return { Point: { coordinates: toKmlCoordinates([geometry.coordinates]) } };
  if (geometry.type === 'LineString') return { LineString: { coordinates: toKmlCoordinates(geometry.coordinates || []) } };
  if (geometry.type === 'Polygon') return { Polygon: polygonToKml(geometry.coordinates || []) };
  if (geometry.type === 'MultiPolygon') return { MultiGeometry: { Polygon: (geometry.coordinates || []).map(polygonToKml) } };
  return null;
}

function featureToKmlPlacemark(feature) {
  const geometry = geometryToKml(feature.geometry);
  if (!geometry) return null;
  const properties = feature.properties || {};
  return {
    name: cleanXmlValue(properties.name || feature.id || 'Elemento GIS'),
    description: cleanXmlValue(buildDescription(properties)),
    ExtendedData: {
      Data: Object.entries(properties)
        .filter(([, value]) => value !== null && value !== undefined)
        .map(([key, value]) => ({ '@_name': key, value: cleanXmlValue(value) }))
    },
    ...geometry
  };
}

function featureCollectionToKml(featureCollection) {
  const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true });
  const placemarks = (featureCollection.features || []).map(featureToKmlPlacemark).filter(Boolean);
  return builder.build({
    '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
    kml: {
      '@_xmlns': 'http://www.opengis.net/kml/2.2',
      Document: { name: featureCollection.name || 'SAR GIS Export', Placemark: placemarks }
    }
  });
}

function pointFeatureToGpxWaypoint(feature) {
  if (!feature || !feature.geometry || feature.geometry.type !== 'Point') return null;
  const [longitude, latitude] = feature.geometry.coordinates || [];
  if (!hasPoint(latitude, longitude)) return null;
  const properties = feature.properties || {};
  return {
    '@_lat': Number(latitude),
    '@_lon': Number(longitude),
    name: cleanXmlValue(properties.name || feature.id || 'Elemento SAR'),
    desc: cleanXmlValue(buildDescription(properties)),
    type: cleanXmlValue(properties.entity_type || 'sar')
  };
}

function areaFeatureToGpxWaypoint(feature) {
  const properties = feature.properties || {};
  if (properties.entity_type !== 'search_area') return null;
  if (!hasPoint(properties.centroid_latitude, properties.centroid_longitude)) return null;
  return {
    '@_lat': Number(properties.centroid_latitude),
    '@_lon': Number(properties.centroid_longitude),
    name: cleanXmlValue(properties.name || feature.id || 'Área de busca'),
    desc: cleanXmlValue(buildDescription(properties)),
    type: 'search_area_centroid'
  };
}

function featureCollectionToGpx(featureCollection) {
  const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true });
  const waypoints = (featureCollection.features || [])
    .map(feature => pointFeatureToGpxWaypoint(feature) || areaFeatureToGpxWaypoint(feature))
    .filter(Boolean);
  return builder.build({
    '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
    gpx: {
      '@_version': '1.1',
      '@_creator': 'Sistema Pessoas Desaparecidas SAR',
      '@_xmlns': 'http://www.topografix.com/GPX/1/1',
      metadata: { name: featureCollection.name || 'SAR GIS Export' },
      wpt: waypoints
    }
  });
}

function normalizeImportedGeoJson(value) {
  if (!value) throw new Error('GeoJSON é obrigatório');
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      throw new Error('GeoJSON inválido');
    }
  }
  return value;
}

function extractSearchAreaImports(value) {
  const geojson = normalizeImportedGeoJson(value);
  const features = geojson.type === 'FeatureCollection'
    ? (geojson.features || [])
    : geojson.type === 'Feature'
      ? [geojson]
      : [{ type: 'Feature', geometry: geojson, properties: {} }];

  return features
    .map((feature, index) => {
      const geometry = feature && feature.geometry;
      if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) return null;
      const properties = feature.properties || {};
      return {
        name: properties.name || properties.Name || properties.nome || `Área importada ${index + 1}`,
        status: properties.status || properties.estado || 'planned',
        priority: properties.priority || properties.prioridade || 'routine',
        notes: properties.notes || properties.notas || properties.description || properties.desc || null,
        geojson: geometry
      };
    })
    .filter(Boolean);
}

function getExportMetadata(format, caso) {
  const safeCaseId = String(caso.official_case_number || caso.legacy_csv_id || caso.id || 'caso').replace(/[^a-z0-9_-]+/gi, '_');
  if (format === 'kml') return { contentType: 'application/vnd.google-earth.kml+xml; charset=utf-8', filename: `caso_${safeCaseId}.kml` };
  if (format === 'gpx') return { contentType: 'application/gpx+xml; charset=utf-8', filename: `caso_${safeCaseId}.gpx` };
  return { contentType: 'application/geo+json; charset=utf-8', filename: `caso_${safeCaseId}.geojson` };
}

module.exports = {
  buildCaseFeatureCollection,
  extractSearchAreaImports,
  featureCollectionToGpx,
  featureCollectionToKml,
  getExportMetadata,
  normalizeImportedGeoJson
};
