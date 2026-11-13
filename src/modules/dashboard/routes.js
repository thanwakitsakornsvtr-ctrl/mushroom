const { Router } = require('express');
const controller = require('./controller');

const router = Router();

router.get('/', controller.renderDashboard);
// ระบบรวมเหลือหน้าเดียว — redirect เส้นทางเดิมทั้งหมดกลับมาที่ /
router.get('/about', (req, res) => res.redirect(301, '/'));
router.get('/dashboard', (req, res) => res.redirect(301, '/'));
router.get('/logic', (req, res) => res.redirect(301, '/'));
router.get('/how-it-works', (req, res) => res.redirect(301, '/'));

module.exports = router;
