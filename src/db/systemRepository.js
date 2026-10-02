const db = require('./index');

// ── control_decisions ──────────────────────────────────────────────────
const insertDecisionStmt = db.prepare(`
  INSERT INTO control_decisions (mode, situation, reasons, fan_target, mister_target, smoothed, classification)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const recentDecisionsStmt = db.prepare(`
  SELECT id, mode, situation, reasons, fan_target AS fanTarget, mister_target AS misterTarget,
         smoothed, classification, created_at AS createdAt
  FROM control_decisions
  WHERE created_at >= ?
  ORDER BY id DESC
  LIMIT ?
`);

function insertDecision(d) {
  insertDecisionStmt.run(
    d.mode,
    d.situation,
    JSON.stringify(d.reasons || []),
    d.targets?.fan || 'off',
    d.targets?.mister || 'off',
    d.smoothed ? JSON.stringify(d.smoothed) : null,
    d.classification ? JSON.stringify(d.classification) : null
  );
}

function getRecentDecisions(sinceIso, limit = 50) {
  return recentDecisionsStmt.all(sinceIso, limit).map((row) => ({
    ...row,
    reasons: JSON.parse(row.reasons),
    smoothed: row.smoothed ? JSON.parse(row.smoothed) : null,
    classification: row.classification ? JSON.parse(row.classification) : null,
  }));
}

// ── actuator_events ─────────────────────────────────────────────────────
const insertActuatorEventStmt = db.prepare(`
  INSERT INTO actuator_events (device, state, online, last_cmd_id, error_code, error_message)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const latestActuatorStmt = db.prepare(`
  SELECT device, state, online, last_cmd_id AS lastCmdId, error_code AS errorCode,
         error_message AS errorMessage, created_at AS createdAt
  FROM actuator_events
  WHERE device = ?
  ORDER BY id DESC
  LIMIT 1
`);
const recentActuatorEventsStmt = db.prepare(`
  SELECT device, state, online, last_cmd_id AS lastCmdId, error_code AS errorCode,
         error_message AS errorMessage, created_at AS createdAt
  FROM actuator_events
  WHERE created_at >= ?
  ORDER BY id DESC
  LIMIT ?
`);

function insertActuatorEvent(e) {
  insertActuatorEventStmt.run(
    e.device,
    e.state,
    e.online ? 1 : 0,
    e.lastCmdId || null,
    e.lastError?.code || null,
    e.lastError?.message || null
  );
}

function getLatestActuator(device) {
  const row = latestActuatorStmt.get(device);
  return row ? { ...row, online: Boolean(row.online) } : null;
}

function getAllLatestActuators() {
  return ['fan', 'mister'].map((d) => getLatestActuator(d)).filter(Boolean);
}

function getRecentActuatorEvents(sinceIso, limit = 50) {
  return recentActuatorEventsStmt.all(sinceIso, limit).map((row) => ({ ...row, online: Boolean(row.online) }));
}

// ── plug_status (สถานะจริงล่าสุดของปลั๊ก) ─────────────────────────────────
const upsertPlugStmt = db.prepare(`
  INSERT INTO plug_status (device, state, reachable, error, reported_at, changed_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(device) DO UPDATE SET
    state = excluded.state, reachable = excluded.reachable, error = excluded.error,
    reported_at = excluded.reported_at, changed_at = excluded.changed_at
`);
const plugStmt = db.prepare(`
  SELECT device, state, reachable, error, reported_at AS reportedAt, changed_at AS changedAt
  FROM plug_status WHERE device = ?
`);

function upsertPlugStatus(p) {
  upsertPlugStmt.run(p.device, p.state, p.reachable ? 1 : 0, p.error || null, p.reportedAt, p.changedAt);
}

function getPlugStatus(device) {
  const row = plugStmt.get(device);
  return row ? { ...row, reachable: Boolean(row.reachable) } : null;
}

// ── retention (พอร์ตมาจาก readingsRepository.pruneOlderThan — ตารางนี้เขียนบ่อยขึ้นตั้งแต่
// ESP32 ส่ง heartbeat ตัดสินใจตรงมาเอง ไม่ผ่าน MQTT เป็นระยะๆ แบบเดิม จึงต้อง prune ด้วย) ──
const pruneDecisionsStmt = db.prepare('DELETE FROM control_decisions WHERE created_at < ?');
const pruneActuatorEventsStmt = db.prepare('DELETE FROM actuator_events WHERE created_at < ?');

function pruneOlderThan(isoTimestamp) {
  const decisions = pruneDecisionsStmt.run(isoTimestamp).changes;
  const actuatorEvents = pruneActuatorEventsStmt.run(isoTimestamp).changes;
  return decisions + actuatorEvents;
}

module.exports = {
  insertDecision,
  getRecentDecisions,
  insertActuatorEvent,
  getLatestActuator,
  getAllLatestActuators,
  getRecentActuatorEvents,
  upsertPlugStatus,
  getPlugStatus,
  pruneOlderThan,
};
