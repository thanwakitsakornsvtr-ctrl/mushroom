const { Router } = require('express');
const controller = require('../controllers/dashboard.controller');

const router = Router();

router.get('/', controller.renderHome);
router.get('/dashboard', controller.renderDashboard);
router.get('/logic', controller.renderLogic);
// ลิงก์เก่า — ย้ายถาวรไป /logic
router.get('/how-it-works', (req, res) => res.redirect(301, '/logic'));

module.exports = router;
