// Smoke test: เปิดแอปบน DB ชั่วคราว แล้วยิงทุกหน้าหลักตรวจสถานะ + องค์ประกอบสำคัญ (a11y/SEO/ไม่พึ่ง CDN)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mushroom-test-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.DEVICE_API_KEY = 'test-only-key';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.SITE_URL = 'https://example.test';

const app = require('../src/app');

let server;
let base;

test.before(async () => {
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function get(p, opts) {
  const res = await fetch(base + p, { redirect: 'manual', ...opts });
  return { res, body: await res.text() };
}

for (const p of ['/', '/dashboard', '/logic']) {
  test(`GET ${p} renders a complete page`, async () => {
    const { res, body } = await get(p);
    assert.equal(res.status, 200);
    assert.match(body, /<html lang="th"/);
    assert.match(body, /<title>[^<]+<\/title>/);
    assert.match(body, /property="og:title"/);
    assert.match(body, /rel="canonical" href="https:\/\/example\.test/);
    assert.match(body, /class="skip-link" href="#main-content"/);
    assert.match(body, /aria-current="page"/);
    assert.doesNotMatch(body, /fonts\.googleapis\.com/);
    const navs = body.match(/<nav[\s>][^>]*>/g) || [];
    assert.ok(navs.length >= 1 && navs.every((n) => /aria-label=/.test(n)), 'every <nav> is labelled');
    let depth = 0;
    for (const m of body.matchAll(/<(\/?)nav[\s>]/g)) {
      depth += m[1] ? -1 : 1;
      assert.ok(depth <= 1, '<nav> must not be nested');
    }
  });
}

test('landing page hides contact section when no contact info is configured', async () => {
  const { body } = await get('/');
  assert.doesNotMatch(body, /id="contact-heading"/);
  assert.match(body, /id="hero-heading"/);
});

test('/how-it-works redirects permanently to /logic', async () => {
  const { res } = await get('/how-it-works');
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), '/logic');
});

test('unknown page returns a 404 HTML page marked noindex', async () => {
  const { res, body } = await get('/does-not-exist', { headers: { accept: 'text/html' } });
  assert.equal(res.status, 404);
  assert.match(body, /noindex/);
});

test('health check and static brand assets are served', async () => {
  assert.equal((await get('/healthz')).res.status, 200);
  for (const asset of ['/site.webmanifest', '/img/logo-mark.svg', '/img/favicon.svg', '/img/og-image.png',
    '/img/apple-touch-icon.png', '/css/fonts.css', '/vendor/fonts/inter/inter-latin-wght-normal.woff2',
    '/vendor/fonts/noto-sans-thai/noto-sans-thai-thai-wght-normal.woff2']) {
    const res = await fetch(base + asset);
    assert.equal(res.status, 200, asset);
    await res.arrayBuffer();
  }
});

test('dashboard shows live data after a reading is posted', async () => {
  const post = await fetch(`${base}/api/sensors/readings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': 'test-only-key' },
    body: JSON.stringify({ co2: 800, temperature: 27.5, humidity: 85 }),
  });
  assert.equal(post.status, 201);
  const { body } = await get('/dashboard');
  assert.match(body, /ออนไลน์/);
  assert.match(body, /id="chart-summary"/);
});
