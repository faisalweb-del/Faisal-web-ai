// Social spotlight (saluran). Satu orang hanya boleh punya 1 saluran. Hanya pemilik yang bisa kirim pesan.
// Pengikut hanya bisa memberi reaksi, memilih jawaban polling, dan menjawab pertanyaan. Pengikut tidak bisa melihat siapa saja pengikut lain.
const crypto = require('crypto');
const L = require('./_lib.js');

const PHOTO_RE = /^data:image\/(jpeg|webp);base64,[A-Za-z0-9+\/=]+$/, PHOTO_MAX = 70000;
const MEDIA = {
  sticker: { re: /^data:image\/(webp|png);base64,[A-Za-z0-9+\/=]+$/, max: 180000, label: 'Stiker' },
  image: { re: /^data:image\/(jpeg|webp);base64,[A-Za-z0-9+\/=]+$/, max: 420000, label: 'Foto' },
  video: { re: /^data:video\/(webm|mp4)(;codecs=[\w.,-]+)?;base64,[A-Za-z0-9+\/=]+$/, max: 880000, label: 'Video' },
  audio: { re: /^data:audio\/(mpeg|mp3|mp4|x-m4a|m4a|aac|ogg|webm|wav|x-wav)(;codecs=[\w.,-]+)?;base64,[A-Za-z0-9+\/=]+$/, max: 880000, label: 'Musik' },
};
const CID = /^c_[a-f0-9]{10}$/;
const MID = /^[\w-]{6,40}$/;
const EMOJI_OK = new Set(['👍', '❤️', '😂', '😮', '😢', '🙏']);

