const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const runtime = require('./support/runtime')();

const children = new Set();

async function startServer() {
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production', LOG_LEVEL: 'info' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  let output = '';
  child.stderr.on('data', (data) => { output += data; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not start: ${output}`)), 5000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited (${code}): ${output}`)); });
    child.stdout.on('data', (data) => {
      output += data;
      if (output.includes(`server listening on port ${port}`)) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  return {
    base: `http://127.0.0.1:${port}`,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const [code, signal] = await exited;
      assert.equal(code, 0, output);
      assert.equal(signal, null);
      assert.match(output, /Server closed\. Bye\./);
    },
  };
}

test.after(async () => {
  for (const child of children) {
    const exited = once(child, 'exit');
    child.kill('SIGKILL');
    await exited;
  }
  await runtime.cleanup();
});

test('production server shuts down with SSE open and reloads persisted data after restart', { timeout: 15000 }, async (t) => {
  let server = await startServer();
  assert.equal((await fetch(server.base + '/healthz')).status, 200);
  const post = async (endpoint, payload) => {
    const response = await fetch(server.base + endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'test-only-key' }, body: JSON.stringify(payload),
    });
    return { status: response.status, body: await response.json() };
  };
  const reading = await post('/api/sensors/readings', { co2: 850, temperature: 28, humidity: 86 });
  assert.equal(reading.status, 201);
  const plugs = await post('/api/system/plugs', { fan: { state: 'on', reachable: true }, mister: { state: 'off', reachable: true } });
  assert.equal(plugs.status, 202);
  assert.equal((await post('/api/system/decisions', {
    situation: 'normal', targets: { fan: 'off', mister: 'off' }, changed: {},
  })).status, 202);
  const abort = new AbortController();
  t.after(() => abort.abort());
  const stream = await fetch(server.base + '/api/sensors/events', { signal: abort.signal });
  const reader = stream.body.getReader();
  await reader.read();
  await server.stop();
  assert.equal((await reader.read()).done, true);

  server = await startServer();
  const latest = await (await fetch(server.base + '/api/sensors/latest')).json();
  assert.equal(latest.id, reading.body.id);
  assert.equal(latest.co2, 850);
  const restoredPlugs = await (await fetch(server.base + '/api/system/plugs')).json();
  assert.deepEqual(restoredPlugs, plugs.body);
  const decisions = await (await fetch(server.base + '/api/system/decisions')).json();
  assert.equal(decisions.decisions.length, 1);
  assert.equal(decisions.decisions[0].situation, 'normal');
  await server.stop();
});
