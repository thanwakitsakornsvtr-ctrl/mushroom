const { readingSchema } = require('../validators/readingSchema');
const sensorService = require('../services/sensorService');
const sseHub = require('../services/sseHub');
const asyncHandler = require('../utils/asyncHandler');
const config = require('../config');

const createReading = asyncHandler(async (req, res) => {
  const parsed = readingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }
  const reading = sensorService.recordReading(parsed.data);
  res.status(201).json(reading);
});

const getLatest = asyncHandler(async (req, res) => {
  const latest = sensorService.getLatestWithStatus();
  if (!latest) {
    return res.status(404).json({ error: 'No readings yet' });
  }
  res.json({ ...latest, deviceOfflineSeconds: config.deviceOfflineSeconds });
});

const getHistory = asyncHandler(async (req, res) => {
  const hours = Math.min(Math.max(Number(req.query.hours) || 24, 1), 168);
  res.json({ hours, readings: sensorService.getHistory(hours) });
});

function streamEvents(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('\n');

  sseHub.addClient(res);

  req.on('close', () => {
    sseHub.removeClient(res);
  });
}

module.exports = { createReading, getLatest, getHistory, streamEvents };
