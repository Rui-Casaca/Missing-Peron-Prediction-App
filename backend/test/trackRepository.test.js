const test = require('node:test');
const assert = require('node:assert/strict');

const { buildLineStringGeoJsonFromPoints, createSearchTrackFromGeoJson, normalizeTrackGeoJson } = require('../db/trackRepository');

test('normalizeTrackGeoJson exige LineString com dois pontos', () => {
  assert.throws(() => normalizeTrackGeoJson({ type: 'Point', coordinates: [-8, 40] }), /LineString/);
  assert.throws(() => normalizeTrackGeoJson({ type: 'LineString', coordinates: [[-8, 40]] }), /2 pontos/);
  const line = normalizeTrackGeoJson({ type: 'LineString', coordinates: [[-8, 40], [-8.1, 40.1]] });
  assert.equal(line.coordinates.length, 2);
});

test('buildLineStringGeoJsonFromPoints aceita objetos lat/lon', () => {
  const line = buildLineStringGeoJsonFromPoints([{ latitude: 40, longitude: -8 }, { lat: 40.1, lon: -8.1 }]);
  assert.deepEqual(line.coordinates, [[-8, 40], [-8.1, 40.1]]);
});

test('createSearchTrackFromGeoJson insere trilho em PostGIS', async () => {
  const fakeClient = {
    async query(sql, params) {
      assert.match(sql, /ST_GeomFromGeoJSON/);
      assert.match(sql, /ST_Length/);
      assert.equal(params[0], 'case-1');
      assert.equal(params[2], 'manual_map');
      assert.match(params[3], /LineString/);
      return { rows: [{ id: 'track-1', case_id: params[0], source: params[2], distance_meters: 100, metadata: JSON.parse(params[6]), geojson: params[3] }] };
    }
  };

  const track = await createSearchTrackFromGeoJson(fakeClient, {
    caseId: 'case-1',
    source: 'manual_map',
    geojson: { type: 'LineString', coordinates: [[-8, 40], [-8.1, 40.1]] },
    metadata: { name: 'Trilho A' }
  });

  assert.equal(track.id, 'track-1');
  assert.equal(track.metadata.name, 'Trilho A');
});