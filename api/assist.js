// Faisal di dalam obrolan teman: saran balasan, ringkasan, terjemahan.
// Klien mengirim beberapa pesan terakhir dari layar. Server tidak membaca isi obrolan dari database.
const L = require('./_lib.js');
const chat = require('./chat.js');

const hits = new Map();
function limited(id) {
  const now = Date.now(), list = (hits.get(id) || []).filter((t) => now - t < 600000);
  list.push(now); hits.set(id, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < 600000)) hits.delete(k);
  return list.length > 15;
}
const bad = (res, c, m) => res.status(c).json({ error: m });
const LANG = { en: 'Inggris', id: 'Indonesia', ar: 'Arab', ja: 'Jepang', ko: 'Korea', zh: 'Mandarin', es: 'Spanyol', jv: 'Jawa', su: 'Sunda' };

function lines(msgs) {
  return msgs.map((m) => (m.w === 'me' ? 'Aku' : 'Dia') + ': ' + m.t).join('\n');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'Gunakan POST.');
  const b = req.body || {};
  const task = String(b.task || '');
  let msgs = Array.isArray(b.msgs) ? b.msgs : [];
  msgs = msgs.filter((m) => m && typeof m.t === 'string' && m.t.trim()).slice(-20)
    .map((m) => ({ w: m.w === 'me' ? 'me' : 'them', t: m.t.trim().slice(0, 400) }));
  if (!['reply', 'sum', 'tr'].includes(task)) return bad(res, 400, 'Permintaan tidak valid.');
  if (task !== 'tr' && !msgs.length) return bad(res, 400, 'Belum ada pesan untuk dibaca.');
  let user = null, usage = null;
  if (L.enabled()) {
    user = await L.requireUser(req, res);
    if (!user) return;
  }
  const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || 'x').trim();
  if (limited(user ? user.id : ip)) return bad(res, 429, 'Terlalu sering. Coba lagi beberapa menit lagi.');
  if (user) {
    try {
      usage = await L.rpc('faisal_usage', { p_user: user.id });
      if (!usage.chat_ok) return bad(res, 429, 'Jatah Faisal (' + usage.words_max + ' kata) sudah habis. Bisa dipakai lagi jam ' + L.wib(usage.blocked_until) + '.');
    } catch (e) { return bad(res, 503, 'Sistem kuota lagi bermasalah. Coba lagi sebentar.'); }
  }
  let prompt;
  if (task === 'reply') {
    const tone = String(b.tone || '').slice(0, 30);
    prompt = 'Ini obrolan antara aku dan temanku di aplikasi chat (bukan denganmu).\n\n' + lines(msgs) +
      '\n\nBuatkan 3 saran balasan singkat yang bisa kukirim ke dia sebagai "Aku", gaya santai bahasa Indonesia sehari-hari' +
      (tone ? ', nuansa ' + tone : '') + ', beda-beda isinya (setuju / tanya balik / candaan ringan). Maksimal 14 kata per saran. ' +
      'Jawab HANYA 3 baris, satu saran per baris, tanpa nomor, tanpa tanda kutip, tanpa penjelasan.';
  } else if (task === 'sum') {
    prompt = 'Ini obrolan antara aku dan temanku.\n\n' + lines(msgs) +
      '\n\nRingkas obrolan ini dalam 2-4 poin pendek bahasa Indonesia (awali tiap poin dengan "- "). Sebut kesepakatan, pertanyaan yang belum dijawab, dan yang perlu kulakukan kalau ada. Tanpa pembuka.';
  } else {
    const text = String(b.text || '').trim().slice(0, 600);
    if (!text) return bad(res, 400, 'Tidak ada teks.');
    const to = LANG[String(b.to || 'id')] || 'Indonesia';
    prompt = 'Terjemahkan pesan chat berikut ke bahasa ' + to + '. Pertahankan nada dan emoji. Jawab HANYA terjemahannya.\n\n' + text;
  }
  try {
    const referer = req.headers && (req.headers.origin || '');
    const out = await chat.ask([{ role: 'user', content: prompt }], referer);
    if (!out.ok || !out.text) return bad(res, 502, 'Faisal lagi tidak bisa menjawab. Coba lagi sebentar.');
    let text = out.text.trim();
    if (user) { try { usage = await L.rpc('faisal_add_words', { p_user: user.id, p_n: L.countWords(text) }); } catch (e) {} }
    if (task === 'reply') {
      const list = text.split('\n').map((s) => s.replace(/^[\s\-*\d.)]+/, '').replace(/^["“]|["”]$/g, '').trim()).filter(Boolean).slice(0, 3);
      if (!list.length) return bad(res, 502, 'Belum ada saran. Coba lagi.');
      return res.status(200).json({ list, usage });
    }
    return res.status(200).json({ text, usage });
  } catch (e) {
    console.error('assist', e);
    return bad(res, 502, 'Tidak bisa menghubungi server AI.');
  }
};
