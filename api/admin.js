// Panel admin: mengganti paket pengguna (Free / Pro) setelah mereka membayar. Hanya untuk email di ADMIN_EMAILS.
const L = require('./_lib.js');

module.exports = async function handler(req, res) {
  if (!L.enabled()) return L.bad(res, 404, 'Login belum diaktifkan.');
  const user = await L.requireUser(req, res);
  if (!user) return;
  if (!L.isAdmin(user)) return L.bad(res, 403, 'Kamu bukan admin.');
  if (req.method !== 'POST') return res.status(200).json({ admin: true });

  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return L.bad(res, 400, 'Format emailnya belum benar.');
  if (!['check', 'pro', 'free'].includes(b.plan)) return L.bad(res, 400, 'Pilihan paket tidak valid.');
  let target;
  try {
    target = await L.admin().auth().getUserByEmail(email);
  } catch (e) {
    return L.bad(res, 404, 'Email itu belum terdaftar. Minta dia daftar dulu di web.');
  }
  try {
    const days = Math.max(1, Math.min(365, parseInt(b.days, 10) || 30));
    const usage = await L.rpc(b.plan === 'check' ? 'admin_get' : 'admin_set', { p_user: target.uid, plan: b.plan, days, p_email: email });
    return res.status(200).json({ ok: true, email, usage });
  } catch (e) {
    console.error('admin error', e);
    return L.bad(res, 503, 'Gagal mengubah paket. Coba lagi.');
  }
};
