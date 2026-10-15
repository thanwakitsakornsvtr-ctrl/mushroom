const { Router } = require('express');
const controller = require('./controller');

const router = Router();

router.get('/', controller.renderDashboard);
router.get('/about', controller.renderAbout);
router.get('/dashboard', (req, res) => res.redirect(301, '/'));
router.get('/logic', controller.renderLogic);
// ลิงก์เก่า — ย้ายถาวรไป /logic
router.get('/how-it-works', (req, res) => res.redirect(301, '/logic'));

module.exports = router;
