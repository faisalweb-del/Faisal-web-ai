// Service worker Partical Message: menampilkan notifikasi pesan baru saat web ditutup atau di latar belakang.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { try { d = { body: e.data.text() }; } catch (y) {} }
  if (d.data && !d.title) d = d.data;
  e.waitUntil((async function () {
    var cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    var seen = cs.some(function (c) { return c.visibilityState === 'visible'; });
    if (seen) { cs.forEach(function (c) { c.postMessage({ type: 'push' }); }); return; }
    await self.registration.showNotification(d.title || 'Partical Message', {
      body: d.body || 'Ada pesan baru',
      icon: '/img/pm-192.png', badge: '/img/pm-white.png',
      tag: d.tag || 'faisal-chat', renotify: true, vibrate: [120, 60, 120],
      data: { url: d.url || '/' }
    });
  })());
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil((async function () {
    var cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (var i = 0; i < cs.length; i++) {
      if ('focus' in cs[i]) { try { await cs[i].focus(); } catch (x) {} cs[i].postMessage({ type: 'open-chat', url: url }); return; }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});
