/**
 * navLocals middleware — inject device online status into res.locals
 * so every EJS template (dashboard, logic, error …) can render the
 * correct navbar state on the first server-side render.
 *
 * Fields added to res.locals:
 *   navOnline       {boolean}      – true = last reading is fresh
 *   navLastUpdated  {string|null}  – ISO timestamp of the last reading
 */
const sensorService = require('../services/sensorService');

module.exports = function navLocals(req, res, next) {
  const latest = sensorService.getLatestWithStatus();
  res.locals.navOnline      = latest ? latest.online : false;
  res.locals.navLastUpdated = latest ? latest.createdAt : null;
  next();
};
