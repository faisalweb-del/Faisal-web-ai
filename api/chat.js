// Server kecil untuk Faisal AI (Vercel Serverless Function).
const PERSONA = require('./persona.js');

// Menggunakan model gratis yang didukung Serverless Inference API secara resmi
const HF_MODEL = process.env.FAISAL_MODEL || 'Qwen/Qwen2.5-Coder-32B-Instruct';
const MAX_TOKENS = 500;
const MAX_TURNS = 12;
const MAX_CHARS = 1000;
const LIMIT_PER_WINDOW = 25;
const WINDOW_MS = 10 * 60 * 1000;

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
  
  const merged = [];
  for (const t of turns) {
    const last = merged[merged.length - 1];
    if (last && last.role === t.role) last.content += '\n' + t.content;
    else merged.push({ ...t });
  }
  return { turns: merged };
}

async function viaHuggingFace(token, turns) {
  const messages = [{ role: 'system', content: PERSONA }].concat(
    turns.map((t) => ({ role: t.role, content: t.content }))
  );

  const r = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: { 
      'content-type': 'application/json', 
      'authorization': 'Bearer ' + token 
    },
    body: JSON.stringify({ 
      model: HF_MODEL, 
      max_tokens: MAX_TOKENS, 
      messages 
    }),
  });

  const data = await r.json().catch(() => null);
  if (!r.ok || !data) return { status: r.status, data };
  const choice = (data.choices || [])[0] || {};
  return { ok: true, text: String((choice.message && choice.message.content) || '').trim(), truncated: choice.finish_reason === 'length' };
}

module.exports = async function handler(req, res) {
  const hf = process.env.HF_TOKEN;

  if (req.method === 'GET') {
    return res.status(200).json({
      server: 'faisal-ai',
      versi: 2,
      penyedia: hf ? 'huggingface' : 'belum diatur',
      token_terbaca: !!hf,
      model_teks: HF_MODEL,
    });
  }

  if (req.method !== 'POST') return bad(res, 405, 'Gunakan POST.');
  if (!hf) return bad(res, 500, 'Server belum diatur: HF_TOKEN kosong.');

  const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || 'x').trim();
  if (limited(ip)) return bad(res, 429, 'Terlalu banyak pesan. Coba lagi beberapa menit lagi.');

  const c = clean(req.body);
  if (!c) return bad(res, 400, 'Pesan tidak valid.');

  try {
    const out = await viaHuggingFace(hf, c.turns);
    if (!out.ok) {
      console.error('AI error', out.status, JSON.stringify(out.data));
      const raw = out.data && (out.data.error || out.data.message);
      const msg = String(typeof raw === 'string' ? raw : (raw && raw.message) || '').replace(/\s+/g, ' ').slice(0, 220);
      const info = out.status + (msg ? ': ' + msg : '');
      if (out.status === 402) return bad(res, 502, 'Kuota gratis Hugging Face habis atau akun belum punya kredit (' + info + ').');
      if (out.status === 429) return bad(res, 429, 'Faisal lagi ramai. Coba lagi sebentar lagi.');
      if (out.status === 401 || out.status === 403) return bad(res, 502, 'Token ditolak. Cek HF_TOKEN di pengaturan server.');
      return bad(res, 502, 'Faisal lagi tidak bisa menjawab. (' + info + ')');
    }
    if (!out.text) return bad(res, 502, 'Jawaban kosong. Coba tanya dengan cara lain.');
    return res.status(200).json({ text: out.text, truncated: out.truncated });
  } catch (e) {
    console.error('Fetch error', e);
    return bad(res, 502, 'Tidak bisa menghubungi server AI.');
  }
};
      
