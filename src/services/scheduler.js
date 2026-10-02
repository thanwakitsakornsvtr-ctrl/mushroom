const readingsRepo = require('../db/readingsRepository');
const systemRepo = require('../db/systemRepository');
const config = require('../config');
const logger = require('../utils/logger');

const DAY_MS = 24 * 60 * 60 * 1000;

function pruneOldData() {
  const cutoff = new Date(Date.now() - config.dataRetentionDays * DAY_MS).toISOString();
  const deletedReadings = readingsRepo.pruneOlderThan(cutoff);
  const deletedSystemRows = systemRepo.pruneOlderThan(cutoff);
  if (deletedReadings > 0 || deletedSystemRows > 0) {
    logger.info('Pruned old data', {
      deletedReadings,
      deletedSystemRows,
      retentionDays: config.dataRetentionDays,
    });
  }
}

function start() {
  pruneOldData();
  const timer = setInterval(pruneOldData, DAY_MS);
  timer.unref();
  return timer;
}

module.exports = { start, pruneOldData };
