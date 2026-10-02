const repo = require('../db/systemRepository');
const sseHub = require('./sseHub');

function recordDecision(payload) {
  repo.insertDecision(payload);
  sseHub.broadcast('control', payload);
}

function recordActuatorEvent(payload) {
  repo.insertActuatorEvent(payload);
  sseHub.broadcast('actuator', payload);
}

const PLUG_DEVICES = ['fan', 'mister'];

// changedAt = เวลาที่สถานะ (on/off/unknown) เปลี่ยนล่าสุด, reportedAt = เวลาที่ ESP32 รายงานล่าสุด
function recordPlugStatus(device, { state, reachable, error }) {
  const now = new Date().toISOString();
  const prev = repo.getPlugStatus(device);
  const plug = {
    device,
    state,
    reachable,
    error: error || null,
    reportedAt: now,
    changedAt: prev && prev.state === state ? prev.changedAt : now,
  };
  repo.upsertPlugStatus(plug);
  sseHub.broadcast('plug', plug);
  return plug;
}

function getPlugs() {
  return PLUG_DEVICES.map((device) => repo.getPlugStatus(device) || { device, state: 'unknown', reachable: false, error: null, reportedAt: null, changedAt: null });
}

function getRecentDecisions(hours = 24, limit = 50) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  return repo.getRecentDecisions(since, limit);
}

function getActuators() {
  return repo.getAllLatestActuators();
}

function getRecentActuatorEvents(hours = 24, limit = 50) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  return repo.getRecentActuatorEvents(since, limit);
}

module.exports = {
  recordDecision,
  recordActuatorEvent,
  getRecentDecisions,
  getActuators,
  getRecentActuatorEvents,
  recordPlugStatus,
  getPlugs,
};
