# 🔧 Troubleshooting

## Masalah Umum & Solusi

---

### Bot tidak merespons perintah Telegram

**Penyebab:** Bot crash atau stop.

**Solusi:**
1. Masuk ke server: `ssh root@IP_VPS`
2. Cek status: `pm2 status`
3. Kalau `stopped` atau `errored`: `pm2 restart summary-bot`
4. Lihat log: `pm2 logs summary-bot --lines 30`

---

### WhatsApp offline / terputus

**Penyebab:** Sesi WhatsApp expired atau koneksi terputus.

**Solusi (dari Telegram):**
1. Ketik `/reconnect` — coba reconnect tanpa hapus sesi
2. Kalau masih gagal, ketik `/clearsesi` — bot hapus sesi lama dan kirim QR code baru
3. Scan QR code dari foto yang dikirim ke Telegram

**Solusi (dari terminal):**
```bash
pm2 stop summary-bot
rm -rf /root/summary-bot/.wwebjs_auth
node index.js  # scan QR, tunggu "WhatsApp Bot siap!"
# Ctrl+C
pm2 start index.js --name summary-bot
pm2 save
```

> ⚠️ Data di folder `data/` TIDAK terhapus saat reset sesi.

---

### Rangkuman tidak muncul setelah `/rangkum`

**Langkah diagnosa:**
1. Ketik `/logerror` — lihat error apa yang terjadi
2. Ketik `/retryqueue` — apakah grup masuk antrian retry?
3. Ketik `/status` — apakah ada pesan di buffer?

**Kemungkinan penyebab:**

| Error di log | Penyebab | Solusi |
|---|---|---|
| `rate_limit_exceeded` | Token Groq habis | Bot retry otomatis, tunggu |
| `ECONNRESET` | Koneksi internet VPS terputus | Bot retry otomatis |
| `Cannot read properties of undefined` | Response Groq tidak terduga | Ketik `/rangkumgrup` lagi |
| `401 Unauthorized` | Groq API key salah | Update GROQ_API_KEY di index.js |

---

### Pesan tidak terekam

**Penyebab:** Perekaman dinonaktifkan.

**Solusi:** Ketik `/mulai` di Telegram.

**Cek dengan:** Ketik `/status` — pastikan mode menampilkan ✅ Aktif.

---

### Tombol keyboard tidak muncul saat `/master`, `/weekly`, dll

**Penyebab:** Belum ada grup yang terpantau.

**Solusi:** Tunggu ada pesan masuk dari grup WhatsApp. Bot akan otomatis mendeteksi grup baru saat ada pesan masuk.

---

### `/rangkumgrup` menampilkan "Tidak ada grup dengan pesan baru"

**Penyebab:** Semua grup sudah dirangkum atau belum ada pesan baru.

**Solusi:** Normal — tunggu pesan baru masuk. Atau gunakan `/rangkum` (akan memberi notifikasi yang sama kalau memang tidak ada pesan baru).

---

### RAM terlalu tinggi (> 80%)

**Gejala:** Muncul peringatan RAM di Telegram, atau bot lambat merespons.

**Solusi jangka pendek:**
```bash
pm2 restart summary-bot  # restart bot untuk bebas memori
```

**Solusi jangka panjang:**
- Pastikan swap sudah ditambahkan (1GB)
- Monitor dengan `/cekram` setiap hari selama seminggu
- Kalau swap konsisten terpakai > 500MB → pertimbangkan upgrade VPS ke 2GB RAM

---

### Error saat pertama install: `Failed to launch browser`

**Penyebab:** Library pendukung Chromium belum terinstall.

**Solusi:**
```bash
apt install -y libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
  libxfixes3 libxrandr2 libgbm1 libasound2 libcairo2 \
  libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf2.0-0 \
  libgtk-3-0 libx11-xcb1 libxcb-dri3-0 libxss1 libxtst6
```

---

### Error: `401 Unauthorized` (Telegram)

**Penyebab:** Token Telegram salah atau sudah di-revoke.

**Solusi:**
1. Buka @BotFather di Telegram
2. Ketik `/mybots` → pilih bot → API Token → Revoke → copy token baru
3. Update `TELEGRAM_TOKEN` di index.js
4. `pm2 restart summary-bot`

---

### Error: `polling_error ECONNRESET`

**Penyebab:** Koneksi internet VPS ke Telegram terputus sesaat.

**Solusi:** Normal dan tidak berbahaya — bot akan otomatis reconnect ke Telegram polling. Tidak perlu tindakan apapun.

---

## Prosedur Reset Lengkap

Kalau bot benar-benar bermasalah dan perlu fresh start:

```bash
# 1. Stop bot
pm2 stop summary-bot

# 2. Hapus sesi WhatsApp
rm -rf /root/summary-bot/.wwebjs_auth

# 3. (Opsional) Hapus data grup kalau mau mulai dari nol
# rm -rf /root/summary-bot/data/*
# HATI-HATI: ini menghapus semua history, master, weekly!

# 4. Jalankan manual untuk scan QR
cd /root/summary-bot
node index.js

# 5. Scan QR code di terminal dengan WhatsApp
# Tunggu: "WhatsApp Bot siap!"

# 6. Ctrl+C, lalu jalankan dengan PM2
pm2 start index.js --name summary-bot
pm2 save
```

---

## Cek Kondisi Server

```bash
# RAM & Swap
free -h

# Storage
df -h /

# CPU & Load
top -bn1 | head -5

# Status PM2
pm2 status

# Log realtime
pm2 logs summary-bot

# Log error
pm2 logs summary-bot --err --lines 50
```

---

## Kontak & Support

Kalau menemukan bug atau ada pertanyaan, buka [GitHub Issues](https://github.com/username/whatsapp-summary-bot/issues).
