const test = require('node:test');
const assert = require('node:assert/strict');
const runtime = require('./support/runtime')();
const app = require('../src/app');
const db = require('../src/shared/db');

let base;
const reading = { deviceId: 'greenhouse-01', co2: 800, temperature: 27.5, humidity: 85 };
const decision = {
  situation: 'hot', reasons: ['temperature_high'], targets: { fan: 'on', mister: 'off' },
  changed: { fan: true, mister: false }, outcomes: { fan: { applied: true } },
};

test.before(async () => {
  base = await runtime.listen(app);
});
test.beforeEach(() => {
  for (const table of ['readings', 'control_decisions', 'actuator_events', 'plug_status']) db.exec(`DELETE FROM ${table}`);
});
test.after(() => runtime.cleanup());

async function request(path, body, key = 'test-only-key') {
  const options = body === undefined ? {} : {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key === null ? {} : { 'x-api-key': key }) },
    body: JSON.stringify(body),
  };
  const response = await fetch(base + path, options);
  return { status: response.status, body: await response.json() };
}

test('empty APIs retain their existing response shapes', async () => {
  assert.deepEqual(await request('/api/sensors/latest'), { status: 404, body: { error: 'No readings yet' } });
  assert.deepEqual((await request('/api/sensors/history')).body, { hours: 24, readings: [] });
  assert.deepEqual((await request('/api/system/decisions')).body, { hours: 24, decisions: [] });
  assert.deepEqual((await request('/api/system/actuators')).body, { actuators: [] });
  const { body } = await request('/api/system/plugs');
  assert.deepEqual(body.plugs.map((p) => p.state), ['unknown', 'unknown']);
});

test('all device write endpoints reject missing, wrong and multibyte API keys', async () => {
  for (const path of ['/api/sensors/readings', '/api/system/decisions', '/api/system/plugs']) {
    for (const key of [null, 'wrong', 'é'.repeat(13)]) {
      const result = await request(path, {}, key);
      assert.equal(result.status, 401);
      assert.equal(result.body.error, 'Unauthorized: missing or invalid X-API-Key');
    }
  }
});

test('invalid device payloads return validation errors without writing any rows', async () => {
  for (const path of ['/api/sensors/readings', '/api/system/decisions', '/api/system/plugs']) {
    const result = await request(path, {});
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'Invalid payload');
    assert.ok(result.body.details.fieldErrors);
  }
  for (const table of ['readings', 'control_decisions', 'actuator_events', 'plug_status']) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0);
  }
});

test('reading ingest, latest and history preserve values, classifications and device defaults', async () => {
  const created = await request('/api/sensors/readings', reading);
  assert.equal(created.status, 201);
  assert.equal(created.body.deviceId, reading.deviceId);
  assert.equal(created.body.temperature, 27.5);
  assert.deepEqual(created.body.status, { co2: 'normal', temperature: 'normal', humidity: 'normal' });
  const latest = await request('/api/sensors/latest');
  assert.deepEqual(latest.body, { ...created.body, online: true, deviceOfflineSeconds: 60 });
  const history = await request('/api/sensors/history?hours=24');
  assert.deepEqual(history.body.readings, [created.body]);
  const defaultDevice = await request('/api/sensors/readings', { co2: 1600, temperature: 31, humidity: 79 });
  assert.equal(defaultDevice.body.deviceId, 'esp32-scd40-01');
  assert.deepEqual(defaultDevice.body.status, { co2: 'high', temperature: 'high', humidity: 'low' });
});

test('history and decision queries keep their default and clamped time ranges', async () => {
  for (const path of ['/api/sensors/history', '/api/system/decisions']) {
    for (const [input, expected] of [['-2', 1], ['999', 168], ['0', 24], ['invalid', 24], ['12', 12]]) {
      assert.equal((await request(`${path}?hours=${input}`)).body.hours, expected);
    }
  }
});

test('decision reports persist targets and only record changed actuator outcomes', async () => {
  assert.deepEqual(await request('/api/system/decisions', decision), { status: 202, body: { status: 'recorded' } });
  const saved = (await request('/api/system/decisions')).body.decisions[0];
  assert.equal(saved.mode, 'live');
  assert.equal(saved.situation, 'hot');
  assert.deepEqual(saved.reasons, ['temperature_high']);
  assert.equal(saved.fanTarget, 'on');
  assert.equal(saved.smoothed, null);
  const actuators = (await request('/api/system/actuators')).body.actuators;
  assert.equal(actuators.length, 1);
  assert.equal(actuators[0].device, 'fan');
  assert.equal(actuators[0].online, true);
  assert.equal(actuators[0].errorCode, null);
});

test('missing actuator outcomes preserve the apply_failed fallback', async () => {
  const input = { ...decision, changed: { fan: false, mister: true }, outcomes: {} };
  assert.equal((await request('/api/system/decisions', input)).status, 202);
  const [actuator] = (await request('/api/system/actuators')).body.actuators;
  assert.equal(actuator.device, 'mister');
  assert.equal(actuator.online, false);
  assert.equal(actuator.errorCode, 'apply_failed');
  assert.equal(actuator.errorMessage, 'missing_outcome');
});

test('plug reports persist both device states and appear on the dashboard', async () => {
  const payload = { fan: { state: 'on', reachable: true }, mister: { state: 'off', reachable: false, error: 'timeout' } };
  const result = await request('/api/system/plugs', payload);
  assert.equal(result.status, 202);
  assert.equal(result.body.plugs[0].state, 'on');
  assert.equal(result.body.plugs[1].error, 'timeout');
  assert.deepEqual((await request('/api/system/plugs')).body, result.body);
  const page = await fetch(base + '/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /ปลั๊กเปิดอยู่/);
});

test('SSE streams uncompressed plug updates using the existing event names and payload', { timeout: 5000 }, async (t) => {
  const abort = new AbortController();
  t.after(() => abort.abort());
  const response = await fetch(base + '/api/sensors/events', { signal: abort.signal, headers: { 'accept-encoding': 'gzip' } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  assert.equal(response.headers.get('content-encoding'), null);
  assert.equal(response.headers.get('x-accel-buffering'), 'no');
  const reader = response.body.getReader();
  const report = await request('/api/system/plugs', {
    fan: { state: 'on', reachable: true }, mister: { state: 'off', reachable: true },
  });
  let data = '';
  while (!data.includes('\n\n')) {
    const chunk = await reader.read();
    assert.equal(chunk.done, false);
    data += new TextDecoder().decode(chunk.value);
  }
  assert.match(data, /event: plug\ndata: /);
  const payload = JSON.parse(data.split('\n').find((line) => line.startsWith('data: ')).slice(6));
  assert.deepEqual(payload, report.body.plugs[0]);
  abort.abort();
});
