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

test('GET / renders a complete single-page dashboard', async () => {
  const { res, body } = await get('/');
  assert.equal(res.status, 200);
  assert.match(body, /<html lang="th"/);
  assert.match(body, /<title>[^<]+<\/title>/);
  assert.match(body, /property="og:title"/);
  assert.match(body, /rel="canonical" href="https:\/\/example\.test\/"/);
  assert.match(body, /class="skip-link" href="#main-content"/);
  assert.doesNotMatch(body, /แดชบอร์ด|ตำนานกราฟ|เรียลไทม์/);
  assert.doesNotMatch(body, /href="\/dashboard"|href="\/about"|href="\/logic"/);
  assert.doesNotMatch(body, /<nav[\s>]/);
  assert.doesNotMatch(body, /fonts\.googleapis\.com/);
  assert.match(body, /class="rules-strip"/);
  assert.match(body, /id="history-chart"/);
  assert.match(body, /id="research-details"/);
  assert.match(body, /class="site-footer__mark"/);
  assert.doesNotMatch(body, /class="site-footer__col"|class="site-footer__copy"/);
});

for (const oldPath of ['/about', '/logic', '/dashboard', '/how-it-works']) {
  test(`${oldPath} redirects permanently to home`, async () => {
    const { res } = await get(oldPath);
    assert.equal(res.status, 301);
    assert.equal(res.headers.get('location'), '/');
  });
}

test('home opens the greenhouse view and explains when there are no readings', async () => {
  const { body } = await get('/');
  assert.match(body, /<h1[^>]*>สภาพโรงเรือน<\/h1>/);
  assert.match(body, /rel="canonical" href="https:\/\/example\.test\/"/);
  assert.match(body, /ยังไม่มีข้อมูลจากโรงเรือน/);
  assert.equal((body.match(/data-role="status">ไม่มีข้อมูล/g) || []).length, 5);
  assert.match(body, /เซนเซอร์ควบคุม · SHT40/);
  assert.match(body, /เซนเซอร์วัด CO₂ · SCD40/);
  assert.match(body, /src="\/js\/dashboard\.client\.js/);
  assert.doesNotMatch(body, /src="\/js\/nav-status\.client\.js/);
});

test('installed shortcut opens the greenhouse home page', async () => {
  const { body } = await get('/site.webmanifest');
  const manifest = JSON.parse(body);
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.short_name, 'โรงเห็ดนางฟ้า');
  assert.equal(manifest.name, 'โรงเห็ดนางฟ้า กันทรลักษ์');
  assert.ok(manifest.icons.some((i) => i.src === '/img/icon-192.png' && i.purpose === 'any'));
  assert.ok(manifest.icons.some((i) => i.src === '/img/icon-512.png' && i.purpose === 'any'));
  assert.ok(manifest.icons.some((i) => i.src === '/img/icon-maskable-512.png' && i.purpose === 'maskable'));
});

test('unknown page returns a 404 HTML page marked noindex', async () => {
  const { res, body } = await get('/does-not-exist', { headers: { accept: 'text/html' } });
  assert.equal(res.status, 404);
  assert.match(body, /noindex/);
});

test('health check and static brand assets are served', async () => {
  assert.equal((await get('/healthz')).res.status, 200);
  for (const asset of ['/site.webmanifest', '/img/logo-mark.png', '/img/logo-mark.svg', '/img/favicon.svg',
    '/img/favicon-32.png', '/img/icon-192.png', '/img/icon-512.png', '/img/icon-maskable-512.png',
    '/img/og-image.png', '/img/apple-touch-icon.png', '/css/fonts.css',
    '/vendor/fonts/inter/inter-latin-wght-normal.woff2',
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
    body: JSON.stringify({ co2: 800, temperature: 27.5, humidity: 85, sht40Temperature: 26.2, sht40Humidity: 87.4 }),
  });
  assert.equal(post.status, 201);
  const { body } = await get('/');
  assert.match(body, /id="connection-label">ออนไลน์</);
  assert.match(body, /data-role="value">27\.5/);
  assert.match(body, /data-role="value">800/);
  assert.match(body, /data-role="value">26\.2/);
  assert.match(body, /data-role="value">87\.4/);
  assert.match(body, /ไม่ทราบสถานะปลั๊กเครื่องพ่นน้ำ/);
  assert.doesNotMatch(body, /ปลั๊กพัดลม|id="plug-fan"|ไม่ต้องทำอะไร/);
  assert.match(body, /id="chart-summary"/);
});

test('home labels old readings without presenting them as current conditions', async () => {
  const db = require('../src/shared/db');
  const reading = db.prepare('SELECT id, created_at FROM readings ORDER BY id DESC LIMIT 1').get();
  db.prepare('UPDATE readings SET created_at = ? WHERE id = ?')
    .run(new Date(Date.now() - 10 * 60 * 1000).toISOString(), reading.id);
  try {
    const { body } = await get('/');
    assert.match(body, /ขาดการติดต่อจากโรงเรือน 10 นาที/);
    assert.equal((body.match(/data-role="status">ข้อมูลเก่า/g) || []).length, 5);
    assert.match(body, /ค่าเก่า/);
    assert.doesNotMatch(body, /data-role="status">ปกติ/);
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
