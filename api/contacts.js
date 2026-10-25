// Kontak dan chat teks antar pengguna Faisal AI. Semua data ada di Firestore dan hanya server ini yang bisa membaca/menulis.
// Pengaman: nomor 12 digit dengan digit pemeriksa, permintaan kontak harus diterima, blokir, laporan, batas kirim, tanpa pencarian nama.
const crypto = require('crypto');
const L = require('./_lib.js');
let _wp = null;
function wp() { if (_wp === null) { try { _wp = require('web-push'); } catch (e) { _wp = false; } } return _wp; }

const MAX_CONTACTS = 100;
const MSG_MAX = 1000;
const PHOTO_RE = /^data:image\/(jpeg|webp);base64,[A-Za-z0-9+\/=]+$/, PHOTO_MAX = 70000;
const MEDIA = { // jenis lampiran: pola data URL dan batas ukuran (karakter base64), supaya muat di satu dokumen database
  sticker: { re: /^data:image\/(webp|png);base64,[A-Za-z0-9+\/=]+$/, max: 180000, label: 'Stiker' },
  image: { re: /^data:image\/(jpeg|webp);base64,[A-Za-z0-9+\/=]+$/, max: 420000, label: 'Foto' },
  video: { re: /^data:video\/(webm|mp4)(;codecs=[\w.,-]+)?;base64,[A-Za-z0-9+\/=]+$/, max: 880000, label: 'Video' },
};
const GID = /^g_[a-f0-9]{10}$/;
const MAX_GROUP = 30;
function gView(me, g) {
  return (m) => {
    const o = { id: m.id, from: m.from === me ? 'me' : 'them', text: m.deleted ? '' : m.text, ts: m.ts };
    if (m.deleted) o.deleted = true; else if (m.kind) { o.kind = m.kind; o.ar = m.ar || 1; if (m.dur) o.dur = m.dur; }
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
async function notify(db, toId, fromId, entry, fromProfile, text) {
  const w = wp(); if (!w) return;
  const pcol = db.collection('profiles').doc(toId).collection('push'), snap = await pcol.get();
  if (!snap.size) return;
  const keys = await vapidKeys(db, w);
  w.setVapidDetails(vapidSubject(), keys.publicKey, keys.privateKey);
  const nm = ((entry && ((entry.first || '') + ' ' + (entry.last || '')).trim()) || (fromProfile && fromProfile.name) || '').trim() || 'Pesan baru';
  const payload = JSON.stringify({ title: nm, body: text.slice(0, 120), tag: 'chat-' + fromId, url: '/?chat=' + fromId });
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
  if (req.method === 'GET') return res.status(200).json({ ok: true, contacts_version: 8, fitur: ['lampiran', 'stiker', 'foto-profil', 'grup', 'status'] });
  if (req.method !== 'POST') return L.bad(res, 405, 'Gunakan POST.');
  if (!L.enabled()) return L.bad(res, 404, 'Login belum diaktifkan.');
  const user = await L.requireUser(req, res);
  if (!user) return;
  const me = user.id, b = req.body || {}, op = String(b.op || '');
  try {
    const db = L.admin().firestore();
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
          upd = q2.docs.map((d) => d.data()).map((m) => { const v = gv(m); return { id: v.id, react: v.react || null, deleted: !!v.deleted }; });
        }
        return res.status(200).json({ msgs: msgs.map(gv), upd, rts });
      }
      const after = Number(b.after) || 0, crts = Number(b.rts) || 0;
      const meta = await db.collection('threads').doc(tid(me, oid)).get();
      if (!meta.exists) return res.status(200).json({ msgs: [], rts: 0 });
      const md = meta.data(), rts = md.rts || 0;
      const newMsgs = !(after > 0 && (md.lastTs || 0) <= after), newUpd = after > 0 && rts > crts;
      if (!newMsgs && !newUpd) return res.status(200).json({ msgs: [], rts });
      const mcol = db.collection('threads').doc(tid(me, oid)).collection('msgs');
      const view = (m) => {
        const o = { id: m.id, from: m.from === me ? 'me' : 'them', text: m.deleted ? '' : m.text, ts: m.ts };
        if (m.deleted) o.deleted = true;
        else if (m.kind) { o.kind = m.kind; o.ar = m.ar || 1; if (m.dur) o.dur = m.dur; }
        if (m.react && typeof m.react === 'object') { const r = {}; Object.keys(m.react).forEach((k) => { if (m.react[k]) r[k === me ? 'me' : 'them'] = m.react[k]; }); if (Object.keys(r).length) o.react = r; }
        if (m.reply && m.reply.mid) o.reply = { mid: m.reply.mid, text: m.reply.text || '', who: m.from === me ? m.reply.who : (m.reply.who === 'me' ? 'them' : 'me') };
        return o;
      };
      let msgs = [], upd = [];
      if (newMsgs) {
        const q = after > 0 ? await mcol.where('ts', '>', after).orderBy('ts', 'asc').limit(100).get() : await mcol.orderBy('ts', 'desc').limit(80).get();
        msgs = q.docs.map((d) => d.data());
        if (!(after > 0)) msgs = msgs.reverse();
      }
      if (newUpd) {
        const q2 = await mcol.orderBy('ts', 'desc').limit(100).get();
        upd = q2.docs.map((d) => d.data()).filter((m) => m.deleted || (m.react && Object.keys(m.react).some((k) => m.react[k]))).map((m) => { const v = view(m); return { id: v.id, react: v.react || null, deleted: !!v.deleted }; });
        const have = {}; upd.forEach((u) => { have[u.id] = 1; });
        // pesan yang reaksinya baru dihapus tidak ikut daftar di atas, jadi kirim juga yang tidak punya reaksi supaya klien bisa menghapusnya
        q2.docs.forEach((d) => { const m = d.data(); if (!have[m.id] && m.ts <= (crts || 0) + 1e13) upd.push({ id: m.id, react: null, deleted: false }); });
      }
      return res.status(200).json({ msgs: msgs.map(view), upd, rts });
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
    if (GID.test(String(b.id || '')) && ['send', 'react', 'unsend', 'getmedia'].includes(op)) {
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
        if (kind) { m.kind = kind; m.ar = Math.min(4, Math.max(0.25, Number(b.ar) || 1)); if (kind === 'video') m.dur = Math.min(60, Math.max(0, Number(b.dur) || 0)); }
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
      const kind = b.kind === 'image' ? 'image' : 'text', text = clean(b.text, 200);
      const bg = /^#[0-9a-f]{6}$/i.test(String(b.bg || '')) ? String(b.bg) : '#1b2d73';
      let data = '';
      if (kind === 'image') { data = String(b.data || ''); if (data.length > 420000 || !MEDIA.image.re.test(data)) return L.bad(res, 400, 'Foto status tidak valid atau terlalu besar.'); }
      else if (!text) return L.bad(res, 400, 'Tulis statusnya dulu.');
      let allow = null;
      if (Array.isArray(b.allow)) { const oks = await okContacts(); allow = [...new Set(b.allow.map(String))].filter((x) => oks[x]).slice(0, 100); if (!allow.length) return L.bad(res, 400, 'Pilih minimal 1 kontak, atau pilih semua kontak.'); }
      const now = Date.now(), sid = 's' + crypto.randomBytes(6).toString('hex');
      const sm = await SC(me).get(), items = ((sm.exists && sm.data().items) || []).filter((x) => x.exp > now);
      const drop = items.length >= 10 ? items.splice(0, items.length - 9) : [];
      await Promise.all(drop.map((x) => SC(me).collection('items').doc(x.sid).delete()));
      const item = { id: sid, kind, text, bg, data, allow, ts: now, exp: now + DAYMS };
      await SC(me).collection('items').doc(sid).set(item);
      items.push({ sid, ts: now, exp: now + DAYMS, kind, text: text.slice(0, 40), allow });
      await SC(me).set({ items });
      return res.status(200).json({ ok: true, id: sid });
    }
    if (op === 'statmine') {
      const now = Date.now(), q = await SC(me).collection('items').where('exp', '>', now).orderBy('exp', 'asc').limit(10).get();
      const vc = await Promise.all(q.docs.map((d) => d.ref.collection('v').get().then((r) => r.size).catch(() => 0)));
      return res.status(200).json({ items: q.docs.map((d, i) => { const x = d.data(); return { id: x.id, kind: x.kind, text: x.text, bg: x.bg, data: x.data, ts: x.ts, exp: x.exp, shared: x.allow ? x.allow.length : 0, views: vc[i] }; }) });
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
      const items = q.docs.map((d) => d.data()).filter((x) => !x.allow || x.allow.includes(me)).map((x) => ({ id: x.id, kind: x.kind, text: x.text, bg: x.bg, data: x.data, ts: x.ts }));
      if (b.view !== false) await Promise.all(items.map((x) => SC(pid).collection('items').doc(x.id).collection('v').doc(me).set({ ts: now }).catch(() => {})));
      return res.status(200).json({ items });
    }

    if (op === 'me') return res.status(200).json({ number: mine.number, name: mine.name || '', about: mine.about || '', link: mine.link || '', pv: mine.pv || 0 });

    if (op === 'list') {
      const snap = await cl(me).get();
      const contacts = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      const ok = contacts.filter((c) => c.status === 'ok');
      const metas = ok.length ? await db.getAll(...ok.map((c) => db.collection('threads').doc(tid(me, c.id)))) : [];
      const lm = {}, pvm = {}; ok.forEach((c, i) => { const m = metas[i] && metas[i].exists ? metas[i].data() : null; if (m && m.pv && m.pv[c.id]) pvm[c.id] = m.pv[c.id]; if (m && m.lastTs) lm[c.id] = { text: m.last || '', ts: m.lastTs, from: m.lastFrom }; });
      const bs = await bl(me).get();
      let groups = [];
      try {
        const gl = await db.collection('ugroups').doc(me).collection('list').get();
        if (gl.size) {
          const gd = await db.getAll(...gl.docs.map((d) => db.collection('groups').doc(d.id)));
          groups = gd.filter((x) => x.exists && (x.data().members || []).includes(me)).map((x) => { const g = x.data(); return { id: x.id, name: g.name || 'Grup', owner: g.owner, members: (g.members || []).map((u) => ({ id: u, name: (g.names && g.names[u]) || 'Anggota' })), lastMsg: g.lastTs ? { text: g.last || '', ts: g.lastTs, from: g.lastFrom, by: (g.names && g.names[g.lastFrom]) || '' } : null, created: g.created || 0 }; });
        }
      } catch (e) { console.error('grup list', e && e.message); }
      return res.status(200).json({
        groups,
        me: { number: mine.number, name: mine.name || '', about: mine.about || '', link: mine.link || '', pv: mine.pv || 0 },
        contacts: contacts.map((c) => ({ id: c.id, first: c.first || '', last: c.last || '', number: c.number || '', name: c.name || '', status: c.status, created: c.created || 0, lastMsg: lm[c.id] || null, pv: pvm[c.id] || 0 })),
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

    if (op === 'newnumber') {
      if (hit('nn' + me, 3, 3600 * 1000)) return L.bad(res, 429, 'Terlalu sering ganti nomor. Coba lagi nanti.');
      for (let i = 0; i < 8; i++) {
        const n = genNum(), nref = db.collection('numbers').doc(n);
        try {
          await db.runTransaction(async (tx) => {
            const x = await tx.get(nref); if (x.exists) throw new Error('taken');
            tx.set(nref, { uid: me }); tx.delete(db.collection('numbers').doc(mine.number)); tx.set(prof(me), { number: n }, { merge: true });
          });
          return res.status(200).json({ number: n });
        } catch (e) { if (e.message !== 'taken') throw e; }
      }
      return L.bad(res, 503, 'Gagal bikin nomor baru, coba lagi.');
    }

    if (op === 'add') {
      const num = String(b.number || '').replace(/\D/g, ''), first = clean(b.first, 24), last = clean(b.last, 24);
      if (!first) return L.bad(res, 400, 'Isi nama awal dulu.');
      if (!validNum(num)) return L.bad(res, 400, 'Nomornya tidak valid. Cek lagi 12 digitnya.');
      if (num === mine.number) return L.bad(res, 400, 'Itu nomor kamu sendiri.');
      if (hit('add' + me, 15, 24 * 3600 * 1000)) return L.bad(res, 429, 'Batas tambah kontak hari ini sudah habis. Coba lagi besok.');
      const cs = await cl(me).get();
      if (cs.size >= MAX_CONTACTS) return L.bad(res, 400, 'Kontak sudah penuh.');
      if (cs.docs.some((d) => d.data().number === num)) return L.bad(res, 409, 'Nomor itu sudah ada di kontakmu.');
      const nref = await db.collection('numbers').doc(num).get();
      const other = nref.exists ? nref.data().uid : null;
      const now = Date.now();
      if (!other) { // jawabannya sama seperti nomor yang ada, supaya nomor tidak bisa ditebak-tebak
        await cl(me).doc('x' + num).set({ first, last, number: num, status: 'out', created: now });
        return res.status(200).json({ ok: true, status: 'out' });
      }
      if ((await bl(other).doc(me).get()).exists) {
        await cl(me).doc(other).set({ first, last, number: num, status: 'out', created: now });
        return res.status(200).json({ ok: true, status: 'out' });
      }
      const theirs = await cl(other).doc(me).get();
      if (theirs.exists && theirs.data().status === 'out') {
        await cl(me).doc(other).set({ first, last, number: num, status: 'ok', created: now });
        await cl(other).doc(me).set({ status: 'ok' }, { merge: true });
        return res.status(200).json({ ok: true, status: 'ok' });
      }
      await cl(me).doc(other).set({ first, last, number: num, status: 'out', created: now });
      await cl(other).doc(me).set({ first: '', last: '', number: mine.number, name: mine.name || '', status: 'in', created: now });
      return res.status(200).json({ ok: true, status: 'out' });
    }

    const id = String(b.id || '');
    if (!/^[\w-]{1,80}$/.test(id)) return L.bad(res, 400, 'Kontak tidak valid.');
    const myEntry = await cl(me).doc(id).get(), my = myEntry.exists ? myEntry.data() : null;

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
      if (kind) { m.kind = kind; m.ar = Math.min(4, Math.max(0.25, Number(b.ar) || 1)); if (kind === 'video') m.dur = Math.min(60, Math.max(0, Number(b.dur) || 0)); }
      if (b.reply && typeof b.reply === 'object' && /^[\w-]{6,40}$/.test(String(b.reply.mid || ''))) m.reply = { mid: String(b.reply.mid), text: clean(b.reply.text, 120), who: b.reply.who === 'them' ? 'them' : 'me' };
      if (kind) await db.collection('threads').doc(tid(me, id)).collection('media').doc(cid).set({ data: mdata, kind, ts });
      await col.doc(cid).set(m);
      const prev = kind ? MEDIA[kind].label + (text ? ': ' + text : '') : text;
      await tref.set({ last: prev.slice(0, 80), lastTs: ts, lastFrom: me }, { merge: true });
      try { await Promise.race([notify(db, id, me, theirE.data(), mine, prev), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { console.error('push error', e && e.message); }
      return res.status(200).json({ ok: true, msg: { id: cid, from: 'me', text, ts, kind: kind || undefined, ar: m.ar, dur: m.dur, reply: m.reply ? { mid: m.reply.mid, text: m.reply.text, who: m.reply.who } : undefined } });
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

    if (op === 'react' || op === 'unsend') {
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
