const db = require('../../shared/db');

db.exec(`
  CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    co2 INTEGER NOT NULL,
    temperature REAL NOT NULL,
    humidity REAL NOT NULL,
    sht40_temperature REAL,
    sht40_humidity REAL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`);

// Migrate existing databases created before SHT40 columns existed
const columns = new Set(db.prepare('PRAGMA table_info(readings)').all().map((c) => c.name));
if (!columns.has('sht40_temperature')) db.exec('ALTER TABLE readings ADD COLUMN sht40_temperature REAL;');
if (!columns.has('sht40_humidity')) db.exec('ALTER TABLE readings ADD COLUMN sht40_humidity REAL;');

db.exec('CREATE INDEX IF NOT EXISTS idx_readings_created_at ON readings(created_at);');
db.exec('CREATE INDEX IF NOT EXISTS idx_readings_device_id ON readings(device_id);');

module.exports = db;
