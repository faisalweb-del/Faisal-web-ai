// Suara Faisal: mengubah teks jadi suara cowok lewat Gemini TTS. Key Gemini ada di server.
const L = require('./_lib.js');

const TTS_MODEL = process.env.FAISAL_TTS_MODEL || 'gemini-3.8-flash-tts';
// Suara cowok yang boleh dipilih (nama suara bawaan Gemini).
const VOICES = ['Charon', 'Orus', 'Puck', 'Algenib', 'Achird', 'Umbriel', 'Fenrir', 'Sadaltager'];
const MAX_CHARS = 300;
// Potong WAV supaya durasinya tidak lebih dari sec detik (kalau bukan WAV, dikembalikan apa adanya).
function trimWav(b64, sec) {
  try {
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return b64;
    let p = 12, byteRate = 0, dataAt = -1, dataLen = 0;
    while (p + 8 <= buf.length) {
      const id = buf.toString('ascii', p, p + 4), len = buf.readUInt32LE(p + 4);
      if (id === 'fmt ') byteRate = buf.readUInt32LE(p + 16);
      if (id === 'data') { dataAt = p + 8; dataLen = Math.min(len, buf.length - dataAt); break; }
      p += 8 + len + (len % 2);
    }
    if (!byteRate || dataAt < 0) return b64;
    const max = Math.floor(byteRate * sec / 4) * 4;
    if (dataLen <= max) return b64;
    const out = Buffer.concat([buf.subarray(0, dataAt), buf.subarray(dataAt, dataAt + max)]);
    out.writeUInt32LE(out.length - 8, 4); out.writeUInt32LE(max, dataAt - 4);
    return out.toString('base64');
  } catch (e) { return b64; }
}
const hits = new Map();

function limited(id) {
  const now = Date.now();
  const list = (hits.get(id) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  hits.set(id, list);
  return list.length > 40;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return L.bad(res, 405, 'Gunakan POST.');
  const rvKey = process.env.REPLICAVOX_API_KEY;
  const rvVoice = String(process.env.REPLICAVOX_VOICE_ID || '').trim();
  const key = process.env.GEMINI_API_KEY;
  const forceGemini = String(process.env.TTS_PROVIDER || '').toLowerCase() === 'gemini' && !!key;
  const useRv = !forceGemini && !!(rvKey && rvVoice);
  if (!useRv && !key) return L.bad(res, 501, 'Suara belum aktif: REPLICAVOX_API_KEY + REPLICAVOX_VOICE_ID (atau GEMINI_API_KEY) belum diatur di server.', { code: 'no_tts' });

  let user = null, plan = 'free';
  let who = String((req.headers['x-forwarded-for'] || '').split(',')[0] || 'x').trim();
  if (L.enabled()) {
    user = await L.requireUser(req, res);
    if (!user) return;
    who = user.id;
  }
  if (limited(who)) return L.bad(res, 429, 'Terlalu banyak permintaan suara. Tunggu sebentar.');

  let text = String((req.body && req.body.text) || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
  if (!text) return L.bad(res, 400, 'Teks kosong.');
  // jatah suara per hari: Free 1x (maks 10 detik), Pro 15x. Dihitung sebelum suara dibuat, dikembalikan kalau gagal.
  let lim = L.PLANS.free, quotaTaken = false, usageNow = null;
  if (user) {
    const q = await L.rpc('faisal_use_tts', { p_user: user.id });
    plan = q.usage.plan; lim = L.PLANS[plan] || L.PLANS.free;
    if (!q.ok) return L.bad(res, 429, plan === 'pro' ? 'Jatah suara hari ini (' + lim.tts + ' kali) sudah habis. Reset jam 00.00 WIB.' : 'Jatah suara Free (1 kali per hari) sudah dipakai. Reset jam 00.00 WIB. Mau lebih banyak? Lihat paket Pro.', { code: 'tts_limit', usage: q.usage });
    quotaTaken = true; usageNow = q.usage;
  }
  text = text.slice(0, plan === 'pro' ? MAX_CHARS : 130);
  const refund = async () => { if (quotaTaken) { quotaTaken = false; try { await L.rpc('faisal_refund_tts', { p_user: user.id }); } catch (e) {} } };
  const voice = VOICES.includes(req.body.voice) ? req.body.voice : VOICES[0];
  const style = String(req.body.style || '').slice(0, 60).replace(/[^\p{L}\p{N} ,.-]/gu, '');

  if (useRv) {
    try {
      const r = await fetch('https://api.replicavox.com/v1/audio/speech', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + rvKey },
        body: JSON.stringify({ model: process.env.REPLICAVOX_MODEL || 'replicavox-expressive-v2', voice: rvVoice, input: text, language: process.env.REPLICAVOX_LANG || 'id', response_format: 'mp3' }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        console.error('Replicavox error', r.status, JSON.stringify(d).slice(0, 300));
        const c = (d && (d.code || (d.error && d.error.code))) || '';
        if (r.status === 429) { await refund(); return L.bad(res, 429, 'Jatah suara Replicavox habis atau terlalu cepat. Pakai suara HP dulu.', { code: 'tts_busy' }); }
        { await refund(); return L.bad(res, 502, 'Suara Replicavox gagal (' + r.status + (c ? ' ' + c : '') + ').', { code: 'tts_fail' }); }
      }
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length) { await refund(); return L.bad(res, 502, 'Suara kosong.', { code: 'tts_fail' }); }
      return res.status(200).json({ audio: buf.toString('base64'), mime: 'audio/mpeg', usage: usageNow });
    } catch (e) {
      console.error('Replicavox fetch error', e);
      { await refund(); return L.bad(res, 502, 'Tidak bisa menghubungi Replicavox.', { code: 'tts_fail' }); }
    }
  }

  try {
    const content = { type: 'text', text };
    if (style) content.annotations = [{ type: 'speech_metadata', style }];
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        model: TTS_MODEL,
        input: [{ type: 'user_input', content: [content] }],
        response_format: { type: 'audio' },
        generation_config: { speech_config: [{ voice }] },
      }),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data) {
      console.error('TTS error', r.status, JSON.stringify(data).slice(0, 400));
      if (r.status === 429) { await refund(); return L.bad(res, 429, 'Kuota suara Gemini lagi penuh. Coba lagi nanti.', { code: 'tts_busy' }); }
      { await refund(); return L.bad(res, 502, 'Suara gagal dibuat (' + r.status + ').', { code: 'tts_fail' }); }
    }
    let audio = null;
    for (const s of data.steps || []) {
      if (s.type !== 'model_output') continue;
      for (const c of s.content || []) if (c.type === 'audio' && c.data) audio = c.data;
    }
    if (!audio) { await refund(); return L.bad(res, 502, 'Suara kosong.', { code: 'tts_fail' }); }
    return res.status(200).json({ audio: trimWav(audio, lim.tts_sec), mime: 'audio/wav', usage: usageNow });
  } catch (e) {
    console.error('TTS fetch error', e);
    { await refund(); return L.bad(res, 502, 'Tidak bisa menghubungi Gemini.', { code: 'tts_fail' }); }
  }
};
