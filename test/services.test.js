const test = require('node:test');
const assert = require('node:assert/strict');
const runtime = require('./support/runtime')();
const sensors = require('../src/modules/sensors');
const system = require('../src/modules/system');
const db = require('../src/shared/db');
const sseHub = require('../src/shared/events/sseHub');
const scheduler = require('../src/scheduler');

const reading = { deviceId: 'greenhouse-01', co2: 800, temperature: 27.5, humidity: 85 };
const decision = {
  mode: 'live', situation: 'MISTING', reasons: ['humidity_low'],
  targets: { mister: 'on' },
  smoothed: { co2: 800, temperature: 27, humidity: 78 },
  classification: { co2: 'normal', temperature: 'normal', humidity: 'low' },
};

test.beforeEach(() => {
  for (const table of ['readings', 'control_decisions', 'actuator_events', 'plug_status']) {
    db.exec(`DELETE FROM ${table}`);
  }
});
test.after(() => runtime.cleanup());

test('empty sensor history returns null, empty lists and zero samples', () => {
  assert.equal(sensors.getLatestWithStatus(), null);
  assert.deepEqual(sensors.getHistory(24), []);
  assert.deepEqual(sensors.getChartSeries(24), []);
  assert.deepEqual(sensors.getRecent(5), []);
  assert.equal(sensors.getStats(24).count, 0);
});

test('recordReading persists input, enriches status and returns the latest reading', () => {
  const stored = sensors.recordReading(reading);
  assert.ok(Number.isInteger(stored.id));
  assert.equal(stored.deviceId, reading.deviceId);
  assert.equal(stored.temperature, 27.5);
  assert.ok(Number.isFinite(Date.parse(stored.createdAt)));
  assert.deepEqual(stored.status, { co2: 'normal', temperature: 'normal', humidity: 'normal' });
  assert.deepEqual(sensors.getLatestWithStatus(), { ...stored, online: true });
  const alert = sensors.recordReading({ ...reading, co2: 1501, temperature: 21, humidity: 96 });
  assert.deepEqual(alert.status, { co2: 'high', temperature: 'low', humidity: 'high' });
});

test('online status includes the exact freshness boundary and excludes older readings', (t) => {
  const now = Date.now();
  t.mock.method(Date, 'now', () => now);
  assert.equal(sensors.isOnline(null), false);
  assert.equal(sensors.isOnline({ createdAt: new Date(now - 60000).toISOString() }), true);
  assert.equal(sensors.isOnline({ createdAt: new Date(now - 60001).toISOString() }), false);
  const stored = sensors.recordReading(reading);
  db.prepare('UPDATE readings SET created_at = ? WHERE id = ?')
    .run(new Date(now - 60001).toISOString(), stored.id);
  assert.equal(sensors.getLatestWithStatus().online, false);
});

test('history filters by age while recent readings keep newest-first order and limit', () => {
  const old = sensors.recordReading(reading);
  db.prepare('UPDATE readings SET created_at = ? WHERE id = ?')
    .run(new Date(Date.now() - 25 * 3600000).toISOString(), old.id);
  const first = sensors.recordReading({ ...reading, co2: 900 });
  const second = sensors.recordReading({ ...reading, co2: 1100 });
  assert.deepEqual(sensors.getHistory(24).map((r) => r.id), [first.id, second.id]);
  assert.deepEqual(sensors.getRecent(2).map((r) => r.id), [second.id, first.id]);
  assert.equal(sensors.getHistory(24)[1].status.co2, 'high');
});

test('statistics and chart buckets retain averages, rounding and sample counts', () => {
  const bucketStart = Math.floor((Date.now() - 600000) / 300000) * 300000;
  for (const [offset, co2, temperature, humidity] of [[1000, 800, 26, 80], [2000, 1000, 29, 90], [301000, 1200, 30, 95]]) {
    const stored = sensors.recordReading({ ...reading, co2, temperature, humidity });
    db.prepare('UPDATE readings SET created_at = ? WHERE id = ?')
      .run(new Date(bucketStart + offset).toISOString(), stored.id);
  }
  const stats = sensors.getStats(24);
  assert.equal(stats.count, 3);
  assert.equal(stats.minCo2, 800);
  assert.equal(stats.maxCo2, 1200);
  assert.equal(stats.avgCo2, 1000);
  assert.equal(stats.avgTemperature, 28.3);
  assert.equal(stats.avgHumidity, 88.3);
  const series = sensors.getChartSeries(24);
  assert.deepEqual(series.map((p) => ({ co2: p.co2, temperature: p.temperature, humidity: p.humidity, n: p.n })), [
    { co2: 900, temperature: 27.5, humidity: 85, n: 2 },
    { co2: 1200, temperature: 30, humidity: 95, n: 1 },
  ]);
  assert.equal(Date.parse(series[0].t), bucketStart);
  assert.equal(sensors.CHART_BUCKET_SECONDS, 300);
});

