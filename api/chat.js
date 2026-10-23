// Server kecil untuk Faisal AI (Vercel Serverless Function).
// Pilihan 1: OPENROUTER_API_KEY (OpenRouter). Pilihan 2: GEMINI_API_KEY (Google Gemini).
// Key disimpan di environment variable, tidak pernah dikirim ke browser.
const PERSONA = require('./persona.js');
const L = require('./_lib.js');

const MODEL = process.env.FAISAL_MODEL || 'gemini-3.8-flash'; // khusus Gemini
// Daftar model OpenRouter, dicoba berurutan kalau yang pertama gagal. Pisahkan dengan koma di FAISAL_MODELS.
// Model gratis (akhiran :free) sering berganti, jadi ganti lewat FAISAL_MODELS kalau ada yang hilang.
const OR_MODELS = (process.env.FAISAL_MODELS || 'minimax/minimax-m3.1-flash:free,nvidia/nemotron-3.5-super-vl:free')
  .split(',').map((m) => m.trim()).filter(Boolean);
const MAX_TOKENS = 1024;         // batas panjang jawaban (mengatur pemakaian)
const MAX_TURNS = 12;            // jumlah pesan terakhir yang dikirim
const MAX_CHARS = 1000;          // batas panjang tiap pesan
const MAX_IMAGE_B64 = 1500000;   // batas ukuran foto (base64), sekitar 1,1 MB
const LIMIT_PER_WINDOW = 25;     // maksimal pesan per pengunjung
const WINDOW_MS = 10 * 60 * 1000; // dalam 10 menit
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// Pembatas sederhana per IP. Tersimpan di memori, jadi hanya sebagai pengaman dasar.
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  }
  return list.length > LIMIT_PER_WINDOW;
}

function bad(res, code, msg) {
  res.status(code).json({ error: msg });
}

function clean(body) {
  if (!body || !Array.isArray(body.turns)) return null;
  let turns = body.turns
    .filter((t) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string' && t.content.trim())
    .map((t) => ({ role: t.role, content: t.content.slice(0, MAX_CHARS) }))
    .slice(-MAX_TURNS);
  while (turns.length && turns[0].role !== 'user') turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== 'user') return null;
  // gabungkan pesan berurutan dengan peran sama
  const merged = [];
  for (const t of turns) {
    const last = merged[merged.length - 1];
    if (last && last.role === t.role) last.content += '\n' + t.content;
    else merged.push({ ...t });
  }
  let image = null;
  if (body.image && typeof body.image.data === 'string') {
    const type = String(body.image.media_type || '');
    if (!IMAGE_TYPES.includes(type)) return { error: 'Format foto tidak didukung.' };
    if (body.image.data.length > MAX_IMAGE_B64) return { error: 'Foto terlalu besar.' };
    if (!/^[A-Za-z0-9+/=]+$/.test(body.image.data)) return { error: 'Foto tidak valid.' };
    image = { type: 'base64', media_type: type, data: body.image.data };
  }
  return { turns: merged, image };
}

async function viaGemini(key, turns, image) {
  const contents = turns.map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] }));
  if (image) contents[contents.length - 1].parts.unshift({ inlineData: { mimeType: image.media_type, data: image.data } });
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(MODEL) + ':generateContent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: PERSONA }] },
      contents,
      generationConfig: { maxOutputTokens: MAX_TOKENS },
    }),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data) return { status: r.status, data };
  const cand = (data.candidates || [])[0] || {};
  const parts = (cand.content && cand.content.parts) || [];
  const text = parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('').trim();
  const blocked = (data.promptFeedback && data.promptFeedback.blockReason) || (cand.finishReason === 'SAFETY' ? 'SAFETY' : '');
  return { ok: true, text, blocked, truncated: cand.finishReason === 'MAX_TOKENS' };
}

async function viaOpenRouter(key, turns, image, referer) {
  const messages = [{ role: 'system', content: PERSONA }].concat(turns.map((t) => ({ role: t.role, content: t.content })));
  if (image) {
    const last = messages[messages.length - 1];
    last.content = [
      { type: 'image_url', image_url: { url: 'data:' + image.media_type + ';base64,' + image.data } },
      { type: 'text', text: last.content },
    ];
  }
  let lastFail = null;
  for (const model of OR_MODELS) {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key, 'HTTP-Referer': referer || 'https://vercel.app', 'X-Title': 'Faisal AI' },
      body: JSON.stringify({ model, max_tokens: MAX_TOKENS, messages }),
    });
    const data = await r.json().catch(() => null);
    if (r.ok && data && !data.error) {
      const choice = (data.choices || [])[0] || {};
      const text = String((choice.message && choice.message.content) || '').trim();
      if (text) return { ok: true, text, truncated: choice.finish_reason === 'length', model };
      lastFail = { status: 502, data: { error: { message: 'jawaban kosong dari ' + model } } };
      continue;
    }
    const status = r.ok ? (data && data.error && data.error.code) || 502 : r.status;
    lastFail = { status, data: { error: { message: ((data && data.error && data.error.message) || '') + ' [' + model + ']' } } };
    if (status === 401 || status === 402 || status === 403) break; // key atau kredit bermasalah, model lain tidak membantu
  }
  return lastFail || { status: 502, data: null };
}

