// คำแปลโค้ดจาก ESP32 เป็นภาษาคน + รูปแบบเวลา — ใช้ร่วมกันทั้งตอน SSR (views/*.ejs) และฝั่ง browser
// (dashboard.client.js) ให้ผลตรงกันเสมอ โค้ดดิบยังเก็บไว้ใน title ให้นักวิจัยดูได้
// ต้นทางของโค้ดอยู่ใน decide() / applyStaleFailSafe() ใน Microcontroller/sketch_dht11/sketch_dht11.ino
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Labels = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SITUATION = {
    IDLE: 'ปกติ',
    VENTILATE_COOLING: 'ร้อนหรืออากาศอับ',
    VENTILATE_SHORT: 'CO₂ สูงกว่าเกณฑ์',
    VENTILATE_URGENT: 'CO₂ สูงระดับแจ้งเตือน',
    MISTING: 'อากาศแห้ง · เปิดเครื่องพ่นน้ำ',
    SENSOR_STALE: 'ขาดค่าเซนเซอร์ · ปิดเครื่องพ่นน้ำ',
  };

  var REASON = {
    co2_danger: 'CO₂ ถึงระดับแจ้งเตือน',
    co2_high: 'CO₂ สูงกว่าเกณฑ์',
    temp_high: 'อุณหภูมิสูงกว่าเกณฑ์',
    humidity_low: 'ความชื้นต่ำกว่าเกณฑ์',
    humidity_high_skip_mist: 'ความชื้นพอแล้ว',
    sensor_stale: 'ไม่ได้รับค่าจากเซนเซอร์',
  };

  var TARGET = { on: 'เปิด', off: 'ปิด' };

  var STATUS = { normal: 'ปกติ', high: 'สูงกว่าเกณฑ์', low: 'ต่ำกว่าเกณฑ์', unknown: 'ไม่มีข้อมูล', stale: 'ข้อมูลเก่า' };
  var METRIC_STATUS = {
    co2: { normal: 'ปกติ', high: 'สูงกว่าเกณฑ์' },
    temperature: { normal: 'ปกติ', high: 'ร้อนเกิน', low: 'เย็นเกิน' },
    humidity: { normal: 'ปกติ', high: 'ชื้นเกิน', low: 'อากาศแห้ง' },
  };

  function metricStatus(metric, status, stale, hasValue) {
    if (!hasValue) return STATUS.unknown;
    if (stale) return STATUS.stale;
    return (METRIC_STATUS[metric] || {})[status] || STATUS[status] || STATUS.unknown;
  }

  function connection(o) {
    if (o.connected === false) return 'หน้าเว็บขาดการเชื่อมต่อ';
    if (!o.hasData) return 'ไม่มีข้อมูล';
    return o.online ? 'ออนไลน์' : 'ขาดการติดต่อ';
  }

  var TZ = 'Asia/Bangkok';

  // ปัดเลขให้อ่านง่าย — CO₂ เป็นจำนวนเต็ม อุณหภูมิ/ความชื้นทศนิยม 1 ตำแหน่ง (เซนเซอร์/ตัวจำลองอาจส่งทศนิยมยาวมา)
  var DECIMALS = { co2: 0, temperature: 1, humidity: 1 };

  function value(metric, v) {
    if (v === null || v === undefined || v === '' || isNaN(v)) return '--';
    var d = DECIMALS[metric] !== undefined ? DECIMALS[metric] : 1;
    var f = Math.pow(10, d);
    return String(Math.round(Number(v) * f) / f);
  }

  function situation(code) { return SITUATION[code] || 'ยังไม่มีคำอธิบายสภาพนี้'; }

  function reasons(codes) {
    if (!codes || codes.length === 0) return '-';
    return codes.map(function (c) { return REASON[c] || 'ยังไม่มีคำอธิบายเหตุผลนี้'; }).join(', ');
  }

  function target(code) { return TARGET[code] || 'ไม่ทราบคำสั่ง'; }

  function actionSummary(fanTarget, misterTarget) {
    var actions = [];
    if (fanTarget) actions.push(target(fanTarget) + 'พัดลม');
    if (misterTarget) actions.push(target(misterTarget) + 'เครื่องพ่นเพิ่มความชื้น');
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

  // "ปกติไม่เกิน 1000 ppm" / "ช่วงที่กำหนด 80–95 %"
  function normalRange(th, unit) {
    if (!th) return '';
    if (!th.normalMin) return 'ไม่เกิน ' + th.normalMax + ' ' + unit;
    return 'ช่วงปกติ ' + th.normalMin + '–' + th.normalMax + ' ' + unit;
  }

  /* ── ป้ายสรุปสถานะโรงเรือน (ประโยคเดียวบนสุดของหน้า) ───────────────
     o = { hasData, stale, staleSeconds, values, status, co2DangerAt, mister }
     mister = { on, known, unreachable } จาก PlugView.brief()
     คืน { tone: 'ok' | 'warn' | 'alert', title, text } */
  var DEVICE = { mister: 'เครื่องพ่นน้ำ' };
  var CHECK_POWER = 'ตรวจไฟและอินเทอร์เน็ตของกล่องควบคุม';

  function summary(o) {
    if (o.connected === false) {
      return {
        tone: 'warn',
        title: 'หน้าเว็บขาดการเชื่อมต่อ',
        text: (o.hasData ? 'แสดงข้อมูลล่าสุดที่ได้รับ · ' : '') + 'กำลังลองเชื่อมต่อใหม่อัตโนมัติ',
      };
    }
    if (!o.hasData) {
      return { tone: 'alert', title: 'ยังไม่มีข้อมูลจากโรงเรือน', text: CHECK_POWER };
    }
    if (o.stale) {
      return {
        tone: 'alert',
        title: 'ขาดการติดต่อจากโรงเรือน ' + duration(o.staleSeconds),
        text: 'ตัวเลขด้านล่างเป็นค่าเก่า · ' + CHECK_POWER,
      };
    }

    var s = o.status || {};
    var problems = [];
    var actions = [];
    var tone = 'ok';
    var needVent = false;
    var needMister = false;
    var unhandled = false;
    var co2Danger = s.co2 === 'high' && o.values.co2 >= o.co2DangerAt;

    if (s.co2 === 'high') {
      problems.push(co2Danger ? 'CO₂ สูงระดับแจ้งเตือน' : 'CO₂ สูงกว่าเกณฑ์');
      needVent = true;
      if (co2Danger) tone = 'alert';
    }
    if (s.temperature === 'high') { problems.push('ร้อนเกินไป'); needVent = true; }
    if (s.temperature === 'low') { problems.push('เย็นเกินไป'); unhandled = true; }
    if (s.humidity === 'low') { problems.push('อากาศแห้ง'); needMister = true; }
    if (s.humidity === 'high') { problems.push('ชื้นเกินไป'); unhandled = true; }

    ['mister'].forEach(function (key) {
      var p = o[key] || {};
      if (p.unreachable) {
        actions.push('ติดต่อปลั๊ก' + DEVICE[key] + 'ไม่ได้');
        if (tone === 'ok') tone = 'warn';
      } else if (!p.known) {
        actions.push('ไม่ทราบสถานะปลั๊ก' + DEVICE[key]);
        if (tone === 'ok') tone = 'warn';
      } else {
        actions.push('ปลั๊ก' + DEVICE[key] + (p.on ? 'เปิดอยู่' : 'ปิดอยู่'));
      }
    });
    if (needVent) actions.push('ควรตรวจการระบายอากาศ');
    if (needMister) actions.push('ควรตรวจเครื่องพ่นน้ำ');
    if (unhandled) actions.push('ควรตรวจสภาพโรงเรือน');

    if (['co2', 'temperature', 'humidity'].some(function (key) {
      return ['normal', 'low', 'high'].indexOf(s[key]) === -1;
    })) {
      problems.push('ข้อมูลที่วัดได้ยังไม่ครบ');
    }

    if (problems.length === 0) {
      return {
        tone: tone,
        title: 'สภาพโรงเรือนปกติ',
        text: actions.join(' · '),
      };
    }

    if (tone === 'ok') tone = 'warn';
    return { tone: tone, title: problems.join(' · '), text: actions.join(' · ') };
  }

  return {
    SITUATION: SITUATION,
    REASON: REASON,
    TARGET: TARGET,
    STATUS: STATUS,
    metricStatus: metricStatus,
    connection: connection,
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
