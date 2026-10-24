// Kontak dan chat teks antar pengguna Faisal AI. Semua data ada di Firestore dan hanya server ini yang bisa membaca/menulis.
// Pengaman: nomor 12 digit dengan digit pemeriksa, permintaan kontak harus diterima, blokir, laporan, batas kirim, tanpa pencarian nama.
const crypto = require('crypto');
const L = require('./_lib.js');

const MAX_CONTACTS = 100;
const MSG_MAX = 1000;
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

module.exports = async function handler(req, res) {
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
    const mine = await ensureProfile(me);

    if (op === 'me') return res.status(200).json({ number: mine.number, name: mine.name || '' });

    if (op === 'list') {
      const snap = await cl(me).get();
      const contacts = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      const ok = contacts.filter((c) => c.status === 'ok');
      const metas = ok.length ? await db.getAll(...ok.map((c) => db.collection('threads').doc(tid(me, c.id)))) : [];
      const lm = {}; ok.forEach((c, i) => { const m = metas[i] && metas[i].exists ? metas[i].data() : null; if (m && m.lastTs) lm[c.id] = { text: m.last || '', ts: m.lastTs, from: m.lastFrom }; });
      const bs = await bl(me).get();
      return res.status(200).json({
        me: { number: mine.number, name: mine.name || '' },
        contacts: contacts.map((c) => ({ id: c.id, first: c.first || '', last: c.last || '', number: c.number || '', name: c.name || '', status: c.status, created: c.created || 0, last: lm[c.id] || null })),
        blocked: bs.docs.map((d) => ({ id: d.id, first: d.data().first || '', last: d.data().last || '', number: d.data().number || '' })),
      });
    }

    if (op === 'profile') {
      await prof(me).set({ name: clean(b.name, 24) }, { merge: true });
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

    if (op === 'msgs') {
      const after = Number(b.after) || 0;
      let q;
      if (after > 0) q = await col.where('ts', '>=', after).orderBy('ts', 'asc').limit(100).get();
      else { q = await col.orderBy('ts', 'desc').limit(80).get(); }
      let msgs = q.docs.map((d) => d.data());
      if (!(after > 0)) msgs = msgs.reverse();
      return res.status(200).json({ msgs: msgs.map((m) => ({ id: m.id, from: m.from === me ? 'me' : 'them', text: m.text, ts: m.ts })) });
    }

    if (op === 'send') {
      if (blocked || !theirE.exists || theirE.data().status !== 'ok') return L.bad(res, 403, 'Pesan tidak terkirim.');
      const text = String(b.text == null ? '' : b.text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, MSG_MAX);
      if (!text) return L.bad(res, 400, 'Pesan kosong.');
      if (hit('msg' + me, 20, 60 * 1000) || hit('msgd' + me, 1500, 24 * 3600 * 1000)) return L.bad(res, 429, 'Kamu kirim terlalu cepat. Tunggu sebentar.');
      const cid = /^[\w-]{6,40}$/.test(String(b.cid || '')) ? String(b.cid) : crypto.randomBytes(8).toString('hex');
      const ts = Date.now(), m = { id: cid, from: me, text, ts };
      await col.doc(cid).set(m);
      await db.collection('threads').doc(tid(me, id)).set({ last: text.slice(0, 80), lastTs: ts, lastFrom: me }, { merge: true });
      return res.status(200).json({ ok: true, msg: { id: cid, from: 'me', text, ts } });
    }

    return L.bad(res, 400, 'Perintah tidak dikenal.');
  } catch (e) {
    console.error('contacts error', e);
    return L.bad(res, 503, 'Kontak lagi bermasalah. Coba lagi sebentar.');
  }
};
