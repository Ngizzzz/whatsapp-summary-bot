# 🏗️ Arsitektur Sistem

## Gambaran Umum

```
WhatsApp Groups (61 grup)
         │
         ▼
┌─────────────────────┐
│   whatsapp-web.js   │  ← Linked Device resmi, baca semua pesan
│   (VPS 24 jam)      │
└─────────┬───────────┘
          │ pesan masuk
          ▼
┌─────────────────────┐
│   Buffer (file JSON) │  ← Simpan pesan per grup
│   data/grup/         │
│   buffer.json        │
└─────────┬───────────┘
          │ saat rangkum
          ▼
┌─────────────────────┐    ┌──────────────────┐
│   Groq AI           │ ◄──│  Konteks:        │
│   Llama 3.3 70B     │    │  master.json     │
│                     │    │  weekly.json     │
└─────────┬───────────┘    └──────────────────┘
          │ hasil rangkuman
          ▼
┌─────────────────────┐
│   Telegram Bot      │  ← Kirim rangkuman ke HP
└─────────────────────┘
          │ juga simpan ke
          ▼
┌─────────────────────┐
│   History           │  ← Arsip rangkuman selamanya
│   data/grup/        │
│   history/          │
└─────────────────────┘
```

---

## Sistem Memori 3 Layer

Bot ini memiliki "ingatan" yang tersimpan secara permanen di VPS, sehingga AI bisa memberikan rangkuman yang kontekstual dan terhubung dengan kejadian sebelumnya.

### Layer 1: Master Summary (`master.json`)

Fakta permanen tentang grup — tidak berubah kecuali ada update signifikan.

```json
{
  "grup": "PTK - CB Kumawa Spirit",
  "terakhir_update": "21 April 2026, 00.00 WIB",
  "ringkasan": "Kapal CB Kumawa Spirit beroperasi rute Balikpapan-Bontang. 
  Tim teknisi: Budi (Chief Engineer), Andi (asisten). Masalah berulang: 
  gearbox kiri cenderung overheat sejak Januari 2026, sudah 2x ganti seal. 
  Engine kanan pernah mati mendadak Feb 2026 akibat fuel filter tersumbat."
}
```

**Update:** Setiap Senin 00.00 WIB otomatis, berdasarkan history 7 hari terakhir.

### Layer 2: Weekly Digest (`weekly.json`)

Ringkasan aktivitas minggu berjalan — diperbarui setiap kali ada rangkuman.

```json
{
  "minggu": "2026-04-14",
  "ringkasan": "Minggu ini: engine kiri bunyi aneh (senin), teknisi cek dan 
  identifikasi rubber coupling perlu diganti (selasa), part dipesan dari 
  gudang PTK (rabu), menunggu konfirmasi ketersediaan (kamis-jumat)."
}
```

**Update:** Setiap kali ada rangkuman baru, weekly digest digabungkan dengan rangkuman terbaru.

### Layer 3: Buffer (`buffer.json`)

Pesan yang belum dirangkum — dikosongkan setelah berhasil dirangkum.

```json
[
  "[08.32] Budi: Engine kiri bunyi aneh",
  "[08.33] Andi: <mengirim foto/media>",
  "[08.35] Roi: Sudah dicek teknisi?"
]
```

---

## Alur Rangkuman

```
1. Load buffer.json
2. Load master.json + weekly.json (konteks)
3. Cek token budget (anti rate limit)
4. Request 1: Groq AI → rangkuman utama (~1500 token)
5. Delay 5 detik
6. Request 2: Groq AI → update weekly digest (~500 token)
7. Simpan rangkuman ke history/YYYY-MM-DD.json
8. Update weekly.json
9. Kosongkan buffer.json
10. Delay 10 detik sebelum grup berikutnya
```

---

## Sistem Retry Otomatis

```
Gagal rangkum
     │
     ▼
Masuk retryQueue
{ attempts: 1, nextRetry: +2 menit }
     │
     ▼ (setiap 30 detik)
Retry processor cek antrian
     │
  nextRetry lewat?
     │
  Ya ──► Coba rangkum ulang
     │         │
     │      Berhasil? ──Ya──► Notifikasi sukses
     │         │
     │        Tidak
     │         │
     │      attempts++ > 3?
     │         │
     │      Ya ──► Notifikasi gagal 3x
     │             Buffer TIDAK dihapus
     │         │
     │        Tidak
     │         │
     └─────── nextRetry = +2 menit lagi
```

---

## Token Tracker (Anti Rate Limit)

Groq free tier limit: **12.000 token/menit**. Bot menggunakan maksimal **9.000 token/menit** (75% dari limit).

```javascript
// Sebelum setiap request ke Groq:
estimatedTokens = teks.length / 3.5
if (tokenUsedThisMinute + estimatedTokens > SAFE_TPM) {
    // Tunggu sampai menit berikutnya
    await sleep(tokenResetTime - Date.now())
}

// Setelah response:
tokenUsedThisMinute += response.usage.total_tokens
```

Kalau tetap terkena rate limit:
- Baca waktu tunggu dari pesan error Groq
- Tunggu tepat sesuai waktu + 2 detik buffer
- Reset token tracker
- Retry request yang sama

---

## Fetch Pesan Terlewat

Saat bot restart atau reconnect setelah offline:

```
1. Baca last_online.json → timestamp terakhir online
2. Kalau offline < 2 menit → skip (tidak signifikan)
3. Fetch 100 pesan terakhir dari setiap grup
4. Filter: timestamp > last_online AND bukan pesan sendiri
5. Filter duplikat: cek apakah sudah ada di buffer
6. Tambah ke buffer + simpan ke file
7. Notifikasi: total pesan berhasil diambil
```

**Keterbatasan:** WhatsApp Web hanya menyimpan ~100 pesan terakhir per grup di memori. Jika bot offline terlalu lama dan grup sangat aktif, pesan terlalu lama mungkin tidak bisa diambil.

---

## Inline Keyboard

Perintah yang butuh nama grup menggunakan Telegram inline keyboard untuk kemudahan penggunaan.

```
/master
    │
    ▼
Bot kirim pesan + keyboard:
[PTK - CB Kumawa Spirit  ]
[PTK - CB Manbefor       ]
...10 grup...
[◀ Prev] [1/7] [Next ▶]
[❌ Batal]
    │
User klik nama grup
    │
    ▼
Bot tampilkan master summary
```

Fitur keyboard:
- **Paginasi:** 10 grup per halaman
- **Filter:** `/rangkumgrup` hanya tampilkan grup dengan pesan baru
- **Konfirmasi:** hapushistory dan hapusmaster minta konfirmasi sebelum eksekusi
- **Batal:** setiap keyboard punya tombol batal

---

## Jadwal & Timer

```javascript
// Cek setiap 1 menit
setInterval(() => {
    if (jam === 7 && menit === 0)  → summarizeAll('Pagi')
    if (jam === 17 && menit === 0) → summarizeAll('Sore')
    if (hari === Senin && jam === 0 && menit === 0) → updateAllMasterSummaries()
    saveLastOnline() // update timestamp
}, 60 * 1000)

// Retry processor setiap 30 detik
setInterval(() => processRetryQueue(), 30 * 1000)

// Cek RAM setiap 10 menit
setInterval(() => checkRAM(), 10 * 60 * 1000)
```
