# Faisal AI: cara pasang

Folder ini berisi website lengkap plus server kecil untuk Faisal AI.
API key disimpan di server (Vercel), tidak pernah ada di file website.

## Isi folder
- index.html : website
- img/ : gambar dan logo
- api/chat.js : server Faisal AI
- api/persona.js : kepribadian dan aturan Faisal AI
- package.json

## Pakai OpenRouter (OPENROUTER_API_KEY)
Di Vercel, Settings, Environment Variables, tambah OPENROUTER_API_KEY berisi key dari openrouter.ai (diawali sk-or-), lalu Redeploy.
Model bawaan (gratis, dicoba berurutan kalau yang pertama gagal): minimax/minimax-m3.1-flash:free lalu nvidia/nemotron-3.5-super-vl:free.
Model gratis di OpenRouter sering berganti. Kalau ada yang hilang, isi FAISAL_MODELS dengan daftar model pilihanmu, dipisah koma.
Kalau OPENROUTER_API_KEY dan GEMINI_API_KEY sama-sama ada, OpenRouter yang dipakai.

## 1. (Alternatif) Ambil API key Gemini (Google AI Studio)
1. Buka aistudio.google.com dan masuk dengan akun Google.
2. Pilih Get API key, lalu Create API key, dan salin key-nya.
3. Cek batas gratis dan syaratnya di ai.google.dev/gemini-api/docs/pricing. Batasnya bisa berubah.

## 2. Pasang di Vercel
1. Taruh folder ini di GitHub, lalu di Vercel pilih Add New, Project, dan Deploy.
2. Di Vercel buka Settings, Environment Variables, tambah:
   - Name: GEMINI_API_KEY
   - Value: key yang tadi disalin
3. Buka Deployments, tekan Redeploy.
4. Cek status: buka link-website/api/chat di browser. Kalau muncul key_terbaca: true, berarti key sudah terbaca.
5. Buka website, tekan tombol Faisal AI, lalu coba chat.

Model bawaan: gemini-3.8-flash. Mau ganti, tambah environment variable FAISAL_MODEL berisi nama model Gemini lain.

## 3. Jadikan APK
Pakai link Vercel tadi di aplikasi pembuat APK dari website. Pakai link online, jangan file lokal, supaya chat bisa menghubungi server.

## Keamanan dan biaya
- Jangan tempel API key di index.html, di chat, atau di tempat umum. Kalau bocor, hapus key di console.anthropic.com dan buat yang baru.
- Server membatasi 25 pesan per pengunjung tiap 10 menit, jawaban maksimal 500 token, dan foto diperkecil dulu. Pembatas ini hanya pengaman dasar. Tetap pasang Spend limit di console.
- Mengubah kepribadian: edit api/persona.js.
