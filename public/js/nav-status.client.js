(function () {
  'use strict';

  var dot = document.getElementById('connection-dot');
  var label = document.getElementById('connection-label');
  var upd = document.getElementById('nav-last-updated');

  function setOnline(online, updatedAt) {
    if (!dot || !label) return;
    dot.classList.toggle('status-dot--online', online);
    dot.classList.toggle('status-dot--offline', !online);
    label.textContent = online ? 'ออนไลน์' : 'ขาดการติดต่อ';
    if (upd && updatedAt) {
      var diff = Math.round((Date.now() - new Date(updatedAt).getTime()) / 1000);
      upd.textContent = diff < 60 ? diff + ' วิที่แล้ว'
        : Math.round(diff / 60) + ' นาทีที่แล้ว';
    }
  }

  function poll() {
    fetch('/api/sensors/latest')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) {
          setOnline(false, null);
          return;
        }
        var age = (Date.now() - new Date(data.createdAt).getTime()) / 1000;
        setOnline(age <= (data.deviceOfflineSeconds || 60), data.createdAt);
      })
      .catch(function () { setOnline(false, null); });
  }

  poll();
  setInterval(poll, 10000);
})();
