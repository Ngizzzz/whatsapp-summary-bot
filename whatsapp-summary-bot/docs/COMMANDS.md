# 📲 Daftar Perintah Telegram

Semua perintah dikirim melalui chat Telegram ke bot kamu.

---

## 📋 Rangkuman

### `/rangkum`
Rangkum semua grup yang ada pesan baru sekarang.
- Bot akan memproses semua grup dengan pesan baru secara berurutan
- Setiap grup diproses dengan jeda 10 detik
- Kalau gagal, otomatis masuk antrian retry

### `/rangkumgrup`
Pilih grup tertentu untuk dirangkum menggunakan tombol interaktif.
- Muncul daftar grup yang ada pesan baru (10 per halaman)
- Klik nama grup → bot langsung merangkum
- Kalau gagal, otomatis masuk antrian retry

### `/status`
Tampilkan status perekaman saat ini:
- Mode (aktif/stop)
- Jadwal rangkuman
- Jumlah grup dalam retry queue
- Daftar grup dengan jumlah pesan yang belum dirangkum

### `/daftargrup`
Tampilkan semua grup yang pernah dipantau beserta jumlah pesan di buffer.

### `/stop`
Hentikan perekaman pesan sementara. Pesan yang masuk selama stop tidak akan direkam.

### `/mulai`
Aktifkan kembali perekaman pesan.

---

## 🧠 Konteks & Memory

Semua perintah di bagian ini menggunakan **inline keyboard** — kamu tidak perlu mengetik nama grup, cukup pilih dari tombol yang muncul.

### `/master`
Lihat **Master Summary** grup — konteks permanen yang berisi:
- Nama kapal dan rute operasi
- Tim teknisi yang terlibat
- Masalah berulang atau kronis
- Keputusan penting jangka panjang

*Diupdate otomatis setiap Senin 00.00 WIB*

### `/weekly`
Lihat **Weekly Digest** grup — ringkasan aktivitas minggu berjalan (maks 300 kata). Berisi masalah yang sedang berjalan, tindakan yang sudah diambil, dan hal yang perlu perhatian.

*Diupdate setiap kali ada rangkuman baru*

### `/history`
Lihat **7 rangkuman terakhir** dari grup yang dipilih.

### `/hapushistory`
Hapus semua file history dari grup yang dipilih.
- Muncul konfirmasi sebelum eksekusi
- **Tidak bisa dibatalkan setelah dikonfirmasi**
- Buffer dan master summary tidak terpengaruh

### `/hapusmaster`
Reset master summary dan weekly digest grup yang dipilih kembali ke kondisi awal.
- Muncul konfirmasi sebelum eksekusi
- History tidak terpengaruh

---

## 🔧 Perbaikan

### `/restart`
Restart bot. PM2 akan otomatis menjalankan ulang dalam beberapa detik.
- Bot akan kirim notifikasi saat aktif kembali
- Sesi WhatsApp tetap tersimpan — tidak perlu scan QR ulang

### `/clearsesi`
Hapus sesi WhatsApp lama dan minta scan QR baru.
- Gunakan kalau WhatsApp tidak bisa reconnect
- QR code akan dikirim ke Telegram sebagai foto
- **Data di folder `data/` tidak terhapus**

### `/reconnect`
Paksa reconnect WhatsApp tanpa hapus sesi.
- Coba ini dulu sebelum `/clearsesi`
- Lebih cepat karena tidak perlu scan QR

### `/cekram`
Tampilkan kondisi resource VPS:
- RAM: total, terpakai, tersedia
- Swap: total, terpakai, tersedia
- Bot memory usage

### `/retryqueue`
Tampilkan daftar grup yang sedang dalam antrian retry:
- Nama grup
- Percobaan ke berapa
- Waktu retry berikutnya (dalam detik)

---

## 📊 Log & Monitor

### `/log`
Tampilkan 20 baris log terakhir (output normal bot).

### `/logerror`
Tampilkan 20 baris error log terakhir. Berguna untuk diagnosa masalah.

### `/clearlog`
Bersihkan semua file log PM2. Berguna kalau log sudah terlalu menumpuk.

### `/pesanterakhir`
Tampilkan 5 pesan terakhir yang terekam per grup. Berguna untuk verifikasi bot benar-benar merekam pesan.

---

## ℹ️ Umum

### `/menu`
Tampilkan daftar semua perintah yang tersedia.

---

## 💡 Tips Penggunaan

**Mau tahu apa yang terjadi di grup tertentu tanpa nunggu jadwal?**
→ Ketik `/rangkumgrup`, pilih grup dari tombol

**Bot tidak merespons?**
→ Ketik `/restart` — kalau masih tidak merespons, masuk server dan cek `pm2 status`

**Rangkuman tidak muncul setelah /rangkum?**
→ Ketik `/logerror` untuk lihat error, cek `/retryqueue` untuk lihat apakah masuk antrian

**Mau lihat konteks panjang suatu grup?**
→ Ketik `/master` untuk konteks permanen, `/weekly` untuk minggu ini, `/history` untuk 7 hari terakhir

**RAM mulai tinggi?**
→ Ketik `/cekram`, kalau swap terpakai konsisten > 500MB pertimbangkan upgrade VPS ke 2GB
