// กฎการแสดงผลการ์ดสถานะปลั๊ก (พัดลม / เครื่องพ่นไอน้ำ) — ใช้ร่วมกันทั้งตอน SSR
// (views/partials/actuator-card.ejs) และฝั่ง browser (dashboard.client.js) ให้ผลตรงกันเสมอ
// ต้องโหลด /js/labels.js ก่อนไฟล์นี้ (ฝั่ง browser)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./labels'));
  else root.PlugView = factory(root.Labels);
})(typeof self !== 'undefined' ? self : this, function (Labels) {
  'use strict';

  var LABEL = { fan: 'พัดลม', mister: 'เครื่องพ่นไอน้ำ' };
  var STATE_TEXT = { on: 'เปิด', off: 'ปิด' };

  function ageOf(plug, nowMs) {
    return Math.max(0, Math.round((nowMs - new Date(plug.reportedAt).getTime()) / 1000));
  }

  // plug: { device, state, reachable, error, reportedAt, changedAt } — reportedAt null = ยังไม่เคยมีรายงาน
  // nowMs: เวลาปัจจุบันฝั่ง server (ms) — ฝั่ง browser ชดเชย clock skew มาแล้ว
  function describe(plug, nowMs, staleSeconds) {
    var lastKnown = STATE_TEXT[plug.state];
    var lastKnownText = lastKnown ? 'ล่าสุดที่ทราบ: ' + lastKnown + ' (' + Labels.shortTime(plug.changedAt, nowMs) + ')' : '';

    if (!plug.reportedAt) {
      return { online: false, badge: 'unknown', text: 'ไม่ทราบสถานะ', meta: 'ยังไม่มีรายงานจาก ESP32', error: null };
    }

    var ageSeconds = ageOf(plug, nowMs);
    if (ageSeconds > staleSeconds) {
      return {
        online: false,
        badge: 'unknown',
        text: 'ไม่ทราบสถานะ',
        meta: 'ไม่มีรายงานมา ' + Labels.duration(ageSeconds) + (lastKnownText ? ' · ' + lastKnownText : ''),
        error: null,
      };
    }

    if (!plug.reachable) {
      return {
        online: false,
        badge: 'high',
        text: 'ติดต่อปลั๊กไม่ได้',
        meta: 'ตรวจล่าสุด ' + Labels.relativeTime(plug.reportedAt, nowMs) + (lastKnownText ? ' · ' + lastKnownText : ''),
        error: plug.error || null,
      };
    }

    if (!lastKnown) {
      return { online: true, badge: 'unknown', text: 'ไม่ทราบสถานะ', meta: 'ตรวจล่าสุด ' + Labels.relativeTime(plug.reportedAt, nowMs), error: null };
    }

    return {
      online: true,
      badge: plug.state === 'on' ? 'normal' : 'unknown',
      text: plug.state === 'on' ? 'เปิดอยู่' : 'ปิดอยู่',
      meta: lastKnown + 'ตั้งแต่ ' + Labels.shortTime(plug.changedAt, nowMs) + ' · ตรวจล่าสุด ' + Labels.relativeTime(plug.reportedAt, nowMs),
      error: null,
    };
  }

  // สรุปสั้นสำหรับป้ายสถานะบนสุด (Labels.summary) — known = รายงานสดและติดต่อปลั๊กได้
  function brief(plug, nowMs, staleSeconds) {
    if (!plug || !plug.reportedAt || ageOf(plug, nowMs) > staleSeconds) return { on: false, known: false, unreachable: false };
    if (!plug.reachable) return { on: false, known: false, unreachable: true };
    var known = plug.state === 'on' || plug.state === 'off';
    return { on: plug.state === 'on', known: known, unreachable: false };
  }

  return { LABEL: LABEL, describe: describe, brief: brief };
});