const hitsMap = new Map();
function hit(key, max, ms) {
  const now = Date.now();
  const arr = (hitsMap.get(key) || []).filter((t) => now - t < ms);
  arr.push(now); hitsMap.set(key, arr);
  if (hitsMap.size > 5000) hitsMap.clear();
  return arr.length > max;
}
function clean(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n); }
function cleanML(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g, '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, n); }

module.exports = async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ ok: true, channels_version: 1, fitur: ['saluran', 'polling', 'pertanyaan', 'ikuti', 'cari'] });
  if (req.method !== 'POST') return L.bad(res, 405, 'Gunakan POST.');
  if (!L.enabled()) return L.bad(res, 404, 'Login belum diaktifkan.');
  const user = await L.requireUser(req, res);
  if (!user) return;
  const me = user.id, b = req.body || {}, op = String(b.op || '');
  try {
    const adm = L.admin(), db = adm.firestore(), FV = adm.firestore.FieldValue;
    const CH = (id) => db.collection('channels').doc(id);
    const OWN = db.collection('chanowner');
    const UCH = (id) => db.collection('uchan').doc(id).collection('list');
    const prof = (id) => db.collection('profiles').doc(id);
    const cleanName = (s) => clean(s, 40);

    const card = (snap, following) => {
      const d = snap.data();
      return { id: snap.id, name: d.name || 'Saluran', desc: d.desc || '', pv: d.pv || 0, followers: Math.max(0, d.fc || 0), created: d.created || 0, mine: d.owner === me, following: !!following, last: d.last || '', lastTs: d.lastTs || 0 };
    };
    async function followingSet() { const s = await UCH(me).get(); return new Set(s.docs.map((x) => x.id)); }
    async function loadCh(cid) {
      if (!CID.test(String(cid || ''))) return null;
      const s = await CH(cid).get(); return s.exists ? s : null;
    }
    const bumpRts = async (cid, cur) => { const now = Math.max(Date.now(), (cur || 0) + 1); await CH(cid).set({ rts: now }, { merge: true }); return now; };

    // ---------- daftar saluran ----------
    if (op === 'clist') {
      if (hit('cl' + me, 90, 60 * 1000)) return L.bad(res, 429, 'Terlalu sering memuat.');
      let mine = null;
      const os = await OWN.doc(me).get();
      if (os.exists) { const cs = await CH(os.data().cid).get(); if (cs.exists && cs.data().owner === me) mine = card(cs, false); }
      const fl = await UCH(me).get(), ids = fl.docs.map((d) => d.id);
      const docs = ids.length ? await db.getAll(...ids.map((i) => CH(i))) : [];
      const list = [];
      const stale = [];
      docs.forEach((d, i) => { if (d.exists) list.push(card(d, true)); else stale.push(ids[i]); });
      if (stale.length) { try { await Promise.all(stale.map((i) => UCH(me).doc(i).delete())); } catch (e) {} }
      return res.status(200).json({ mine, list });
    }
    if (op === 'csearch') {
      if (hit('cs' + me, 40, 60 * 1000)) return L.bad(res, 429, 'Terlalu sering mencari. Tunggu sebentar.');
      const q = clean(b.q, 40).toLowerCase();
      const snap = await db.collection('channels').orderBy('fc', 'desc').limit(200).get();
      const fs = await followingSet();
      let rows = snap.docs;
      if (q) rows = rows.filter((d) => { const x = d.data(); return String(x.nlc || '').includes(q) || String(x.desc || '').toLowerCase().includes(q); });
      return res.status(200).json({ list: rows.slice(0, 30).map((d) => card(d, fs.has(d.id))) });
    }
    if (op === 'cget') {
      const s = await loadCh(b.id); if (!s) return L.bad(res, 404, 'Saluran tidak ditemukan.');
      const f = await UCH(me).doc(s.id).get();
      return res.status(200).json({ ch: card(s, f.exists) });
    }
    if (op === 'cphoto') {
      if (hit('cph' + me, 120, 60 * 1000)) return L.bad(res, 429, 'Terlalu cepat.');
      if (!CID.test(String(b.id || ''))) return L.bad(res, 400, 'Tidak valid.');
      const d = await db.collection('chphotos').doc(String(b.id)).get();
      if (!d.exists) return res.status(200).json({ data: '', pv: 0 });
      return res.status(200).json({ data: d.data().data, pv: d.data().ts || 0 });
    }

    // ---------- buat, ubah, hapus saluran ----------
    if (op === 'ccreate') {
      if (hit('cc' + me, 5, 3600 * 1000)) return L.bad(res, 429, 'Terlalu sering. Coba lagi nanti.');
      const name = cleanName(b.name); if (!name) return L.bad(res, 400, 'Isi nama saluran dulu.');
      const desc = cleanML(b.desc, 300), cid = 'c_' + crypto.randomBytes(5).toString('hex'), now = Date.now();
      try {
        await db.runTransaction(async (tx) => {
          const o = await tx.get(OWN.doc(me));
          let has = false;
          if (o.exists) { const c0 = await tx.get(CH(o.data().cid)); has = c0.exists; }
          if (has) throw new Error('has');
          tx.set(OWN.doc(me), { cid });
          tx.set(CH(cid), { owner: me, name, nlc: name.toLowerCase(), desc, created: now, pv: 0, fc: 0, lastTs: 0, rts: 0 });
        });
      } catch (e) { if (e.message === 'has') return L.bad(res, 409, 'Kamu sudah punya 1 saluran. Satu orang hanya boleh punya satu.'); throw e; }
      return res.status(200).json({ id: cid, created: now });
    }
    if (op === 'cedit' || op === 'cdelete' || op === 'cmembers' || op === 'cpost' || op === 'cunsend' || op === 'canswers') {
      const s = await loadCh(b.id); if (!s) return L.bad(res, 404, 'Saluran tidak ditemukan.');
      const d = s.data(); if (d.owner !== me) return L.bad(res, 403, 'Hanya pemilik saluran yang bisa melakukan ini.');
      const cid = s.id;
      if (op === 'cedit') {
        const up = {}; let pv;
        if (b.name !== undefined) { const n = cleanName(b.name); if (!n) return L.bad(res, 400, 'Nama saluran tidak boleh kosong.'); up.name = n; up.nlc = n.toLowerCase(); }
        if (b.desc !== undefined) up.desc = cleanML(b.desc, 300);
        if (b.data !== undefined) {
          if (hit('cep' + me, 6, 3600 * 1000)) return L.bad(res, 429, 'Terlalu sering ganti foto. Coba lagi nanti.');
          const data = String(b.data || '');
          if (data && (data.length > PHOTO_MAX || !PHOTO_RE.test(data))) return L.bad(res, 400, 'Foto saluran tidak valid atau terlalu besar.');
          pv = data ? Date.now() : 0;
          if (data) await db.collection('chphotos').doc(cid).set({ data, ts: pv }); else await db.collection('chphotos').doc(cid).delete();
          up.pv = pv;
        }
        if (Object.keys(up).length) await CH(cid).set(up, { merge: true });
        return res.status(200).json({ ok: true, pv });
      }
      if (op === 'cdelete') {
        const fol = await CH(cid).collection('followers').limit(450).get();
        await Promise.all(fol.docs.map((x) => UCH(x.id).doc(cid).delete().catch(() => {})));
        for (const sub of ['followers', 'msgs', 'media']) {
          const q = await CH(cid).collection(sub).limit(450).get();
          await Promise.all(q.docs.map((x) => x.ref.delete().catch(() => {})));
        }
        await db.collection('chphotos').doc(cid).delete().catch(() => {});
        await CH(cid).delete(); await OWN.doc(me).delete();
        return res.status(200).json({ ok: true });
      }
      if (op === 'cmembers') {
        const fol = await CH(cid).collection('followers').orderBy('ts', 'desc').limit(200).get();
        const ids = fol.docs.map((x) => x.id);
        const ps = ids.length ? await db.getAll(...ids.map((i) => prof(i))) : [];
        return res.status(200).json({ total: Math.max(0, d.fc || 0), list: ids.map((i, k) => ({ id: i, name: clean(ps[k] && ps[k].exists ? ps[k].data().name : '', 24) || 'Pengguna', ts: fol.docs[k].data().ts || 0 })) });
      }
      const col = CH(cid).collection('msgs'), mcol = CH(cid).collection('media');
      if (op === 'cpost') {
        const text = cleanML(b.text, 1000);
        const kind = MEDIA[b.kind] ? b.kind : '', mdata = kind ? String(b.data || '') : '';
        if (kind && (mdata.length > MEDIA[kind].max || !MEDIA[kind].re.test(mdata))) return L.bad(res, 400, kind === 'video' ? 'Videonya terlalu besar atau formatnya tidak didukung.' : kind === 'audio' ? 'Musiknya terlalu besar atau formatnya tidak didukung.' : 'Lampiran tidak valid atau terlalu besar.');
        let poll = null;
        if (b.poll && typeof b.poll === 'object') {
          const q = clean(b.poll.q, 160), opts = (Array.isArray(b.poll.opts) ? b.poll.opts : []).map((x) => clean(x, 60)).filter(Boolean).slice(0, 4);
          if (!q || opts.length < 2) return L.bad(res, 400, 'Polling butuh pertanyaan dan minimal 2 pilihan.');
          poll = { q, opts };
        }
        const ask = !!b.ask;
        if (ask && !text) return L.bad(res, 400, 'Tulis pertanyaannya dulu.');
        if (!text && !kind && !poll) return L.bad(res, 400, 'Pesan kosong.');
        if (hit('cp' + me, 20, 60 * 1000) || hit('cpd' + me, 300, 24 * 3600 * 1000)) return L.bad(res, 429, 'Kamu kirim terlalu cepat. Tunggu sebentar.');
        if (kind && hit('cpm' + me, 12, 60 * 1000)) return L.bad(res, 429, 'Terlalu banyak kirim lampiran. Tunggu sebentar.');
        const mid = MID.test(String(b.cid || '')) ? String(b.cid) : crypto.randomBytes(8).toString('hex');
        const ts = Math.max(Date.now(), (d.lastTs || 0) + 1), m = { id: mid, from: me, text, ts };
        if (kind) { m.kind = kind; m.ar = Math.min(4, Math.max(0.25, Number(b.ar) || 1)); if (kind === 'video' || kind === 'audio') m.dur = Math.min(120, Math.max(0, Number(b.dur) || 0)); if (kind === 'audio') m.title = clean(b.title, 60); }
        if (poll) { m.poll = poll; m.votes = {}; }
        if (ask) { m.ask = true; m.ac = 0; }
        if (kind) await mcol.doc(mid).set({ data: mdata, kind, ts });
        await col.doc(mid).set(m);
        const prev = poll ? 'Polling: ' + poll.q : ask ? 'Pertanyaan: ' + text : kind ? MEDIA[kind].label + (text ? ': ' + text : '') : text;
        await CH(cid).set({ last: prev.slice(0, 80), lastTs: ts }, { merge: true });
        return res.status(200).json({ ok: true, id: mid, ts });
      }
      if (op === 'cunsend') {
        const mid = String(b.mid || ''); if (!MID.test(mid)) return L.bad(res, 400, 'Pesan tidak valid.');
        const ms = await col.doc(mid).get(); if (!ms.exists) return L.bad(res, 404, 'Pesan tidak ditemukan.');
        await col.doc(mid).set({ deleted: true, text: '', poll: FV.delete(), votes: FV.delete(), react: FV.delete() }, { merge: true });
        if (ms.data().kind) await mcol.doc(mid).delete();
        if (d.lastTs === ms.data().ts) await CH(cid).set({ last: 'Pesan ditarik' }, { merge: true });
        await bumpRts(cid, d.rts);
        return res.status(200).json({ ok: true });
      }
      if (op === 'canswers') {
        const mid = String(b.mid || ''); if (!MID.test(mid)) return L.bad(res, 400, 'Pesan tidak valid.');
        const q = await col.doc(mid).collection('ans').orderBy('ts', 'desc').limit(200).get();
        const ids = q.docs.map((x) => x.id), ps = ids.length ? await db.getAll(...ids.map((i) => prof(i))) : [];
        return res.status(200).json({ list: q.docs.map((x, k) => ({ name: clean(ps[k] && ps[k].exists ? ps[k].data().name : '', 24) || 'Pengguna', text: x.data().text || '', ts: x.data().ts || 0 })) });
      }
    }

    // ---------- ikuti, berhenti mengikuti ----------
    if (op === 'cfollow' || op === 'cunfollow') {
      const s = await loadCh(b.id); if (!s) return L.bad(res, 404, 'Saluran tidak ditemukan.');
      const cid = s.id, d = s.data();
      if (hit('cf' + me, 30, 60 * 1000)) return L.bad(res, 429, 'Terlalu cepat.');
      if (op === 'cfollow') {
        if (d.owner === me) return L.bad(res, 400, 'Itu saluranmu sendiri.');
        const cnt = (await UCH(me).limit(201).get()).size; if (cnt >= 200) return L.bad(res, 400, 'Kamu sudah mengikuti 200 saluran. Berhenti mengikuti beberapa dulu.');
        const now = Date.now();
        await db.runTransaction(async (tx) => {
          const f = await tx.get(UCH(me).doc(cid)); if (f.exists) return;
          tx.set(UCH(me).doc(cid), { ts: now }); tx.set(CH(cid).collection('followers').doc(me), { ts: now }); tx.set(CH(cid), { fc: FV.increment(1) }, { merge: true });
        });
      } else {
        await db.runTransaction(async (tx) => {
          const f = await tx.get(UCH(me).doc(cid)); if (!f.exists) return;
          tx.delete(UCH(me).doc(cid)); tx.delete(CH(cid).collection('followers').doc(me)); tx.set(CH(cid), { fc: FV.increment(-1) }, { merge: true });
        });
      }
      return res.status(200).json({ ok: true });
    }

    // ---------- baca pesan saluran (terbuka untuk semua orang) ----------
    if (op === 'cmsgs') {
      if (hit('cpoll' + me, 240, 60 * 1000)) return L.bad(res, 429, 'Terlalu sering memuat. Tunggu sebentar.');
      const s = await loadCh(b.id); if (!s) return L.bad(res, 404, 'Saluran sudah tidak ada.');
      const d = s.data(), isOwner = d.owner === me, after = Number(b.after) || 0, crts = Number(b.rts) || 0, rts = d.rts || 0;
      const newMsgs = !(after > 0 && (d.lastTs || 0) <= after), newUpd = after > 0 && rts > crts;
      if (!newMsgs && !newUpd) return res.status(200).json({ msgs: [], upd: [], rts });
      const col = CH(s.id).collection('msgs');
      const view = (m, mine) => {
        const o = { id: m.id, ts: m.ts };
        if (m.deleted) { o.deleted = true; return o; }
        o.text = m.text || '';
        if (m.kind) { o.kind = m.kind; o.ar = m.ar || 1; if (m.dur) o.dur = m.dur; if (m.title) o.title = m.title; }
        if (m.poll && Array.isArray(m.poll.opts)) {
          const n = m.poll.opts.map(() => 0); let tot = 0, my = -1;
          Object.keys(m.votes || {}).forEach((u) => { const i = m.votes[u]; if (n[i] !== undefined) { n[i]++; tot++; } if (u === me) my = i; });
          o.poll = { q: m.poll.q, opts: m.poll.opts.map((t, i) => ({ t, n: n[i] })), my, total: tot };
        }
        if (m.ask) { o.ask = { mine: (mine && mine[m.id]) || '' }; if (isOwner) o.ask.ac = m.ac || 0; }
        const rc = {}; let rm = '';
        Object.keys(m.react || {}).forEach((u) => { const e = m.react[u]; if (!e) return; rc[e] = (rc[e] || 0) + 1; if (u === me) rm = e; });
        if (Object.keys(rc).length) { o.rc = rc; if (rm) o.rm = rm; }
        return o;
      };
      async function mineAns(list) {
        const asks = list.filter((m) => m.ask && !m.deleted); const out = {};
        if (!asks.length) return out;
        const gs = await Promise.all(asks.map((m) => col.doc(m.id).collection('ans').doc(me).get()));
        gs.forEach((g, i) => { if (g.exists) out[asks[i].id] = g.data().text || ''; });
        return out;
      }
      let msgs = [], upd = [];
      if (newMsgs) {
        const q = after > 0 ? await col.where('ts', '>', after).orderBy('ts', 'asc').limit(100).get() : await col.orderBy('ts', 'desc').limit(60).get();
        msgs = q.docs.map((x) => x.data()); if (!(after > 0)) msgs.reverse();
      }
      if (newUpd) { const q2 = await col.orderBy('ts', 'desc').limit(60).get(); upd = q2.docs.map((x) => x.data()); }
      const mine = await mineAns(msgs.concat(upd));
      return res.status(200).json({ msgs: msgs.map((m) => view(m, mine)), upd: upd.map((m) => view(m, mine)), rts });
    }
    if (op === 'cgetmedia') {
      if (hit('cgm' + me, 200, 60 * 1000)) return L.bad(res, 429, 'Terlalu cepat.');
      if (!CID.test(String(b.id || '')) || !MID.test(String(b.mid || ''))) return L.bad(res, 400, 'Lampiran tidak valid.');
      const d = await CH(String(b.id)).collection('media').doc(String(b.mid)).get();
      if (!d.exists) return L.bad(res, 404, 'Lampiran sudah tidak ada.');
      return res.status(200).json({ data: d.data().data });
    }

    // ---------- aksi pengikut: reaksi, polling, jawaban ----------
    if (op === 'creact' || op === 'cvote' || op === 'canswer') {
      const s = await loadCh(b.id); if (!s) return L.bad(res, 404, 'Saluran tidak ditemukan.');
      const cid = s.id, d = s.data(), mid = String(b.mid || '');
      if (!MID.test(mid)) return L.bad(res, 400, 'Pesan tidak valid.');
      if (hit('cx' + me, 60, 60 * 1000)) return L.bad(res, 429, 'Terlalu cepat.');
      const isOwner = d.owner === me;
      if (!isOwner) { const f = await UCH(me).doc(cid).get(); if (!f.exists) return L.bad(res, 403, 'Ikuti saluran ini dulu supaya bisa ikut berinteraksi.'); }
      const mref = CH(cid).collection('msgs').doc(mid), ms = await mref.get();
      if (!ms.exists || ms.data().deleted) return L.bad(res, 404, 'Pesan tidak ditemukan.');
      const m = ms.data();
      if (op === 'creact') {
        const em = String(b.emoji || '');
        if (em && !EMOJI_OK.has(em)) return L.bad(res, 400, 'Reaksi tidak valid.');
        await mref.set({ react: { [me]: em ? em : FV.delete() } }, { merge: true });
      } else if (op === 'cvote') {
        if (isOwner) return L.bad(res, 403, 'Pemilik saluran tidak ikut memilih.');
        const i = Number(b.idx);
        if (!m.poll || !Number.isInteger(i) || i < 0 || i >= m.poll.opts.length) return L.bad(res, 400, 'Pilihan tidak valid.');
        await mref.set({ votes: { [me]: i } }, { merge: true });
      } else {
        if (isOwner) return L.bad(res, 403, 'Pemilik saluran tidak menjawab pertanyaannya sendiri.');
        if (!m.ask) return L.bad(res, 400, 'Pesan ini bukan pertanyaan.');
        const text = cleanML(b.text, 500); if (!text) return L.bad(res, 400, 'Tulis jawabanmu dulu.');
        const aref = mref.collection('ans').doc(me), had = await aref.get();
        await aref.set({ text, ts: Date.now() });
        if (!had.exists) await mref.set({ ac: FV.increment(1) }, { merge: true });
      }
      await bumpRts(cid, d.rts);
      return res.status(200).json({ ok: true });
    }

    return L.bad(res, 400, 'Perintah tidak dikenal.');
  } catch (e) {
    console.error('channels error', e);
    return L.bad(res, 503, 'Saluran lagi bermasalah. Coba lagi sebentar.');
  }
};
