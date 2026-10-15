const db = require('../../shared/db');

// ── Control engine decisions (ประเมิน+ตัดสินใจ) ──────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS control_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mode TEXT NOT NULL,
    situation TEXT NOT NULL,
    reasons TEXT NOT NULL,
    fan_target TEXT NOT NULL,
    mister_target TEXT NOT NULL,
    smoothed TEXT,
    classification TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`);
db.exec('CREATE INDEX IF NOT EXISTS idx_control_decisions_created_at ON control_decisions(created_at);');

// ── Actuator command outcomes (ผลการสั่งพัดลม/เครื่องพ่นไอน้ำจริง) ────────
db.exec(`
  CREATE TABLE IF NOT EXISTS actuator_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device TEXT NOT NULL,
    state TEXT NOT NULL,
    online INTEGER NOT NULL,
    last_cmd_id TEXT,
    error_code TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`);
db.exec('CREATE INDEX IF NOT EXISTS idx_actuator_events_created_at ON actuator_events(created_at);');
db.exec('CREATE INDEX IF NOT EXISTS idx_actuator_events_device ON actuator_events(device);');

// ── สถานะจริงของปลั๊ก Tapo (ESP32 อ่านจากปลั๊กแล้วรายงานมาเป็นระยะ) — 1 แถวต่อ device ────
db.exec(`
  CREATE TABLE IF NOT EXISTS plug_status (
    device TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    reachable INTEGER NOT NULL,
    error TEXT,
    reported_at TEXT NOT NULL,
    changed_at TEXT NOT NULL
  );
`);

module.exports = db;