module.exports = async function handler(req, res) {
  const orKey = process.env.OPENROUTER_API_KEY, key = process.env.GEMINI_API_KEY;
  // Buka /api/chat di browser untuk cek status server (tidak menampilkan key).
  if (req.method === 'GET') {
    return res.status(200).json({ server: 'faisal-ai', versi: 5, login: L.enabled(), penyedia: orKey ? 'openrouter' : key ? 'gemini' : 'belum diatur', key_terbaca: !!(orKey || key), model: orKey ? OR_MODELS : key ? MODEL : null });
  }
  if (req.method !== 'POST') return bad(res, 405, 'Gunakan POST.');
  if (!orKey && !key) return bad(res, 500, 'Server belum diatur: OPENROUTER_API_KEY kosong.');

  const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || 'x').trim();
  if (limited(ip)) return bad(res, 429, 'Terlalu banyak pesan. Coba lagi beberapa menit lagi.');

  const c = clean(req.body);
  if (!c) return bad(res, 400, 'Pesan tidak valid.');
  if (c.error) return bad(res, 400, c.error);

  // Login dan jatah free user (aktif kalau Supabase sudah diatur).
  let user = null, usage = null;
  if (L.enabled()) {
    user = await L.requireUser(req, res);
    if (!user) return;
    try {
      usage = await L.rpc('faisal_usage', { p_user: user.id });
      if (!usage.chat_ok) {
        return res.status(429).json({ error: 'Jatah chat kamu habis (lebih dari 500 kata). Bisa ngobrol lagi jam ' + L.wib(usage.blocked_until) + '.', code: 'chat_limit', usage });
      }
      if (c.image) {
        const p = await L.rpc('faisal_use_photo', { p_user: user.id });
        usage = p.usage;
        if (!p.ok) return res.status(429).json({ error: 'Jatah foto hari ini (4 kali) sudah habis. Reset otomatis jam 00.00 WIB.', code: 'photo_limit', usage });
      }
    } catch (e) {
      console.error('kuota error', e);
      return bad(res, 503, 'Sistem kuota lagi bermasalah. Coba lagi sebentar.');
    }
  }

  try {
    const referer = req.headers && (req.headers.origin || (req.headers.host ? 'https://' + req.headers.host : ''));
    const out = orKey ? await viaOpenRouter(orKey, c.turns, c.image, referer) : await viaGemini(key, c.turns, c.image);
    if (!out.ok) {
      console.error('AI error', out.status, JSON.stringify(out.data));
      const raw = out.data && out.data.error;
      const msg = String((raw && raw.message) || '').replace(/\s+/g, ' ').slice(0, 220);
      const info = out.status + (msg ? ': ' + msg : '');
      if (out.status === 402) return bad(res, 502, 'Kredit OpenRouter habis atau belum ada. (' + info + ')');
      if (out.status === 429) return bad(res, 429, 'Jatah lagi habis atau terlalu ramai. Coba lagi sebentar lagi. (' + info + ')');
      if (out.status === 401 || out.status === 403 || /API key not valid|API_KEY_INVALID/i.test(msg)) return bad(res, 502, 'API key ditolak. Cek key di pengaturan server. (' + info + ')');
      if (c.image) return bad(res, 502, 'Fotonya belum bisa dibaca. Coba tanpa foto atau foto lain. (' + info + ')');
      return bad(res, 502, 'Faisal lagi tidak bisa menjawab. (' + info + ')');
    }
    if (!out.text) {
      if (out.blocked) return bad(res, 502, 'Pesan itu tidak bisa dijawab. Coba tanya dengan cara lain.');
      return bad(res, 502, 'Jawaban kosong. Coba tanya dengan cara lain.');
    }
    if (user) {
      const lastUser = c.turns[c.turns.length - 1].content.replace(/\n?\[[^\]]*\]/g, '');
      try { usage = await L.rpc('faisal_add_words', { p_user: user.id, p_n: L.countWords(lastUser) + L.countWords(out.text) }); } catch (e) { console.error('hitung kata gagal', e); }
    }
    return res.status(200).json({ text: out.text, truncated: out.truncated, usage });
  } catch (e) {
    console.error('Fetch error', e);
    return bad(res, 502, 'Tidak bisa menghubungi server AI.');
  }
};