test('reading broadcasts are throttled while every reading remains stored', (t) => {
  let now = Date.now() + 1000000;
  t.mock.method(Date, 'now', () => now);
  const messages = [];
  const client = { write: (message) => messages.push(message) };
  sseHub.addClient(client);
  t.after(() => sseHub.removeClient(client));
  sensors.recordReading(reading);
  now += 4999;
  sensors.recordReading(reading);
  now += 1;
  sensors.recordReading(reading);
  assert.equal(sensors.getStats(24).count, 3);
  assert.equal(messages.length, 2);
  assert.match(messages[0], /^event: reading\ndata: /);
  const payload = JSON.parse(messages[0].split('\n')[1].slice(6));
  assert.equal(payload.online, true);
  assert.equal(payload.deviceId, reading.deviceId);
});

test('unknown plugs have a complete fallback and unchanged states retain changedAt', (t) => {
  assert.deepEqual(system.getPlugs(), ['mister'].map((device) => ({
    device, state: 'unknown', reachable: false, error: null, reportedAt: null, changedAt: null,
  })));
  const past = '2020-01-01T00:00:00.000Z';
  system.recordPlugStatus('mister', { state: 'off', reachable: true });
  db.prepare('UPDATE plug_status SET reported_at = ?, changed_at = ? WHERE device = ?').run(past, past, 'mister');
  const messages = [];
  const client = { write: (message) => messages.push(message) };
  sseHub.addClient(client);
  t.after(() => sseHub.removeClient(client));
  const same = system.recordPlugStatus('mister', { state: 'off', reachable: false, error: 'timeout' });
  assert.equal(same.changedAt, past);
  assert.notEqual(same.reportedAt, past);
  assert.equal(same.reachable, false);
  assert.equal(same.error, 'timeout');
  const changed = system.recordPlugStatus('mister', { state: 'on', reachable: true });
  assert.equal(changed.changedAt, changed.reportedAt);
  assert.equal(changed.error, null);
  assert.deepEqual(system.getPlugs()[0], changed);
  assert.match(messages[0], /^event: plug\ndata: /);
});

test('decisions and actuator outcomes preserve JSON, booleans, latest state and events', (t) => {
  const messages = [];
  const client = { write: (message) => messages.push(message) };
  sseHub.addClient(client);
  t.after(() => sseHub.removeClient(client));
  system.recordDecision(decision);
  const saved = system.getRecentDecisions(24, 1)[0];
  for (const key of ['mode', 'situation', 'reasons', 'smoothed', 'classification']) {
    assert.deepEqual(saved[key], decision[key]);
  }
  assert.equal(saved.misterTarget, 'on');
  system.recordActuatorEvent({ device: 'mister', state: 'on', online: true, lastCmdId: 'cmd-1' });
  system.recordActuatorEvent({ device: 'mister', state: 'off', online: false, lastError: { code: 'apply_failed', message: 'timeout' } });
  const latest = system.getActuators();
  assert.equal(latest.length, 1);
  assert.equal(latest[0].state, 'off');
  assert.equal(latest[0].online, false);
  assert.equal(latest[0].errorCode, 'apply_failed');
  assert.equal(system.getRecentActuatorEvents(24, 1).length, 1);
  assert.deepEqual(messages.map((m) => m.split('\n')[0]), ['event: control', 'event: actuator', 'event: actuator']);
});

test('retention removes expired history from all modules and preserves current plug state', () => {
  sensors.recordReading(reading);
  system.recordDecision(decision);
  system.recordActuatorEvent({ device: 'mister', state: 'on', online: true });
  system.recordPlugStatus('mister', { state: 'on', reachable: true });
  const expired = new Date(Date.now() - 31 * 86400000).toISOString();
  for (const table of ['readings', 'control_decisions', 'actuator_events']) {
    db.prepare(`UPDATE ${table} SET created_at = ?`).run(expired);
  }
  const current = sensors.recordReading(reading);
  system.recordDecision({ ...decision, situation: 'normal' });
  system.recordActuatorEvent({ device: 'mister', state: 'off', online: true });
  scheduler.pruneOldData();
  assert.deepEqual(sensors.getRecent(10).map((r) => r.id), [current.id]);
  assert.equal(system.getRecentDecisions(168).length, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM control_decisions').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM actuator_events').get().n, 1);
  assert.equal(system.getActuators()[0].state, 'off');
  assert.equal(system.getPlugs()[0].state, 'on');
});

test('SSE heartbeat and disconnect preserve the existing event protocol', () => {
  const messages = [];
  const client = { write: (message) => messages.push(message) };
  sseHub.addClient(client);
  sseHub.heartbeat();
  sseHub.removeClient(client);
  sseHub.broadcast('reading', {});
  assert.deepEqual(messages, [': heartbeat\n\n']);
});
