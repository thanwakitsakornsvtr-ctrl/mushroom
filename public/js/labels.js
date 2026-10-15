// คำแปลโค้ดจาก ESP32 เป็นภาษาคน + รูปแบบเวลา — ใช้ร่วมกันทั้งตอน SSR (views/*.ejs) และฝั่ง browser
// (dashboard.client.js) ให้ผลตรงกันเสมอ โค้ดดิบยังเก็บไว้ใน title ให้นักวิจัยดูได้
// ต้นทางของโค้ดอยู่ใน decide() / applyStaleFailSafe() ใน Microcontroller/sketch_dht11/sketch_dht11.ino
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Labels = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SITUATION = {
    IDLE: 'ค่าที่วัดอยู่ในช่วงที่กำหนด',
    VENTILATE_COOLING: 'ร้อนหรืออากาศอับ ต้องเปิดพัดลม',
    VENTILATE_SHORT: 'อากาศเริ่มอับ ต้องถ่ายเทอากาศ',
    VENTILATE_URGENT: 'อากาศอับมาก ต้องเปิดพัดลมด่วน',
    MISTING: 'อากาศแห้ง ต้องเพิ่มความชื้น',
    SENSOR_STALE: 'ไม่ได้รับค่าจากเครื่องวัด ระบบหยุดสั่งงาน',
  };

  var REASON = {
    co2_danger: 'คาร์บอนไดออกไซด์สูงถึงระดับแจ้งเตือนของระบบ',
    co2_high: 'คาร์บอนไดออกไซด์สูงกว่าที่กำหนด',
    temp_high: 'อุณหภูมิสูง ร้อนเกินไป',
    humidity_low: 'ความชื้นต่ำ อากาศแห้ง',
    humidity_high_skip_mist: 'ความชื้นพอแล้ว เลยไม่พ่นเพิ่ม',
    sensor_stale: 'ไม่ได้รับค่าจากเครื่องวัด',
  };

  var TARGET = { on: 'เปิด', off: 'ปิด' };

  var STATUS = { normal: 'อยู่ในช่วงที่กำหนด', high: 'สูงกว่าที่กำหนด', low: 'ต่ำกว่าที่กำหนด', unknown: 'ยังไม่มีข้อมูล', stale: 'ยังไม่ได้รับค่าใหม่' };
  var METRIC_STATUS = {
    co2: { normal: 'อยู่ในช่วงที่กำหนด', high: 'ก๊าซสูงกว่าที่กำหนด' },
    temperature: { normal: 'อยู่ในช่วงที่กำหนด', high: 'ร้อนกว่าที่กำหนด', low: 'เย็นกว่าที่กำหนด' },
    humidity: { normal: 'อยู่ในช่วงที่กำหนด', high: 'ชื้นกว่าที่กำหนด', low: 'อากาศแห้ง' },
  };

  function metricStatus(metric, status, stale, hasValue) {
    if (!hasValue) return STATUS.unknown;
    if (stale) return STATUS.stale;
    return (METRIC_STATUS[metric] || {})[status] || STATUS[status] || STATUS.unknown;
  }

  function connection(o) {
    if (o.connected === false) return 'หน้าเว็บรับข้อมูลใหม่ไม่ได้';
    if (!o.hasData) return 'ยังไม่มีข้อมูล';
    return o.online ? 'ได้รับข้อมูลต่อเนื่อง' : 'ไม่ได้รับข้อมูลใหม่';
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

  // "ปกติ 80–95 %" / CO₂ ไม่มีขั้นต่ำ → "ปกติไม่เกิน 1000 ppm"
  function normalRange(th, unit) {
    if (!th) return '';
    if (!th.normalMin) return 'กำหนดไม่เกิน ' + th.normalMax + ' ' + unit;
    return 'ช่วงที่กำหนด ' + th.normalMin + '–' + th.normalMax + ' ' + unit;
  }

  /* ── ป้ายสรุปสถานะโรงเรือน (ประโยคเดียวบนสุดของหน้า) ───────────────
     o = { hasData, stale, staleSeconds, values, status, co2DangerAt, fan, mister }
     fan/mister = { on, known, unreachable } จาก PlugView.brief()
     คืน { tone: 'ok' | 'warn' | 'alert', title, text } */
  var DEVICE = { fan: 'พัดลม', mister: 'เครื่องพ่นเพิ่มความชื้น' };
  var CHECK_POWER = 'ควรตรวจไฟและการเชื่อมต่ออินเทอร์เน็ตของกล่องควบคุมโรงเรือน';

  function summary(o) {
    if (o.connected === false) {
      return {
        tone: 'warn',
        title: 'ขณะนี้หน้าเว็บรับข้อมูลใหม่ไม่ได้',
        text: 'ตรวจการเชื่อมต่ออินเทอร์เน็ตของเครื่องที่ใช้เปิดเว็บ ' + (o.hasData ? 'ตัวเลขและสถานะด้านล่างเป็นข้อมูลล่าสุดที่ได้รับ' : 'ขณะนี้ยังไม่มีข้อมูลให้แสดง') + ' หน้าเว็บจะลองเชื่อมต่อใหม่อัตโนมัติ',
      };
    }
    if (!o.hasData) {
      return { tone: 'alert', title: 'ยังไม่เคยได้รับข้อมูลจากโรงเรือน', text: CHECK_POWER };
    }
    if (o.stale) {
      return {
        tone: 'alert',
        title: 'ไม่ได้รับข้อมูลใหม่จากโรงเรือนมา ' + duration(o.staleSeconds),
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
      problems.push(co2Danger ? 'คาร์บอนไดออกไซด์สูงถึงระดับแจ้งเตือนของระบบ' : 'คาร์บอนไดออกไซด์สูงกว่าที่กำหนด');
      needFan = true;
      if (co2Danger) tone = 'alert';
    }
    if (s.temperature === 'high') { problems.push('ร้อนเกินไป'); needFan = true; }
    if (s.temperature === 'low') { problems.push('เย็นเกินไป'); unhandled = true; }
    if (s.humidity === 'low') { problems.push('อากาศแห้งเกินไป'); needMister = true; }
    if (s.humidity === 'high') { problems.push('ชื้นเกินไป'); unhandled = true; }

    ['fan', 'mister'].forEach(function (key) {
      var p = o[key] || {};
      if (p.unreachable) {
        actions.push('ติดต่อปลั๊ก' + DEVICE[key] + 'ไม่ได้');
        if (tone === 'ok') tone = 'warn';
      } else if (!p.known) {
        actions.push('ยังไม่ทราบสถานะปลั๊ก' + DEVICE[key]);
        if (tone === 'ok') tone = 'warn';
      } else {
        actions.push('ปลั๊ก' + DEVICE[key] + (p.on ? 'เปิดอยู่' : 'ปิดอยู่'));
      }
    });
    if (needFan) actions.push('ควรตรวจการระบายอากาศที่โรงเรือน');
    if (needMister && !co2Danger) actions.push('ควรตรวจการเพิ่มความชื้นที่โรงเรือน');
    if (unhandled) actions.push('ควรตรวจสภาพโรงเรือนเพิ่มเติม');

    if (['co2', 'temperature', 'humidity'].some(function (key) {
      return ['normal', 'low', 'high'].indexOf(s[key]) === -1;
    })) {
      problems.push('ข้อมูลที่วัดได้ยังไม่ครบ');
    }

    if (problems.length === 0) {
      return {
        tone: tone,
        title: 'ค่าที่วัดได้อยู่ในช่วงที่กำหนด',
        text: actions.join(' · '),
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
