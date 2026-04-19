# 📱 WhatsApp Summary Bot

> AI-powered WhatsApp group summarizer for maintenance planners — built by a non-programmer using Claude AI.

Bot ini secara otomatis membaca pesan dari grup-grup WhatsApp kerja dan merangkumnya menggunakan Groq AI (Llama 3.3 70B), lalu mengirim hasil rangkuman ke Telegram. Sistem berjalan 24 jam di VPS tanpa perlu laptop menyala.

---


## ✨ Fitur Utama

- 📨 **Rekam pesan otomatis** dari semua grup WhatsApp (termasuk pesan sendiri)
- 🧠 **Sistem memori 3 layer** — Master Summary, Weekly Digest, History
- 📋 **Format Gmail AI Overview style** — natural, kontekstual, menyebut nama orang & kapal
- ⏰ **Jadwal otomatis** — rangkuman pagi (07.00 WIB) & sore (17.00 WIB)
- 🔄 **Retry otomatis 3x** kalau gagal rangkum
- 📱 **Fully managed via Telegram** — tidak perlu masuk terminal
- 🎛️ **Inline keyboard** — pilih grup dari tombol, tidak perlu ketik nama
- 🔌 **Fetch pesan terlewat** saat bot offline
- 💾 **Persistent storage** — pesan tidak hilang saat bot restart
- 🛡️ **Token tracker** — cegah rate limit Groq secara proaktif

---

## 🏗️ Arsitektur

```
WhatsApp (61 grup)
       ↓
whatsapp-web.js (VPS 24 jam)
       ↓
Groq AI — Llama 3.3 70B (rangkum)
       ↓
Telegram Bot (hasil rangkuman)
```

### Stack
| Komponen | Fungsi | Biaya |
|---|---|---|
| VPS Nevacloud Jakarta | Server 24 jam | ~Rp 42.000/bulan |
| whatsapp-web.js | Baca pesan via Linked Device | Gratis |
| Groq API (Llama 3.3 70B) | AI summarizer | Gratis (500K token/hari) |
| Telegram Bot | Output & kontrol | Gratis |
| PM2 | Process manager | Gratis |

---

## 📂 Struktur Data

```
data/
└── NamaGrup_Sanitized/
    ├── buffer.json      ← pesan belum dirangkum
    ├── master.json      ← konteks permanen grup
    ├── weekly.json      ← digest minggu ini
    └── history/
        ├── 2026-04-18.json
        └── ...          ← disimpan selamanya
```

### Sistem Memori 3 Layer

| Layer | File | Update |
|---|---|---|
| Master Summary | master.json | Setiap Senin 00.00 WIB |
| Weekly Digest | weekly.json | Setiap kali ada rangkuman |
| Buffer | buffer.json | Real-time saat pesan masuk |
| History | history/YYYY-MM-DD.json | Setiap rangkuman berhasil |

---

## 📋 Contoh Output Rangkuman

```
📋 PTK - CB Kumawa Spirit
🕐 19 April 2026, 17.00 WIB

• Budi melaporkan engine kiri Kapal A bunyi aneh sejak 
  pagi — diduga masalah rubber coupling gearbox.
• Andi mengirim foto kondisi gearbox (08.33) dan meminta 
  konfirmasi Toni sebelum order part.
• Toni mengarahkan cek ketersediaan spare di gudang Jakarta dulu 
  sebelum buat PR.
• Feri menginfokan Kapal A dijadwalkan sandar besok 
  pagi jam 06.00.

⚠️ Belum Selesai:
• Toni belum konfirmasi foto gearbox dari Andi
• Ketersediaan rubber coupling di gudang belum dicek
```

---

## 🛠️ Cara Setup

Lihat [docs/SETUP.md](docs/SETUP.md) untuk panduan lengkap.

### Quick Start

```bash
# 1. Clone repository
git clone https://github.com/username/whatsapp-summary-bot.git
cd whatsapp-summary-bot

# 2. Install dependencies
npm install

# 3. Isi credentials di index.js
# Edit bagian KONFIGURASI — isi TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, GROQ_API_KEY

# 4. Jalankan
node index.js
# Scan QR code yang muncul dengan WhatsApp

# 5. Jalankan dengan PM2 (24 jam)
npm install -g pm2
pm2 start index.js --name summary-bot
pm2 startup && pm2 save
```

