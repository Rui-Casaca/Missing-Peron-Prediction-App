const express = require('express');

const { withClient, withTransaction } = require('./db');
const { buildPointWkt } = require('./db/caseMapper');
const { createQuickCase, listCases } = require('./db/caseRepository');
const { recordCaseEvent } = require('./db/caseEventRepository');
const { parseBody } = require('./validation/request');
const { syncPushBodySchema } = require('./validation/schemas');

const router = express.Router();

function normalizeSyncOperation(input) {
  const operation = input || {};
  return {
    clientOperationId: operation.client_operation_id || operation.clientOperationId || operation.id,
    sourceDeviceId: operation.source_device_id || operation.sourceDeviceId || operation.device_id || 'unknown-device',
    entityType: operation.entity_type || operation.entityType,
    operationType: operation.operation_type || operation.operationType || 'create',
    payload: operation.payload || {}
  };
}

async function findExistingOperation(client, clientOperationId) {
  const result = await client.query(`
    SELECT id, client_operation_id, source_device_id, entity_type, entity_id, operation_type, status, payload, error, applied_at, created_at
    FROM sync_operations
    WHERE client_operation_id = $1
    LIMIT 1
  `, [clientOperationId]);
  return result.rows[0] || null;
}

async function insertSyncOperation(client, operation, { status, entityId = null, error = null }) {
  const result = await client.query(`
    INSERT INTO sync_operations (
      client_operation_id,
      source_device_id,
      entity_type,
      entity_id,
      operation_type,
      status,
      payload,
      error,
      applied_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, CASE WHEN $6 = 'applied' THEN now() ELSE NULL END)
    RETURNING id, client_operation_id, source_device_id, entity_type, entity_id, operation_type, status, payload, error, applied_at, created_at
  `, [
    operation.clientOperationId,
    operation.sourceDeviceId,
    operation.entityType,
    entityId,
    operation.operationType,
    status,
    JSON.stringify(operation.payload || {}),
    error
  ]);
  return result.rows[0];
}

async function recordOfflineQuickCaseEvent(client, caso, operation) {
  return recordCaseEvent(client, {
    caseId: caso.id,
    eventType: 'quick_case_created',
    summary: `Registo rápido SAR criado offline: ${caso.person_name}`,
    payload: {
      case_id: caso.id,
      person_name: caso.person_name,
      status: caso.status,
      priority: caso.priority,
      risk_level: caso.risk_level,
      source_device_id: operation.sourceDeviceId
    },
    eventPointWkt: buildPointWkt(caso.latitude, caso.longitude),
    sourceDeviceId: operation.sourceDeviceId,
    offlineOperationId: operation.clientOperationId
  });
}

async function applySyncOperation(client, rawOperation) {
  const operation = normalizeSyncOperation(rawOperation);
  if (!operation.clientOperationId) throw new Error('client_operation_id é obrigatório');
  if (!operation.entityType) throw new Error('entity_type é obrigatório');

  const existing = await findExistingOperation(client, operation.clientOperationId);
  if (existing) return { idempotent: true, operation: existing };

  if (operation.entityType === 'quick_case' && operation.operationType === 'create') {
    const caso = await createQuickCase(client, {
      personName: operation.payload.person_name || operation.payload.personName || operation.payload.nome,
      approximateAge: operation.payload.approximate_age || operation.payload.idade || null,
      personSex: operation.payload.person_sex || operation.payload.sexo || null,
      reporterName: operation.payload.reporter_name || operation.payload.denunciante || null,
      reporterContact: operation.payload.reporter_contact || operation.payload.contacto || null,
      lastSeenLocation: operation.payload.last_seen_location || operation.payload.local || null,
      lastSeenAt: operation.payload.last_seen_at || null,
      latitude: operation.payload.latitude ?? operation.payload.lat ?? null,
      longitude: operation.payload.longitude ?? operation.payload.lon ?? null,
      riskLevel: operation.payload.risk_level || 'normal',
      priority: operation.payload.priority || 'urgent',
      notes: operation.payload.notes || null
    });
    await recordOfflineQuickCaseEvent(client, caso, operation);
    const syncOperation = await insertSyncOperation(client, operation, { status: 'applied', entityId: caso.id });
    return { idempotent: false, operation: syncOperation, entity: caso };
  }

  const failedOperation = await insertSyncOperation(client, operation, {
    status: 'failed',
    error: `Operação offline não suportada: ${operation.entityType}/${operation.operationType}`
  });
  return { idempotent: false, operation: failedOperation };
}

router.post('/push', async (req, res) => {
  try {
    const body = parseBody(syncPushBodySchema, req, res);
    if (!body) return;
    const operations = body.operations;

    const results = await withTransaction(async (client) => {
      const applied = [];
      for (const operation of operations) {
        applied.push(await applySyncOperation(client, operation));
      }
      return applied;
    });

    res.json({ success: true, total: results.length, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/pull', async (req, res) => {
  try {
    const since = req.query.since ? new Date(String(req.query.since)) : null;
    const validSince = since && !Number.isNaN(since.getTime()) ? since.toISOString() : null;
    const casos = await withClient(async (client) => {
      if (!validSince) return listCases(client, { limit: 200, offset: 0 });
      const result = await client.query(`
        SELECT
          id,
          official_case_number,
          legacy_csv_id,
          status,
          priority,
          risk_level,
          person_name,
          person_age,
          person_sex,
          disappearance_type,
          last_seen_at,
          last_seen_location,
          freguesia,
          concelho,
          ST_Y(last_seen_point) AS latitude,
          ST_X(last_seen_point) AS longitude,
          found_at,
          found_location,
          ST_Y(found_point) AS found_latitude,
          ST_X(found_point) AS found_longitude,
          official_payload,
          created_at,
          updated_at,
          synced_at
        FROM cases
        WHERE updated_at > $1::timestamptz OR created_at > $1::timestamptz
        ORDER BY updated_at ASC, created_at ASC
        LIMIT 200
      `, [validSince]);
      return result.rows;
    });
    res.json({ success: true, cursor: new Date().toISOString(), casos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/status', async (_req, res) => {
  try {
    const status = await withClient(async (client) => {
      const result = await client.query(`
        SELECT status, count(*)::int AS count
        FROM sync_operations
        GROUP BY status
        ORDER BY status
      `);
      return result.rows.reduce((acc, row) => ({ ...acc, [row.status]: row.count }), {});
    });
    res.json({ success: true, status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
module.exports.applySyncOperation = applySyncOperation;
module.exports.normalizeSyncOperation = normalizeSyncOperation;
