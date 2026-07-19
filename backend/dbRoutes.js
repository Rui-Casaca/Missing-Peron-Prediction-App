const express = require('express');
const fs = require('fs');
const path = require('path');

const { parseCsvFile } = require('./csvUtil');
const { withClient, withTransaction } = require('./db');
const { buildPointWkt, parseCoordinate } = require('./db/caseMapper');
const { listCaseEvents } = require('./db/caseEventRepository');
const { createClue, listCluesByCase } = require('./db/clueRepository');
const { createQuickCase, findCaseByAnyId, getCaseStatistics, listCases, updateCaseStatus } = require('./db/caseRepository');
const { createTask, assignTaskToTeam, findTaskById, listTasksByCase, updateTaskStatus } = require('./db/taskRepository');
const { createTeam, findTeamById, listTeams, updateTeamStatus } = require('./db/teamRepository');
const { createCircularSearchArea, createSearchAreaFromGeoJson, deleteSearchArea, findSearchAreaById, listSearchAreasByCase, updateSearchAreaGeometry, updateSearchAreaStatus } = require('./db/searchAreaRepository');
const { buildLineStringGeoJsonFromPoints, createSearchTrackFromGeoJson, listSearchTracksByCase } = require('./db/trackRepository');
const { buildCaseFeatureCollection, extractSearchAreaImports, featureCollectionToGpx, featureCollectionToKml, getExportMetadata } = require('./gisService');
const { parseBody } = require('./validation/request');
const {
  caseStatusBodySchema,
  clueBodySchema,
  quickCaseBodySchema,
  searchAreaBodySchema,
  searchAreaGeometryBodySchema,
  searchAreaStatusBodySchema,
  taskBodySchema,
  taskStatusBodySchema,
  taskTeamBodySchema,
  teamBodySchema,
  teamStatusBodySchema
} = require('./validation/schemas');

const router = express.Router();
const CSV_FILE_OFFICIAL = path.join(__dirname, '../historico_casos_pdgnr_oficial.csv');

function compareCsvAndDb(csvRows, dbCases) {
  const csvById = new Map(csvRows.map(row => [String(row.ID_Caso || '').trim(), row]));
  const dbById = new Map(dbCases.map(row => [String(row.legacy_csv_id || row.official_case_number || '').trim(), row]));
  const csvIds = Array.from(csvById.keys()).filter(Boolean);
  const dbIds = Array.from(dbById.keys()).filter(Boolean);

  const missingInDb = csvIds.filter(id => !dbById.has(id));
  const missingInCsv = dbIds.filter(id => !csvById.has(id));
  const commonIds = csvIds.filter(id => dbById.has(id));

  const divergent = commonIds.filter((id) => {
    const csvRow = csvById.get(id);
    const dbRow = dbById.get(id);
    const csvName = String(csvRow.Nome_Completo || csvRow.Nome || '').trim();
    const dbName = String(dbRow.person_name || '').trim();
    const csvRisk = String(csvRow.Risco_Calculado || '').trim().toLowerCase();
    const dbRisk = String(dbRow.risk_level || '').trim().toLowerCase();
    return Boolean(csvName && dbName && csvName !== dbName) ||
      (csvRisk === 'elevado' && dbRisk !== 'high') ||
      (csvRisk === 'moderado' && dbRisk !== 'moderate') ||
      (csvRisk === 'normal' && dbRisk !== 'normal');
  });

  return {
    csv_total: csvRows.length,
    db_total: dbCases.length,
    common_ids: commonIds.length,
    missing_in_db: missingInDb,
    missing_in_csv: missingInCsv,
    divergent_ids: divergent,
    matches_total_count: csvRows.length === dbCases.length,
    matches_ids: missingInDb.length === 0 && missingInCsv.length === 0
  };
}

