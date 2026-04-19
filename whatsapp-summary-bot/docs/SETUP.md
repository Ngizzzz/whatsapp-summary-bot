# 🛠️ Panduan Setup Lengkap

## Prasyarat

- VPS dengan Ubuntu 22.04 (minimal 1GB RAM)
- Akun Telegram
- Akun Groq (groq.com)
- WhatsApp aktif di HP

---

## Step 1 — Siapkan Credentials

### 1.1 Telegram Bot Token
1. Buka Telegram, cari **@BotFather** (centang biru resmi)
2. Ketik `/newbot`
3. Masukkan nama bot, contoh: `Maintenance Summary Bot`
4. Masukkan username (harus diakhiri `bot`), contoh: `maintenance_summary_bot`
5. Copy token yang diberikan — simpan di Notepad

### 1.2 Telegram Chat ID
1. Buka Telegram, cari **@userinfobot**
2. Ketik `/start`
3. Catat angka Chat ID yang muncul

### 1.3 Groq API Key
1. Buka [console.groq.com](https://console.groq.com)
2. Daftar / login dengan akun Google
3. Klik **API Keys** → **Create API Key**
4. Beri nama, copy API key — simpan di Notepad

> ⚠️ **JANGAN** bagikan token dan API key ke siapapun.

---

## Step 2 — Setup VPS

### Rekomendasi VPS
| Provider | Harga | Lokasi | Link |
|---|---|---|---|
| Nevacloud | ~Rp 42.000/bulan | Jakarta | nevacloud.com |
| Hetzner | ~€3.79/bulan | Eropa | hetzner.com |
| Contabo | ~$4/bulan | Eropa | contabo.com |

### Spesifikasi Minimum
- **OS:** Ubuntu 22.04 LTS
- **RAM:** 1GB (+ tambah 1GB Swap)
- **Storage:** 20GB SSD

### Masuk ke VPS
```bash
ssh root@IP_ADDRESS_VPS
```

---

## Step 3 — Install Dependencies

```bash
# Update sistem
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install Chromium (dibutuhkan whatsapp-web.js)
apt install -y chromium-browser

# Install library pendukung Chromium
apt install -y libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
  libxfixes3 libxrandr2 libgbm1 libasound2 libcairo2 \
  libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf2.0-0 \
  libgtk-3-0 libx11-xcb1 libxcb-dri3-0 libxss1 libxtst6

# Verifikasi Node.js
node --version && npm --version
```

---

## Step 4 — Tambah Swap (Penting untuk RAM 1GB)

```bash
fallocate -l 1G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Verifikasi
free -h
```

---

## Step 5 — Setup Project

```bash
# Buat folder project
mkdir -p /root/summary-bot/data
cd /root/summary-bot

# Clone atau copy file
# Kalau dari GitHub:
git clone https://github.com/username/whatsapp-summary-bot.git .

# Install dependencies
npm install

# Install PM2
npm install -g pm2
```

---

## Step 6 — Konfigurasi

Edit file `index.js`, cari bagian KONFIGURASI:

```javascript
// ===== KONFIGURASI =====
const TELEGRAM_TOKEN = 'TELEGRAM_TOKEN_KAMU';        // ← Ganti ini
const TELEGRAM_CHAT_ID = 'TELEGRAM_CHAT_ID_KAMU';   // ← Ganti ini
const GROQ_API_KEY = 'GROQ_API_KEY_KAMU';           // ← Ganti ini
```

```bash
nano index.js
# Edit 3 baris di atas
# Simpan: Ctrl+X → Y → Enter
```

### Konfigurasi Opsional

```javascript
const PAGE_SIZE = 10;   // Jumlah grup per halaman keyboard (default: 10)
```

---

## Step 7 — Test Pertama

```bash
# Jalankan manual dulu
node index.js
```

Yang akan muncul:
1. QR code di terminal
2. Buka WhatsApp di HP → titik tiga (⋮) → Linked Devices → Link a Device
3. Scan QR code
4. Muncul: `WhatsApp Bot siap!`
5. Cek Telegram — harusnya ada notifikasi bot aktif

---

## Step 8 — Jalankan 24 Jam dengan PM2

```bash
# Stop manual (Ctrl+C), lalu:
pm2 start index.js --name summary-bot

# Agar otomatis start saat server reboot
pm2 startup
pm2 save

# Cek status
pm2 status
```

---

## Step 9 — Verifikasi

Di Telegram, test perintah:
- `/menu` — harusnya muncul daftar perintah
- `/status` — harusnya muncul status perekaman
- `/cekram` — harusnya muncul info RAM & Swap

---

## Menggunakan Environment Variables (Opsional)

Cara lebih aman menyimpan credentials:

```bash
# Buat file .env
cat > /root/summary-bot/.env << EOF
TELEGRAM_TOKEN=token_kamu
TELEGRAM_CHAT_ID=chat_id_kamu
GROQ_API_KEY=api_key_kamu
EOF

# Tambahkan ke .gitignore
echo '.env' >> .gitignore
```

Install dotenv:
```bash
npm install dotenv
```

Tambahkan di awal index.js:
```javascript
require('dotenv').config();
```

Credentials di index.js akan otomatis dibaca dari environment variables.

---

## Troubleshooting Setup

| Error | Solusi |
|---|---|
| `Failed to launch browser` | Jalankan perintah install library Chromium di Step 3 |
| `401 Unauthorized` (Telegram) | Token salah — ambil token baru dari @BotFather |
| `rate_limit_exceeded` (Groq) | Normal — bot akan retry otomatis |
| QR expired sebelum di-scan | Ketik /clearsesi di Telegram untuk generate QR baru |
| Bot tidak merekam pesan | Ketik /mulai di Telegram |

Lihat [TROUBLESHOOTING.md](TROUBLESHOOTING.md) untuk panduan lebih lengkap.
