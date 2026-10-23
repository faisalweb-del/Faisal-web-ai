// Memberi tahu browser apakah login aktif. Isinya hanya konfigurasi web Firebase yang memang publik.
const L = require('./_lib.js');

module.exports = function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (!L.enabled()) return res.status(200).json({ enabled: false });
  return res.status(200).json({
    enabled: true,
    firebase: L.webConfig(),
    google: process.env.LOGIN_GOOGLE === '1',
    limits: L.LIMITS,
  });
};
