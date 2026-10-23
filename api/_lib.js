// Fungsi bersama untuk server Faisal AI: cek login (Firebase) dan kuota pemakaian (Firestore).
// Semua rahasia ada di environment variable Vercel, tidak pernah dikirim ke browser.
const LIMITS = { words: 500, photos: 4 };
const TWO_HOURS = 2 * 60 * 60 * 1000;

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

// Memeriksa token login (header Authorization: Bearer <token>) dan mengembalikan { id, email } atau null.
async function getUser(req) {
  const h = String((req.headers && req.headers.authorization) || '');
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return null;
  try {
    const d = await admin().auth().verifyIdToken(m[1]);
    return { id: d.uid, email: d.email || '' };
  } catch (e) {
    return null;
  }
}

function wibDay(ms) {
  return new Date(ms + 7 * 3600 * 1000).toISOString().slice(0, 10); // tanggal di WIB (UTC+7)
}

// Menerapkan reset otomatis: foto reset tiap 00.00 WIB, kata reset setelah istirahat selesai atau 2 jam tidak aktif.
function touch(r, now) {
  r = Object.assign({ plan: 'free', words: 0, last_at: now, blocked_until: null, photos: 0, photo_day: wibDay(now) }, r || {});
  if (r.photo_day !== wibDay(now)) { r.photos = 0; r.photo_day = wibDay(now); }
  if (r.blocked_until && now >= r.blocked_until) { r.words = 0; r.blocked_until = null; }
  else if (!r.blocked_until && now - r.last_at >= TWO_HOURS) r.words = 0;
  return r;
}

function view(r) {
  return {
    plan: r.plan, words: r.words, words_max: LIMITS.words,
    blocked_until: r.blocked_until ? new Date(r.blocked_until).toISOString() : null,
    photos: r.photos, photos_max: LIMITS.photos, chat_ok: !r.blocked_until,
  };
}

// Operasi kuota. Nama dan bentuk hasilnya sama dengan versi sebelumnya supaya file lain tidak berubah.
async function rpc(name, args) {
  const db = admin().firestore();
  const ref = db.collection('usage').doc(String(args.p_user));
  return db.runTransaction(async (tx) => {
    const now = Date.now();
    const snap = await tx.get(ref);
    let r = touch(snap.exists ? snap.data() : null, now);
    let out;
    if (name === 'faisal_usage') {
      out = view(r);
    } else if (name === 'faisal_add_words') {
      r.words += Math.max(0, args.p_n | 0);
      r.last_at = now;
      if (r.words > LIMITS.words && !r.blocked_until) r.blocked_until = now + TWO_HOURS;
      out = view(r);
    } else if (name === 'faisal_use_photo') {
      let ok = false;
      if (r.photos < LIMITS.photos) { r.photos += 1; ok = true; }
      out = { ok, usage: view(r) };
    } else {
      throw new Error('fungsi tidak dikenal: ' + name);
    }
    tx.set(ref, r);
    return out;
  });
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

// Balas 401 kalau belum login. Mengembalikan user, atau null (respons sudah dikirim).
async function requireUser(req, res) {
  const user = await getUser(req);
  if (!user) {
    bad(res, 401, 'Masuk dulu ya supaya bisa pakai Faisal AI.', { code: 'login' });
    return null;
  }
  return user;
}

module.exports = { enabled, webConfig, bad, getUser, rpc, wib, countWords, requireUser, LIMITS };
