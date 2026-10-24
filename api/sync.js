// Sinkron riwayat obrolan (teks saja) antar perangkat. Disimpan di Firestore: sync/{uid}/chats/{chatId}.
// Hanya server yang bisa membaca dan menulis (aturan Firestore menolak akses dari browser).
const L = require('./_lib.js');

const MAX_CHATS = 40;
const MAX_RECS = 150;
const MAX_BYTES = 700 * 1024;

function str(v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; }
function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

function cleanChat(c) {
  if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !/^[\w-]{3,60}$/.test(c.id)) return null;
  const recs = (Array.isArray(c.recs) ? c.recs : []).slice(-MAX_RECS).map((r) => {
    if (!r || typeof r !== 'object') return null;
    const o = { t: ['me', 'bot', 'res'].includes(r.t) ? r.t : 'bot', text: str(r.text, 4000) };
    if (typeof r.id === 'string') o.id = str(r.id, 40);
    if (r.ts) o.ts = num(r.ts, 0);
    if (r.img) o.img = str(r.img, 40);
    if (r.cut) o.cut = true;
    if (r.name) o.name = str(r.name, 80);
    if (r.alt) o.alt = str(r.alt, 120);
    if (r.react) o.react = str(r.react, 12);
    if (r.star) o.star = true;
    if (r.reply && typeof r.reply === 'object') o.reply = { who: str(r.reply.who, 12), text: str(r.reply.text, 200), rid: str(r.reply.rid, 40) };
    return o;
  }).filter(Boolean);
  const turns = (Array.isArray(c.turns) ? c.turns : []).slice(-30).map((t) => (t && (t.role === 'user' || t.role === 'assistant') ? { role: t.role, content: str(t.content, 4000) } : null)).filter(Boolean);
  return { id: c.id, title: str(c.title, 80) || 'Obrolan', pinned: !!c.pinned, created: num(c.created, Date.now()), updated: num(c.updated, Date.now()), recs, turns, deleted: false };
}

module.exports = async function handler(req, res) {
  if (!L.enabled()) return L.bad(res, 404, 'Login belum diaktifkan.');
  const user = await L.requireUser(req, res);
  if (!user) return;
  try {
    const col = L.admin().firestore().collection('sync').doc(user.id).collection('chats');
    if (req.method === 'GET') {
      const snap = await col.orderBy('updated', 'desc').limit(MAX_CHATS + 20).get();
      return res.status(200).json({ chats: snap.docs.map((d) => d.data()) });
    }
    if (req.method !== 'POST') return L.bad(res, 405, 'Gunakan GET atau POST.');
    const b = req.body || {};
    if (b.op === 'delete') {
      if (typeof b.id !== 'string' || !/^[\w-]{3,60}$/.test(b.id)) return L.bad(res, 400, 'ID tidak valid.');
      await col.doc(b.id).set({ id: b.id, deleted: true, updated: Date.now(), recs: [], turns: [], title: '', pinned: false, created: 0 });
      return res.status(200).json({ ok: true });
    }
    const c = cleanChat(b.chat);
    if (!c) return L.bad(res, 400, 'Data obrolan tidak valid.');
    if (Buffer.byteLength(JSON.stringify(c)) > MAX_BYTES) { c.recs = c.recs.slice(-60); }
    await col.doc(c.id).set(c);
    // batasi jumlah obrolan: hapus yang paling lama (kecuali yang dipin)
    const all = await col.orderBy('updated', 'desc').limit(200).get();
    const live = all.docs.filter((d) => !d.data().deleted);
    const extra = live.slice(MAX_CHATS).filter((d) => !d.data().pinned);
    await Promise.all(extra.map((d) => d.ref.set({ id: d.id, deleted: true, updated: Date.now(), recs: [], turns: [], title: '', pinned: false, created: 0 })));
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('sync error', e);
    return L.bad(res, 503, 'Sinkron lagi bermasalah.');
  }
};
