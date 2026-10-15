const sensors = require('./modules/sensors');
const system = require('./modules/system');
const config = require('./shared/config');
const logger = require('./shared/utils/logger');

const DAY_MS = 24 * 60 * 60 * 1000;

function pruneOldData() {
  const cutoff = new Date(Date.now() - config.dataRetentionDays * DAY_MS).toISOString();
  const deletedReadings = sensors.pruneOlderThan(cutoff);
  const deletedSystemRows = system.pruneOlderThan(cutoff);
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