### Credentials yang Dibutuhkan

| Credential | Cara Dapat |
|---|---|
| Telegram Bot Token | Chat @BotFather di Telegram, ketik /newbot |
| Telegram Chat ID | Chat @userinfobot di Telegram |
| Groq API Key | Daftar di console.groq.com |

> ⚠️ **JANGAN** commit credentials ke GitHub. Gunakan environment variables atau isi langsung di index.js (pastikan index.js ada di .gitignore kalau mau simpan credentials di sana).

---

## 📲 Perintah Telegram

### Rangkuman
| Perintah | Fungsi |
|---|---|
| `/rangkum` | Rangkum semua grup yang ada pesan baru |
| `/rangkumgrup` | Pilih grup tertentu dari tombol |
| `/status` | Status perekaman & pesan per grup |
| `/daftargrup` | Daftar semua grup dipantau |
| `/stop` | Stop perekaman |
| `/mulai` | Mulai perekaman kembali |

### Konteks & Memory
| Perintah | Fungsi |
|---|---|
| `/master` | Lihat master summary grup (pilih dari tombol) |
| `/weekly` | Lihat weekly digest minggu ini |
| `/history` | Lihat 7 rangkuman terakhir |
| `/hapushistory` | Hapus history grup |
| `/hapusmaster` | Reset master summary & weekly |

### Perbaikan
| Perintah | Fungsi |
|---|---|
| `/restart` | Restart bot |
| `/clearsesi` | Hapus sesi WhatsApp & scan QR ulang |
| `/reconnect` | Paksa reconnect WhatsApp |
| `/cekram` | Cek kondisi RAM & Swap VPS |
| `/retryqueue` | Lihat antrian retry saat ini |

### Log & Monitor
| Perintah | Fungsi |
|---|---|
| `/log` | Lihat 20 log terakhir |
| `/logerror` | Lihat error terakhir |
| `/clearlog` | Bersihkan log |
| `/pesanterakhir` | Lihat 5 pesan terakhir per grup |
| `/menu` | Tampilkan semua perintah |

---

## ⏰ Jadwal Otomatis

| Waktu (WIB) | Aksi |
|---|---|
| 07.00 | Rangkuman pagi (aktivitas malam 17.00-07.00) |
| 17.00 | Rangkuman sore (aktivitas siang 07.00-17.00) |
| Senin 00.00 | Update Master Summary semua grup |
| Setiap 30 detik | Proses retry queue |
| Setiap 10 menit | Cek RAM VPS |

---

## 🔒 Keamanan

- ✅ WhatsApp Linked Device (resmi, tidak melanggar ToS)
- ✅ Data pesan disimpan lokal di VPS — tidak ke server luar
- ✅ Groq API hanya menerima teks, tidak menyimpan permanen
- ✅ `.wwebjs_auth/` dan `data/` ada di .gitignore
- ⚠️ Jangan upload credentials ke GitHub

---

## 📚 Dokumentasi

- [Setup Lengkap](docs/SETUP.md)
- [Daftar Perintah](docs/COMMANDS.md)
- [Arsitektur Sistem](docs/ARCHITECTURE.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Contoh Rangkuman](examples/summary-example.md)

---

## 📈 Changelog

| Versi | Perubahan |
|---|---|
| v1.0 | Setup awal: WhatsApp → Gemini → Telegram |
| v2.0 | Groq API, persistent storage, sistem memori 3 layer, format AI Overview, fetch pesan terlewat |
| v3.0 | Inline keyboard, retry otomatis, token tracker, delay adaptif |

---

## 🤝 Kontribusi

Pull request dan issue sangat disambut! Bot ini dibangun oleh non-programmer untuk non-programmer — semua improvement untuk kemudahan penggunaan sangat diapresiasi.

---

## 📄 Lisensi

MIT License — bebas digunakan, dimodifikasi, dan didistribusikan.

---

> *"AI bukan cuma untuk programmer. Kalau masalahnya jelas, AI bisa bantu build solusinya."*
