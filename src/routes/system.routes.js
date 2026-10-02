const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/system.controller');
const apiKeyAuth = require('../middleware/apiKeyAuth');

const router = Router();

const readLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false });
const ingestLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });

router.get('/actuators', readLimiter, controller.getActuators);
router.get('/decisions', readLimiter, controller.getDecisions);
router.post('/decisions', ingestLimiter, apiKeyAuth, controller.postDecision);
router.get('/plugs', readLimiter, controller.getPlugs);
router.post('/plugs', ingestLimiter, apiKeyAuth, controller.postPlugs);

module.exports = router;
