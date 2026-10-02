const path = require('node:path');
require('dotenv').config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

const deviceApiKey = required('DEVICE_API_KEY', isProduction ? undefined : 'dev-local-key');
if (isProduction && deviceApiKey === 'dev-local-key') {
  throw new Error('DEVICE_API_KEY must be set to a non-default value in production');
}

const dbPath = process.env.DB_PATH
  || (process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'mushroom.db')
    : './data/mushroom.db');

module.exports = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT) || 4100,
  deviceApiKey,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  // ใช้สร้าง canonical / og:url / ลิงก์รูปแชร์ — ตั้งเป็นโดเมนจริงตอน deploy
  siteUrl: (process.env.SITE_URL || '').replace(/\/+$/, ''),
  dbPath: path.resolve(process.cwd(), dbPath),
  dataRetentionDays: Number(process.env.DATA_RETENTION_DAYS) || 30,
  deviceOfflineSeconds: Number(process.env.DEVICE_OFFLINE_SECONDS) || 60,
  // ESP32 รายงานสถานะปลั๊กทุก 30 วิ — เงียบเกินนี้ถือว่าไม่ทราบสถานะจริงของปลั๊กแล้ว
  readingBroadcastMs: Number(process.env.READING_BROADCAST_MS) || 5000,
  plugStaleSeconds: Number(process.env.PLUG_STALE_SECONDS) || 90,
  logLevel: process.env.LOG_LEVEL || 'info',
  logDir: path.resolve(process.cwd(), 'logs'),
};
