const sensorService = require('../services/sensorService');
const systemService = require('../services/systemService');
const thresholds = require('../config/thresholds');
const config = require('../config');
const plugView = require('../../public/js/plug-view');
const labels = require('../../public/js/labels');
const controlLogic = require('../config/controlLogic');
const asyncHandler = require('../utils/asyncHandler');

// จำนวนแถวในตาราง "ประวัติล่าสุด" และ "ประวัติการตัดสินใจ" (ฝั่ง browser ใช้ค่าเดียวกันตอนเพิ่มแถวสด)
const TABLE_ROWS = 5;

const renderDashboard = asyncHandler(async (req, res) => {
  const latest = sensorService.getLatestWithStatus();
  const chartSeries = sensorService.getChartSeries(24);
  const recent = sensorService.getRecent(TABLE_ROWS);
  const stats = sensorService.getStats(24);
  const plugs = systemService.getPlugs();
  const decisions = systemService.getRecentDecisions(24, TABLE_ROWS);

  res.render('dashboard', {
    title: 'แดชบอร์ด',
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
    title: 'กฎเปิด/ปิดอุปกรณ์',
    activePage: 'logic',
    logic: controlLogic,
    plugStaleSeconds: config.plugStaleSeconds,
  });
};

module.exports = { renderDashboard, renderLogic };
