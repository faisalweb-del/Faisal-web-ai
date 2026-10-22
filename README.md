# Faisal AI: cara pasang

Folder ini berisi website lengkap plus server kecil untuk Faisal AI.
API key disimpan di server (Vercel), tidak pernah ada di file website.

## Isi folder
- index.html : website
- img/ : gambar dan logo
- api/chat.js : server Faisal AI
- api/persona.js : kepribadian dan aturan Faisal AI
- package.json

## 1. Ambil API key
1. Buka console.anthropic.com dan masuk.
2. Isi saldo di menu Billing. Pemakaian API berbayar per pesan.
3. Atur batas pengeluaran bulanan (Spend limit) supaya aman.
4. Buka menu API Keys, tekan Create Key, lalu salin key-nya (diawali sk-ant-).

## 2. Pasang di Vercel (gratis untuk pemakaian kecil)
1. Buat akun di vercel.com.
2. Taruh folder ini di repositori GitHub (di GitHub: New repository, lalu Upload files, unggah semua isi folder).
3. Di Vercel: Add New, Project, pilih repositori itu, lalu Deploy.
4. Di Vercel buka Settings, Environment Variables, tambah:
   - Name: ANTHROPIC_API_KEY
   - Value: key yang tadi disalin
5. Buka tab Deployments, tekan Redeploy supaya key terbaca.
6. Buka link website dari Vercel, tekan tombol Faisal AI, lalu coba chat dan kirim foto.

## 3. Jadikan APK
Pakai link Vercel tadi di aplikasi pembuat APK dari website. Pakai link online, jangan file lokal, supaya chat bisa menghubungi server.

## Keamanan dan biaya
- Jangan tempel API key di index.html, di chat, atau di tempat umum. Kalau bocor, hapus key di console.anthropic.com dan buat yang baru.
- Server membatasi 25 pesan per pengunjung tiap 10 menit, jawaban maksimal 500 token, dan foto diperkecil dulu. Pembatas ini hanya pengaman dasar. Tetap pasang Spend limit di console.
- Model bawaan: claude-haiku-5-5 (murah dan cepat). Mau ganti, tambah environment variable FAISAL_MODEL dengan nama model lain.
- Mengubah kepribadian: edit api/persona.js.
