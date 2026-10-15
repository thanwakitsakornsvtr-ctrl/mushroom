// Ideal cultivation ranges for oyster mushroom (เห็ดนางฟ้า) fruiting rooms.
// Used to classify each reading as low / normal / high for the dashboard badges.
module.exports = {
  co2: {
    unit: 'ppm',
    label: 'CO2',
    normalMin: 0,
    normalMax: 1000,
    // no meaningful "low" for CO2, only normal/high
  },
  temperature: {
    unit: '°C',
    label: 'อุณหภูมิ',
    normalMin: 22,
    normalMax: 30,
  },
  humidity: {
    unit: '%',
    label: 'ความชื้น',
    normalMin: 80,
    normalMax: 95,
  },
};

function classify(metric, value) {
  const range = module.exports[metric];
  if (!range || value === null || value === undefined) return 'unknown';
  if (value < range.normalMin) return 'low';
  if (value > range.normalMax) return 'high';
  return 'normal';
}

module.exports.classify = classify;
