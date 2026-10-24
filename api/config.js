// Memberi tahu browser apakah login aktif. Isinya hanya konfigurasi web Firebase yang memang publik.
// Buka /api/config?check=1 untuk memeriksa apakah server Firebase sudah terpasang benar (tanpa membuka rahasia).
const L = require('./_lib.js');

module.exports = async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (req.query && req.query.check) {
    const out = { login_aktif: L.enabled(), env_service_account: !!process.env.FIREBASE_SERVICE_ACCOUNT, env_web_config: !!process.env.FIREBASE_WEB_CONFIG, admin_emails_terisi: !!process.env.ADMIN_EMAILS };
    try { const sa = JSON.parse(String(process.env.FIREBASE_SERVICE_ACCOUNT || '').trim()); out.kunci = { project_id: sa.project_id || null, client_email_ada: !!sa.client_email, private_key_ada: typeof sa.private_key === 'string', private_key_awal_benar: typeof sa.private_key === 'string' && sa.private_key.indexOf('BEGIN PRIVATE KEY') >= 0 }; } catch (e) { out.kunci = 'isi FIREBASE_SERVICE_ACCOUNT bukan JSON utuh (kemungkinan terpotong saat ditempel)'; }
    try {
      const db = L.admin().firestore();
      await db.collection('usage').limit(1).get();
      out.firebase_admin = 'ok';
      out.firestore = 'ok';
    } catch (e) {
      out.firebase_admin = e && e.code === 'MODULE_NOT_FOUND' ? 'GAGAL: paket firebase-admin belum terpasang (cek package.json di GitHub)' : 'GAGAL: ' + String((e && e.message) || e).slice(0, 200);
    }
    return res.status(200).json(out);
  }
  if (!L.enabled()) return res.status(200).json({ enabled: false });
  return res.status(200).json({
    enabled: true,
    firebase: L.webConfig(),
    google: process.env.LOGIN_GOOGLE === '1',
    limits: L.LIMITS,
  });
};
