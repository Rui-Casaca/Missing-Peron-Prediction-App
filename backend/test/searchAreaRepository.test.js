const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createCircularSearchArea,
  createSearchAreaFromGeoJson,
  deleteSearchArea,
  normalizeAreaPriority,
  normalizeAreaStatus,
  normalizeSearchAreaGeoJson,
  parseRadiusMeters,
  updateSearchAreaGeometry
} = require('../db/searchAreaRepository');

test('normaliza estado/prioridade e limita raio', () => {
  assert.equal(normalizeAreaStatus('searched'), 'searched');
  assert.equal(normalizeAreaStatus('x'), 'planned');
  assert.equal(normalizeAreaPriority('Muito Urgente'), 'very_urgent');
  assert.equal(normalizeAreaPriority('Urgente'), 'urgent');
  assert.equal(normalizeAreaPriority('x'), 'routine');
  assert.equal(parseRadiusMeters('250'), 250);
  assert.equal(parseRadiusMeters('-1'), null);
  assert.equal(parseRadiusMeters('999999'), 50000);
});

test('createCircularSearchArea exige campos essenciais', async () => {
  await assert.rejects(() => createCircularSearchArea({}, { caseId: 'case-1', name: '', latitude: 40, longitude: -8, radiusMeters: 100 }), /name é obrigatório/);
  await assert.rejects(() => createCircularSearchArea({}, { caseId: 'case-1', name: 'Área', latitude: 999, longitude: -8, radiusMeters: 100 }), /latitude inválida/);
});

test('createCircularSearchArea insere buffer circular em PostGIS', async () => {
  const fakeClient = {
    async query(sql, params) {
      assert.match(sql, /ST_Buffer/);
      assert.equal(params[0], 'case-1');
      assert.equal(params[2], 'Setor A');
      assert.equal(params[5], -8.2);
      assert.equal(params[6], 40.1);
      assert.equal(params[7], 500);
      return { rows: [{ id: 'area-1', case_id: params[0], name: params[2], status: params[3], priority: params[4], geojson: '{"type":"MultiPolygon","coordinates":[]}' }] };
    }
  };

  const area = await createCircularSearchArea(fakeClient, { caseId: 'case-1', name: 'Setor A', latitude: 40.1, longitude: -8.2, radiusMeters: 500 });
  assert.equal(area.id, 'area-1');
  assert.equal(area.name, 'Setor A');
});

test('normalizeSearchAreaGeoJson aceita FeatureCollection poligonal', () => {
  const geometry = normalizeSearchAreaGeoJson({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[-8, 40], [-8, 40.1], [-8.1, 40.1], [-8, 40]]] } }
    ]
  });

  assert.equal(geometry.type, 'Polygon');
  assert.throws(() => normalizeSearchAreaGeoJson({ type: 'Point', coordinates: [-8, 40] }), /Polygon/);
});

test('createSearchAreaFromGeoJson insere geometria desenhada em PostGIS', async () => {
  const fakeClient = {
    async query(sql, params) {
      assert.match(sql, /ST_GeomFromGeoJSON/);
      assert.match(sql, /ST_MakeValid/);
      assert.equal(params[0], 'case-1');
      assert.equal(params[2], 'Setor desenhado');
      assert.match(params[5], /Polygon/);
      return { rows: [{ id: 'area-geo-1', case_id: params[0], name: params[2], status: params[3], priority: params[4], geojson: '{"type":"MultiPolygon","coordinates":[]}' }] };
    }
  };

  const area = await createSearchAreaFromGeoJson(fakeClient, {
    caseId: 'case-1',
    name: 'Setor desenhado',
    geojson: { type: 'Polygon', coordinates: [[[-8, 40], [-8, 40.1], [-8.1, 40.1], [-8, 40]]] }
  });

  assert.equal(area.id, 'area-geo-1');
});

test('updateSearchAreaGeometry atualiza geometria existente', async () => {
  const fakeClient = {
    async query(sql, params) {
      assert.match(sql, /UPDATE search_areas/);
      assert.match(sql, /ST_GeomFromGeoJSON/);
      assert.equal(params[0], 'area-1');
      return { rows: [{ id: 'area-1', case_id: 'case-1', name: 'Setor A', status: 'planned', priority: 'routine', geojson: '{"type":"MultiPolygon","coordinates":[]}' }] };
    }
  };

  const area = await updateSearchAreaGeometry(fakeClient, 'area-1', { type: 'Polygon', coordinates: [[[-8, 40], [-8, 40.2], [-8.2, 40.2], [-8, 40]]] });
  assert.equal(area.id, 'area-1');
});

test('deleteSearchArea remove e devolve área apagada', async () => {
  const fakeClient = {
    async query(sql, params) {
      assert.match(sql, /DELETE FROM search_areas/);
      assert.equal(params[0], 'area-1');
      return { rows: [{ id: 'area-1', case_id: 'case-1', name: 'Setor A', status: 'planned', priority: 'routine', geojson: '{"type":"MultiPolygon","coordinates":[]}' }] };
    }
  };

  const area = await deleteSearchArea(fakeClient, 'area-1');
  assert.equal(area.id, 'area-1');
});
