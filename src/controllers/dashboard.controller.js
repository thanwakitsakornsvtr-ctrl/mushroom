const sensorService = require('../services/sensorService');
const systemService = require('../services/systemService');
const thresholds = require('../config/thresholds');
const config = require('../config');
const plugView = require('../../public/js/plug-view');
const labels = require('../../public/js/labels');
const controlLogic = require('../config/controlLogic');
const asyncHandler = require('../utils/asyncHandler');
const site = require('../config/site');

// จำนวนแถวในตาราง "ประวัติล่าสุด" และ "ประวัติการตัดสินใจ" (ฝั่ง browser ใช้ค่าเดียวกันตอนเพิ่มแถวสด)
const TABLE_ROWS = 5;

const renderAbout = (req, res) => {
  res.render('about', {
    title: 'เกี่ยวกับฟาร์ม',
    description: site.description,
    canonicalPath: '/about',
    activePage: 'about',
    logic: controlLogic,
  });
};

const renderDashboard = asyncHandler(async (req, res) => {
  const latest = sensorService.getLatestWithStatus();
  const chartSeries = sensorService.getChartSeries(24);
  const recent = sensorService.getRecent(TABLE_ROWS);
  const stats = sensorService.getStats(24);
  const plugs = systemService.getPlugs();
  const decisions = systemService.getRecentDecisions(24, TABLE_ROWS);

  res.render('dashboard', {
    title: 'สภาพโรงเรือน',
    description: 'ดูอุณหภูมิ ความชื้นในอากาศ คาร์บอนไดออกไซด์ และสถานะอุปกรณ์ของโรงเห็ดนางฟ้า พร้อมเวลาได้รับข้อมูลล่าสุด',
    canonicalPath: '/',
    activePage: 'dashboard',
    latest,
    chartSeries,
    chartBucketSeconds: sensorService.CHART_BUCKET_SECONDS,
    recent,
    stats,
    thresholds,
    plugs,
    plugView,
    labels,
    nowMs: Date.now(),
    plugStaleSeconds: config.plugStaleSeconds,
    deviceOfflineSeconds: config.deviceOfflineSeconds,
    decisions,
    tableRows: TABLE_ROWS,
    co2DangerAt: controlLogic.co2DangerAtOrAbove,
  });
});

const renderLogic = (req, res) => {
  res.render('logic', {
    title: 'การทำงานอัตโนมัติ',
    description: 'ระบบดูแลโรงเรือนเห็ดนางฟ้าอย่างไร อ่านเกณฑ์และระยะเวลาที่ใช้สั่งเปิด–ปิดพัดลมและเครื่องพ่นเพิ่มความชื้น',
    canonicalPath: '/logic',
    activePage: 'logic',
    logic: controlLogic,
    thresholds,
    plugStaleSeconds: config.plugStaleSeconds,
  });
};

module.exports = { renderAbout, renderDashboard, renderLogic };