router.get('/status', async (req, res) => {
  try {
    const result = await withClient(async (client) => {
      const dbResult = await client.query('SELECT current_database() AS database, now() AS server_time');
      const extResult = await client.query("SELECT extname FROM pg_extension WHERE extname IN ('postgis', 'pgcrypto') ORDER BY extname");
      const countResult = await client.query('SELECT count(*)::int AS total FROM cases');
      return {
        database: dbResult.rows[0].database,
        server_time: dbResult.rows[0].server_time,
        extensions: extResult.rows.map(row => row.extname),
        cases_total: countResult.rows[0].total
      };
    });

    res.json({ success: true, db: result });
  } catch (error) {
    res.status(503).json({ success: false, error: error.message });
  }
});

router.get('/casos-oficial', async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 500;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    const casos = await withClient(client => listCases(client, { limit, offset }));
    res.json({ success: true, total: casos.length, casos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/casos-oficial/:id/timeline', async (req, res) => {
  try {
    const result = await withClient(async (client) => {
      const caso = await findCaseByAnyId(client, req.params.id);
      if (!caso) return null;
      const eventos = await listCaseEvents(client, caso.id);
      return { caso, eventos };
    });

    if (!result) {
      return res.status(404).json({ success: false, error: 'Caso não encontrado' });
    }

    res.json({
      success: true,
      caso: result.caso,
      total: result.eventos.length,
      eventos: result.eventos
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/casos-oficial/:id/status', async (req, res) => {
  try {
    const body = parseBody(caseStatusBodySchema, req, res);
    if (!body) return;
    const status = body.status || body.estado;
    const justification = body.justification || body.justificacao;

    const result = await withTransaction(async (client) => {
      const before = await findCaseByAnyId(client, req.params.id);
      if (!before) return null;
      const caso = await updateCaseStatus(client, before.id, { status, justification });
      await recordCaseStatusEvent(client, caso.id, before.status, caso.status, justification);
      return { caso, previousStatus: before.status };
    });

    if (!result) return res.status(404).json({ success: false, error: 'Caso não encontrado' });
    res.json({ success: true, caso: result.caso, previous_status: result.previousStatus });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/quick-cases', async (req, res) => {
  try {
    const body = parseBody(quickCaseBodySchema, req, res);
    if (!body) return;
    const personName = body.person_name || body.personName || body.nome || body.Nome_Completo;

    const result = await withTransaction(async (client) => {
      const caso = await createQuickCase(client, {
        personName,
        approximateAge: body.approximate_age || body.idade || body.Idade_Exacta || null,
        personSex: body.person_sex || body.sexo || body.Sexo || null,
        reporterName: body.reporter_name || body.denunciante || body.Denunciante_Nome || null,
        reporterContact: body.reporter_contact || body.contacto || body.Denunciante_Contacto || null,
        lastSeenLocation: body.last_seen_location || body.local || body.Local_Ultimo_Avistamento || null,
        lastSeenAt: body.last_seen_at || body.data_hora || null,
        latitude: body.latitude ?? body.lat ?? null,
        longitude: body.longitude ?? body.lon ?? null,
        riskLevel: body.risk_level || body.risco || 'normal',
        priority: body.priority || body.prioridade || 'urgent',
        notes: body.notes || body.observacoes || null
      });
      await recordQuickCaseEvent(client, caso);
      return { caso };
    });

    res.status(201).json({ success: true, caso: result.caso });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/casos-oficial/:id/clues', async (req, res) => {
  try {
    const result = await withClient(async (client) => {
      const caso = await findCaseByAnyId(client, req.params.id);
      if (!caso) return null;
      const pistas = await listCluesByCase(client, caso.id);
      return { caso, pistas };
    });

    if (!result) {
      return res.status(404).json({ success: false, error: 'Caso não encontrado' });
    }

    res.json({ success: true, caso: result.caso, total: result.pistas.length, pistas: result.pistas });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/casos-oficial/:id/clues', async (req, res) => {
  try {
    const body = parseBody(clueBodySchema, req, res);
    if (!body) return;
    const description = body.description || body.descricao || '';

    const latitude = parseCoordinate(body.latitude ?? body.lat, -90, 90);
    const longitude = parseCoordinate(body.longitude ?? body.lon, -180, 180);
    const cluePointWkt = buildPointWkt(latitude, longitude);

    const result = await withTransaction(async (client) => {
      const caso = await findCaseByAnyId(client, req.params.id);
      if (!caso) return null;

      const pista = await createClue(client, {
        caseId: caso.id,
        clueType: body.clue_type || body.tipo || 'observation',
        description,
        reliability: body.reliability || body.fiabilidade || 'unknown',
        cluePointWkt,
        observedAt: body.observed_at || body.observado_em || null,
        reportedBy: body.reported_by || body.reportado_por || null
      });

      await recordClueAddedEvent(client, caso.id, pista, cluePointWkt);
      return { caso, pista };
    });

    if (!result) {
      return res.status(404).json({ success: false, error: 'Caso não encontrado' });
    }

    res.status(201).json({ success: true, caso: result.caso, pista: result.pista });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/casos-oficial/:id/tasks', async (req, res) => {
  try {
    const result = await withClient(async (client) => {
      const caso = await findCaseByAnyId(client, req.params.id);
      if (!caso) return null;
      const tarefas = await listTasksByCase(client, caso.id);
      return { caso, tarefas };
    });

    if (!result) {
      return res.status(404).json({ success: false, error: 'Caso não encontrado' });
    }

    res.json({ success: true, caso: result.caso, total: result.tarefas.length, tarefas: result.tarefas });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/casos-oficial/:id/search-areas', async (req, res) => {
  try {
    const result = await withClient(async (client) => {
      const caso = await findCaseByAnyId(client, req.params.id);
      if (!caso) return null;
      const areas = await listSearchAreasByCase(client, caso.id);
      return { caso, areas };
    });

    if (!result) return res.status(404).json({ success: false, error: 'Caso não encontrado' });
    res.json({ success: true, caso: result.caso, total: result.areas.length, areas: result.areas });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/casos-oficial/:id/search-areas', async (req, res) => {
  try {
    const body = parseBody(searchAreaBodySchema, req, res);
    if (!body) return;
    const name = body.name || body.nome || '';
    const areaGeometry = body.geometry || body.geojson || body.area_geojson || null;

    const result = await withTransaction(async (client) => {
      const caso = await findCaseByAnyId(client, req.params.id);
      if (!caso) return null;
      const teamId = body.team_id || body.teamId || null;
      if (teamId) {
        const team = await findTeamById(client, teamId);
        if (!team) return { missingTeam: true };
      }

      const areaInput = {
        caseId: caso.id,
        teamId,
        name,
        status: body.status || (teamId ? 'assigned' : 'planned'),
        priority: body.priority || body.prioridade || 'routine',
        notes: body.notes || body.notas || null
      };
      const area = areaGeometry ? await createSearchAreaFromGeoJson(client, {
        ...areaInput,
        geojson: areaGeometry
      }) : await createCircularSearchArea(client, {
        ...areaInput,
        latitude: body.latitude ?? body.lat,
        longitude: body.longitude ?? body.lon,
        radiusMeters: body.radius_meters || body.radiusMeters || body.raio_metros
      });

      await recordSearchAreaEvent(client, caso.id, area, 'search_area_created', `Área de busca criada: ${area.name}`);
      return { caso, area };
    });

    if (!result) return res.status(404).json({ success: false, error: 'Caso não encontrado' });
    if (result.missingTeam) return res.status(404).json({ success: false, error: 'Equipa não encontrada' });
    res.status(201).json({ success: true, caso: result.caso, area: result.area });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/teams', async (req, res) => {
  try {
    const teams = await withClient(client => listTeams(client, { status: req.query.status || null }));
    res.json({ success: true, total: teams.length, teams });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/teams', async (req, res) => {
  try {
    const body = parseBody(teamBodySchema, req, res);
    if (!body) return;

    const team = await withTransaction(client => createTeam(client, {
      name: body.name,
      teamType: body.team_type || body.tipo || 'ground',
      contact: body.contact || body.contacto || null,
      status: body.status || 'available'
    }));

    res.status(201).json({ success: true, team });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/teams/:teamId/status', async (req, res) => {
  try {
    const body = parseBody(teamStatusBodySchema, req, res);
    if (!body) return;
    const team = await withTransaction(client => updateTeamStatus(client, req.params.teamId, body.status));
    if (!team) return res.status(404).json({ success: false, error: 'Equipa não encontrada' });
    res.json({ success: true, team });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/casos-oficial/:id/tasks', async (req, res) => {
  try {
    const body = parseBody(taskBodySchema, req, res);
    if (!body) return;
    const title = body.title || body.titulo || '';

    const latitude = parseCoordinate(body.latitude ?? body.lat, -90, 90);
    const longitude = parseCoordinate(body.longitude ?? body.lon, -180, 180);
    const taskPointWkt = buildPointWkt(latitude, longitude);

    const result = await withTransaction(async (client) => {
      const caso = await findCaseByAnyId(client, req.params.id);
      if (!caso) return null;

      const tarefa = await createTask(client, {
        caseId: caso.id,
        sourceClueId: body.source_clue_id || body.clue_id || null,
        title,
        description: body.description || body.descricao || null,
        status: body.status || 'pending',
        priority: body.priority || body.prioridade || 'routine',
        dueAt: body.due_at || body.prazo || null,
        taskPointWkt
      });

      await recordTaskEvent(client, caso.id, tarefa, 'task_created', `Tarefa criada: ${tarefa.title}`, taskPointWkt);
      return { caso, tarefa };
    });

    if (!result) {
      return res.status(404).json({ success: false, error: 'Caso não encontrado' });
    }

    res.status(201).json({ success: true, caso: result.caso, tarefa: result.tarefa });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/tasks/:taskId/status', async (req, res) => {
  try {
    const body = parseBody(taskStatusBodySchema, req, res);
    if (!body) return;
    const status = body.status || body.estado;

    const result = await withTransaction(async (client) => {
      const tarefa = await updateTaskStatus(client, req.params.taskId, {
        status,
        result: body.result || body.resultado || null
      });
      if (!tarefa) return null;

      const eventType = tarefa.status === 'completed' ? 'task_completed' : 'task_status_changed';
      const summary = tarefa.status === 'completed'
        ? `Tarefa concluída: ${tarefa.title}`
        : `Estado da tarefa atualizado: ${tarefa.title} (${tarefa.status})`;
      await recordTaskEvent(client, tarefa.case_id, tarefa, eventType, summary, buildPointWkt(tarefa.latitude, tarefa.longitude));
      return { tarefa };
    });

    if (!result) {
      return res.status(404).json({ success: false, error: 'Tarefa não encontrada' });
    }

    res.json({ success: true, tarefa: result.tarefa });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/tasks/:taskId/team', async (req, res) => {
  try {
    const body = parseBody(taskTeamBodySchema, req, res);
    if (!body) return;
    const teamId = body.team_id || body.teamId || null;

    const result = await withTransaction(async (client) => {
      const team = await findTeamById(client, teamId);
      if (!team) return { missingTeam: true };
      const tarefa = await assignTaskToTeam(client, req.params.taskId, team.id);
      if (!tarefa) return null;
      await recordTaskEvent(client, tarefa.case_id, tarefa, 'team_assigned', `Tarefa atribuída a ${team.name}: ${tarefa.title}`, buildPointWkt(tarefa.latitude, tarefa.longitude));
      return { tarefa, team };
    });

    if (!result) return res.status(404).json({ success: false, error: 'Tarefa não encontrada' });
    if (result.missingTeam) return res.status(404).json({ success: false, error: 'Equipa não encontrada' });
    res.json({ success: true, tarefa: result.tarefa, team: result.team });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/search-areas/:areaId/status', async (req, res) => {
  try {
    const body = parseBody(searchAreaStatusBodySchema, req, res);
    if (!body) return;
    const status = body.status || body.estado;

    const result = await withTransaction(async (client) => {
      const area = await updateSearchAreaStatus(client, req.params.areaId, status);
      if (!area) return null;
      const eventType = area.status === 'searched' ? 'search_area_completed' : 'search_area_status_changed';
      const summary = area.status === 'searched'
        ? `Área de busca pesquisada: ${area.name}`
        : `Estado da área atualizado: ${area.name} (${area.status})`;
      await recordSearchAreaEvent(client, area.case_id, area, eventType, summary);
      return { area };
    });

    if (!result) return res.status(404).json({ success: false, error: 'Área não encontrada' });
    res.json({ success: true, area: result.area });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/search-areas/:areaId/geometry', async (req, res) => {
  try {
    const body = parseBody(searchAreaGeometryBodySchema, req, res);
    if (!body) return;
    const geometry = body.geometry || body.geojson || body.area_geojson || null;

    const result = await withTransaction(async (client) => {
      const area = await updateSearchAreaGeometry(client, req.params.areaId, geometry);
      if (!area) return null;
      await recordSearchAreaEvent(client, area.case_id, area, 'search_area_geometry_updated', `Geometria da área atualizada: ${area.name}`);
      return { area };
    });

    if (!result) return res.status(404).json({ success: false, error: 'Área não encontrada' });
    res.json({ success: true, area: result.area });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/search-areas/:areaId', async (req, res) => {
  try {
    const result = await withTransaction(async (client) => {
      const area = await deleteSearchArea(client, req.params.areaId);
      if (!area) return null;
      await recordSearchAreaEvent(client, area.case_id, area, 'search_area_deleted', `Área de busca apagada: ${area.name}`);
      return { area };
    });

    if (!result) return res.status(404).json({ success: false, error: 'Área não encontrada' });
    res.json({ success: true, area: result.area });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/casos-oficial/:id/tracks', async (req, res) => {
  try {
    const result = await withClient(async (client) => {
      const caso = await findCaseByAnyId(client, req.params.id);
      if (!caso) return null;
      const tracks = await listSearchTracksByCase(client, caso.id);
      return { caso, tracks };
    });

    if (!result) return res.status(404).json({ success: false, error: 'Caso não encontrado' });
    res.json({ success: true, caso: result.caso, total: result.tracks.length, tracks: result.tracks });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/casos-oficial/:id/tracks', async (req, res) => {
  try {
    const body = req.body || {};
    const geometry = body.geometry || body.geojson || (body.points ? buildLineStringGeoJsonFromPoints(body.points) : null);
    if (!geometry) return res.status(400).json({ success: false, error: 'Geometry LineString ou points são obrigatórios' });

    const result = await withTransaction(async (client) => {
      const caso = await findCaseByAnyId(client, req.params.id);
      if (!caso) return null;
      const teamId = body.team_id || body.teamId || null;
      if (teamId) {
        const team = await findTeamById(client, teamId);
        if (!team) return { missingTeam: true };
      }
      const track = await createSearchTrackFromGeoJson(client, {
        caseId: caso.id,
        teamId,
        source: body.source || 'manual_map',
        geojson: geometry,
        startedAt: body.started_at || null,
        endedAt: body.ended_at || null,
        metadata: {
          name: body.name || body.nome || 'Trilho operacional',
          notes: body.notes || body.notas || null
        }
      });
      await recordTrackEvent(client, caso.id, track, 'track_created', `Trilho registado: ${track.metadata?.name || track.id}`);
      return { caso, track };
    });

    if (!result) return res.status(404).json({ success: false, error: 'Caso não encontrado' });
    if (result.missingTeam) return res.status(404).json({ success: false, error: 'Equipa não encontrada' });
    res.status(201).json({ success: true, caso: result.caso, track: result.track });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/casos-oficial/:id/gis/export', async (req, res) => {
  try {
    const format = String(req.query.format || 'geojson').toLowerCase();
    if (!['geojson', 'json', 'kml', 'gpx'].includes(format)) {
      return res.status(400).json({ success: false, error: 'Formato GIS inválido. Use geojson, kml ou gpx.' });
    }

    const result = await withClient(async (client) => {
      const caso = await findCaseByAnyId(client, req.params.id);
      if (!caso) return null;
      const areas = await listSearchAreasByCase(client, caso.id);
      const pistas = await listCluesByCase(client, caso.id);
      const tarefas = await listTasksByCase(client, caso.id);
      const tracks = await listSearchTracksByCase(client, caso.id);
      return { caso, featureCollection: buildCaseFeatureCollection(caso, { areas, clues: pistas, tasks: tarefas, tracks }) };
    });

    if (!result) return res.status(404).json({ success: false, error: 'Caso não encontrado' });

    const exportFormat = format === 'json' ? 'geojson' : format;
    const metadata = getExportMetadata(exportFormat, result.caso);
    res.setHeader('Content-Type', metadata.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${metadata.filename}"`);

    if (exportFormat === 'kml') return res.send(featureCollectionToKml(result.featureCollection));
    if (exportFormat === 'gpx') return res.send(featureCollectionToGpx(result.featureCollection));
    return res.send(JSON.stringify(result.featureCollection, null, 2));
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/casos-oficial/:id/gis/import', async (req, res) => {
  try {
    const body = req.body || {};
    const format = String(body.format || req.query.format || 'geojson').toLowerCase();
    if (!['geojson', 'json'].includes(format)) {
      return res.status(400).json({ success: false, error: 'Nesta fase, a importação suporta GeoJSON.' });
    }
    const geojson = body.geojson || body.geometry || body.featureCollection || body;
    const areaImports = extractSearchAreaImports(geojson);
    if (areaImports.length === 0) return res.status(400).json({ success: false, error: 'GeoJSON sem polígonos importáveis para áreas de busca' });

    const result = await withTransaction(async (client) => {
      const caso = await findCaseByAnyId(client, req.params.id);
      if (!caso) return null;
      const imported = [];
      for (const areaImport of areaImports) {
        const area = await createSearchAreaFromGeoJson(client, {
          caseId: caso.id,
          name: areaImport.name,
          status: areaImport.status,
          priority: areaImport.priority,
          geojson: areaImport.geojson,
          notes: areaImport.notes
        });
        await recordSearchAreaEvent(client, caso.id, area, 'search_area_created', `Área importada via GeoJSON: ${area.name}`);
        imported.push(area);
      }
      return { caso, imported };
    });

    if (!result) return res.status(404).json({ success: false, error: 'Caso não encontrado' });
    res.status(201).json({ success: true, caso: result.caso, total: result.imported.length, areas: result.imported });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

async function recordClueAddedEvent(client, caseId, pista, cluePointWkt) {
  const { recordCaseEvent } = require('./db/caseEventRepository');
  return recordCaseEvent(client, {
    caseId,
    eventType: 'clue_added',
    summary: `Pista registada: ${pista.description}`,
    payload: {
      clue_id: pista.id,
      clue_type: pista.clue_type,
      description: pista.description,
      reliability: pista.reliability,
      observed_at: pista.observed_at,
      reported_by: pista.reported_by
    },
    eventPointWkt: cluePointWkt,
    eventAt: pista.observed_at || null
  });
}

async function recordTaskEvent(client, caseId, tarefa, eventType, summary, taskPointWkt) {
  const { recordCaseEvent } = require('./db/caseEventRepository');
  return recordCaseEvent(client, {
    caseId,
    eventType,
    summary,
    payload: {
      task_id: tarefa.id,
      source_clue_id: tarefa.source_clue_id || null,
      team_id: tarefa.team_id || null,
      team_name: tarefa.team_name || null,
      title: tarefa.title,
      description: tarefa.description,
      status: tarefa.status,
      priority: tarefa.priority,
      due_at: tarefa.due_at,
      result: tarefa.result
    },
    eventPointWkt: taskPointWkt,
    eventAt: null
  });
}

async function recordSearchAreaEvent(client, caseId, area, eventType, summary) {
  const { recordCaseEvent } = require('./db/caseEventRepository');
  return recordCaseEvent(client, {
    caseId,
    eventType,
    summary,
    payload: {
      search_area_id: area.id,
      name: area.name,
      status: area.status,
      priority: area.priority,
      team_id: area.team_id || null,
      team_name: area.team_name || null,
      area_m2: area.area_m2,
      centroid_latitude: area.centroid_latitude,
      centroid_longitude: area.centroid_longitude
    },
    eventPointWkt: area.centroid_latitude && area.centroid_longitude ? buildPointWkt(area.centroid_latitude, area.centroid_longitude) : null,
    eventAt: null
  });
}

async function recordCaseStatusEvent(client, caseId, previousStatus, nextStatus, justification) {
  const { recordCaseEvent } = require('./db/caseEventRepository');
  return recordCaseEvent(client, {
    caseId,
    eventType: 'case_status_changed',
    summary: `Estado operacional alterado: ${previousStatus} -> ${nextStatus}`,
    payload: { previous_status: previousStatus, status: nextStatus, justification },
    eventPointWkt: null,
    eventAt: null
  });
}

async function recordQuickCaseEvent(client, caso) {
  const { recordCaseEvent } = require('./db/caseEventRepository');
  return recordCaseEvent(client, {
    caseId: caso.id,
    eventType: 'quick_case_created',
    summary: `Registo rápido SAR criado: ${caso.person_name}`,
    payload: {
      case_id: caso.id,
      person_name: caso.person_name,
      status: caso.status,
      priority: caso.priority,
      risk_level: caso.risk_level,
      last_seen_location: caso.last_seen_location
    },
    eventPointWkt: buildPointWkt(caso.latitude, caso.longitude),
    eventAt: null
  });
}

async function recordTrackEvent(client, caseId, track, eventType, summary) {
  const { recordCaseEvent } = require('./db/caseEventRepository');
  return recordCaseEvent(client, {
    caseId,
    eventType,
    summary,
    payload: {
      track_id: track.id,
      team_id: track.team_id || null,
      team_name: track.team_name || null,
      source: track.source,
      distance_meters: track.distance_meters,
      started_at: track.started_at,
      ended_at: track.ended_at,
      metadata: track.metadata || {}
    },
    eventPointWkt: null,
    eventAt: track.started_at || null
  });
}

router.get('/estatisticas-oficial', async (req, res) => {
  try {
    const estatisticas = await withClient(client => getCaseStatistics(client));
    res.json({ success: true, estatisticas });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/comparar-csv', async (req, res) => {
  try {
    const csvRows = fs.existsSync(CSV_FILE_OFFICIAL)
      ? parseCsvFile(CSV_FILE_OFFICIAL, { columns: true, skip_empty_lines: true, trim: true })
      : [];
    const dbCases = await withClient(client => listCases(client, { limit: 10000, offset: 0 }));
    res.json({ success: true, comparacao: compareCsvAndDb(csvRows, dbCases) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
module.exports.compareCsvAndDb = compareCsvAndDb;
module.exports.recordClueAddedEvent = recordClueAddedEvent;
module.exports.recordTaskEvent = recordTaskEvent;
module.exports.recordSearchAreaEvent = recordSearchAreaEvent;
module.exports.recordTrackEvent = recordTrackEvent;
module.exports.recordCaseStatusEvent = recordCaseStatusEvent;
module.exports.recordQuickCaseEvent = recordQuickCaseEvent;
