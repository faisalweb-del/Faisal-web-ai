// GET: lihat sisa jatah. POST {kind:'photo'}: pakai 1 jatah foto (dipanggil sebelum HD-in / hapus background).
const L = require('./_lib.js');

module.exports = async function handler(req, res) {
  if (!L.enabled()) return L.bad(res, 404, 'Login belum diaktifkan.');
  const user = await L.requireUser(req, res);
  if (!user) return;
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ email: user.email, usage: await L.rpc('faisal_usage', { p_user: user.id }) });
    }
    if (req.method !== 'POST') return L.bad(res, 405, 'Gunakan GET atau POST.');
    if (!req.body || req.body.kind !== 'photo') return L.bad(res, 400, 'Permintaan tidak valid.');
    const out = await L.rpc('faisal_use_photo', { p_user: user.id });
    if (!out.ok) {
      return L.bad(res, 429, 'Jatah foto hari ini (4 kali) sudah habis. Reset otomatis jam 00.00 WIB.', { code: 'photo_limit', usage: out.usage });
    }
    return res.status(200).json({ ok: true, usage: out.usage });
  } catch (e) {
    console.error('quota error', e);
    return L.bad(res, 503, 'Sistem kuota lagi bermasalah. Coba lagi sebentar.');
  }
};
