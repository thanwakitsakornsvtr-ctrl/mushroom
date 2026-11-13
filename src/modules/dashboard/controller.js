const sensorService = require('../sensors');
const systemService = require('../system');
const { thresholds } = sensorService;
const config = require('../../shared/config');
const plugView = require('../../../public/js/plug-view');
const labels = require('../../../public/js/labels');
const { controlLogic } = systemService;
const asyncHandler = require('../../shared/utils/asyncHandler');
const site = require('./site');

// จำนวนแถวในตาราง "ประวัติล่าสุด" (ฝั่ง browser ใช้ค่าเดียวกันตอนเพิ่มแถวสด)
const TABLE_ROWS = 5;

const renderDashboard = asyncHandler(async (req, res) => {
  const latest = sensorService.getLatestWithStatus();
  const chartSeries = sensorService.getChartSeries(24);
  const recent = sensorService.getRecent(TABLE_ROWS);
  const stats = sensorService.getStats(24);
  const plugs = systemService.getPlugs();
  const decisions = systemService.getRecentDecisions(24, TABLE_ROWS);

  res.render('dashboard', {
    title: 'สภาพโรงเรือน',
    description: 'ติดตาม CO₂ อุณหภูมิ ความชื้น และสถานะเครื่องพ่นน้ำอัตโนมัติของโรงเห็ดนางฟ้า',
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
    logic: controlLogic,
    nowMs: Date.now(),
    plugStaleSeconds: config.plugStaleSeconds,
    deviceOfflineSeconds: config.deviceOfflineSeconds,
    decisions,
    tableRows: TABLE_ROWS,
    co2DangerAt: controlLogic.co2DangerAtOrAbove,
  });
});

module.exports = { renderDashboard };
