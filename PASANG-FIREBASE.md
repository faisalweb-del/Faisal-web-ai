# Pasang login dan limit (Firebase)

## 1. Aktifkan login
Firebase Console, project kamu, **Authentication**, Get started, tab **Sign-in method**:
- Aktifkan **Email/Password**.
- (Opsional) aktifkan **Google**, lalu di Vercel isi `LOGIN_GOOGLE` = `1`.
Tab **Settings**, **Authorized domains**: tambahkan domain Vercel kamu (contoh `nama-web.vercel.app`).

## 2. Buat database
**Firestore Database**, Create database, mode production, pilih lokasi (mis. asia-southeast2 Jakarta).
Tab **Rules**, ganti isinya jadi ini lalu Publish (browser tidak boleh akses langsung, hanya server):

    rules_version = '2';
    service cloud.firestore {
      match /databases/{database} {
        match /{document=**} { allow read, write: if false; }
      }
    }

## 3. Ambil dua konfigurasi
- **Konfigurasi web** (publik): Project settings (ikon roda gigi), General, di bawah "Your apps" tambahkan app Web (ikon </>), salin isi `firebaseConfig` sebagai JSON satu baris, contoh:
  `{"apiKey":"...","authDomain":"...firebaseapp.com","projectId":"...","appId":"..."}`
- **Service account** (RAHASIA): Project settings, tab **Service accounts**, Generate new private key. File JSON yang terunduh isinya dipakai di langkah 4. Jangan kirim file ini ke siapa pun atau ke chat.

## 4. Isi di Vercel (Settings, Environment Variables)
- `FIREBASE_WEB_CONFIG` = JSON konfigurasi web
- `FIREBASE_SERVICE_ACCOUNT` = seluruh isi file JSON service account (boleh ditempel apa adanya)
- `GEMINI_API_KEY` = key Gemini kamu (untuk suara cowok)
- `LOGIN_GOOGLE` = `1` (hanya kalau Google diaktifkan)

## 5. Upload ke GitHub
Ganti `index.html`, folder `api`, dan `package.json` (sekarang ada firebase-admin), lalu Vercel Redeploy.
Cek: buka `alamat-web/api/config`, harus muncul `"enabled": true`.

Aturan: foto 4x per hari reset 00.00 WIB. Chat bebas, tapi setelah total lewat 500 kata kena istirahat 2 jam.
