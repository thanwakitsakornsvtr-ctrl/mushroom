const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/sensors.controller');
const apiKeyAuth = require('../middleware/apiKeyAuth');

const router = Router();

const ingestLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/readings', ingestLimiter, apiKeyAuth, controller.createReading);
router.get('/latest', readLimiter, controller.getLatest);
router.get('/history', readLimiter, controller.getHistory);
router.get('/events', controller.streamEvents);

module.exports = router;
