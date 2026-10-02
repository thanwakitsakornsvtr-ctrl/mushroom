const { Router } = require('express');
const controller = require('../controllers/dashboard.controller');

const router = Router();

router.get('/', controller.renderDashboard);
router.get('/how-it-works', controller.renderLogic);
router.get('/logic', controller.renderLogic);

module.exports = router;
