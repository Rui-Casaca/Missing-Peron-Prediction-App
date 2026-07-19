const OUTBOX_KEY = 'sar_offline_outbox';
const DEVICE_KEY = 'sar_device_id';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_KEY);
  if (!deviceId) {
    deviceId = (crypto && crypto.randomUUID) ? crypto.randomUUID() : `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, deviceId);
  }
  return deviceId;
}

export function getOutbox() {
  return readJson(OUTBOX_KEY, []);
}

export function getPendingCount() {
  return getOutbox().length;
}

export function enqueueOperation({ entityType, operationType = 'create', payload }) {
  const operation = {
    client_operation_id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    source_device_id: getDeviceId(),
    entity_type: entityType,
    operation_type: operationType,
    payload,
    queued_at: new Date().toISOString()
  };
  const outbox = getOutbox();
  outbox.push(operation);
  writeJson(OUTBOX_KEY, outbox);
  window.dispatchEvent(new Event('sar-outbox-changed'));
  return operation;
}

export async function flushOutbox() {
  const outbox = getOutbox();
  if (outbox.length === 0) return { success: true, total: 0, synced: 0 };

  const token = localStorage.getItem('auth_token');
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch('/api/sync/push', {
    method: 'POST',
    headers,
    body: JSON.stringify({ operations: outbox })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);

  const completed = new Set((data.results || [])
    .filter(result => result.operation && ['applied', 'failed'].includes(result.operation.status))
    .map(result => result.operation.client_operation_id));
  const remaining = outbox.filter(operation => !completed.has(operation.client_operation_id));
  writeJson(OUTBOX_KEY, remaining);
  window.dispatchEvent(new Event('sar-outbox-changed'));
  return { ...data, synced: completed.size, remaining: remaining.length };
}
