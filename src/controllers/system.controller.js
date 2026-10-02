const systemService = require('../services/systemService');
const asyncHandler = require('../utils/asyncHandler');
const { decisionSchema, plugsSchema } = require('../validators/decisionSchema');

const getActuators = asyncHandler(async (req, res) => {
  res.json({ actuators: systemService.getActuators() });
});

const getDecisions = asyncHandler(async (req, res) => {
  const hours = Math.min(Math.max(Number(req.query.hours) || 24, 1), 168);
  res.json({ hours, decisions: systemService.getRecentDecisions(hours) });
});

// ESP32 ตัดสินใจ + คุมปลั๊ก Tapo เองแล้วรายงานผลมาที่นี่ (แทนที่ control-engine/actuator-service
// เดิมที่คุยกันผ่าน MQTT) — บันทึกทั้ง decision (ประเมิน+เหตุผล+เป้าหมาย) และผลการสั่งปลั๊กจริง
// (เฉพาะ device ที่ state เปลี่ยนจริงในรอบนี้) ในคำขอเดียว
const postDecision = asyncHandler(async (req, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }
  const { situation, reasons, targets, smoothed, classification, changed, outcomes } = parsed.data;

  systemService.recordDecision({
    ts: new Date().toISOString(),
    mode: 'live',
    situation,
    reasons,
    targets,
    smoothed: smoothed || null,
    classification: classification || null,
  });

  for (const device of ['fan', 'mister']) {
    if (!changed[device]) continue;
    const outcome = outcomes?.[device] || { applied: false, error: 'missing_outcome' };
    systemService.recordActuatorEvent({
      device,
      state: targets[device],
      online: outcome.applied,
      lastCmdId: null,
      lastError: outcome.applied ? null : { code: 'apply_failed', message: outcome.error || 'unknown error' },
      ts: new Date().toISOString(),
    });
  }

  res.status(202).json({ status: 'recorded' });
});

const getPlugs = asyncHandler(async (req, res) => {
  res.json({ plugs: systemService.getPlugs() });
});

const postPlugs = asyncHandler(async (req, res) => {
  const parsed = plugsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }
  const plugs = ['fan', 'mister'].map((device) => systemService.recordPlugStatus(device, parsed.data[device]));
  res.status(202).json({ plugs });
});

module.exports = { getActuators, getDecisions, postDecision, getPlugs, postPlugs };
