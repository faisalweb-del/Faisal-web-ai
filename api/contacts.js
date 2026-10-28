// Kontak dan chat teks antar pengguna Faisal AI. Semua data ada di Firestore dan hanya server ini yang bisa membaca/menulis.
// Pengaman: nomor 12 digit dengan digit pemeriksa, permintaan kontak harus diterima, blokir, laporan, batas kirim, tanpa pencarian nama.
const crypto = require('crypto');
const L = require('./_lib.js');
let _wp = null;
function wp() { if (_wp === null) { try { _wp = require('web-push'); } catch (e) { _wp = false; } } return _wp; }

const DEV_NUMBER = '452858264974'; // nomor Partical developer: tombol Verifikasi kepercayaan dan beli Pro langsung chat ke sini
const DEV_EMAIL = String(process.env.DEV_EMAIL || 'y8068553@gmail.com').toLowerCase();
let _dev = { uid: '', t: 0 };
async function devUid(db) { // akun developer: terdaftar saat dia masuk dengan DEV_EMAIL, cadangannya lewat nomor Partical
  if (_dev.uid && Date.now() - _dev.t < 60000) return _dev.uid;
  let uid = '';
  try { const s = await db.collection('config').doc('dev').get(); if (s.exists) uid = s.data().uid || ''; } catch (e) {}
  if (!uid) { try { uid = (await L.admin().auth().getUserByEmail(DEV_EMAIL)).uid || ''; if (uid) await db.collection('config').doc('dev').set({ uid, ts: Date.now() }); } catch (e) {} }
  if (!uid) { try { const n = await db.collection('numbers').doc(DEV_NUMBER).get(); if (n.exists) uid = n.data().uid || ''; } catch (e) {} }
  _dev = { uid, t: Date.now() }; return uid;
}
const VF_DAY = 24 * 3600 * 1000, VF_PLATFORMS = ['TikTok', 'Instagram', 'YouTube', 'Website'];
async function vgMap(db, ids) { // siapa saja yang punya centang hijau yang masih aktif
  const out = {}; ids = Array.from(new Set(ids.filter(Boolean))).slice(0, 120); if (!ids.length) return out;
  try { const ds = await db.getAll(...ids.map((u) => db.collection('verif').doc(u))); const now = Date.now(); ds.forEach((d, i) => { const x = d.exists ? d.data() : null; if (x && x.st === 'active' && x.until > now) out[ids[i]] = 1; }); } catch (e) { console.error('vg', e && e.message); }
  return out;
}
function vgView(x) { if (!x) return { st: 'none' }; if (x.st === 'active' && x.until <= Date.now()) return { st: 'expired' }; return { st: x.st, until: x.until || 0 }; }
const DUMMY_ID = 'dummy-bot', DUMMY_NUMBER = '222226666123';
const MAX_CONTACTS = 100;
const MSG_MAX = 1000;
const PHOTO_RE = /^data:image\/(jpeg|webp);base64,[A-Za-z0-9+\/=]+$/, PHOTO_MAX = 70000;
const MEDIA = { // jenis lampiran: pola data URL dan batas ukuran (karakter base64), supaya muat di satu dokumen database
  sticker: { re: /^data:image\/(webp|png);base64,[A-Za-z0-9+\/=]+$/, max: 180000, label: 'Stiker' },
  image: { re: /^data:image\/(jpeg|webp);base64,[A-Za-z0-9+\/=]+$/, max: 420000, label: 'Foto' },
  voice: { re: /^data:audio\/(webm|mp4|ogg|x-m4a|aac)(;codecs=[\w.,-]+)?;base64,[A-Za-z0-9+\/=]+$/, max: 330000, label: 'Pesan suara' },
  video: { re: /^data:video\/(webm|mp4)(;codecs=[\w.,-]+)?;base64,[A-Za-z0-9+\/=]+$/, max: 880000, label: 'Video' },
};
const GID = /^g_[a-f0-9]{10}$/;
const MAX_GROUP = 30;
function gView(me, g) {
  return (m) => {
    const o = { id: m.id, from: m.from === me ? 'me' : 'them', text: m.deleted ? '' : m.text, ts: m.ts };
    if (m.deleted) o.deleted = true; else if (m.kind) { o.kind = m.kind; o.ar = m.ar || 1; if (m.dur) o.dur = m.dur; }
    if (m.ed && !m.deleted) o.ed = 1;
    if (m.from !== me) o.by = (g.names && g.names[m.from]) || 'Anggota';
    if (m.react && typeof m.react === 'object') {
      const mine = m.react[me] || '', others = [...new Set(Object.keys(m.react).filter((k) => k !== me && m.react[k]).map((k) => m.react[k]))].slice(0, 3).join('');
      if (mine || others) { o.react = {}; if (mine) o.react.me = mine; if (others) o.react.them = others; }
    }
    if (m.reply && m.reply.mid) o.reply = { mid: m.reply.mid, text: m.reply.text || '', who: m.from === me ? m.reply.who : 'them', by: m.reply.by || '' };
    return o;
  };
}
const hitsMap = new Map();

function hit(key, max, ms) {
  const now = Date.now();
  const arr = (hitsMap.get(key) || []).filter((t) => now - t < ms);
  arr.push(now); hitsMap.set(key, arr);
  if (hitsMap.size > 5000) hitsMap.clear();
  return arr.length > max;
}
function luhnDigit(p) {
  let sum = 0;
  for (let i = 0; i < p.length; i++) { let d = +p[p.length - 1 - i]; if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; } sum += d; }
  return String((10 - (sum % 10)) % 10);
}
function validNum(n) { return /^\d{12}$/.test(n) && luhnDigit(n.slice(0, 11)) === n[11]; }
function genNum() {
  let p = String(crypto.randomInt(1, 10));
  for (let i = 0; i < 10; i++) p += String(crypto.randomInt(0, 10));
  return p + luhnDigit(p);
}
function clean(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n); }
function tid(a, b) { return [a, b].sort().join('_'); }
const wibDay = (ms) => new Date(ms + 7 * 3600 * 1000).toISOString().slice(0, 10);

async function vapidKeys(db, w) {
  const ref = db.collection('config').doc('vapid'), s = await ref.get();
  if (s.exists && s.data().publicKey && s.data().privateKey) return s.data();
  return db.runTransaction(async (tx) => {
    const x = await tx.get(ref);
    if (x.exists && x.data().publicKey) return x.data();
    const k = w.generateVAPIDKeys(); tx.set(ref, k); return k;
  });
}
function vapidSubject() {
  const h = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return h ? 'https://' + h : 'mailto:admin@example.com';
}
async function notify(db, toId, fromId, entry, fromProfile, text, ack) {
  const w = wp(); if (!w) return;
  const pcol = db.collection('profiles').doc(toId).collection('push'), snap = await pcol.get();
  if (!snap.size) return;
  let silent = false;
  try { const pd = await db.collection('profiles').doc(toId).get(), mu = (pd.exists && pd.data().mute) || {}; silent = !!(mu[fromId] && mu[fromId] > Date.now()); } catch (e) {}
  if (silent) return; // dibisukan: tidak ada push (Chrome mewajibkan push selalu menampilkan notifikasi)
  const keys = await vapidKeys(db, w);
  w.setVapidDetails(vapidSubject(), keys.publicKey, keys.privateKey);
  const nm = ((entry && ((entry.first || '') + ' ' + (entry.last || '')).trim()) || (fromProfile && fromProfile.name) || '').trim() || 'Pesan baru';
  const payload = JSON.stringify({ title: nm, body: text.slice(0, 120), tag: 'chat-' + fromId, url: '/?chat=' + fromId, ack: ack || undefined });
  await Promise.all(snap.docs.slice(0, 5).map(async (d) => {
    try { await w.sendNotification(d.data().sub, payload, { TTL: 3600, urgency: 'high' }); }
    catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) { try { await pcol.doc(d.id).delete(); } catch (x) {} } }
  }));
}

