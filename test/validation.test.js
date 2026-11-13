const test = require('node:test');
const assert = require('node:assert/strict');
const thresholds = require('../src/modules/sensors/thresholds');
const { readingSchema } = require('../src/modules/sensors/validation');
const { decisionSchema, plugsSchema } = require('../src/modules/system/validation');

const reading = { co2: 800, temperature: 27, humidity: 85 };

test('classification retains inclusive ranges and handles missing measurements', () => {
  for (const metric of ['co2', 'temperature', 'humidity']) {
    const range = thresholds[metric];
    assert.equal(thresholds.classify(metric, range.normalMin), 'normal');
    assert.equal(thresholds.classify(metric, range.normalMax), 'normal');
    assert.equal(thresholds.classify(metric, range.normalMin - 0.1), 'low');
    assert.equal(thresholds.classify(metric, range.normalMax + 0.1), 'high');
    assert.equal(thresholds.classify(metric, null), 'unknown');
    assert.equal(thresholds.classify(metric, undefined), 'unknown');
  }
  assert.equal(thresholds.classify('missing', 10), 'unknown');
});

test('reading validation keeps device defaults, trims identifiers and accepts physical bounds', () => {
  assert.equal(readingSchema.parse(reading).deviceId, 'esp32-scd40-01');
  assert.equal(readingSchema.parse({ ...reading, deviceId: ' greenhouse-01 ' }).deviceId, 'greenhouse-01');
  assert.equal(readingSchema.safeParse({ co2: 0, temperature: -40, humidity: 0 }).success, true);
  assert.equal(readingSchema.safeParse({ co2: 40000, temperature: 85, humidity: 100 }).success, true);
});

test('reading validation rejects out-of-range, missing and nonnumeric measurements', () => {
  for (const invalid of [
    { co2: -1 }, { co2: 40001 }, { co2: 1.5 }, { co2: '800' }, { co2: NaN },
    { temperature: -41 }, { temperature: 86 }, { temperature: Infinity },
    { humidity: -1 }, { humidity: 101 }, { humidity: null },
    { deviceId: '' }, { deviceId: ' ' }, { deviceId: 'x'.repeat(65) },
  ]) {
    assert.equal(readingSchema.safeParse({ ...reading, ...invalid }).success, false, JSON.stringify(invalid));
  }
  assert.equal(readingSchema.safeParse({}).success, false);
});

test('decision validation preserves defaults and rejects unsupported targets and outcomes', () => {
  const input = { situation: ' normal ', targets: { mister: 'off' }, changed: {} };
  const result = decisionSchema.parse(input);
  assert.equal(result.situation, 'normal');
  assert.deepEqual(result.reasons, []);
  assert.deepEqual(result.changed, { fan: false, mister: false });
  for (const invalid of [
    { situation: '' }, { targets: { mister: 'unknown' } },
    { reasons: Array(9).fill('x') }, { changed: { mister: 'true' } },
    { outcomes: { mister: { applied: 'yes' } } },
  ]) {
    assert.equal(decisionSchema.safeParse({ ...input, ...invalid }).success, false);
  }
});

test('plug reports require mister device, valid states and boolean reachability', () => {
  const input = { mister: { state: 'unknown', reachable: false, error: 'timeout' } };
  assert.equal(plugsSchema.safeParse(input).success, true);
  assert.equal(plugsSchema.safeParse({ fan: { state: 'on', reachable: true } }).success, false);
  assert.equal(plugsSchema.safeParse({ mister: { state: 'broken', reachable: true } }).success, false);
  assert.equal(plugsSchema.safeParse({ mister: { state: 'on', reachable: 1 } }).success, false);
  assert.equal(plugsSchema.safeParse({ mister: { state: 'off', reachable: false, error: 'x'.repeat(65) } }).success, false);
});
