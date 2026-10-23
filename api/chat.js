// Server Faisal AI - OpenRouter API (Full Async & Safe Error Handling)
const PERSONA = require('./persona.js');

const MODEL = 'meta-llama/llama-3.1-8b-instruct:free';
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

module.exports = async function handler(req, res) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (req.method === 'GET') {
    return res.status(200).json({
      server: 'faisal-ai',
      penyedia: 'openrouter',
      status: apiKey ? 'siap' : 'OPENROUTER_API_KEY belum diatur',
    });
  }

  if (req.method !== 'POST') return bad(res, 405, 'Gunakan POST.');
  if (!apiKey) return bad(res, 500, 'Server belum diatur: OPENROUTER_API_KEY kosong di Vercel.');

  const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || 'x').trim();
  if (limited(ip)) return bad(res, 429, 'Terlalu banyak pesan. Coba lagi beberapa menit lagi.');

  const c = clean(req.body);
  if (!c) return bad(res, 400, 'Format pesan tidak valid.');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 detik timeout biar gak hanging

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://vercel.com',
        'X-Title': 'Faisal AI'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: PERSONA },
          ...c.turns
        ],
        max_tokens: MAX_TOKENS,
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return bad(res, response.status, errData.error?.message || 'Gagal menghubungi server OpenRouter.');
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ text });
  } catch (err) {
    if (err.name === 'AbortError') {
      return bad(res, 540, 'Respon AI terlalu lama (Timeout). Silakan coba lagi.');
    }
    return bad(res, 500, 'Terjadi kesalahan pada server: ' + err.message);
  }
};
    
