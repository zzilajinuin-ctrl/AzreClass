# Ruang Komunitas

Website komunitas sederhana: daftar/login dengan username + password, profil publik, foto profil, deskripsi, dan postingan publik.

## Menjalankan di komputer

1. Install **Node.js 18 atau lebih baru**.
2. Ekstrak folder project.
3. Buka terminal di folder project, lalu jalankan:

   ```bash
   npm install
   ```

4. Salin `.env.example` menjadi `.env`, lalu ganti `JWT_SECRET` dengan string acak yang panjang.
5. Jalankan:

   ```bash
   npm start
   ```

6. Buka `http://localhost:3000`.

## Fitur

- Pendaftaran dengan nama pengguna unik dan password minimal 8 karakter.
- Password disimpan dalam bentuk hash bcrypt, bukan teks biasa.
- Login dan sesi token.
- Profil dengan foto (JPG, PNG, WEBP, GIF; maksimal 3 MB) dan deskripsi.
- Feed publik, postingan teks maksimal 2.000 karakter.
- Pengguna dapat menghapus postingannya sendiri.
- Pembatasan percobaan login/daftar dan validasi input dasar.

## Sebelum dipublikasikan ke internet

Project ini adalah fondasi yang bisa dijalankan. Agar dapat dipakai banyak orang secara online:

- Deploy server Node.js ke layanan hosting yang mendukung Node.
- Gunakan HTTPS dan atur `JWT_SECRET` rahasia yang kuat melalui environment variables hosting.
- Pastikan folder `data/` dan `uploads/` memakai persistent storage/volume. Jika hosting tidak menyediakan disk permanen, pindahkan database ke PostgreSQL dan foto ke object storage.
- Tambahkan kebijakan privasi, aturan komunitas, pelaporan konten, moderasi, backup, dan perlindungan spam sebelum membuka pendaftaran publik.
- Jangan mengunggah file `.env` atau membagikan JWT secret.

## Catatan

Pendaftaran memakai username dan password saja sesuai konsep awal. Belum ada verifikasi email, reset password, komentar, like, atau upload gambar pada postingan.
