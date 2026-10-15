const db = require('../../shared/db');

db.exec(`
  CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    co2 INTEGER NOT NULL,
    temperature REAL NOT NULL,
    humidity REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`);

db.exec('CREATE INDEX IF NOT EXISTS idx_readings_created_at ON readings(created_at);');
db.exec('CREATE INDEX IF NOT EXISTS idx_readings_device_id ON readings(device_id);');

module.exports = db;
