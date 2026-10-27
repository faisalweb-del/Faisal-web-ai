// Service worker Partical Message: notifikasi pesan baru saat web ditutup, dengan tombol "Jawab pesan" dan "Tandai sudah dibaca".
var clickT = {}; // ketukan pertama per obrolan (untuk "ketuk dua kali baru buka aplikasi")
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

function post(body) {
  return fetch('/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(function (r) { return r.ok ? r.json().catch(function () { return { ok: true }; }) : { ok: false }; })
    .catch(function () { return { ok: false }; });
}
function ackOf(d) { return d && d.ack && d.ack.t ? d.ack : null; }

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { try { d = { body: e.data.text() }; } catch (y) {} }
  if (d.data && !d.title) d = d.data;
  e.waitUntil((async function () {
    if (d.ack) { post({ op: 'ack', t: d.ack.t, u: d.ack.u, m: d.ack.m, k: d.ack.k }); }
    var cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    var seen = cs.some(function (c) { return c.visibilityState === 'visible'; });
    if (seen) { cs.forEach(function (c) { c.postMessage({ type: 'push' }); }); return; }
    var tag = d.tag || 'faisal-chat', lines = [];
    try { var old = await self.registration.getNotifications({ tag: tag }); if (old[0] && old[0].data && old[0].data.lines) lines = old[0].data.lines.slice(); } catch (x) {}
    lines.push(d.body || 'Ada pesan baru'); lines = lines.slice(-6);
    var opt = {
      body: lines.join('\n'), icon: '/img/pm-192.png', badge: '/img/pm-white.png',
      tag: tag, renotify: true, vibrate: [120, 60, 120],
      data: { url: d.url || '/', ack: ackOf(d), lines: lines }
    };
    if (ackOf(d) && ackOf(d).r) opt.actions = [
      { action: 'reply', type: 'text', title: 'Jawab pesan', placeholder: 'Tulis balasan' },
      { action: 'read', title: 'Tandai sudah dibaca' }
    ];
    await self.registration.showNotification(d.title || 'Partical Message', opt);
  })());
});

async function openApp(url) {
  var cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (var i = 0; i < cs.length; i++) {
    if ('focus' in cs[i]) { try { await cs[i].focus(); } catch (x) {} cs[i].postMessage({ type: 'open-chat', url: url }); return; }
  }
  if (self.clients.openWindow) await self.clients.openWindow(url);
}

self.addEventListener('notificationclick', function (e) {
  var n = e.notification, d = n.data || {}, ack = ackOf(d), tag = n.tag || '';
  if (e.action === 'read' && ack && ack.r) { // tandai sudah dibaca: tidak membuka aplikasi, centang di HP pengirim jadi hijau
    n.close();
    e.waitUntil(post({ op: 'nact', a: 'read', t: ack.t, u: ack.u, m: ack.m, r: ack.r }));
    return;
  }
  if (e.action === 'reply' && ack && ack.r && e.reply) { // jawab langsung dari notifikasi
    var txt = String(e.reply).trim();
    n.close();
    e.waitUntil((async function () {
      var r = await post({ op: 'nact', a: 'reply', t: ack.t, u: ack.u, m: ack.m, r: ack.r, text: txt });
      await self.registration.showNotification(n.title, { body: (r && r.ok ? 'Terkirim: ' : 'Gagal terkirim: ') + txt, icon: '/img/pm-192.png', badge: '/img/pm-white.png', tag: tag, silent: true, data: { url: d.url || '/', lines: [] } });
      setTimeout(function () { self.registration.getNotifications({ tag: tag }).then(function (l) { l.forEach(function (x) { if (!x.data || !x.data.ack) x.close(); }); }).catch(function () {}); }, 4000);
    })());
    return;
  }
  var now = Date.now();
  if (e.action === 'reply' || (clickT[tag] && now - clickT[tag] < 4000)) { // ketukan kedua (atau balas tanpa kolom ketik): buka aplikasi
    delete clickT[tag]; n.close();
    e.waitUntil(openApp(d.url || '/'));
    return;
  }
  clickT[tag] = now; // ketukan pertama: tetap di bilah notifikasi supaya semua yang chat kelihatan
  n.close();
  e.waitUntil((async function () {
    var opt = { body: n.body, icon: '/img/pm-192.png', badge: '/img/pm-white.png', tag: tag, silent: true, renotify: false, data: d };
    if (n.actions && n.actions.length) opt.actions = n.actions;
    await self.registration.showNotification(n.title, opt);
  })());
});
