// Server kecil untuk Faisal AI (Vercel Serverless Function).
// Token disimpan di environment variable, tidak pernah dikirim ke browser.
// Pilihan 1: HF_TOKEN (Hugging Face). Pilihan 2: ANTHROPIC_API_KEY (Anthropic).
// Kalau dua-duanya ada, HF_TOKEN yang dipakai.
const PERSONA = require('./persona.js');

const HF_MODEL = process.env.FAISAL_MODEL || 'meta-llama/Llama-3.3-70B-Instruct';
const HF_VISION_MODEL = process.env.FAISAL_VISION_MODEL || 'Qwen/Qwen2.5-VL-72B-Instruct';
const ANTHROPIC_MODEL = process.env.FAISAL_MODEL || 'claude-haiku-5-5';
const MAX_TOKENS = 500;          // batas panjang jawaban (mengatur biaya)
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

async function viaHuggingFace(token, turns, image) {
  const messages = [{ role: 'system', content: PERSONA }].concat(
    turns.map((t) => ({ role: t.role, content: t.content }))
  );
  if (image) {
    const last = messages[messages.length - 1];
    last.content = [
      { type: 'image_url', image_url: { url: 'data:' + image.media_type + ';base64,' + image.data } },
      { type: 'text', text: last.content },
    ];
  }
  const r = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify({ model: image ? HF_VISION_MODEL : HF_MODEL, max_tokens: MAX_TOKENS, messages }),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data) return { status: r.status, data };
  const choice = (data.choices || [])[0] || {};
  return { ok: true, text: String((choice.message && choice.message.content) || '').trim(), truncated: choice.finish_reason === 'length' };
}

async function viaAnthropic(key, turns, image) {
  const messages = turns.map((t) => ({ role: t.role, content: t.content }));
  if (image) {
    const last = messages[messages.length - 1];
    last.content = [{ type: 'image', source: image }, { type: 'text', text: last.content }];
  }
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: MAX_TOKENS, system: PERSONA, messages }),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data) return { status: r.status, data };
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  return { ok: true, text, truncated: data.stop_reason === 'max_tokens' };
}

module.exports = async function handler(req, res) {
  const hf = process.env.HF_TOKEN, an = process.env.ANTHROPIC_API_KEY;
  // Buka /api/chat di browser untuk cek status server (tidak menampilkan token).
  if (req.method === 'GET') {
    return res.status(200).json({
      server: 'faisal-ai',
      versi: 2,
      penyedia: hf ? 'huggingface' : an ? 'anthropic' : 'belum diatur',
      token_terbaca: !!(hf || an),
      model_teks: hf ? HF_MODEL : an ? ANTHROPIC_MODEL : null,
      model_foto: hf ? HF_VISION_MODEL : null,
    });
  }
  if (req.method !== 'POST') return bad(res, 405, 'Gunakan POST.');
  if (!hf && !an) return bad(res, 500, 'Server belum diatur: HF_TOKEN kosong.');

  const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || 'x').trim();
  if (limited(ip)) return bad(res, 429, 'Terlalu banyak pesan. Coba lagi beberapa menit lagi.');

  const c = clean(req.body);
  if (!c) return bad(res, 400, 'Pesan tidak valid.');
  if (c.error) return bad(res, 400, c.error);

  try {
    const out = hf ? await viaHuggingFace(hf, c.turns, c.image) : await viaAnthropic(an, c.turns, c.image);
    if (!out.ok) {
      console.error('AI error', out.status, JSON.stringify(out.data));
      const raw = out.data && (out.data.error || out.data.message);
      const msg = String(typeof raw === 'string' ? raw : (raw && raw.message) || '').replace(/\s+/g, ' ').slice(0, 220);
      const info = out.status + (msg ? ': ' + msg : '');
      if (out.status === 402) return bad(res, 502, 'Kuota gratis Hugging Face habis atau akun belum punya kredit (' + info + ').');
      if (out.status === 429) return bad(res, 429, 'Faisal lagi ramai. Coba lagi sebentar lagi.');
      if (out.status === 401 || out.status === 403) return bad(res, 502, 'Token ditolak. Cek HF_TOKEN di pengaturan server.');
      if (c.image) return bad(res, 502, 'Fotonya belum bisa dibaca. Coba tanpa foto atau foto lain. (' + info + ')');
      return bad(res, 502, 'Faisal lagi tidak bisa menjawab. (' + info + ')');
    }
    if (!out.text) return bad(res, 502, 'Jawaban kosong. Coba tanya dengan cara lain.');
    return res.status(200).json({ text: out.text, truncated: out.truncated });
  } catch (e) {
    console.error('Fetch error', e);
    return bad(res, 502, 'Tidak bisa menghubungi server AI.');
  }
};
