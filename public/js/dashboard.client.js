(function () {
  'use strict';

  /* ── Constants ──────────────────────────────────────────────────── */
  /* คำแปล/รูปแบบเวลาใช้ร่วมกับ SSR อยู่ใน /js/labels.js */
  var Labels = window.Labels;
  var STATUS_LABEL = Labels.STATUS;

  /* ── Parse Initial SSR Data ─────────────────────────────────────── */
  var initialData = { latest: null, chartSeries: [], chartBucketSeconds: 300, stats: null, thresholds: {}, deviceId: null };
  try {
    var el = document.getElementById('initial-data');
    if (el) {
      var rawInitialData = (el.content && el.content.textContent)
        || el.textContent
        || el.innerHTML
        || '';
      if (rawInitialData.trim()) {
        initialData = JSON.parse(rawInitialData);
      }
    }
  } catch (e) {
    console.error('[Dashboard] Failed to parse initial data:', e);
  }

  var thresholds = initialData.thresholds || {};

  /* เวลาฝั่ง server (ชดเชย clock ของเครื่องที่เปิด dashboard ไม่ตรงกับ server) */
  var clockOffset = initialData.serverNow ? initialData.serverNow - Date.now() : 0;
  function serverNow() { return Date.now() + clockOffset; }

  var tableRows = initialData.tableRows || 5;
  var plugStaleSeconds = initialData.plugStaleSeconds || 90;
  var deviceOfflineSeconds = initialData.deviceOfflineSeconds || 60;
  var latestReading = initialData.latest || null;
  var lastReadingAt = latestReading ? latestReading.createdAt : null;
  var co2DangerAt = initialData.co2DangerAt || 1500;
  var plugsByDevice = {};
  (initialData.plugs || []).forEach(function (p) { plugsByDevice[p.device] = p; });

  /* ── DOM References ─────────────────────────────────────────────── */
  var connectionDot   = document.getElementById('connection-dot');
  var connectionLabel = document.getElementById('connection-label');
  var navLastUpdated  = document.getElementById('nav-last-updated');
  var historyTableBody = document.getElementById('history-table-body');
  var summaryEl       = document.getElementById('status-summary');
  var esp32Card       = document.getElementById('esp32-health-item');

  /* ── Utilities ──────────────────────────────────────────────────── */
  function formatThaiTime(iso) { return Labels.fullTime(iso); }

  function timeCell(iso) {
    var td = document.createElement('td');
    td.textContent = Labels.shortTime(iso, serverNow());
    td.title = Labels.fullTime(iso);
    return td;
  }

  /* ── Connection State ───────────────────────────────────────────── */
  function setConnectionState(online) {
    connectionDot.classList.toggle('status-dot--online',  online);
    connectionDot.classList.toggle('status-dot--offline', !online);
    connectionLabel.textContent = online ? 'ออนไลน์' : 'ขาดการติดต่อ';
  }

  /* "x นาทีที่แล้ว" ต้องนับใหม่เรื่อยๆ — เรียกจาก refreshLiveness ทุก 5 วิ */
  function renderLastUpdated() {
    if (!navLastUpdated) return;
    if (!lastReadingAt) {
      navLastUpdated.textContent = 'ยังไม่มีข้อมูล';
      navLastUpdated.removeAttribute('title');
      return;
    }
    navLastUpdated.textContent = Labels.relativeTime(lastReadingAt, serverNow());
    navLastUpdated.title = formatThaiTime(lastReadingAt);
  }

  /* ESP32 เงียบเกิน deviceOfflineSeconds — การ์ดเป็นสีเทา ป้ายเป็น "ข้อมูลเก่า" และขึ้นแถบเตือน
     กันคนเข้าใจผิดว่าตัวเลขค้างเป็นค่าปัจจุบัน */
  function applyStale(stale) {
    document.querySelectorAll('.stat-card').forEach(function (card) {
      var valueEl = card.querySelector('[data-role="value"]');
      var hasValue = valueEl && valueEl.textContent.trim() !== '--';
      var isStale = stale && hasValue;
      card.classList.toggle('stat-card--stale', isStale);
      var status = isStale ? 'unknown' : (card.dataset.status || 'unknown');
      var marker = card.querySelector('[data-role="marker"]');
      if (marker) marker.className = 'gauge__marker gauge__marker--' + status;
      var badge = card.querySelector('[data-role="status"]');
      if (!badge) return;
      badge.className = 'status-badge status-badge--' + status;
      badge.textContent = isStale ? STATUS_LABEL.stale : (STATUS_LABEL[status] || STATUS_LABEL.unknown);
    });

  }

  /* ── ป้ายสรุปสถานะบนสุด (ประโยคมาจาก Labels.summary — ตัวเดียวกับ SSR) ── */
  function renderSummary(online) {
    if (!summaryEl) return;
    var now = serverNow();
    var sum = Labels.summary({
      hasData: !!latestReading,
      stale: !online,
      staleSeconds: lastReadingAt ? Math.max(0, Math.round((now - new Date(lastReadingAt).getTime()) / 1000)) : 0,
      values: latestReading || {},
      status: latestReading ? latestReading.status : {},
      co2DangerAt: co2DangerAt,
      fan: window.PlugView.brief(plugsByDevice.fan, now, plugStaleSeconds),
      mister: window.PlugView.brief(plugsByDevice.mister, now, plugStaleSeconds)
    });
    var cls = 'summary summary--' + sum.tone;
    if (summaryEl.className !== cls) summaryEl.className = cls;
    var title = summaryEl.querySelector('[data-role="title"]');
    var text = summaryEl.querySelector('[data-role="text"]');
    /* ตั้งเฉพาะตอนข้อความเปลี่ยน — กัน screen reader อ่านซ้ำทุก 5 วิ */
    if (title && title.textContent !== sum.title) title.textContent = sum.title;
    if (text && text.textContent !== sum.text) text.textContent = sum.text;
  }

  /* ── Stat Card Update ───────────────────────────────────────────── */
  function updateStatCard(metric, value, status) {
    var card = document.querySelector('.stat-card[data-metric="' + metric + '"]');
    if (!card) return;

    /* badge — applyStale() เป็นคนวาดจาก data-status (ให้ "ข้อมูลเก่า" ทับได้) */
    card.dataset.status = status;

    /* hero value — ตั้งค่าตรงๆ ไม่ทำ animation นับเลข (มือถือสเปคต่ำกระตุก) */
    var valueEl = card.querySelector('[data-role="value"]');
    if (valueEl) valueEl.textContent = Labels.value(metric, value);

    /* ตัวชี้บนเกจ — เลื่อนด้วย CSS transition (สีวาดใน applyStale ตาม data-status) */
    var marker = card.querySelector('[data-role="marker"]');
    var g = Labels.gauge(metric, value, thresholds[metric]);
    if (marker) {
      marker.hidden = g.pos === null;
      if (g.pos !== null) marker.style.left = g.pos + '%';
    }

    /* ต่ำสุด/สูงสุด 24 ชม. — ขยับตามค่าใหม่ทันที ไม่ต้องรอโหลดหน้าใหม่ */
    if (value !== null && value !== undefined) {
      var mm = minMax[metric];
      if (mm.min === null || mm.min === undefined || value < mm.min) mm.min = value;
      if (mm.max === null || mm.max === undefined || value > mm.max) mm.max = value;
      renderMinMax(card, metric);
    }
  }

  /* ── Min/Max 24 ชม. (ค่าตั้งต้นจาก SSR แล้วขยายตามค่าสด) ─────────── */
  var st = initialData.stats || {};
  var minMax = {
    co2:         { min: st.minCo2,         max: st.maxCo2 },
    temperature: { min: st.minTemperature, max: st.maxTemperature },
    humidity:    { min: st.minHumidity,    max: st.maxHumidity }
  };

  function renderMinMax(card, metric) {
    var minEl = card.querySelector('[data-role="min"]');
    var maxEl = card.querySelector('[data-role="max"]');
    if (minEl) minEl.textContent = Labels.value(metric, minMax[metric].min);
    if (maxEl) maxEl.textContent = Labels.value(metric, minMax[metric].max);
  }

  function initMinMax() {
    Object.keys(minMax).forEach(function (metric) {
      var card = document.querySelector('.stat-card[data-metric="' + metric + '"]');
      if (card) renderMinMax(card, metric);
    });
  }

  /* ── History Table ──────────────────────────────────────────────── */
  function prependHistoryRow(reading) {
    if (!historyTableBody) return;
    var emptyRow = historyTableBody.querySelector('.empty-row');
    if (emptyRow) emptyRow.parentElement.remove();

    var tr = document.createElement('tr');
    tr.className = 'row-new';
    tr.appendChild(timeCell(reading.createdAt));
    ['co2', 'temperature', 'humidity'].forEach(function (m) {
      var td = document.createElement('td');
      td.className = 'status-' + reading.status[m];
      td.textContent = Labels.value(m, reading[m]);
      tr.appendChild(td);
    });
    historyTableBody.prepend(tr);

    while (historyTableBody.rows.length > tableRows) {
      historyTableBody.deleteRow(historyTableBody.rows.length - 1);
    }
  }

  /* ── Apply incoming SSE reading ─────────────────────────────────── */
  /* แท็บถูกซ่อน (สลับแอป/ล็อกจอ) ไม่ต้องวาดหน้าจอ เก็บค่าล่าสุดไว้แล้ววาดทีเดียวตอนกลับมา — ประหยัด
     CPU/แบตมือถือ ส่วนข้อมูลกราฟยังสะสมต่อ */
  var pendingReading = null;

  function applyReading(reading) {
    latestReading = reading;
    lastReadingAt = reading.createdAt;
    addChartReading(reading);
    if (document.hidden) {
      pendingReading = reading;
      return;
    }
    renderReading(reading);
  }

  function renderReading(reading) {
    updateStatCard('co2',         reading.co2,         reading.status.co2);
    updateStatCard('temperature', reading.temperature, reading.status.temperature);
    updateStatCard('humidity',    reading.humidity,    reading.status.humidity);
    prependHistoryRow(reading);
    if (chart) chart.update('none');
    refreshLiveness();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden || !pendingReading) return;
    var r = pendingReading;
    pendingReading = null;
    renderReading(r);
    refreshLiveness();
  });

  /* ── Chart.js ───────────────────────────────────────────────────── */
  var chart = null;

  function buildChart() {
    var canvas = document.getElementById('history-chart');
    if (!canvas || typeof Chart === 'undefined') return null;
    var ctx = canvas.getContext('2d');

    /* สี/ฟอนต์ทั้งหมดอ่านจาก design tokens ใน style.css — แก้ที่เดียวกราฟตามทันที */
    var css = getComputedStyle(document.documentElement);
    function token(name) { return css.getPropertyValue(name).trim(); }
    var cCo2 = token('--color-metric-co2'), cTemp = token('--color-metric-temp'), cHumid = token('--color-metric-humid');
    var rCo2 = token('--color-metric-co2-rgb'), rTemp = token('--color-metric-temp-rgb'), rHumid = token('--color-metric-humid-rgb');
    var cText = token('--color-text'), cMuted = token('--color-text-muted'), cFaint = token('--color-text-faint');
    var cSurface = token('--color-surface'), cBorder = token('--color-border');
    var fontNum = token('--font-number'), fontBody = token('--font-body');

    /* Gradient fills */
    var gradCo2  = ctx.createLinearGradient(0, 0, 0, 320);
    gradCo2.addColorStop(0,   'rgba(' + rCo2 + ', 0.20)');
    gradCo2.addColorStop(1,   'rgba(' + rCo2 + ', 0.01)');

    var gradTemp = ctx.createLinearGradient(0, 0, 0, 320);
    gradTemp.addColorStop(0,  'rgba(' + rTemp + ', 0.20)');
    gradTemp.addColorStop(1,  'rgba(' + rTemp + ', 0.01)');

    var gradHumid = ctx.createLinearGradient(0, 0, 0, 320);
    gradHumid.addColorStop(0, 'rgba(' + rHumid + ', 0.20)');
    gradHumid.addColorStop(1, 'rgba(' + rHumid + ', 0.01)');

    var series = initialData.chartSeries || [];
    series.forEach(function (p) { bucketKeys.push(bucketOf(p.t)); bucketCounts.push(p.n || 1); });
    var labels = series.map(function (p) { return formatChartTime(p.t); });

    return new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'CO₂ (ppm)',
            data: series.map(function (p) { return p.co2; }),
            borderColor: cCo2,
            backgroundColor: gradCo2,
            fill: true,
            yAxisID: 'yCo2',
            tension: 0.25,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: cCo2,
            borderWidth: 2,
          },
          {
            label: 'อุณหภูมิ (°C)',
            data: series.map(function (p) { return p.temperature; }),
            borderColor: cTemp,
            backgroundColor: gradTemp,
            fill: true,
            yAxisID: 'yTemp',
            tension: 0.25,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: cTemp,
            borderWidth: 2,
          },
          {
            label: 'ความชื้น (%)',
            data: series.map(function (p) { return p.humidity; }),
            borderColor: cHumid,
            backgroundColor: gradHumid,
            fill: true,
            yAxisID: 'yTemp',
            tension: 0.25,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: cHumid,
            borderWidth: 2,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: cSurface,
            titleColor: cText,
            bodyColor: cMuted,
            borderColor: cBorder,
            borderWidth: 1,
            padding: 12,
            cornerRadius: 12,
            titleFont: { family: fontBody, weight: '600', size: 12 },
            bodyFont: { family: fontNum, size: 13 },
            callbacks: {
              title: function (items) { return items[0].label; },
            }
          }
        },
        scales: {
          x: {
            ticks: {
              maxTicksLimit: 6,
              color: cFaint,
              font: { family: fontNum, size: 12 },
              maxRotation: 0,
            },
            grid: { color: cBorder, drawBorder: false },
            border: { display: false }
          },
          yCo2: {
            position: 'right',
            title: { display: true, text: 'CO₂ (ppm)', color: cFaint, font: { size: 12, family: fontNum } },
            ticks: { color: cFaint, font: { family: fontNum, size: 12 } },
            grid: { drawOnChartArea: false, drawBorder: false },
            border: { display: false }
          },
          yTemp: {
            position: 'left',
            title: { display: true, text: '°C / %', color: cFaint, font: { size: 12, family: fontNum } },
            ticks: { color: cFaint, font: { family: fontNum, size: 12 } },
            grid: { color: cBorder, drawBorder: false },
            border: { display: false }
          }
        },
        animation: false,
        normalized: true,
      }
    });
  }

  /* จุดกราฟ = ค่าเฉลี่ยช่วงละ chartBucketSeconds (ตรงกับที่ server คำนวณ) ค่าใหม่ที่ยังอยู่ในช่วงเดิม
     จะเฉลี่ยเข้าจุดสุดท้าย ข้ามช่วงแล้วค่อยเพิ่มจุดใหม่ — กราฟ 24 ชม. จึงมีแค่ ~288 จุดเสมอ */
  var bucketMs = (initialData.chartBucketSeconds || 300) * 1000;
  var maxChartPoints = Math.ceil(24 * 3600 * 1000 / bucketMs);
  var bucketKeys = [];
  var bucketCounts = [];

  function bucketOf(iso) { return Math.floor(new Date(iso).getTime() / bucketMs); }

  function formatChartTime(iso) {
    try { return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return iso; }
  }

  function addChartReading(reading) {
    if (!chart) return;
    var key = bucketOf(reading.createdAt);
    var last = bucketKeys.length - 1;
    var sets = chart.data.datasets;
    var values = [reading.co2, reading.temperature, reading.humidity].map(function (v) { return Math.round(v * 10) / 10; });

    if (last >= 0 && bucketKeys[last] === key) {
      var n = bucketCounts[last];
      sets.forEach(function (ds, i) {
        ds.data[last] = Math.round(((ds.data[last] * n + values[i]) / (n + 1)) * 10) / 10;
      });
      bucketCounts[last] = n + 1;
      return;
    }

    bucketKeys.push(key);
    bucketCounts.push(1);
    chart.data.labels.push(formatChartTime(new Date(key * bucketMs).toISOString()));
    sets.forEach(function (ds, i) { ds.data.push(values[i]); });
    while (bucketKeys.length > maxChartPoints) {
      bucketKeys.shift();
      bucketCounts.shift();
      chart.data.labels.shift();
      sets.forEach(function (ds) { ds.data.shift(); });
    }
  }

  /* ── Actuator cards ────────────────────────────────────────────── */
  /* ── Plug status cards (กฎการแสดงผลอยู่ใน /js/plug-view.js ใช้ร่วมกับ SSR) ── */
  function renderPlugCard(device) {
    var plug = plugsByDevice[device];
    var card = document.querySelector('.actuator-card[data-device="' + device + '"]');
    if (!plug || !card || !window.PlugView) return;
    var v = window.PlugView.describe(plug, serverNow(), plugStaleSeconds);

    var dot = card.querySelector('[data-role="dot"]');
    if (dot) {
      dot.classList.toggle('status-dot--online', v.online);
      dot.classList.toggle('status-dot--offline', !v.online);
    }
    var badge = card.querySelector('[data-role="state"]');
    if (badge) {
      badge.className = 'status-badge status-badge--' + v.badge;
      badge.textContent = v.text;
    }
    var meta = card.querySelector('[data-role="updated"]');
    if (meta) meta.textContent = v.meta;
    var err = card.querySelector('[data-role="error"]');
    if (err) {
      err.hidden = !v.error;
      err.textContent = v.error || '';
    }
  }

  function applyPlug(plug) {
    plugsByDevice[plug.device] = plug;
    renderPlugCard(plug.device);
    renderSummary(isDeviceOnline());
  }

  function isDeviceOnline() {
    if (!lastReadingAt) return false;
    return serverNow() - new Date(lastReadingAt).getTime() <= deviceOfflineSeconds * 1000;
  }

  /* ประเมินใหม่เป็นระยะ — ถ้า ESP32 เงียบไป หน้าจอต้องเปลี่ยนเป็นออฟไลน์/ไม่ทราบสถานะเอง
     ไม่ใช่ค้างค่าสุดท้ายไว้ */
  function refreshLiveness() {
    Object.keys(plugsByDevice).forEach(renderPlugCard);
    var online = isDeviceOnline();
    setConnectionState(online);
    applyStale(!online);
    renderSummary(online);
    renderLastUpdated();
    renderEsp32Card(online);
  }

  /* ── การ์ดกล่องควบคุม ESP32 (ดูจากว่ายังส่งค่าเซนเซอร์มาอยู่ไหม) ──── */
  function renderEsp32Card(online) {
    if (!esp32Card) return;
    var dot = esp32Card.querySelector('[data-role="dot"]');
    if (dot) {
      dot.classList.toggle('status-dot--online', online);
      dot.classList.toggle('status-dot--offline', !online);
    }
    var badge = esp32Card.querySelector('[data-role="state"]');
    if (badge) {
      badge.className = 'status-badge status-badge--' + (online ? 'normal' : 'high');
      badge.textContent = online ? 'ทำงานอยู่' : 'ขาดการติดต่อ';
    }
    var meta = esp32Card.querySelector('[data-role="meta"]');
    if (meta) meta.textContent = lastReadingAt ? 'ส่งค่าล่าสุด ' + Labels.relativeTime(lastReadingAt, serverNow()) : 'ยังไม่เคยติดต่อ';
    if (latestReading && latestReading.deviceId) esp32Card.title = latestReading.deviceId;
  }

  /* ── Decision log ──────────────────────────────────────────────── */
  function prependDecisionRow(d) {
    var body = document.getElementById('decision-log-body');
    if (!body) return;
    var emptyRow = body.querySelector('.empty-row');
    if (emptyRow) emptyRow.remove();

    var tr = document.createElement('tr');
    tr.className = 'row-new';
    tr.appendChild(timeCell(d.ts));

    var situation = document.createElement('td');
    situation.className = 'cell-wrap';
    situation.textContent = Labels.situation(d.situation);
    situation.title = d.situation || '';
    tr.appendChild(situation);

    var action = document.createElement('td');
    action.className = 'cell-wrap';
    [
      { label: 'พัดลม', value: d.targets.fan },
      { label: 'เครื่องพ่น', value: d.targets.mister }
    ].forEach(function (item) {
      var chip = document.createElement('span');
      chip.className = 'target target--' + item.value;
      chip.textContent = (Labels.TARGET[item.value] || item.value) + item.label;
      action.appendChild(chip);
      action.appendChild(document.createTextNode(' '));
    });
    action.title = 'พัดลม: ' + Labels.target(d.targets.fan) + ', เครื่องพ่นไอน้ำ: ' + Labels.target(d.targets.mister);
    tr.appendChild(action);

    var reasons = document.createElement('td');
    reasons.className = 'cell-wrap';
    reasons.textContent = Labels.reasons(d.reasons);
    reasons.title = (d.reasons || []).join(', ');
    tr.appendChild(reasons);
    body.prepend(tr);
    while (body.rows.length > tableRows) body.deleteRow(body.rows.length - 1);
  }

  /* ── SSE ────────────────────────────────────────────────────────── */
  function connectEvents() {
    var source = new EventSource('/api/sensors/events');
    source.addEventListener('reading', function (event) {
      try {
        var reading = JSON.parse(event.data);
        applyReading(reading);
      } catch (e) {
        console.error('[Dashboard] SSE parse error:', e);
      }
    });
    source.addEventListener('plug', function (event) {
      try { applyPlug(JSON.parse(event.data)); } catch (e) { console.error('[Dashboard] SSE plug parse error:', e); }
    });
    source.addEventListener('control', function (event) {
      try { prependDecisionRow(JSON.parse(event.data)); } catch (e) { console.error('[Dashboard] SSE control parse error:', e); }
    });
    source.onopen  = function () { setConnectionState(isDeviceOnline()); };
    source.onerror = function () { setConnectionState(false); };
  }

  /* ── Init ───────────────────────────────────────────────────────── */
  /* Init 24h min/max from SSR stats */
  initMinMax();

  /* Build chart */
  chart = buildChart();

  /* Set connection state + re-evaluate staleness periodically */
  refreshLiveness();
  setInterval(refreshLiveness, 5000);

  /* Connect SSE */
  connectEvents();

  /* จำว่าเปิด/ปิดส่วน "ข้อมูลละเอียด" ไว้ในเครื่อง (นักวิจัยเปิดค้างไว้ได้) */
  var research = document.getElementById('research-details');
  if (research) {
    try { if (localStorage.getItem('research-open') === '1') research.open = true; } catch (e) { /* storage ปิดอยู่ */ }
    research.addEventListener('toggle', function () {
      try { localStorage.setItem('research-open', research.open ? '1' : '0'); } catch (e) { /* storage ปิดอยู่ */ }
    });
  }

})();
