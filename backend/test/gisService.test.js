const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCaseFeatureCollection,
  extractSearchAreaImports,
  featureCollectionToGpx,
  featureCollectionToKml,
  getExportMetadata
} = require('../gisService');

const caso = {
  id: 'case-1',
  official_case_number: '1',
  status: 'active',
  priority: 'urgent',
  risk_level: 'high',
  person_name: 'Ana Teste',
  last_seen_location: 'Rua A',
  last_seen_at: '2026-06-09T10:00:00Z',
  latitude: 40.1,
  longitude: -8.2,
  found_latitude: null,
  found_longitude: null
};

test('buildCaseFeatureCollection agrega caso, áreas, pistas e tarefas', () => {
  const collection = buildCaseFeatureCollection(caso, {
    areas: [{ id: 'area-1', case_id: 'case-1', name: 'Setor A', status: 'planned', priority: 'urgent', geojson: { type: 'MultiPolygon', coordinates: [] }, centroid_latitude: 40.1, centroid_longitude: -8.2 }],
    clues: [{ id: 'clue-1', case_id: 'case-1', clue_type: 'sighting', description: 'Avistamento', reliability: 'high', latitude: 40.11, longitude: -8.21 }],
    tasks: [{ id: 'task-1', case_id: 'case-1', title: 'Verificar trilho', status: 'pending', priority: 'urgent', latitude: 40.12, longitude: -8.22 }],
    tracks: [{ id: 'track-1', case_id: 'case-1', source: 'manual_map', metadata: { name: 'Trilho A' }, geojson: { type: 'LineString', coordinates: [[-8, 40], [-8.1, 40.1]] } }]
  });

  assert.equal(collection.type, 'FeatureCollection');
  assert.equal(collection.features.length, 5);
  assert.equal(collection.features[0].properties.entity_type, 'case_last_seen');
  assert.ok(collection.features.some(feature => feature.properties.entity_type === 'search_area'));
  assert.ok(collection.features.some(feature => feature.properties.entity_type === 'track'));
});

test('featureCollectionToKml e GPX produzem XML operacional', () => {
  const collection = buildCaseFeatureCollection(caso, {
    clues: [{ id: 'clue-1', case_id: 'case-1', clue_type: 'sighting', description: 'Avistamento', reliability: 'high', latitude: 40.11, longitude: -8.21 }]
  });

  const kml = featureCollectionToKml(collection);
  const gpx = featureCollectionToGpx(collection);
  assert.match(kml, /<kml/);
  assert.match(kml, /Último avistamento/);
  assert.match(gpx, /<gpx/);
  assert.match(gpx, /<wpt/);
});

test('extractSearchAreaImports extrai polígonos de GeoJSON', () => {
  const imports = extractSearchAreaImports({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { name: 'Setor importado', priority: 'urgent' }, geometry: { type: 'Polygon', coordinates: [[[-8, 40], [-8, 40.1], [-8.1, 40.1], [-8, 40]]] } },
      { type: 'Feature', properties: { name: 'Ignorar ponto' }, geometry: { type: 'Point', coordinates: [-8, 40] } }
    ]
  });

  assert.equal(imports.length, 1);
  assert.equal(imports[0].name, 'Setor importado');
  assert.equal(imports[0].priority, 'urgent');
});

test('getExportMetadata escolhe content-type e filename', () => {
  assert.equal(getExportMetadata('geojson', caso).filename, 'caso_1.geojson');
  assert.match(getExportMetadata('kml', caso).contentType, /kml/);
  assert.match(getExportMetadata('gpx', caso).contentType, /gpx/);
});
