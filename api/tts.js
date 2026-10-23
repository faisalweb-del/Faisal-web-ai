// Suara Faisal: mengubah teks jadi suara cowok lewat Gemini TTS. Key Gemini ada di server.
const L = require('./_lib.js');

const TTS_MODEL = process.env.FAISAL_TTS_MODEL || 'gemini-3.8-flash-tts';
// Suara cowok yang boleh dipilih (nama suara bawaan Gemini).
const VOICES = ['Charon', 'Orus', 'Puck', 'Algenib', 'Achird', 'Umbriel', 'Fenrir', 'Sadaltager'];
const MAX_CHARS = 400;
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
  const key = process.env.GEMINI_API_KEY;
  if (!key) return L.bad(res, 501, 'Suara belum aktif: GEMINI_API_KEY belum diatur di server.', { code: 'no_tts' });

  let who = String((req.headers['x-forwarded-for'] || '').split(',')[0] || 'x').trim();
  if (L.enabled()) {
    const user = await L.requireUser(req, res);
    if (!user) return;
    who = user.id;
  }
  if (limited(who)) return L.bad(res, 429, 'Terlalu banyak permintaan suara. Tunggu sebentar.');

  const text = String((req.body && req.body.text) || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
  if (!text) return L.bad(res, 400, 'Teks kosong.');
  const voice = VOICES.includes(req.body.voice) ? req.body.voice : VOICES[0];
  const style = String(req.body.style || '').slice(0, 60).replace(/[^\p{L}\p{N} ,.-]/gu, '');

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
      if (r.status === 429) return L.bad(res, 429, 'Kuota suara Gemini lagi penuh. Coba lagi nanti.', { code: 'tts_busy' });
      return L.bad(res, 502, 'Suara gagal dibuat (' + r.status + ').', { code: 'tts_fail' });
    }
    let audio = null;
    for (const s of data.steps || []) {
      if (s.type !== 'model_output') continue;
      for (const c of s.content || []) if (c.type === 'audio' && c.data) audio = c.data;
    }
    if (!audio) return L.bad(res, 502, 'Suara kosong.', { code: 'tts_fail' });
    return res.status(200).json({ audio, mime: 'audio/wav' });
  } catch (e) {
    console.error('TTS fetch error', e);
    return L.bad(res, 502, 'Tidak bisa menghubungi Gemini.', { code: 'tts_fail' });
  }
};
