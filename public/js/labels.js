// คำแปลโค้ดจาก ESP32 เป็นภาษาคน + รูปแบบเวลา — ใช้ร่วมกันทั้งตอน SSR (views/*.ejs) และฝั่ง browser
// (dashboard.client.js) ให้ผลตรงกันเสมอ โค้ดดิบยังเก็บไว้ใน title ให้นักวิจัยดูได้
// ต้นทางของโค้ดอยู่ใน decide() / applyStaleFailSafe() ใน Microcontroller/sketch_dht11/sketch_dht11.ino
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Labels = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SITUATION = {
    IDLE: 'ค่าปกติ เครื่องพัก',
    VENTILATE_COOLING: 'ร้อนหรืออากาศอับ ต้องเปิดพัดลม',
    VENTILATE_SHORT: 'อากาศเริ่มอับ ต้องถ่ายเทอากาศ',
    VENTILATE_URGENT: 'อากาศอับมาก ต้องเปิดพัดลมด่วน',
    MISTING: 'อากาศแห้ง ต้องพ่นไอน้ำ',
    SENSOR_STALE: 'กล่องวัดค่าเงียบ ระบบหยุดสั่งงานเพื่อความปลอดภัย',
  };

  var REASON = {
    co2_danger: 'อากาศอับมากเกินไป',
    co2_high: 'อากาศอับ',
    temp_high: 'อุณหภูมิสูง ร้อนเกินไป',
    humidity_low: 'ความชื้นต่ำ อากาศแห้ง',
    humidity_high_skip_mist: 'ความชื้นพอแล้ว เลยไม่พ่นเพิ่ม',
    sensor_stale: 'กล่องวัดค่าไม่ส่งข้อมูล',
  };

  var TARGET = { on: 'เปิด', off: 'ปิด' };

  var STATUS = { normal: 'ปกติ', high: 'สูงเกิน', low: 'ต่ำเกิน', unknown: 'ไม่มีข้อมูล', stale: 'ข้อมูลเก่า' };

  var TZ = 'Asia/Bangkok';

  // ปัดเลขให้อ่านง่าย — CO₂ เป็นจำนวนเต็ม อุณหภูมิ/ความชื้นทศนิยม 1 ตำแหน่ง (เซนเซอร์/ตัวจำลองอาจส่งทศนิยมยาวมา)
  var DECIMALS = { co2: 0, temperature: 1, humidity: 1 };

  function value(metric, v) {
    if (v === null || v === undefined || v === '' || isNaN(v)) return '--';
    var d = DECIMALS[metric] !== undefined ? DECIMALS[metric] : 1;
    var f = Math.pow(10, d);
    return String(Math.round(Number(v) * f) / f);
  }

  function situation(code) { return SITUATION[code] || code || '-'; }

  function reasons(codes) {
    if (!codes || codes.length === 0) return '-';
    return codes.map(function (c) { return REASON[c] || c; }).join(', ');
  }

  function target(code) { return TARGET[code] || code || '-'; }

  function actionSummary(fanTarget, misterTarget) {
    var actions = [];
    if (fanTarget) actions.push(target(fanTarget) + 'พัดลม');
    if (misterTarget) actions.push(target(misterTarget) + 'เครื่องพ่นไอน้ำ');
    return actions.length ? actions.join(' · ') : '-';
  }

  function dayKey(ms) {
    return new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ });
  }

  // เวลาเต็ม เช่น "1 ต.ค. 2569 14:33:59" — ใช้ใน title / ตอนต้องการความแม่นยำ
  function fullTime(iso) {
    try {
      return new Date(iso).toLocaleString('th-TH', {
        timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    } catch (e) { return String(iso); }
  }

  // เวลาแบบสั้นในตาราง: วันนี้แสดงแค่ "14:33:59" วันอื่นแสดง "30 ก.ย. 14:33:59"
  function shortTime(iso, nowMs) {
    try {
      var ms = new Date(iso).getTime();
      if (dayKey(ms) === dayKey(nowMs)) {
        return new Date(ms).toLocaleTimeString('th-TH', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }
      return new Date(ms).toLocaleString('th-TH', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) { return String(iso); }
  }

  function duration(seconds) {
    if (seconds < 60) return seconds + ' วินาที';
    if (seconds < 3600) return Math.floor(seconds / 60) + ' นาที';
    if (seconds < 172800) return Math.floor(seconds / 3600) + ' ชั่วโมง';
    return Math.floor(seconds / 86400) + ' วัน';
  }

  // "เมื่อสักครู่" / "5 นาทีที่แล้ว"
  function relativeTime(iso, nowMs) {
    var seconds = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000));
    if (seconds < 10) return 'เมื่อสักครู่';
    return duration(seconds) + 'ที่แล้ว';
  }

  /* ── เกจช่วงปกติ ──────────────────────────────────────────────────
     สเกลของแต่ละค่า (ซ้ายสุด–ขวาสุดของแถบ) ตั้งให้ช่วงปกติอยู่กลางๆ และเห็นว่าห่างจากขอบแค่ไหน */
  var GAUGE_SCALE = { co2: [0, 2000], temperature: [15, 40], humidity: [50, 100] };

  function pct(scale, v) {
    var p = ((v - scale[0]) / (scale[1] - scale[0])) * 100;
    return Math.min(100, Math.max(0, Math.round(p * 10) / 10));
  }

  // { zoneLeft, zoneWidth } = แถบช่วงปกติ, pos = ตำแหน่งตัวชี้ค่าปัจจุบัน (null = ไม่มีค่า) — หน่วย % ของความกว้าง
  function gauge(metric, v, th) {
    var scale = GAUGE_SCALE[metric] || [0, 100];
    var zoneLeft = th ? pct(scale, th.normalMin) : 0;
    var zoneRight = th ? pct(scale, th.normalMax) : 0;
    var hasValue = v !== null && v !== undefined && !isNaN(v);
    return { zoneLeft: zoneLeft, zoneWidth: zoneRight - zoneLeft, pos: hasValue ? pct(scale, Number(v)) : null };
  }

  // "ปกติ 80–95 %" / CO₂ ไม่มีขั้นต่ำ → "ปกติไม่เกิน 1000 ppm"
  function normalRange(th, unit) {
    if (!th) return '';
    if (!th.normalMin) return 'ปกติไม่เกิน ' + th.normalMax + ' ' + unit;
    return 'ปกติ ' + th.normalMin + '–' + th.normalMax + ' ' + unit;
  }

  /* ── ป้ายสรุปสถานะโรงเรือน (ประโยคเดียวบนสุดของหน้า) ───────────────
     o = { hasData, stale, staleSeconds, values, status, co2DangerAt, fan, mister }
     fan/mister = { on, known, unreachable } จาก PlugView.brief()
     คืน { tone: 'ok' | 'warn' | 'alert', title, text } */
  var DEVICE = { fan: 'พัดลม', mister: 'เครื่องพ่นไอน้ำ' };
  var CHECK_POWER = 'ลองตรวจไฟและ Wi-Fi ของกล่อง ESP32 ในโรงเรือน';

  function summary(o) {
    if (!o.hasData) {
      return { tone: 'alert', title: 'ยังไม่เคยได้รับข้อมูลจากโรงเรือน', text: CHECK_POWER };
    }
    if (o.stale) {
      return {
        tone: 'alert',
        title: 'ขาดการติดต่อกับโรงเรือนมา ' + duration(o.staleSeconds),
        text: 'ตัวเลขด้านล่างเป็นค่าล่าสุดที่ได้รับ ไม่ใช่ค่าตอนนี้ — ' + CHECK_POWER,
      };
    }

    var s = o.status || {};
    var problems = [];
    var actions = [];
    var tone = 'ok';
    var needFan = false;
    var needMister = false;
    var unhandled = false;
    var co2Danger = s.co2 === 'high' && o.values.co2 >= o.co2DangerAt;

    if (s.co2 === 'high') {
      problems.push(co2Danger ? 'CO₂ สูงถึงขั้นอันตราย' : 'อากาศอับ (CO₂ สูง)');
      needFan = true;
      if (co2Danger) tone = 'alert';
    }
    if (s.temperature === 'high') { problems.push('ร้อนเกินไป'); needFan = true; }
    if (s.temperature === 'low') { problems.push('เย็นเกินไป'); unhandled = true; }
    if (s.humidity === 'low') { problems.push('อากาศแห้งเกินไป'); needMister = true; }
    if (s.humidity === 'high') { problems.push('ชื้นเกินไป'); unhandled = true; }

    function respond(key, doing) {
      var p = o[key] || {};
      if (p.unreachable) return; // แจ้งรวมด้านล่าง
      if (!p.known) actions.push('ไม่ทราบสถานะ' + DEVICE[key]);
      else if (p.on) actions.push(DEVICE[key] + doing);
      else actions.push('ระบบจะเปิด' + DEVICE[key] + 'ให้อัตโนมัติ');
    }
    if (needFan) respond('fan', 'กำลังเปิดระบายอากาศ');
    if (needMister) {
      if (co2Danger) actions.push('งดพ่นไอน้ำชั่วคราวเพราะ CO₂ สูง');
      else respond('mister', 'กำลังพ่นเพิ่มความชื้น');
    }
    if (unhandled) actions.push('ข้อนี้ระบบแก้เองไม่ได้ ควรเข้าไปดูที่โรงเรือน');

    ['fan', 'mister'].forEach(function (key) {
      if (o[key] && o[key].unreachable) {
        actions.push('ติดต่อปลั๊ก' + DEVICE[key] + 'ไม่ได้');
        if (tone === 'ok') tone = 'warn';
      }
    });

    if (problems.length === 0) {
      if (actions.length === 0) {
        ['fan', 'mister'].forEach(function (key) {
          if (o[key] && o[key].known && o[key].on) actions.push('ตอนนี้' + DEVICE[key] + 'เปิดอยู่');
        });
      }
      return {
        tone: tone,
        title: 'สภาพในโรงเรือนปกติดี',
        text: actions.length ? actions.join(' · ') : 'ไม่ต้องทำอะไร ระบบคอยดูแลให้อัตโนมัติ',
      };
    }

    if (tone === 'ok') tone = 'warn';
    return { tone: tone, title: problems.join(' และ '), text: actions.join(' · ') };
  }

  return {
    SITUATION: SITUATION,
    REASON: REASON,
    TARGET: TARGET,
    STATUS: STATUS,
    value: value,
    situation: situation,
    reasons: reasons,
    target: target,
    actionSummary: actionSummary,
    fullTime: fullTime,
    shortTime: shortTime,
    duration: duration,
    relativeTime: relativeTime,
    gauge: gauge,
    normalRange: normalRange,
    summary: summary,
  };
});
