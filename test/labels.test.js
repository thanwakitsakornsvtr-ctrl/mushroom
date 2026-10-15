const test = require('node:test');
const assert = require('node:assert/strict');
const labels = require('../public/js/labels');
const plugView = require('../public/js/plug-view');

const normal = {
  hasData: true,
  stale: false,
  values: { co2: 800, temperature: 27, humidity: 85 },
  status: { co2: 'normal', temperature: 'normal', humidity: 'normal' },
  co2DangerAt: 1500,
  fan: { known: true, on: false },
  mister: { known: true, on: false },
};

test('missing data is distinct from an old measurement', () => {
  assert.equal(labels.metricStatus('temperature', 'unknown', true, false), 'ยังไม่มีข้อมูล');
  assert.equal(labels.metricStatus('temperature', 'normal', true, true), 'ยังไม่ได้รับค่าใหม่');
  assert.equal(labels.metricStatus('temperature', 'high', false, true), 'ร้อนกว่าที่กำหนด');
  assert.equal(labels.metricStatus('humidity', 'low', false, true), 'อากาศแห้ง');
});

test('normal readings with an unknown plug still request attention', () => {
  const result = labels.summary({ ...normal, fan: { known: false } });
  assert.equal(result.tone, 'warn');
  assert.match(result.text, /ยังไม่ทราบสถานะปลั๊กพัดลม/);
  assert.doesNotMatch(result.text, /ไม่ต้องทำอะไร|กำลังเปิด/);
});

test('warnings describe reported plug state without promising a future action', () => {
  const result = labels.summary({
    ...normal,
    values: { ...normal.values, co2: 1600 },
    status: { ...normal.status, co2: 'high' },
  });
  assert.equal(result.tone, 'alert');
  assert.match(result.title, /ระดับแจ้งเตือนของระบบ/);
  assert.match(result.text, /ปลั๊กพัดลมปิดอยู่/);
  assert.match(result.text, /ตรวจการระบายอากาศ/);
  assert.doesNotMatch(result.text, /ระบบจะเปิด|กำลังเปิด|งดพ่น/);
});

test('browser connection failure never claims that the greenhouse device is offline', () => {
  for (const hasData of [true, false]) {
    const result = labels.summary({ ...normal, connected: false, hasData, stale: true });
    assert.equal(result.tone, 'warn');
    assert.match(result.title, /หน้าเว็บรับข้อมูลใหม่ไม่ได้/);
    assert.doesNotMatch(result.text, /ตรวจไฟ|กล่องควบคุม|ขาดการติดต่อ/);
    assert.equal(labels.connection({ connected: false, hasData, online: true }), 'หน้าเว็บรับข้อมูลใหม่ไม่ได้');
  }
});

test('incomplete sensor status cannot produce an all-clear summary', () => {
  const result = labels.summary({ ...normal, status: { temperature: 'normal' } });
  assert.equal(result.tone, 'warn');
  assert.match(result.title, /ข้อมูลที่วัดได้ยังไม่ครบ/);
});

test('plug reports identify the power outlet and keep technical errors out of instructions', () => {
  const now = Date.now();
  const plug = { state: 'on', reachable: true, reportedAt: new Date(now).toISOString(), changedAt: new Date(now).toISOString() };
  assert.equal(plugView.describe(plug, now, 90).text, 'ปลั๊กเปิดอยู่');
  const failed = plugView.describe({ ...plug, reachable: false, error: 'ETIMEDOUT' }, now, 90);
  assert.match(failed.error, /ตรวจไฟ/);
  assert.doesNotMatch(failed.error, /ETIMEDOUT/);
  assert.equal(plugView.brief(plug, now + 91000, 90).known, false);
});
