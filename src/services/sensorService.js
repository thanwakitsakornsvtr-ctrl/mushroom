const repo = require('../db/readingsRepository');
const thresholds = require('../config/thresholds');
const config = require('../config');
const sseHub = require('./sseHub');
const logger = require('../utils/logger');

function withStatus(reading) {
  if (!reading) return null;
  return {
    ...reading,
    status: {
      co2: thresholds.classify('co2', reading.co2),
      temperature: thresholds.classify('temperature', reading.temperature),
      humidity: thresholds.classify('humidity', reading.humidity),
    },
  };
}

function isOnline(reading) {
  if (!reading) return false;
  const ageSeconds = (Date.now() - new Date(reading.createdAt).getTime()) / 1000;
  return ageSeconds <= config.deviceOfflineSeconds;
}

let lastBroadcastAt = 0;

function recordReading(input) {
  const reading = repo.insertReading(input);
  logger.info('Reading stored', { id: reading.id, deviceId: reading.deviceId });
  const enriched = withStatus(reading);
  // ESP32 ส่งทุก 2 วิ แต่หน้าเว็บไม่จำเป็นต้องขยับถี่ขนาดนั้น — ส่งต่อให้ browser ไม่เกิน 1 ครั้ง/
  // READING_BROADCAST_MS ลดงาน render บนมือถือสเปคต่ำและเน็ตมือถือของผู้ใช้ (DB ยังเก็บครบทุกค่า)
  const now = Date.now();
  if (now - lastBroadcastAt >= config.readingBroadcastMs) {
    lastBroadcastAt = now;
    sseHub.broadcast('reading', { ...enriched, online: true });
  }
  return enriched;
}

function getLatestWithStatus() {
  const reading = repo.getLatest();
  const enriched = withStatus(reading);
  if (!enriched) return null;
  return { ...enriched, online: isOnline(reading) };
}

function getHistory(hours) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  return repo.getHistorySince(since).map(withStatus);
}

// จุดกราฟย้อนหลัง (เฉลี่ยช่วงละ CHART_BUCKET_SECONDS) — 24 ชม. = 288 จุด
const CHART_BUCKET_SECONDS = 300;

function getChartSeries(hours) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  return repo.getBucketedSince(since, CHART_BUCKET_SECONDS);
}

function getRecent(limit) {
  return repo.getRecent(limit).map(withStatus);
}

function getStats(hours) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  return repo.getStatsSince(since);
}

module.exports = {
  recordReading,
  getLatestWithStatus,
  getHistory,
  getChartSeries,
  getRecent,
  getStats,
  CHART_BUCKET_SECONDS,
  isOnline,
};
