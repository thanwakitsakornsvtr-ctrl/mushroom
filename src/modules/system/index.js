// Reports originate on ESP32; this module stores and publishes them.
const service = require('./service');

module.exports = {
  ...service,
  router: require('./routes'),
  controlLogic: require('./controlLogic'),
  pruneOlderThan: require('./repository').pruneOlderThan,
};
