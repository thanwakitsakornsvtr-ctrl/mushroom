const db = require('./index');

const insertStmt = db.prepare(`
  INSERT INTO readings (device_id, co2, temperature, humidity)
  VALUES (?, ?, ?, ?)
`);

const latestStmt = db.prepare(`
  SELECT id, device_id AS deviceId, co2, temperature, humidity, created_at AS createdAt
  FROM readings
  ORDER BY id DESC
  LIMIT 1
`);

const historyStmt = db.prepare(`
  SELECT id, device_id AS deviceId, co2, temperature, humidity, created_at AS createdAt
  FROM readings
  WHERE created_at >= ?
  ORDER BY id ASC
`);

const statsStmt = db.prepare(`
  SELECT
    MIN(co2) AS minCo2, MAX(co2) AS maxCo2, AVG(co2) AS avgCo2,
    ROUND(MIN(temperature), 1) AS minTemperature, ROUND(MAX(temperature), 1) AS maxTemperature, ROUND(AVG(temperature), 1) AS avgTemperature,
    ROUND(MIN(humidity), 1) AS minHumidity, ROUND(MAX(humidity), 1) AS maxHumidity, ROUND(AVG(humidity), 1) AS avgHumidity,
    COUNT(*) AS count
  FROM readings
  WHERE created_at >= ?
`);

// เฉลี่ยเป็นช่วงละ bucketSeconds สำหรับกราฟ — ESP32 ส่งทุก 2 วิ (~43,000 แถว/วัน) ถ้าส่งดิบทั้งหมด
// หน้าเว็บจะใหญ่หลาย MB และกราฟวาดใหม่ไม่ทันบนมือถือสเปคต่ำ
// หมายเหตุ: node:sqlite bind ตัวเลข JS เป็น REAL — ต้อง CAST(:bucket AS INTEGER) ไม่งั้นการหารไม่ปัดเศษ
// และจะไม่ได้ group เป็นช่วงเลย
const bucketedStmt = db.prepare(`
  SELECT
    strftime('%Y-%m-%dT%H:%M:%SZ', (CAST(strftime('%s', created_at) AS INTEGER) / CAST(:bucket AS INTEGER)) * CAST(:bucket AS INTEGER), 'unixepoch') AS t,
    ROUND(AVG(co2)) AS co2,
    ROUND(AVG(temperature), 1) AS temperature,
    ROUND(AVG(humidity), 1) AS humidity,
    COUNT(*) AS n
  FROM readings
  WHERE created_at >= :since
  GROUP BY CAST(strftime('%s', created_at) AS INTEGER) / CAST(:bucket AS INTEGER)
  ORDER BY t ASC
`);

const recentStmt = db.prepare(`
  SELECT id, device_id AS deviceId, co2, temperature, humidity, created_at AS createdAt
  FROM readings
  ORDER BY id DESC
  LIMIT ?
`);

const pruneStmt = db.prepare('DELETE FROM readings WHERE created_at < ?');

function insertReading({ deviceId, co2, temperature, humidity }) {
  const info = insertStmt.run(deviceId, co2, temperature, humidity);
  return getById(Number(info.lastInsertRowid));
}

const byIdStmt = db.prepare(`
  SELECT id, device_id AS deviceId, co2, temperature, humidity, created_at AS createdAt
  FROM readings WHERE id = ?
`);

function getById(id) {
  return byIdStmt.get(id) ?? null;
}

function getLatest() {
  return latestStmt.get() ?? null;
}

function getHistorySince(isoTimestamp) {
  return historyStmt.all(isoTimestamp);
}

function getStatsSince(isoTimestamp) {
  return statsStmt.get(isoTimestamp);
}

function getBucketedSince(isoTimestamp, bucketSeconds) {
  return bucketedStmt.all({ since: isoTimestamp, bucket: bucketSeconds });
}

function getRecent(limit) {
  return recentStmt.all(limit);
}

function pruneOlderThan(isoTimestamp) {
  const info = pruneStmt.run(isoTimestamp);
  return info.changes;
}

module.exports = {
  insertReading,
  getLatest,
  getHistorySince,
  getStatsSince,
  getBucketedSince,
  getRecent,
  pruneOlderThan,
};
