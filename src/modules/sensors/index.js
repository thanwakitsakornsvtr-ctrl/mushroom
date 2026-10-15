// Public interface: other modules use this file instead of internal files.
const service = require('./service');

module.exports = {
  ...service,
  router: require('./routes'),
  thresholds: require('./thresholds'),
  pruneOlderThan: require('./repository').pruneOlderThan,
};
