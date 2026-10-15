const crypto = require('node:crypto');
const config = require('../config');

const expected = Buffer.from(config.deviceApiKey);

module.exports = function apiKeyAuth(req, res, next) {
  const key = req.get('X-API-Key') || '';
  const actual = Buffer.from(key);
  const valid = actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  if (!valid) {
    return res.status(401).json({ error: 'Unauthorized: missing or invalid X-API-Key' });
  }
  next();
};
