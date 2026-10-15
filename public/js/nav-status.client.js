(function () {
  'use strict';

  var Labels = window.Labels;
  var dot = document.getElementById('connection-dot');
  var label = document.getElementById('connection-label');
  var updated = document.getElementById('nav-last-updated');
  var latest;
  var connected = true;
  var clockOffset = 0;

  function render() {
    if (!dot || !label) return;
    if (latest === undefined && connected) return;
    var now = Date.now() + clockOffset;
    var online = !!latest && now - new Date(latest.createdAt).getTime() <= (latest.deviceOfflineSeconds || 60) * 1000;
    dot.classList.toggle('status-dot--online', online && connected);
    dot.classList.toggle('status-dot--offline', !online || !connected);
    label.textContent = Labels.connection({ connected: connected, hasData: !!latest, online: online });
    if (updated && latest !== undefined) {
      updated.textContent = latest ? Labels.relativeTime(latest.createdAt, now) : 'ยังไม่มีข้อมูล';
      updated.title = latest ? Labels.fullTime(latest.createdAt) : '';
    }
  }

  function poll() {
    fetch('/api/sensors/latest', { signal: AbortSignal.timeout(8000), cache: 'no-store' })
      .then(function (response) {
        if (!response.ok && response.status !== 404) throw new Error('Data unavailable');
        var serverTime = Date.parse(response.headers.get('date'));
        if (!isNaN(serverTime)) clockOffset = serverTime - Date.now();
        return response.status === 404 ? null : response.json();
      })
      .then(function (data) {
        latest = data;
        connected = true;
        render();
      })
      .catch(function () { connected = false; render(); });
  }

  poll();
  setInterval(poll, 10000);
  setInterval(render, 5000);
  window.addEventListener('offline', function () { connected = false; render(); });
  window.addEventListener('online', poll);
})();