async function notifyUser(db, toId, payload) {
  const w = wp(); if (!w) return;
  const pcol = db.collection('profiles').doc(toId).collection('push'), snap = await pcol.get();
  if (!snap.size) return;
  const keys = await vapidKeys(db, w);
  w.setVapidDetails(vapidSubject(), keys.publicKey, keys.privateKey);
  const body = JSON.stringify(payload);
  await Promise.all(snap.docs.slice(0, 5).map(async (d) => {
    try { await w.sendNotification(d.data().sub, body, { TTL: 3600, urgency: 'high' }); }
    catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) { try { await pcol.doc(d.id).delete(); } catch (x) {} } }
  }));
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ ok: true, contacts_version: 15, fitur: ['pesan-suara', 'bisukan', 'pesan-hilang', 'edit-pesan', 'lampiran', 'stiker', 'foto-profil', 'grup', 'status', 'online', 'centang', 'grup-profil', 'status-video', 'notif-aksi', 'developer', 'centang-hijau', 'dummy', 'kontak-langsung', 'qr', 'kontak-langsung', 'qr-kontak'] });
  if (req.method !== 'POST') return L.bad(res, 405, 'Gunakan POST.');
  if (!L.enabled()) return L.bad(res, 404, 'Login belum diaktifkan.');
  if (String((req.body || {}).op || '') === 'ack') { // tanda "terkirim" dari service worker saat notifikasi sampai di HP penerima (tanpa login, pakai kunci sekali pakai per pesan)
    try {
      const b0 = req.body, ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || 'x').trim();
      const t = String(b0.t || ''), u = String(b0.u || ''), mid = String(b0.m || ''), k = String(b0.k || '');
      if (!hit('ack' + ip, 120, 60 * 1000) && /^[\w-]{3,200}$/.test(t) && /^[\w-]{1,80}$/.test(u) && /^[\w-]{6,40}$/.test(mid) && /^[a-f0-9]{16}$/.test(k)) {
        const db0 = L.admin().firestore(), tref = db0.collection('threads').doc(t), ms = await tref.collection('msgs').doc(mid).get();
        if (ms.exists && ms.data().ak === k && ms.data().from !== u && tid(ms.data().from, u) === t) {
          const meta = await tref.get(), md = meta.exists ? meta.data() : {};
          if (ms.data().ts > ((md.dv || {})[u] || 0)) await tref.set({ dv: { [u]: ms.data().ts }, rts: Math.max(Date.now(), (md.rts || 0) + 1) }, { merge: true });
        }
      }
    } catch (e) { console.error('ack', e && e.message); }
    return res.status(200).json({ ok: true });
  }
  if (String((req.body || {}).op || '') === 'nact') { // tombol di notifikasi: tandai dibaca atau jawab pesan. Pakai kunci per pesan yang hanya dikirim ke HP penerima.
    try {
      const b0 = req.body, ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || 'x').trim();
      const act = String(b0.a || ''), t = String(b0.t || ''), u = String(b0.u || ''), mid = String(b0.m || ''), rk = String(b0.r || '');
      if (hit('nact' + ip, 60, 60 * 1000) || hit('nactu' + u, 40, 60 * 1000)) return res.status(429).json({ error: 'Terlalu cepat.' });
      if (!['read', 'reply'].includes(act) || !/^[\w-]{3,200}$/.test(t) || !/^[\w-]{1,80}$/.test(u) || !/^[\w-]{6,40}$/.test(mid) || !/^[a-f0-9]{16}$/.test(rk)) return res.status(400).json({ error: 'Tidak valid.' });
      const db0 = L.admin().firestore(), tref = db0.collection('threads').doc(t), ms = await tref.collection('msgs').doc(mid).get();
      if (!ms.exists || ms.data().rk !== rk || ms.data().from === u || tid(ms.data().from, u) !== t || Date.now() - ms.data().ts > 3 * 864e5) return res.status(403).json({ error: 'Tidak bisa diproses.' });
      const from = ms.data().from, meta = await tref.get(), md = meta.exists ? meta.data() : {};
      const readTs = Math.max(ms.data().ts, md.lastFrom && md.lastFrom !== u ? (md.lastTs || 0) : 0);
      let rts = Math.max(Date.now(), (md.rts || 0) + 1);
      if (act === 'read') {
        await tref.set({ rd: { [u]: readTs }, dv: { [u]: readTs }, rts }, { merge: true });
        return res.status(200).json({ ok: true });
      }
      const text = String(b0.text == null ? '' : b0.text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, MSG_MAX);
      if (!text) return res.status(400).json({ error: 'Balasan kosong.' });
      const cu = db0.collection('contacts'), mine0 = await cu.doc(u).collection('list').doc(from).get(), theirs0 = await cu.doc(from).collection('list').doc(u).get();
      const b1 = await db0.collection('blocks').doc(u).collection('list').doc(from).get(), b2 = await db0.collection('blocks').doc(from).collection('list').doc(u).get();
      if (!mine0.exists || mine0.data().status !== 'ok' || !theirs0.exists || theirs0.data().status !== 'ok' || b1.exists || b2.exists) return res.status(403).json({ error: 'Pesan tidak terkirim.' });
      const cid = crypto.randomBytes(8).toString('hex'), ts = Math.max(Date.now(), (md.lastTs || 0) + 1), nm = { id: cid, from: u, text, ts, ak: crypto.randomBytes(8).toString('hex'), rk: crypto.randomBytes(8).toString('hex') };
      await tref.collection('msgs').doc(cid).set(nm);
      rts = Math.max(rts, ts);
      await tref.set({ last: text.slice(0, 80), lastTs: ts, lastFrom: u, rd: { [u]: readTs }, dv: { [u]: readTs }, rts }, { merge: true });
      const up = await db0.collection('profiles').doc(u).get();
      try { await Promise.race([notify(db0, from, u, theirs0.data(), up.exists ? up.data() : {}, text, { t, u: from, m: cid, k: nm.ak, r: nm.rk }), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { console.error('push balasan', e && e.message); }
      return res.status(200).json({ ok: true });
    } catch (e) { console.error('nact', e && e.message); return res.status(200).json({ ok: false }); }
  }
  const user = await L.requireUser(req, res);
  if (!user) return;
  const me = user.id, b = req.body || {}, op = String(b.op || '');
  try {
    const db = L.admin().firestore();
    if (user.verified && user.email && user.email.toLowerCase() === DEV_EMAIL && _dev.uid !== me) { // developer masuk: akunnya ditandai centang biru
      try { await db.collection('config').doc('dev').set({ uid: me, ts: Date.now() }); _dev = { uid: me, t: Date.now() }; } catch (e) { console.error('dev', e && e.message); }
    }
    const prof = (id) => db.collection('profiles').doc(id);
    const cl = (id) => db.collection('contacts').doc(id).collection('list');
    const bl = (id) => db.collection('blocks').doc(id).collection('list');

    async function ensureProfile(id) {
      const ref = prof(id), s = await ref.get();
      if (s.exists) return s.data();
      for (let i = 0; i < 8; i++) {
        const n = genNum(), nref = db.collection('numbers').doc(n);
        try {
          const p = await db.runTransaction(async (tx) => {
            const [x, y] = [await tx.get(nref), await tx.get(ref)];
            if (y.exists) return y.data();
            if (x.exists) throw new Error('taken');
            const np = { number: n, name: '', created: Date.now() };
            tx.set(nref, { uid: id }); tx.set(ref, np); return np;
          });
          return p;
        } catch (e) { if (e.message !== 'taken') throw e; }
      }
      throw new Error('nomor penuh');
    }
    if (op === 'msgs') { // jalur cepat: sekali baca kalau tidak ada pesan baru
      const oid = String(b.id || '');
      if (!/^[\w-]{1,80}$/.test(oid) || oid === me) return L.bad(res, 400, 'Kontak tidak valid.');
      if (hit('poll' + me, 240, 60 * 1000)) return L.bad(res, 429, 'Terlalu sering memuat. Tunggu sebentar.');
      if (GID.test(oid)) {
        const gs = await db.collection('groups').doc(oid).get();
        if (!gs.exists || !(gs.data().members || []).includes(me)) return L.bad(res, 403, 'Kamu bukan anggota grup ini.');
        const g = gs.data(), after = Number(b.after) || 0, crts = Number(b.rts) || 0, rts = g.rts || 0;
        const newMsgs = !(after > 0 && (g.lastTs || 0) <= after), newUpd = after > 0 && rts > crts;
        if (!newMsgs && !newUpd) return res.status(200).json({ msgs: [], rts });
        const mcol = db.collection('groups').doc(oid).collection('msgs'), gv = gView(me, g);
        let msgs = [], upd = [];
        if (newMsgs) {
          const q = after > 0 ? await mcol.where('ts', '>', after).orderBy('ts', 'asc').limit(100).get() : await mcol.orderBy('ts', 'desc').limit(80).get();
          msgs = q.docs.map((d) => d.data()); if (!(after > 0)) msgs = msgs.reverse();
        }
        if (newUpd) {
          const q2 = await mcol.orderBy('ts', 'desc').limit(100).get();
          upd = q2.docs.map((d) => d.data()).map((m) => { const v = gv(m); return { id: v.id, react: v.react || null, deleted: !!v.deleted, text: v.text, ed: v.ed || 0 }; });
        }
        return res.status(200).json({ msgs: msgs.map(gv), upd, rts });
      }
      const after = Number(b.after) || 0, crts = Number(b.rts) || 0;
      const meta = await db.collection('threads').doc(tid(me, oid)).get();
      if (!meta.exists) return res.status(200).json({ msgs: [], rts: 0 });
      const md = meta.data(); let rts = md.rts || 0;
      const newMsgs = !(after > 0 && (md.lastTs || 0) <= after), newUpd = after > 0 && rts > crts;
      if (!newMsgs && !newUpd) return res.status(200).json({ msgs: [], rts, dis: md.dis || 0 });
      if (md.lastFrom && md.lastFrom !== me && (md.lastTs || 0) > ((md.rd || {})[me] || 0)) { // penerima membuka obrolan: tandai sudah dibaca
        rts = Math.max(Date.now(), rts + 1);
        try { await db.collection('threads').doc(tid(me, oid)).set({ rd: { [me]: md.lastTs }, dv: { [me]: md.lastTs }, rts }, { merge: true }); } catch (e) {}
      }
      const mcol = db.collection('threads').doc(tid(me, oid)).collection('msgs');
      const view = (m) => {
        const o = { id: m.id, from: m.from === me ? 'me' : 'them', text: m.deleted ? '' : m.text, ts: m.ts };
        if (m.from === me && !m.deleted) o.st = m.ts <= ((md.rd || {})[oid] || 0) ? 3 : m.ts <= ((md.dv || {})[oid] || 0) ? 2 : 1;
        if (m.deleted) o.deleted = true;
        else if (m.kind) { o.kind = m.kind; o.ar = m.ar || 1; if (m.dur) o.dur = m.dur; }
        if (m.ed && !m.deleted) o.ed = 1;
        if (m.react && typeof m.react === 'object') { const r = {}; Object.keys(m.react).forEach((k) => { if (m.react[k]) r[k === me ? 'me' : 'them'] = m.react[k]; }); if (Object.keys(r).length) o.react = r; }
        if (m.reply && m.reply.mid) o.reply = { mid: m.reply.mid, text: m.reply.text || '', who: m.from === me ? m.reply.who : (m.reply.who === 'me' ? 'them' : 'me') };
        return o;
      };
      let msgs = [], upd = [];
      if (newMsgs) {
        const q = after > 0 ? await mcol.where('ts', '>', after).orderBy('ts', 'asc').limit(100).get() : await mcol.orderBy('ts', 'desc').limit(80).get();
        msgs = q.docs.map((d) => d.data());
        if (!(after > 0)) msgs = msgs.reverse();
        const nowx = Date.now(), gone = msgs.filter((m) => m.ex && m.ex <= nowx); // pesan hilang otomatis: sembunyikan dan hapus
        if (gone.length) { msgs = msgs.filter((m) => !(m.ex && m.ex <= nowx)); try { await Promise.all(gone.slice(0, 20).map(async (m) => { await mcol.doc(m.id).delete(); if (m.kind) await db.collection('threads').doc(tid(me, oid)).collection('media').doc(m.id).delete(); })); } catch (e) {} }
      }
      if (newUpd) {
        const q2 = await mcol.orderBy('ts', 'desc').limit(100).get();
        upd = q2.docs.map((d) => d.data()).map((m) => { const v = view(m); return { id: v.id, react: v.react || null, deleted: !!v.deleted, st: v.st || 0, text: v.text, ed: v.ed || 0 }; });
      }
      return res.status(200).json({ msgs: msgs.map((m) => { const v = view(m); if (m.ex) v.ex = m.ex; return v; }), upd, rts, dis: md.dis || 0 });
    }
    if (op === 'ping') { // tanda online: dikirim berkala selama aplikasi terbuka, dan sekali saat aplikasi ditutup
      if (hit('ping' + me, 12, 60 * 1000)) return res.status(200).json({ ok: true });
      await prof(me).set({ seen: Date.now(), on: b.off ? false : true }, { merge: true });
      return res.status(200).json({ ok: true });
    }
    if (op === 'mute') { // bisukan notifikasi satu obrolan (pesan tetap masuk, centang terkirim tetap jalan)
      const mid = String(b.id || ''); if (!/^[\w-]{3,60}$/.test(mid)) return L.bad(res, 400, 'Obrolan tidak valid.');
      const until = b.hours ? Date.now() + Math.min(24 * 365, Math.max(1, Number(b.hours) || 8)) * 3600000 : (b.forever ? 4102444800000 : 0);
      await prof(me).set({ mute: { [mid]: until } }, { merge: true });
      return res.status(200).json({ ok: true, until });
    }
    if (op === 'disap') { // pesan hilang otomatis untuk obrolan berdua (24 jam, 7 hari, atau mati)
      const oid = String(b.id || ''), secs = [0, 86400, 604800].includes(Number(b.secs)) ? Number(b.secs) : -1;
      if (secs < 0 || !/^[\w-]{3,60}$/.test(oid) || GID.test(oid)) return L.bad(res, 400, 'Pengaturan tidak valid.');
      const ce = await cl(me).doc(oid).get(); if (!ce.exists || ce.data().status !== 'ok') return L.bad(res, 403, 'Bukan kontakmu.');
      const tr = db.collection('threads').doc(tid(me, oid)), tm = await tr.get();
      await tr.set({ dis: secs, rts: Math.max(Date.now(), ((tm.exists && tm.data().rts) || 0) + 1) }, { merge: true });
      return res.status(200).json({ ok: true, dis: secs });
    }
    const mine = await ensureProfile(me);

    // ---------- grup ----------
    const grp = (gid) => db.collection('groups').doc(gid);
    async function loadGroup(gid) { const x = await grp(gid).get(); if (!x.exists) return null; const g = x.data(); return (g.members || []).includes(me) ? g : null; }
    async function okContacts() { const cs = await cl(me).get(); const m = {}; cs.docs.forEach((d) => { if (d.data().status === 'ok') m[d.id] = d.data(); }); return m; }
    function label(c) { return clean(((c.first || '') + ' ' + (c.last || '')).trim() || c.name || '', 24); }
    if (op === 'gcreate') {
      if (hit('gc' + me, 5, 3600 * 1000)) return L.bad(res, 429, 'Terlalu sering bikin grup. Coba lagi nanti.');
      const name = clean(b.name, 40); if (!name) return L.bad(res, 400, 'Isi nama grup dulu.');
      const oks = await okContacts();
      const ms = [...new Set((Array.isArray(b.members) ? b.members : []).map(String))].filter((x) => x !== me && oks[x]).slice(0, MAX_GROUP - 1);
      if (!ms.length) return L.bad(res, 400, 'Pilih minimal 1 teman.');
      const all = [me].concat(ms), profs = await db.getAll(...all.map((u) => prof(u))), names = {};
      all.forEach((u, i) => { const p = profs[i] && profs[i].exists ? profs[i].data() : {}; names[u] = clean(p.name, 24) || (oks[u] ? label(oks[u]) : '') || 'Anggota'; });
      const gid = 'g_' + crypto.randomBytes(5).toString('hex'), now = Date.now();
      await grp(gid).set({ name, owner: me, members: all, names, created: now, lastTs: 0, rts: 0 });
      await Promise.all(all.map((u) => db.collection('ugroups').doc(u).collection('list').doc(gid).set({ ts: now })));
      return res.status(200).json({ id: gid });
    }
    if (op === 'gedit' || op === 'ggetphoto') {
      const gid = String(b.id || ''); if (!GID.test(gid)) return L.bad(res, 400, 'Grup tidak valid.');
      const g = await loadGroup(gid); if (!g) return L.bad(res, 403, 'Kamu bukan anggota grup ini.');
      if (op === 'ggetphoto') {
        if (hit('ggp' + me, 120, 60 * 1000)) return L.bad(res, 429, 'Terlalu cepat.');
        const d = await db.collection('gphotos').doc(gid).get();
        return res.status(200).json(d.exists ? { data: d.data().data, pv: d.data().ts || 0 } : { data: '', pv: 0 });
      }
      if (g.owner !== me) return L.bad(res, 403, 'Hanya admin grup yang bisa mengubah foto dan deskripsi.');
      const up = {}; let pv;
      if (b.desc !== undefined) up.desc = String(b.desc == null ? '' : b.desc).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g, '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 300);
      if (b.data !== undefined) {
        if (hit('gep' + me, 8, 3600 * 1000)) return L.bad(res, 429, 'Terlalu sering ganti foto. Coba lagi nanti.');
        const data = String(b.data || '');
        if (data && (data.length > PHOTO_MAX || !PHOTO_RE.test(data))) return L.bad(res, 400, 'Foto grup tidak valid atau terlalu besar.');
        pv = data ? Date.now() : 0;
        if (data) await db.collection('gphotos').doc(gid).set({ data, ts: pv }); else await db.collection('gphotos').doc(gid).delete();
        up.pv = pv;
      }
      if (Object.keys(up).length) await grp(gid).set(up, { merge: true });
      return res.status(200).json({ ok: true, pv });
    }
    if (op === 'gleave' || op === 'gadd') {
      const gid = String(b.id || ''); if (!GID.test(gid)) return L.bad(res, 400, 'Grup tidak valid.');
      const g = await loadGroup(gid); if (!g) return L.bad(res, 403, 'Kamu bukan anggota grup ini.');
      if (op === 'gleave') {
        const rest = g.members.filter((u) => u !== me);
        await db.collection('ugroups').doc(me).collection('list').doc(gid).delete();
        if (!rest.length) { await grp(gid).delete(); return res.status(200).json({ ok: true }); }
        await grp(gid).set({ members: rest, owner: g.owner === me ? rest[0] : g.owner }, { merge: true });
        return res.status(200).json({ ok: true });
      }
      if (g.owner !== me) return L.bad(res, 403, 'Hanya pembuat grup yang bisa menambah anggota.');
      const oks = await okContacts();
      const add = [...new Set((Array.isArray(b.members) ? b.members : []).map(String))].filter((x) => oks[x] && !g.members.includes(x)).slice(0, MAX_GROUP - g.members.length);
      if (!add.length) return L.bad(res, 400, 'Tidak ada teman yang bisa ditambahkan (penuh atau sudah masuk).');
      const profs = await db.getAll(...add.map((u) => prof(u))), names = Object.assign({}, g.names);
      add.forEach((u, i) => { const p = profs[i] && profs[i].exists ? profs[i].data() : {}; names[u] = clean(p.name, 24) || label(oks[u]) || 'Anggota'; });
      const now = Date.now();
      await grp(gid).set({ members: g.members.concat(add), names }, { merge: true });
      await Promise.all(add.map((u) => db.collection('ugroups').doc(u).collection('list').doc(gid).set({ ts: now })));
      return res.status(200).json({ ok: true });
    }
    if (GID.test(String(b.id || '')) && ['send', 'react', 'unsend', 'edit', 'getmedia'].includes(op)) {
      const gid = String(b.id), g = await loadGroup(gid);
      if (!g) return L.bad(res, 403, 'Kamu bukan anggota grup ini.');
      const col = grp(gid).collection('msgs'), mcol = grp(gid).collection('media');
      if (op === 'getmedia') {
        const mid = String(b.mid || ''); if (!/^[\w-]{6,40}$/.test(mid)) return L.bad(res, 400, 'Lampiran tidak valid.');
        if (hit('gm' + me, 200, 60 * 1000)) return L.bad(res, 429, 'Terlalu cepat.');
        const d = await mcol.doc(mid).get(); if (!d.exists) return L.bad(res, 404, 'Lampiran sudah tidak ada.');
        return res.status(200).json({ data: d.data().data });
      }
      if (op === 'send') {
        const text = String(b.text == null ? '' : b.text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, MSG_MAX);
        const kind = MEDIA[b.kind] ? b.kind : '', mdata = kind ? String(b.data || '') : '';
        if (kind && (mdata.length > MEDIA[kind].max || !MEDIA[kind].re.test(mdata))) return L.bad(res, 400, kind === 'video' ? 'Videonya terlalu besar atau formatnya tidak didukung.' : 'Lampiran tidak valid atau terlalu besar.');
        if (!text && !kind) return L.bad(res, 400, 'Pesan kosong.');
        if (hit('msg' + me, 20, 60 * 1000) || hit('msgd' + me, 1500, 24 * 3600 * 1000)) return L.bad(res, 429, 'Kamu kirim terlalu cepat. Tunggu sebentar.');
        if (kind && (hit('media' + me, 12, 60 * 1000) || hit('mediad' + me, 150, 24 * 3600 * 1000))) return L.bad(res, 429, 'Terlalu banyak kirim lampiran. Tunggu sebentar.');
        const cid = /^[\w-]{6,40}$/.test(String(b.cid || '')) ? String(b.cid) : crypto.randomBytes(8).toString('hex');
        const ts = Math.max(Date.now(), (g.lastTs || 0) + 1), m = { id: cid, from: me, text, ts };
        if (kind) { m.kind = kind; m.ar = Math.min(4, Math.max(0.25, Number(b.ar) || 1)); if (kind === 'video' || kind === 'voice') m.dur = Math.min(60, Math.max(0, Number(b.dur) || 0)); }
        if (b.reply && typeof b.reply === 'object' && /^[\w-]{6,40}$/.test(String(b.reply.mid || ''))) m.reply = { mid: String(b.reply.mid), text: clean(b.reply.text, 120), who: b.reply.who === 'them' ? 'them' : 'me', by: clean(b.reply.by, 30) };
        if (kind) await mcol.doc(cid).set({ data: mdata, kind, ts });
        await col.doc(cid).set(m);
        const prev = kind ? MEDIA[kind].label + (text ? ': ' + text : '') : text, upd = { last: prev.slice(0, 80), lastTs: ts, lastFrom: me };
        const myName = clean(mine.name, 24); if (myName && (!g.names || g.names[me] !== myName)) upd.names = Object.assign({}, g.names, { [me]: myName });
        await grp(gid).set(upd, { merge: true });
        try { await Promise.race([Promise.all(g.members.filter((u) => u !== me).slice(0, 15).map((u) => notifyUser(db, u, { title: g.name || 'Grup', body: ((g.names && g.names[me]) || 'Anggota') + ': ' + prev.slice(0, 100), tag: 'chat-' + gid, url: '/?chat=' + gid }))), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { console.error('push grup', e && e.message); }
        return res.status(200).json({ ok: true, msg: { id: cid, from: 'me', text, ts, kind: kind || undefined, ar: m.ar, dur: m.dur, reply: m.reply ? { mid: m.reply.mid, text: m.reply.text, who: m.reply.who, by: m.reply.by } : undefined } });
      }
      const mid = String(b.mid || ''); if (!/^[\w-]{6,40}$/.test(mid)) return L.bad(res, 400, 'Pesan tidak valid.');
      const mref = col.doc(mid), ms = await mref.get(); if (!ms.exists) return L.bad(res, 404, 'Pesan tidak ditemukan.');
      const md = ms.data(), now = Math.max(Date.now(), (g.rts || 0) + 1);
      if (op === 'react') {
        if (hit('rx' + me, 60, 60 * 1000)) return L.bad(res, 429, 'Terlalu cepat.');
        await mref.set({ react: { [me]: clean(b.emoji, 8) } }, { merge: true });
      } else if (op === 'edit') {
        if (md.from !== me) return L.bad(res, 403, 'Hanya pesanmu yang bisa diedit.');
        if (md.deleted) return L.bad(res, 400, 'Pesan sudah ditarik.');
        if (Date.now() - md.ts > 15 * 60 * 1000) return L.bad(res, 400, 'Edit hanya bisa dalam 15 menit setelah dikirim.');
        const nt = String(b.text == null ? '' : b.text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, MSG_MAX);
        if (!nt && !md.kind) return L.bad(res, 400, 'Pesan tidak boleh kosong.');
        await mref.set({ text: nt, ed: true }, { merge: true });
      } else {
        if (md.from !== me) return L.bad(res, 403, 'Hanya pesanmu yang bisa ditarik.');
        await mref.set({ deleted: true, text: '' }, { merge: true });
        if (md.kind) await mcol.doc(mid).delete();
        if (g.lastTs === md.ts) await grp(gid).set({ last: 'Pesan ditarik' }, { merge: true });
      }
      await grp(gid).set({ rts: now }, { merge: true });
      return res.status(200).json({ ok: true });
    }

    // ---------- status 24 jam ----------
    const SC = (u) => db.collection('statuses').doc(u);
    const DAYMS = 24 * 3600 * 1000;
    if (op === 'statpost') {
      if (hit('st' + me, 20, DAYMS)) return L.bad(res, 429, 'Batas status hari ini sudah habis.');
      const kind = b.kind === 'image' ? 'image' : b.kind === 'video' ? 'video' : 'text', text = clean(b.text, 200);
      const bg = /^#[0-9a-f]{6}$/i.test(String(b.bg || '')) ? String(b.bg) : '#1b2d73';
      let data = '';
      if (kind === 'image') { data = String(b.data || ''); if (data.length > 420000 || !MEDIA.image.re.test(data)) return L.bad(res, 400, 'Foto status tidak valid atau terlalu besar.'); }
      else if (kind === 'video') { data = String(b.data || ''); if (data.length > 860000 || !MEDIA.video.re.test(data)) return L.bad(res, 400, 'Video status tidak valid atau terlalu besar.'); }
      else if (!text) return L.bad(res, 400, 'Tulis statusnya dulu.');
      let src = null; // status yang diposting dari saluran: nama saluran ikut tampil di bawah nama
      if (b.src && /^c_[a-f0-9]{10}$/.test(String(b.src))) { const cs = await db.collection('channels').doc(String(b.src)).get(); if (cs.exists) src = { id: cs.id, name: clean(cs.data().name, 40) }; }
      let allow = null;
      if (Array.isArray(b.allow)) { const oks = await okContacts(); allow = [...new Set(b.allow.map(String))].filter((x) => oks[x]).slice(0, 100); if (!allow.length) return L.bad(res, 400, 'Pilih minimal 1 kontak, atau pilih semua kontak.'); }
      const now = Date.now(), sid = 's' + crypto.randomBytes(6).toString('hex');
      const sm = await SC(me).get(), items = ((sm.exists && sm.data().items) || []).filter((x) => x.exp > now);
      const drop = items.length >= 10 ? items.splice(0, items.length - 9) : [];
      await Promise.all(drop.map((x) => SC(me).collection('items').doc(x.sid).delete()));
      const item = { id: sid, kind, text, bg, data, allow, ts: now, exp: now + DAYMS };
      if (src) item.src = src; if (kind === 'video') item.dur = Math.min(15, Math.max(1, Number(b.dur) || 5));
      await SC(me).collection('items').doc(sid).set(item);
      items.push({ sid, ts: now, exp: now + DAYMS, kind, text: text.slice(0, 40), allow });
      await SC(me).set({ items });
      return res.status(200).json({ ok: true, id: sid });
    }
    if (op === 'statmine') {
      const now = Date.now(), q = await SC(me).collection('items').where('exp', '>', now).orderBy('exp', 'asc').limit(10).get();
      const vc = await Promise.all(q.docs.map((d) => d.ref.collection('v').get().then((r) => r.size).catch(() => 0)));
      return res.status(200).json({ items: q.docs.map((d, i) => { const x = d.data(); return { id: x.id, kind: x.kind, text: x.text, bg: x.bg, data: x.data, ts: x.ts, exp: x.exp, src: x.src || null, dur: x.dur || 0, shared: x.allow ? x.allow.length : 0, views: vc[i] }; }) });
    }
    if (op === 'statviews') {
      const sid = String(b.sid || ''); if (!/^s[a-f0-9]{12}$/.test(sid)) return L.bad(res, 400, 'Tidak valid.');
      const vs = await SC(me).collection('items').doc(sid).collection('v').get();
      return res.status(200).json({ views: vs.docs.map((d) => ({ id: d.id, ts: (d.data() || {}).ts || 0 })).sort((a, c) => c.ts - a.ts).slice(0, 200) });
    }
    if (op === 'statdel') {
      const sid = String(b.sid || ''); if (!/^s[a-f0-9]{12}$/.test(sid)) return L.bad(res, 400, 'Tidak valid.');
      try { const vv = await SC(me).collection('items').doc(sid).collection('v').get(); await Promise.all(vv.docs.map((d) => d.ref.delete())); } catch (e) {}
      await SC(me).collection('items').doc(sid).delete();
      const sm = await SC(me).get(); if (sm.exists) await SC(me).set({ items: (sm.data().items || []).filter((x) => x.sid !== sid) });
      return res.status(200).json({ ok: true });
    }
    if (op === 'statlist') {
      if (hit('sl' + me, 60, 60 * 1000)) return L.bad(res, 429, 'Terlalu sering memuat.');
      const oks = await okContacts(), ids = Object.keys(oks), now = Date.now();
      const docs = ids.length ? await db.getAll(...ids.map((u) => SC(u))) : [];
      const out = [];
      docs.forEach((d, i) => {
        if (!d.exists) return;
        const vis = (d.data().items || []).filter((x) => x.exp > now && (!x.allow || x.allow.includes(me)));
        if (vis.length) out.push({ id: ids[i], n: vis.length, ts: Math.max(...vis.map((x) => x.ts)), kind: vis[vis.length - 1].kind, text: vis[vis.length - 1].text || '' });
      });
      return res.status(200).json({ list: out });
    }
    if (op === 'statget') {
      const pid = String(b.id || ''); if (!/^[\w-]{1,80}$/.test(pid)) return L.bad(res, 400, 'Tidak valid.');
      const ce = await cl(me).doc(pid).get();
      if (!ce.exists || ce.data().status !== 'ok' || (await bl(pid).doc(me).get()).exists) return L.bad(res, 403, 'Tidak bisa dilihat.');
      const now = Date.now(), q = await SC(pid).collection('items').where('exp', '>', now).orderBy('exp', 'asc').limit(10).get();
      const items = q.docs.map((d) => d.data()).filter((x) => !x.allow || x.allow.includes(me)).map((x) => ({ id: x.id, kind: x.kind, text: x.text, bg: x.bg, data: x.data, ts: x.ts, src: x.src || null, dur: x.dur || 0 }));
      if (b.view !== false) await Promise.all(items.map((x) => SC(pid).collection('items').doc(x.id).collection('v').doc(me).set({ ts: now }).catch(() => {})));
      return res.status(200).json({ items });
    }

    if (op === 'devchat') { // tombol Verifikasi kepercayaan dan beli Pro: langsung chat developer tanpa persetujuan, kontak Developer tersimpan otomatis
      if (hit('dc' + me, 20, 3600 * 1000)) return L.bad(res, 429, 'Terlalu sering. Coba lagi nanti.');
      const dv = await devUid(db); if (!dv) return L.bad(res, 503, 'Developer belum aktif. Coba lagi nanti.');
      if (dv === me) return L.bad(res, 400, 'Kamu adalah developer.');
      if ((await bl(dv).doc(me).get()).exists) return L.bad(res, 403, 'Developer tidak bisa dihubungi sekarang.');
      const now = Date.now(), m0 = await cl(me).doc(dv).get(), d0 = await cl(dv).doc(me).get();
      if (m0.exists) await cl(me).doc(dv).set({ status: 'ok' }, { merge: true }); else await cl(me).doc(dv).set({ first: 'Developer', last: '', number: DEV_NUMBER, status: 'ok', created: now });
      if (d0.exists) await cl(dv).doc(me).set({ status: 'ok' }, { merge: true }); else await cl(dv).doc(me).set({ first: '', last: '', number: mine.number, name: mine.name || '', status: 'ok', created: now });
      try { await bl(me).doc(dv).delete(); } catch (e) {}
      return res.status(200).json({ id: dv });
    }
    if (op === 'vfstatus') { const d = await db.collection('verif').doc(me).get(); return res.status(200).json(vgView(d.exists ? d.data() : null)); }
    if (op === 'vfsubmit') { // formulir centang hijau Premium: tersimpan sebagai status "ditinjau" dan otomatis terkirim ke chat developer
      if (hit('vfs' + me, 5, 3600 * 1000)) return L.bad(res, 429, 'Terlalu sering. Coba lagi nanti.');
      const dv = await devUid(db); if (!dv) return L.bad(res, 503, 'Developer belum aktif. Coba lagi nanti.');
      if (dv === me) return L.bad(res, 400, 'Kamu adalah developer.');
      const f = b.form || {}, cl2 = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, n);
      const form = { name: cl2(f.name, 60), biz: cl2(f.biz, 400), platform: cl2(f.platform, 20), link: cl2(f.link, 200), proof: cl2(f.proof, 400), contact: cl2(f.contact, 60) };
      if (!form.name || !form.biz || !form.link || !form.proof) return L.bad(res, 400, 'Lengkapi semua kolom yang wajib.');
      if (VF_PLATFORMS.indexOf(form.platform) < 0) return L.bad(res, 400, 'Pilih platform aktif dulu.');
      if (f.agree !== true) return L.bad(res, 400, 'Centang pernyataan bahwa data benar.');
      const vr = db.collection('verif').doc(me), vd = await vr.get(), cur = vgView(vd.exists ? vd.data() : null);
      if (cur.st === 'review' || cur.st === 'approved' || cur.st === 'active') return L.bad(res, 409, cur.st === 'review' ? 'Pengajuanmu sedang ditinjau.' : 'Pengajuanmu sudah disetujui atau aktif.');
      if ((await bl(dv).doc(me).get()).exists) return L.bad(res, 403, 'Developer tidak bisa dihubungi sekarang.');
      const now = Date.now(), m0 = await cl(me).doc(dv).get(), d0 = await cl(dv).doc(me).get();
      if (m0.exists) await cl(me).doc(dv).set({ status: 'ok' }, { merge: true }); else await cl(me).doc(dv).set({ first: 'Developer', last: '', number: DEV_NUMBER, status: 'ok', created: now });
      if (d0.exists) await cl(dv).doc(me).set({ status: 'ok' }, { merge: true }); else await cl(dv).doc(me).set({ first: '', last: '', number: mine.number, name: mine.name || '', status: 'ok', created: now });
      const text = ['PENGAJUAN CENTANG HIJAU PREMIUM', 'Nama akun/bisnis: ' + form.name, 'Bisnis/layanan: ' + form.biz, 'Platform aktif: ' + form.platform, 'Link: ' + form.link, 'Bukti kepemilikan: ' + form.proof, form.contact ? 'Kontak lain: ' + form.contact : '', 'Nomor Partical: ' + (mine.number || ''), 'Saya setuju biaya Rp15.000/bulan setelah disetujui.'].filter(Boolean).join('\n').slice(0, MSG_MAX);
      const tref = db.collection('threads').doc(tid(me, dv)), meta = await tref.get(), cid = crypto.randomBytes(8).toString('hex');
      const ts = Math.max(now, ((meta.exists && meta.data().lastTs) || 0) + 1), m = { id: cid, from: me, text, ts, ak: crypto.randomBytes(8).toString('hex'), rk: crypto.randomBytes(8).toString('hex') };
      await db.collection('threads').doc(tid(me, dv)).collection('msgs').doc(cid).set(m);
      await tref.set({ last: text.slice(0, 80), lastTs: ts, lastFrom: me }, { merge: true });
      await vr.set({ st: 'review', ts: now, form, until: 0 });
      try { const dE = await cl(dv).doc(me).get(); await Promise.race([notify(db, dv, me, dE.data() || {}, mine, 'Pengajuan centang hijau baru', { t: tid(me, dv), u: dv, m: cid, k: m.ak, r: m.rk }), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { console.error('push error', e && e.message); }
      return res.status(200).json({ ok: true, id: dv, st: 'review' });
    }
    if (op === 'me') return res.status(200).json({ number: mine.number, name: mine.name || '', about: mine.about || '', link: mine.link || '', pv: mine.pv || 0 });

    if (op === 'list') {
      const dvu = await devUid(db);
      let snap = await cl(me).get();
      if (me === dvu && !snap.docs.some((d) => d.id === DUMMY_ID)) { await cl(me).doc(DUMMY_ID).set({ first: 'Dummy', last: '', number: DUMMY_NUMBER, status: 'ok', created: Date.now() }); snap = await cl(me).get();
        try { const tr = db.collection('threads').doc(tid(me, DUMMY_ID)), t0 = Date.now(), iid = crypto.randomBytes(8).toString('hex'); await tr.collection('msgs').doc(iid).set({ id: iid, from: DUMMY_ID, text: 'Halo! Aku Dummy, khusus untukmu.\nKetik: paket pro buat email@gmail.com\nBisa tambah lama, contoh: paket pro buat email@gmail.com 60 hari\nPaket free: paket free buat email@gmail.com\nCek: cek email@gmail.com', ts: t0 }); await tr.set({ last: 'Halo! Aku Dummy, khusus untukmu.', lastTs: t0, lastFrom: DUMMY_ID, rd: { [me]: t0 }, dv: { [me]: t0 }, rts: t0 }, { merge: true }); } catch (e) { console.error('dummy intro', e && e.message); } }
      const legacy = snap.docs.filter((d) => d.data().status === 'in' || d.data().status === 'out'); // sisa sistem lama (menunggu diterima): langsung dijadikan kontak
      if (legacy.length) {
        try {
          await Promise.all(legacy.slice(0, 40).map(async (d) => {
            if (/^x\d{12}$/.test(d.id) && d.data().status === 'out') return cl(me).doc(d.id).delete();
            await cl(me).doc(d.id).set({ status: 'ok' }, { merge: true });
            const th = await cl(d.id).doc(me).get();
            if (th.exists) { if (th.data().status !== 'ok') await cl(d.id).doc(me).set({ status: 'ok' }, { merge: true }); }
            else if (!(await bl(d.id).doc(me).get()).exists) await cl(d.id).doc(me).set({ first: '', last: '', number: mine.number, status: 'ok', created: Date.now() });
          }));
        } catch (e) { console.error('legacy kontak', e && e.message); }
        snap = await cl(me).get();
      }
      const vgm = await vgMap(db, [me].concat(snap.docs.map((d) => d.id)));
      const myv = vgView((await db.collection('verif').doc(me).get()).data());
      const contacts = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      const ok = contacts.filter((c) => c.status === 'ok');
      const metas = ok.length ? await db.getAll(...ok.map((c) => db.collection('threads').doc(tid(me, c.id)))) : [];
      const lm = {}, pvm = {}, dvw = []; ok.forEach((c, i) => { const m = metas[i] && metas[i].exists ? metas[i].data() : null; if (m && m.pv && m.pv[c.id]) pvm[c.id] = m.pv[c.id]; if (m && m.lastTs) lm[c.id] = { text: m.last || '', ts: m.lastTs, from: m.lastFrom };
        if (m && m.lastTs && m.lastFrom && m.lastFrom !== me && m.lastTs > ((m.dv || {})[me] || 0)) dvw.push(db.collection('threads').doc(tid(me, c.id)).set({ dv: { [me]: m.lastTs }, rts: Math.max(Date.now(), (m.rts || 0) + 1) }, { merge: true })); }); // HP penerima aktif: pesan dianggap sudah terkirim (centang dua)
      if (dvw.length) { try { await Promise.all(dvw.slice(0, 30)); } catch (e) {} }
      const bs = await bl(me).get();
      let groups = [];
      try {
        const gl = await db.collection('ugroups').doc(me).collection('list').get();
        if (gl.size) {
          const gd = await db.getAll(...gl.docs.map((d) => db.collection('groups').doc(d.id)));
          const gms = []; gd.forEach((x) => { if (x.exists) (x.data().members || []).forEach((u) => gms.push(u)); }); const vgmG = await vgMap(db, gms);
          groups = gd.filter((x) => x.exists && (x.data().members || []).includes(me)).map((x) => { const g = x.data(); return { id: x.id, name: g.name || 'Grup', owner: g.owner, members: (g.members || []).map((u) => ({ id: u, name: (g.names && g.names[u]) || 'Anggota', vf: u === dvu ? 1 : 0, vg: vgmG[u] || 0 })), lastMsg: g.lastTs ? { text: g.last || '', ts: g.lastTs, from: g.lastFrom, by: (g.names && g.names[g.lastFrom]) || '' } : null, created: g.created || 0, desc: g.desc || '', pv: g.pv || 0 }; });
        }
      } catch (e) { console.error('grup list', e && e.message); }
      return res.status(200).json({
        groups,
        me: { mute: mine.mute || {}, number: mine.number, name: mine.name || '', about: mine.about || '', link: mine.link || '', pv: mine.pv || 0, vf: me === dvu ? 1 : 0, vg: vgm[me] || 0, vs: myv.st, vu: myv.until || 0 },
        contacts: contacts.map((c) => ({ id: c.id, first: c.first || '', last: c.last || '', number: c.number || '', name: c.name || '', status: c.status, created: c.created || 0, lastMsg: lm[c.id] || null, pv: pvm[c.id] || 0, vf: c.id === dvu ? 1 : 0, vg: vgm[c.id] || 0 })),
        blocked: bs.docs.map((d) => ({ id: d.id, first: d.data().first || '', last: d.data().last || '', number: d.data().number || '' })),
      });
    }

    if (op === 'setphoto') {
      if (hit('sp' + me, 6, 3600 * 1000)) return L.bad(res, 429, 'Terlalu sering ganti foto. Coba lagi nanti.');
      const data = String(b.data || '');
      if (data && (data.length > PHOTO_MAX || !PHOTO_RE.test(data))) return L.bad(res, 400, 'Foto profil tidak valid atau terlalu besar.');
      const pv = data ? Date.now() : 0;
      if (data) await db.collection('photos').doc(me).set({ data, ts: pv }); else await db.collection('photos').doc(me).delete();
      await prof(me).set({ pv }, { merge: true });
      const cs = await cl(me).get();
      await Promise.all(cs.docs.filter((d) => d.data().status === 'ok').map((d) => db.collection('threads').doc(tid(me, d.id)).set({ pv: { [me]: pv } }, { merge: true })));
      return res.status(200).json({ ok: true, pv });
    }

    if (op === 'getphoto') {
      const pid = String(b.id || '');
      if (!/^[\w-]{1,80}$/.test(pid)) return L.bad(res, 400, 'Tidak valid.');
      if (hit('gp' + me, 120, 60 * 1000)) return L.bad(res, 429, 'Terlalu cepat.');
      if (pid !== me) {
        const ce = await cl(me).doc(pid).get();
        if (!ce.exists || ce.data().status !== 'ok' || (await bl(pid).doc(me).get()).exists) return L.bad(res, 403, 'Tidak bisa dilihat.');
      }
      const d = await db.collection('photos').doc(pid).get();
      if (!d.exists) return res.status(200).json({ data: '', pv: 0 });
      return res.status(200).json({ data: d.data().data, pv: d.data().ts || 0 });
    }

    if (op === 'profile') {
      const up = {};
      if (b.name !== undefined) up.name = clean(b.name, 24);
      if (b.about !== undefined) up.about = clean(b.about, 140);
      if (b.link !== undefined) { const lk = clean(b.link, 200); if (lk && !/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}([\/?#]\S*)?$/i.test(lk)) return L.bad(res, 400, 'Tautannya tidak valid.'); up.link = lk; }
      await prof(me).set(up, { merge: true });
      return res.status(200).json({ ok: true });
    }

    if (op === 'pushkey' || op === 'pushsub' || op === 'pushoff') {
      const w = wp();
      if (!w) return L.bad(res, 501, 'Notifikasi belum aktif di server (paket web-push belum terpasang).');
      const keys = await vapidKeys(db, w);
      if (op === 'pushkey') return res.status(200).json({ key: keys.publicKey });
      const sub = b.sub || {}, ep = String(sub.endpoint || b.endpoint || '');
      if (!/^https:\/\/[^\s]{10,600}$/.test(ep)) return L.bad(res, 400, 'Langganan notifikasi tidak valid.');
      const hid = crypto.createHash('sha1').update(ep).digest('hex');
      const pcol = prof(me).collection('push');
      if (op === 'pushoff') { await pcol.doc(hid).delete(); return res.status(200).json({ ok: true }); }
      if (!sub.keys || !sub.keys.p256dh || !sub.keys.auth) return L.bad(res, 400, 'Langganan notifikasi tidak lengkap.');
      const map = db.collection('pushmap').doc(hid), prev = await map.get();
      if (prev.exists && prev.data().uid !== me) await prof(prev.data().uid).collection('push').doc(hid).delete();
      await map.set({ uid: me });
      await pcol.doc(hid).set({ sub: { endpoint: ep, keys: { p256dh: String(sub.keys.p256dh).slice(0, 200), auth: String(sub.keys.auth).slice(0, 100) } }, ts: Date.now() });
      const all = await pcol.get();
      if (all.size > 5) { const old = all.docs.map((d) => ({ d, t: d.data().ts || 0 })).sort((x, y) => x.t - y.t).slice(0, all.size - 5); await Promise.all(old.map((o) => pcol.doc(o.d.id).delete())); }
      return res.status(200).json({ ok: true });
    }

    if (op === 'newnumber') return L.bad(res, 403, 'Nomor tidak bisa diganti.');

    if (op === 'add') { // simpan kontak langsung tersambung, tanpa menunggu diterima. Nama sementara = nomor kalau tidak diisi
      const num = String(b.number || '').replace(/\D/g, ''), first = clean(b.first, 24), last = clean(b.last, 24);
      if (!validNum(num)) return L.bad(res, 400, 'Nomornya tidak valid. Cek lagi 12 digitnya.');
      if (num === mine.number) return L.bad(res, 400, 'Itu nomor kamu sendiri.');
      if (hit('add' + me, 40, 24 * 3600 * 1000)) return L.bad(res, 429, 'Batas tambah kontak hari ini sudah habis. Coba lagi besok.');
      const cs = await cl(me).get();
      if (cs.size >= MAX_CONTACTS) return L.bad(res, 400, 'Kontak sudah penuh.');
      const ex = cs.docs.filter((d) => d.data().number === num)[0];
      if (ex && ex.data().status === 'ok') return res.status(200).json({ ok: true, status: 'ok', id: ex.id, already: true });
      const nref = await db.collection('numbers').doc(num).get();
      const other = nref.exists ? nref.data().uid : null;
      if (!other) return L.bad(res, 404, 'Nomor itu belum terdaftar di Partical Message.');
      const now = Date.now();
      await cl(me).doc(other).set({ first, last, number: num, status: 'ok', created: now });
      if (ex && ex.id !== other) { try { await cl(me).doc(ex.id).delete(); } catch (e) {} }
      if (!(await bl(other).doc(me).get()).exists) {
        const theirs = await cl(other).doc(me).get();
        if (theirs.exists) await cl(other).doc(me).set({ status: 'ok' }, { merge: true });
        else await cl(other).doc(me).set({ first: '', last: '', number: mine.number, status: 'ok', created: now });
      }
      return res.status(200).json({ ok: true, status: 'ok', id: other });
    }
    const id = String(b.id || '');
    if (!/^[\w-]{1,80}$/.test(id)) return L.bad(res, 400, 'Kontak tidak valid.');
    const myEntry = await cl(me).doc(id).get(), my = myEntry.exists ? myEntry.data() : null;

    if (id === DUMMY_ID && op === 'send') { // akun Dummy: hanya untuk developer. Ketik "paket pro buat email@..." lalu langsung diproses dan dibalas Dummy
      if (me !== (await devUid(db)) || !my || my.status !== 'ok') return L.bad(res, 403, 'Kontak ini belum terhubung.');
      if (hit('dum' + me, 60, 60 * 1000)) return L.bad(res, 429, 'Terlalu cepat. Tunggu sebentar.');
      const text = String(b.text == null ? '' : b.text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, 300);
      if (!text) return L.bad(res, 400, 'Pesan kosong.');
      let reply = 'Perintah belum dikenali. Contoh:\npaket pro buat nama@gmail.com\npaket pro buat nama@gmail.com 60 hari\npaket free buat nama@gmail.com\ncek nama@gmail.com';
      const em = text.match(/([^\s@]+@[^\s@]+\.[^\s@]+)/), t = text.toLowerCase().replace(em ? em[1].toLowerCase() : '', ' ');
      if (em && /\b(paket\s+)?(pro|free|gratis)\b.*\bbuat\b|\bcek\b/.test(t)) {
        const email = em[1].toLowerCase().replace(/[.,;]+$/, '');
        const plan = /\bcek\b/.test(t) ? 'check' : /\b(free|gratis)\b/.test(t) ? 'free' : 'pro';
        const dm = t.match(/(\d{1,3})\s*hari/), days = Math.max(1, Math.min(365, dm ? parseInt(dm[1], 10) : 30));
        try {
          let target = null; try { target = await L.admin().auth().getUserByEmail(email); } catch (e) {}
          if (!target) reply = 'Gagal: ' + email + ' belum terdaftar. Minta dia daftar dulu di web.';
          else {
            const u = await L.rpc(plan === 'check' ? 'admin_get' : 'admin_set', { p_user: target.uid, plan, days, p_email: email });
            const until = u && u.pro_until ? new Date(u.pro_until).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }) : '';
            if (plan === 'pro') reply = 'Selesai. Paket Pro aktif untuk ' + email + ' selama ' + days + ' hari' + (until ? ' (sampai ' + until + ')' : '') + '.';
            else if (plan === 'free') reply = 'Selesai. ' + email + ' dikembalikan ke paket Free.';
            else reply = email + ': paket ' + ((u && u.plan) || 'free') + (u && u.plan === 'pro' && until ? ', aktif sampai ' + until : '') + '.';
          }
        } catch (e) { console.error('dummy', e && e.message); reply = 'Gagal memproses. Coba lagi.'; }
      }
      const tref = db.collection('threads').doc(tid(me, DUMMY_ID)), meta = await tref.get(), now = Date.now();
      const t1 = Math.max(now, ((meta.exists && meta.data().lastTs) || 0) + 1), t2 = t1 + 1;
      const cid = /^[\w-]{6,40}$/.test(String(b.cid || '')) ? String(b.cid) : crypto.randomBytes(8).toString('hex'), rid = crypto.randomBytes(8).toString('hex');
      const mc = tref.collection('msgs');
      await mc.doc(cid).set({ id: cid, from: me, text, ts: t1 });
      await mc.doc(rid).set({ id: rid, from: DUMMY_ID, text: reply, ts: t2 });
      await tref.set({ last: reply.slice(0, 80), lastTs: t2, lastFrom: DUMMY_ID, rd: { [me]: t2 }, dv: { [me]: t2 }, rts: Math.max(now, ((meta.exists && meta.data().rts) || 0) + 1) }, { merge: true });
      return res.status(200).json({ ok: true, msg: { id: cid, from: 'me', text, ts: t1, st: 3 } });
    }
    if (op === 'accept') {
      if (!my || my.status !== 'in') return L.bad(res, 404, 'Permintaan tidak ditemukan.');
      await cl(me).doc(id).set({ status: 'ok', first: clean(b.first, 24) || my.name || '', last: clean(b.last, 24) }, { merge: true });
      await cl(id).doc(me).set({ status: 'ok' }, { merge: true });
      return res.status(200).json({ ok: true });
    }
    if (op === 'decline') { await cl(me).doc(id).delete(); return res.status(200).json({ ok: true }); }
    if (op === 'rename') {
      if (!my) return L.bad(res, 404, 'Kontak tidak ditemukan.');
      await cl(me).doc(id).set({ first: clean(b.first, 24), last: clean(b.last, 24) }, { merge: true });
      return res.status(200).json({ ok: true });
    }
    if (op === 'remove') {
      await cl(me).doc(id).delete();
      const t = await cl(id).doc(me).get();
      if (t.exists) await cl(id).doc(me).delete();
      return res.status(200).json({ ok: true });
    }
    if (op === 'block') {
      await bl(me).doc(id).set({ ts: Date.now(), first: (my && my.first) || '', last: (my && my.last) || '', number: (my && my.number) || '' });
      await cl(me).doc(id).delete();
      return res.status(200).json({ ok: true });
    }
    if (op === 'unblock') { await bl(me).doc(id).delete(); return res.status(200).json({ ok: true }); }

    if (op === 'report') {
      if (hit('rep' + me, 10, 24 * 3600 * 1000)) return L.bad(res, 429, 'Terlalu banyak laporan hari ini.');
      const q = await db.collection('threads').doc(tid(me, id)).collection('msgs').orderBy('ts', 'desc').limit(20).get();
      await db.collection('reports').add({ by: me, against: id, reason: clean(b.reason, 200), ts: Date.now(), msgs: q.docs.map((d) => d.data()).reverse() });
      return res.status(200).json({ ok: true });
    }

    // dari sini harus sudah saling terhubung
    if (!my || my.status !== 'ok') return L.bad(res, 403, 'Kontak ini belum terhubung.');
    const theirE = await cl(id).doc(me).get();
    const blocked = (await bl(id).doc(me).get()).exists || (await bl(me).doc(id).get()).exists;
    const col = db.collection('threads').doc(tid(me, id)).collection('msgs');

    if (op === 'presence') {
      if (blocked || !theirE.exists || theirE.data().status !== 'ok') return res.status(200).json({});
      if (hit('pres' + me, 120, 60 * 1000)) return L.bad(res, 429, 'Terlalu cepat.');
      const ps = await prof(id).get(), pd = ps.exists ? ps.data() : {}, now = Date.now();
      return res.status(200).json({ on: !!pd.on && now - (pd.seen || 0) < 55000, seen: pd.seen || 0 });
    }

    if (op === 'send') {
      if (blocked || !theirE.exists || theirE.data().status !== 'ok') return L.bad(res, 403, 'Pesan tidak terkirim.');
      const text = String(b.text == null ? '' : b.text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, MSG_MAX);
      const kind = MEDIA[b.kind] ? b.kind : '', mdata = kind ? String(b.data || '') : '';
      if (kind && (mdata.length > MEDIA[kind].max || !MEDIA[kind].re.test(mdata))) return L.bad(res, 400, kind === 'video' ? 'Videonya terlalu besar atau formatnya tidak didukung.' : 'Lampiran tidak valid atau terlalu besar.');
      if (!text && !kind) return L.bad(res, 400, 'Pesan kosong.');
      if (kind && (hit('media' + me, 12, 60 * 1000) || hit('mediad' + me, 150, 24 * 3600 * 1000))) return L.bad(res, 429, 'Terlalu banyak kirim lampiran. Tunggu sebentar.');
      if (hit('msg' + me, 20, 60 * 1000) || hit('msgd' + me, 1500, 24 * 3600 * 1000)) return L.bad(res, 429, 'Kamu kirim terlalu cepat. Tunggu sebentar.');
      const cid = /^[\w-]{6,40}$/.test(String(b.cid || '')) ? String(b.cid) : crypto.randomBytes(8).toString('hex');
      const tref = db.collection('threads').doc(tid(me, id)), meta = await tref.get();
      const ts = Math.max(Date.now(), ((meta.exists && meta.data().lastTs) || 0) + 1), m = { id: cid, from: me, text, ts };
      if (kind) { m.kind = kind; m.ar = Math.min(4, Math.max(0.25, Number(b.ar) || 1)); if (kind === 'video' || kind === 'voice') m.dur = Math.min(60, Math.max(0, Number(b.dur) || 0)); }
      m.ak = crypto.randomBytes(8).toString('hex'); m.rk = crypto.randomBytes(8).toString('hex');
      if (meta.exists && meta.data().dis) m.ex = ts + meta.data().dis * 1000;
      if (b.reply && typeof b.reply === 'object' && /^[\w-]{6,40}$/.test(String(b.reply.mid || ''))) m.reply = { mid: String(b.reply.mid), text: clean(b.reply.text, 120), who: b.reply.who === 'them' ? 'them' : 'me' };
      if (kind) await db.collection('threads').doc(tid(me, id)).collection('media').doc(cid).set({ data: mdata, kind, ts });
      await col.doc(cid).set(m);
      const prev = kind ? MEDIA[kind].label + (text ? ': ' + text : '') : text;
      await tref.set({ last: prev.slice(0, 80), lastTs: ts, lastFrom: me }, { merge: true });
      try { await Promise.race([notify(db, id, me, theirE.data(), mine, prev, { t: tid(me, id), u: id, m: cid, k: m.ak, r: m.rk }), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { console.error('push error', e && e.message); }
      if (!kind && text && me === (await devUid(db))) { // balasan developer mengubah status centang hijau milik lawan bicara
        try {
          const vr = db.collection('verif').doc(id), vd = await vr.get();
          if (vd.exists) {
            const x = vd.data(), t = text.toLowerCase();
            if (/tidak\s+(di)?setuju|ditolak|\btolak\b/.test(t)) await vr.set({ st: 'rejected', ts: Date.now() }, { merge: true });
            else if (/disetujui|di\s?setujui|\bsetuju\b|approve/.test(t) && x.st !== 'active') await vr.set({ st: 'approved', ts: Date.now() }, { merge: true });
            else if (/lunas|sudah\s+bayar|\baktif\b|diaktifkan/.test(t) && (x.st === 'approved' || x.st === 'active')) await vr.set({ st: 'active', ts: Date.now(), until: Math.max(Date.now(), x.st === 'active' && x.until > Date.now() ? x.until : 0) + 30 * VF_DAY }, { merge: true });
          }
        } catch (e) { console.error('vf status', e && e.message); }
      }
      return res.status(200).json({ ok: true, msg: { id: cid, from: 'me', text, ts, st: 1, kind: kind || undefined, ar: m.ar, dur: m.dur, reply: m.reply ? { mid: m.reply.mid, text: m.reply.text, who: m.reply.who } : undefined } });
    }

    if (op === 'getmedia') {
      if (blocked) return L.bad(res, 403, 'Tidak bisa dimuat.');
      const mid = String(b.mid || '');
      if (!/^[\w-]{6,40}$/.test(mid)) return L.bad(res, 400, 'Lampiran tidak valid.');
      if (hit('gm' + me, 200, 60 * 1000)) return L.bad(res, 429, 'Terlalu cepat.');
      const d = await db.collection('threads').doc(tid(me, id)).collection('media').doc(mid).get();
      if (!d.exists) return L.bad(res, 404, 'Lampiran sudah tidak ada.');
      return res.status(200).json({ data: d.data().data });
    }

    if (op === 'react' || op === 'unsend' || op === 'edit') {
      if (blocked || !theirE.exists || theirE.data().status !== 'ok') return L.bad(res, 403, 'Tidak bisa diproses.');
      const mid = String(b.mid || '');
      if (!/^[\w-]{6,40}$/.test(mid)) return L.bad(res, 400, 'Pesan tidak valid.');
      const mref = col.doc(mid), ms = await mref.get();
      if (!ms.exists) return L.bad(res, 404, 'Pesan tidak ditemukan.');
      const md = ms.data(), tref = db.collection('threads').doc(tid(me, id)), meta = await tref.get(), now = Math.max(Date.now(), ((meta.exists && meta.data().rts) || 0) + 1);
      if (op === 'react') {
        if (hit('rx' + me, 60, 60 * 1000)) return L.bad(res, 429, 'Terlalu cepat.');
        const em = clean(b.emoji, 8);
        await mref.set({ react: { [me]: em } }, { merge: true });
      } else if (op === 'edit') {
        if (md.from !== me) return L.bad(res, 403, 'Hanya pesanmu yang bisa diedit.');
        if (md.deleted) return L.bad(res, 400, 'Pesan sudah ditarik.');
        if (Date.now() - md.ts > 15 * 60 * 1000) return L.bad(res, 400, 'Edit hanya bisa dalam 15 menit setelah dikirim.');
        const nt = String(b.text == null ? '' : b.text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, MSG_MAX);
        if (!nt && !md.kind) return L.bad(res, 400, 'Pesan tidak boleh kosong.');
        await mref.set({ text: nt, ed: true }, { merge: true });
      } else {
        if (md.from !== me) return L.bad(res, 403, 'Hanya pesanmu yang bisa ditarik.');
        await mref.set({ deleted: true, text: '' }, { merge: true });
        if (md.kind) await db.collection('threads').doc(tid(me, id)).collection('media').doc(mid).delete();
        if (meta.exists && meta.data().lastTs === md.ts) await tref.set({ last: 'Pesan ditarik' }, { merge: true });
      }
      await tref.set({ rts: now }, { merge: true });
      return res.status(200).json({ ok: true });
    }

    return L.bad(res, 400, 'Perintah tidak dikenal.');
  } catch (e) {
    console.error('contacts error', e);
    return L.bad(res, 503, 'Kontak lagi bermasalah. Coba lagi sebentar.');
  }
};
