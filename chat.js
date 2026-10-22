// Server kecil untuk Faisal AI (Vercel Serverless Function).
// API key disimpan di environment variable ANTHROPIC_API_KEY, tidak pernah dikirim ke browser.
const PERSONA = require('./persona.js');

const MODEL = process.env.FAISAL_MODEL || 'claude-haiku-5-5';
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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'Gunakan POST.');
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return bad(res, 500, 'Server belum diatur: ANTHROPIC_API_KEY kosong.');

  const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || 'x').trim();
  if (limited(ip)) return bad(res, 429, 'Terlalu banyak pesan. Coba lagi beberapa menit lagi.');

  const c = clean(req.body);
  if (!c) return bad(res, 400, 'Pesan tidak valid.');
  if (c.error) return bad(res, 400, c.error);

  const messages = c.turns.map((t) => ({ role: t.role, content: t.content }));
  if (c.image) {
    const last = messages[messages.length - 1];
    last.content = [{ type: 'image', source: c.image }, { type: 'text', text: last.content }];
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: PERSONA, messages }),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data) {
      console.error('Anthropic error', r.status, JSON.stringify(data));
      if (r.status === 429) return bad(res, 429, 'Faisal lagi ramai. Coba lagi sebentar lagi.');
      return bad(res, 502, 'Faisal lagi tidak bisa menjawab. Coba lagi nanti.');
    }
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (!text) return bad(res, 502, 'Jawaban kosong. Coba tanya dengan cara lain.');
    return res.status(200).json({ text, truncated: data.stop_reason === 'max_tokens' });
  } catch (e) {
    console.error('Fetch error', e);
    return bad(res, 502, 'Tidak bisa menghubungi server AI.');
  }
};
