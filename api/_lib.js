// Fungsi bersama untuk server Faisal AI: cek login (Firebase) dan kuota pemakaian (Firestore).
// Semua rahasia ada di environment variable Vercel, tidak pernah dikirim ke browser.
// Batas per paket. Kata dihitung dari balasan AI saja. Foto reset tiap 00.00 WIB, kata reset 3 jam setelah mulai terpakai.
const PLANS = { free: { words: 700, photos: 4 }, pro: { words: 3200, photos: 50 } };
const LIMITS = PLANS.free;
const WORD_WINDOW = 3 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

function parseJson(raw) {
  if (!raw) return null;
  const t = String(raw).trim();
  try { return JSON.parse(t); } catch (e) {}
  try { return JSON.parse(Buffer.from(t, 'base64').toString('utf8')); } catch (e) {}
  // Terima juga hasil salinan langsung dari Firebase: const firebaseConfig = { apiKey: "...", ... };
  if (/apiKey/.test(t)) {
    const o = {};
    t.replace(/["']?(\w+)["']?\s*:\s*["']([^"']*)["']/g, (m, k, v) => { o[k] = v; return m; });
    if (o.apiKey) return o;
  }
  return null;
}

const SERVICE = parseJson(process.env.FIREBASE_SERVICE_ACCOUNT);
const WEB = parseJson(process.env.FIREBASE_WEB_CONFIG);

function enabled() {
  return !!(SERVICE && SERVICE.private_key && WEB && WEB.apiKey);
}

function webConfig() {
  return WEB;
}

let _admin = null;
function admin() {
  if (_admin) return _admin;
  const a = require('firebase-admin');
  if (!a.apps.length) a.initializeApp({ credential: a.credential.cert(SERVICE) });
  _admin = a;
  return a;
}

function bad(res, code, msg, extra) {
  res.status(code).json(Object.assign({ error: msg }, extra || {}));
}

// Memeriksa token login (header Authorization: Bearer <token>). Mengembalikan { id, email, verified },
// null kalau tokennya tidak sah, atau melempar error { init: true } kalau server Firebase sendiri bermasalah.
async function getUser(req) {
  const h = String((req.headers && req.headers.authorization) || '');
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return null;
  let a;
  try {
    a = admin();
  } catch (e) {
    console.error('firebase-admin gagal dimuat', e);
    const err = new Error(e && e.code === 'MODULE_NOT_FOUND' ? 'paket firebase-admin belum terpasang (cek package.json di GitHub)' : 'kunci service account salah atau rusak (' + String((e && e.message) || e).slice(0, 120) + ')');
    err.init = true;
    throw err;
  }
  try {
    const d = await a.auth().verifyIdToken(m[1]);
    return { id: d.uid, email: d.email || '', verified: !!d.email_verified };
  } catch (e) {
    const code = String((e && e.code) || '');
    if (/^auth\/(id-token-expired|argument-error|id-token-revoked|invalid-id-token)/.test(code)) return null;
    console.error('verifyIdToken gagal', e);
    const err = new Error('server tidak bisa memeriksa login (' + (code || String((e && e.message) || e).slice(0, 120)) + '). Biasanya service account berasal dari project Firebase yang berbeda');
    err.init = true;
    throw err;
  }
}

function wibDay(ms) {
  return new Date(ms + 7 * 3600 * 1000).toISOString().slice(0, 10); // tanggal di WIB (UTC+7)
}

// Menerapkan reset otomatis: foto reset tiap 00.00 WIB, kata reset 3 jam setelah mulai terpakai, Pro kembali ke Free kalau sudah habis masa aktif.
function touch(r, now) {
  r = Object.assign({ plan: 'free', words: 0, win_start: null, photos: 0, photo_day: wibDay(now), pro_until: null, ever_pro: false }, r || {});
  delete r.blocked_until; delete r.last_at;
  if (r.plan === 'pro' && r.pro_until && now >= r.pro_until) r.plan = 'free';
  if (r.plan !== 'pro') r.plan = 'free';
  if (r.photo_day !== wibDay(now)) { r.photos = 0; r.photo_day = wibDay(now); }
  if (r.win_start && now - r.win_start >= WORD_WINDOW) { r.words = 0; r.win_start = null; }
  return r;
}

function view(r) {
  const lim = PLANS[r.plan] || PLANS.free;
  const ok = r.words < lim.words;
  const resetAt = r.win_start ? new Date(r.win_start + WORD_WINDOW).toISOString() : null;
  return {
    plan: r.plan, words: r.words, words_max: lim.words,
    blocked_until: ok ? null : resetAt, reset_at: resetAt,
    photos: r.photos, photos_max: lim.photos, chat_ok: ok,
    pro_until: r.plan === 'pro' && r.pro_until ? new Date(r.pro_until).toISOString() : null,
    ever_pro: !!r.ever_pro,
  };
}

// Operasi kuota (satu transaksi per panggilan supaya hitungannya tidak bisa diakali dengan permintaan bersamaan).
async function rpc(name, args) {
  const db = admin().firestore();
  const ref = db.collection('usage').doc(String(args.p_user));
  return db.runTransaction(async (tx) => {
    const now = Date.now();
    const snap = await tx.get(ref);
    let r = touch(snap.exists ? snap.data() : null, now);
    let out;
    if (name === 'faisal_usage' || name === 'admin_get') {
      out = view(r);
    } else if (name === 'faisal_add_words') {
      const n = Math.max(0, args.p_n | 0);
      r.words += n;
      if (n > 0 && !r.win_start) r.win_start = now;
      out = view(r);
    } else if (name === 'faisal_use_photo') {
      let ok = false;
      if (r.photos < (PLANS[r.plan] || PLANS.free).photos) { r.photos += 1; ok = true; }
      out = { ok, usage: view(r) };
    } else if (name === 'admin_set') {
      if (args.plan === 'pro') {
        r.plan = 'pro'; r.ever_pro = true;
        r.pro_until = now + Math.max(1, Math.min(365, args.days | 0 || 30)) * DAY;
      } else {
        r.plan = 'free'; r.pro_until = null;
      }
      if (args.p_email) r.email = String(args.p_email).slice(0, 200);
      out = view(r);
    } else {
      throw new Error('fungsi tidak dikenal: ' + name);
    }
    tx.set(ref, r);
    return out;
  });
}

function adminEmails() {
  return String(process.env.ADMIN_EMAILS || '').toLowerCase().split(/[\s,;]+/).filter(Boolean);
}
// Admin = email ada di ADMIN_EMAILS dan emailnya sudah terverifikasi (login Google otomatis terverifikasi).
function isAdmin(user) {
  return !!(user && user.email && user.verified && adminEmails().includes(user.email.toLowerCase()));
}

function wib(iso) {
  try {
    return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta', hour12: false }).replace(':', '.') + ' WIB';
  } catch (e) {
    return '';
  }
}

function countWords(s) {
  const m = String(s || '').trim().match(/\S+/g);
  return m ? m.length : 0;
}

// Balas 401 kalau belum login, atau 500 dengan alasan jelas kalau server Firebase bermasalah.
// Mengembalikan user, atau null (respons sudah dikirim).
async function requireUser(req, res) {
  let user = null;
  try {
    user = await getUser(req);
  } catch (e) {
    bad(res, 500, 'Server login bermasalah: ' + e.message, { code: 'auth_server' });
    return null;
  }
  if (!user) {
    bad(res, 401, 'Masuk dulu ya supaya bisa pakai Faisal AI.', { code: 'login' });
    return null;
  }
  return user;
}

module.exports = { enabled, webConfig, bad, getUser, rpc, wib, countWords, requireUser, isAdmin, admin, LIMITS, PLANS };
