// Smoke test: เปิดแอปบน DB ชั่วคราว แล้วยิงทุกหน้าหลักตรวจสถานะ + องค์ประกอบสำคัญ (a11y/SEO/ไม่พึ่ง CDN)
const test = require('node:test');
const assert = require('node:assert/strict');
const runtime = require('./support/runtime')();

const app = require('../src/app');

let base;

test.before(async () => {
  base = await runtime.listen(app);
});

test.after(() => runtime.cleanup());

async function get(p, opts) {
  const res = await fetch(base + p, { redirect: 'manual', ...opts });
  return { res, body: await res.text() };
}

for (const p of ['/', '/about', '/logic']) {
  test(`GET ${p} renders a complete page`, async () => {
    const { res, body } = await get(p);
    assert.equal(res.status, 200);
    assert.match(body, /<html lang="th"/);
    assert.match(body, /<title>[^<]+<\/title>/);
    assert.match(body, /property="og:title"/);
    assert.match(body, /rel="canonical" href="https:\/\/example\.test/);
    assert.match(body, /class="skip-link" href="#main-content"/);
    assert.match(body, /aria-current="page"/);
    assert.doesNotMatch(body, /แดชบอร์ด|ตำนานกราฟ|เรียลไทม์/);
    assert.doesNotMatch(body, /href="\/dashboard"/);
    assert.match(body, /href="\/about"/);
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

test('about page preserves farm information without a frozen live-data snapshot', async () => {
  const { body } = await get('/about');
  assert.doesNotMatch(body, /id="contact-heading"/);
  assert.match(body, /id="hero-heading"/);
  assert.match(body, /rel="canonical" href="https:\/\/example\.test\/about"/);
  assert.doesNotMatch(body, /class="stat-card|hero__live|hero__chip/);
});

test('home opens the greenhouse view and explains when there are no readings', async () => {
  const { body } = await get('/');
  assert.match(body, /<h1[^>]*>สภาพโรงเรือน<\/h1>/);
  assert.match(body, /rel="canonical" href="https:\/\/example\.test\/"/);
  assert.match(body, /ยังไม่เคยได้รับข้อมูลจากโรงเรือน/);
  assert.equal((body.match(/data-role="status">ยังไม่มีข้อมูล/g) || []).length, 3);
  assert.match(body, /src="\/js\/dashboard\.client\.js/);
  assert.doesNotMatch(body, /src="\/js\/nav-status\.client\.js/);
  assert.doesNotMatch(body, /id="hero-heading"/);
});

test('old dashboard link redirects permanently to home', async () => {
  const { res } = await get('/dashboard');
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), '/');
});

test('installed shortcut opens the greenhouse home page', async () => {
  const { body } = await get('/site.webmanifest');
  assert.equal(JSON.parse(body).start_url, '/');
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

test('home shows the latest reading immediately after it is posted', async () => {
  const post = await fetch(`${base}/api/sensors/readings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': 'test-only-key' },
    body: JSON.stringify({ co2: 800, temperature: 27.5, humidity: 85 }),
  });
  assert.equal(post.status, 201);
  const { body } = await get('/');
  assert.match(body, /ได้รับข้อมูลต่อเนื่อง/);
  assert.match(body, /data-role="value">27\.5/);
  assert.match(body, /data-role="value">800/);
  assert.match(body, /ยังไม่ทราบสถานะปลั๊กพัดลม/);
  assert.doesNotMatch(body, /ไม่ต้องทำอะไร/);
  assert.match(body, /id="chart-summary"/);
});

test('home labels old readings without presenting them as current conditions', async () => {
  const db = require('../src/shared/db');
  const reading = db.prepare('SELECT id, created_at FROM readings ORDER BY id DESC LIMIT 1').get();
  db.prepare('UPDATE readings SET created_at = ? WHERE id = ?')
    .run(new Date(Date.now() - 10 * 60 * 1000).toISOString(), reading.id);
  try {
    const { body } = await get('/');
    assert.match(body, /ไม่ได้รับข้อมูลใหม่จากโรงเรือนมา 10 นาที/);
    assert.equal((body.match(/data-role="status">ยังไม่ได้รับค่าใหม่/g) || []).length, 3);
    assert.match(body, /ไม่ใช่ค่าตอนนี้/);
    assert.doesNotMatch(body, /data-role="status">อยู่ในช่วงที่กำหนด/);
  } finally {
    db.prepare('UPDATE readings SET created_at = ? WHERE id = ?').run(reading.created_at, reading.id);
  }
});

test('local HTTP assets stay on HTTP, while proxied HTTPS receives HSTS', async () => {
  const http = await get('/');
  assert.doesNotMatch(http.res.headers.get('content-security-policy'), /upgrade-insecure-requests/);
  assert.equal(http.res.headers.get('strict-transport-security'), null);
  const https = await get('/', { headers: { 'x-forwarded-proto': 'https' } });
  assert.match(https.res.headers.get('strict-transport-security'), /max-age=/);
});

test('rate limiting uses the client IP forwarded by the trusted proxy', async () => {
  const headers = { 'x-forwarded-for': '203.0.113.10' };
  for (let i = 0; i < 120; i++) {
    assert.equal((await get('/api/sensors/latest', { headers })).res.status, 200);
  }
  assert.equal((await get('/api/sensors/latest', { headers })).res.status, 429);
  assert.equal((await get('/api/sensors/latest', { headers: { 'x-forwarded-for': '203.0.113.11' } })).res.status, 200);
});
