const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const TelegramBot = require('node-telegram-bot-api');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ===== KONFIGURASI =====
// Ganti dengan credentials kamu
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || 'TELEGRAM_TOKEN_KAMU';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || 'TELEGRAM_CHAT_ID_KAMU';
const GROQ_API_KEY = process.env.GROQ_API_KEY || 'GROQ_API_KEY_KAMU';
const DATA_DIR = process.env.DATA_DIR || './data';
const LAST_ONLINE_FILE = process.env.LAST_ONLINE_FILE || './last_online.json';
const MAX_TPM = 12000;        // Limit token per menit Groq free tier
const SAFETY_MARGIN = 0.75;   // Pakai max 75% dari limit
const SAFE_TPM = MAX_TPM * SAFETY_MARGIN; // 9000 token/menit
const PAGE_SIZE = 10;         // Jumlah grup per halaman inline keyboard
// =======================

let isRecording = true;
let retryQueue = {};
let tokenUsedThisMinute = 0;
let tokenResetTime = Date.now() + 60000;

// ===== TOKEN TRACKER =====

function resetTokenIfNeeded() {
    if (Date.now() > tokenResetTime) {
        tokenUsedThisMinute = 0;
        tokenResetTime = Date.now() + 60000;
    }
}

async function waitForTokenBudget(estimatedTokens) {
    resetTokenIfNeeded();
    if (tokenUsedThisMinute + estimatedTokens > SAFE_TPM) {
        const waitMs = tokenResetTime - Date.now() + 1000;
        console.log(`Token budget habis. Menunggu ${Math.round(waitMs/1000)}s...`);
        await sleep(waitMs);
        resetTokenIfNeeded();
    }
}

function estimateTokens(text) {
    return Math.ceil(text.length / 3.5);
}

// ===== HELPER =====

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function sanitizeGroupName(name) {
    return name.replace(/[^a-zA-Z0-9-_]/g, '_');
}

function getGroupDir(groupName) {
    const dir = path.join(DATA_DIR, sanitizeGroupName(groupName));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(path.join(dir, 'history')))
        fs.mkdirSync(path.join(dir, 'history'), { recursive: true });
    return dir;
}

function loadBuffer(groupName) {
    const file = path.join(getGroupDir(groupName), 'buffer.json');
    if (!fs.existsSync(file)) return [];
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
}

function saveBuffer(groupName, messages) {
    fs.writeFileSync(
        path.join(getGroupDir(groupName), 'buffer.json'),
        JSON.stringify(messages, null, 2)
    );
}

function clearBuffer(groupName) { saveBuffer(groupName, []); }

function loadMaster(groupName) {
    const file = path.join(getGroupDir(groupName), 'master.json');
    if (!fs.existsSync(file))
        return { grup: groupName, terakhir_update: '-', ringkasan: 'Belum ada data.' };
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { return { grup: groupName, terakhir_update: '-', ringkasan: 'Belum ada data.' }; }
}

function saveMaster(groupName, data) {
    fs.writeFileSync(
        path.join(getGroupDir(groupName), 'master.json'),
        JSON.stringify(data, null, 2)
    );
}

function loadWeekly(groupName) {
    const file = path.join(getGroupDir(groupName), 'weekly.json');
    if (!fs.existsSync(file))
        return { minggu: '-', ringkasan: 'Belum ada data minggu ini.' };
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { return { minggu: '-', ringkasan: 'Belum ada data minggu ini.' }; }
}

function saveWeekly(groupName, data) {
    fs.writeFileSync(
        path.join(getGroupDir(groupName), 'weekly.json'),
        JSON.stringify(data, null, 2)
    );
}

function saveHistory(groupName, summary) {
    const today = new Date().toISOString().split('T')[0];
    const file = path.join(getGroupDir(groupName), 'history', `${today}.json`);
    let history = [];
    if (fs.existsSync(file)) {
        try { history = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { history = []; }
    }
    history.push({
        waktu: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
        rangkuman: summary
    });
    fs.writeFileSync(file, JSON.stringify(history, null, 2));
}

function loadHistory7Days(groupName) {
    const dir = path.join(getGroupDir(groupName), 'history');
    const results = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const file = path.join(dir, `${dateStr}.json`);
        if (fs.existsSync(file)) {
            try {
                const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
                entries.forEach(e => results.push(`[${e.waktu}]\n${e.rangkuman}`));
            } catch { }
        }
    }
    return results.join('\n\n---\n\n');
}

function getAllGroups() {
    if (!fs.existsSync(DATA_DIR)) return [];
    return fs.readdirSync(DATA_DIR)
        .filter(f => fs.statSync(path.join(DATA_DIR, f)).isDirectory());
}

function getOriginalGroupName(sanitized) {
    const masterFile = path.join(DATA_DIR, sanitized, 'master.json');
    if (fs.existsSync(masterFile)) {
        try {
            const master = JSON.parse(fs.readFileSync(masterFile, 'utf8'));
            return master.grup || sanitized;
        } catch { }
    }
    return sanitized;
}

function saveLastOnline() {
    fs.writeFileSync(LAST_ONLINE_FILE, JSON.stringify({
        timestamp: Date.now(),
        waktu: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
    }));
}

function loadLastOnline() {
    if (!fs.existsSync(LAST_ONLINE_FILE)) return null;
    try { return JSON.parse(fs.readFileSync(LAST_ONLINE_FILE, 'utf8')); } catch { return null; }
}

// ===== INLINE KEYBOARD =====

function buildGroupKeyboard(action, page = 0, filterHasMessages = false) {
    const allSanitized = getAllGroups();
    let groups = allSanitized.map(s => getOriginalGroupName(s));

    if (filterHasMessages) {
        groups = groups.filter(g => loadBuffer(g).length > 0);
    }

    if (groups.length === 0) return null;

    const totalPages = Math.ceil(groups.length / PAGE_SIZE);
    const pageGroups = groups.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    const groupButtons = pageGroups.map(name => [{
        text: name,
        callback_data: `${action}:${sanitizeGroupName(name)}`
    }]);

    const navButtons = [];
    if (page > 0) navButtons.push({ text: '◀ Prev', callback_data: `page:${action}:${page - 1}` });
    navButtons.push({ text: `${page + 1}/${totalPages}`, callback_data: 'noop' });
    if (page < totalPages - 1) navButtons.push({ text: 'Next ▶', callback_data: `page:${action}:${page + 1}` });

    const keyboard = [...groupButtons];
    if (navButtons.length > 1) keyboard.push(navButtons);
    keyboard.push([{ text: '❌ Batal', callback_data: 'cancel' }]);

    return { inline_keyboard: keyboard, groups, totalPages };
}

// ===== GROQ API =====

async function callGroq(prompt, maxTokens = 1500) {
    const estimatedInput = estimateTokens(prompt);
    await waitForTokenBudget(estimatedInput + maxTokens);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokens
        })
    });

    const data = await response.json();

    if (data.error) {
        if (data.error.code === 'rate_limit_exceeded') {
            const match = data.error.message.match(/try again in (\d+\.?\d*)s/);
            const waitSec = match ? Math.ceil(parseFloat(match[1])) + 2 : 30;
            console.log(`Rate limit. Menunggu ${waitSec}s...`);
            await sleep(waitSec * 1000);
            tokenUsedThisMinute = 0;
            tokenResetTime = Date.now() + 60000;
            return await callGroq(prompt, maxTokens);
        }
        throw new Error(JSON.stringify(data));
    }

    if (data.usage) {
        tokenUsedThisMinute += data.usage.total_tokens;
        console.log(`Token: ${data.usage.total_tokens} | Total: ${tokenUsedThisMinute}/${SAFE_TPM}`);
    }

    if (!data.choices) throw new Error(JSON.stringify(data));
    return data.choices[0].message.content;
}

// ===== CORE SUMMARIZE =====

async function summarizeGroup(groupName, messages) {
    if (messages.length === 0) return null;

    const master = loadMaster(groupName);
    const weekly = loadWeekly(groupName);
    const chat_text = messages.join('\n');
    const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

    const prompt = `Kamu adalah asisten maintenance planner di perusahaan pelayaran Indonesia.

=== KONTEKS PERMANEN GRUP: ${groupName} ===
${master.ringkasan}

=== AKTIVITAS MINGGU INI ===
${weekly.ringkasan}

=== PESAN BARU ===
${chat_text}

Buat rangkuman percakapan dalam Bahasa Indonesia:
1. Format bullet point natural seperti AI Overview (bukan template kaku)
2. Selalu sebutkan nama orang yang terlibat
3. Sebutkan nama kapal/project yang dibahas
4. Tangkap SEMUA info penting: maintenance, koordinasi, jadwal, keputusan, operasional
5. Foto: integrasikan ke narasi (siapa kirim, konteksnya)
6. Hubungkan dengan konteks sebelumnya jika relevan
7. Cantumkan hal belum selesai di bagian akhir

Format output WAJIB:
📋 *${groupName}*
🕐 ${now}

- (bullet point natural)

⚠️ *Belum Selesai:*
- (tindak lanjut yang masih menunggu)

Hapus "Belum Selesai" jika tidak ada.`;

    const summary = await callGroq(prompt, 1500);
    await sleep(5000);

    const weeklyPrompt = `Update weekly digest grup ${groupName}.
Weekly saat ini: ${weekly.ringkasan}
Rangkuman terbaru: ${summary}
Buat weekly digest baru maksimal 300 kata, Bahasa Indonesia.`;

    const newWeekly = await callGroq(weeklyPrompt, 500);
    saveWeekly(groupName, {
        minggu: new Date().toISOString().split('T')[0],
        ringkasan: newWeekly
    });

    return summary;
}

async function processSingleGroup(groupName, messages, label = '') {
    try {
        const summary = await summarizeGroup(groupName, messages);
        if (summary) {
            const header = label ? `🕐 *Rangkuman ${label}*\n\n` : '';
            await sendMarkdown(header + summary);
            saveHistory(groupName, summary);
            clearBuffer(groupName);
            delete retryQueue[groupName];
        }
        return true;
    } catch (err) {
        console.error(`❌ Gagal rangkum ${groupName}:`, err.message);
        return false;
    }
}

async function summarizeAll(label = '') {
    const groups = getAllGroups();
    let ada = false;

    for (const sanitized of groups) {
        const groupName = getOriginalGroupName(sanitized);
        const messages = loadBuffer(groupName);
        if (messages.length === 0) continue;
        ada = true;

        const success = await processSingleGroup(groupName, messages, label);
        if (!success) {
            retryQueue[groupName] = {
                messages: [...messages],
                attempts: 1,
                label,
                nextRetry: Date.now() + 2 * 60 * 1000
            };
            await telegram.sendMessage(TELEGRAM_CHAT_ID,
                `⚠️ Gagal rangkum *${groupName}*\nAkan dicoba ulang dalam 2 menit (percobaan 1/3)`,
                { parse_mode: 'Markdown' }
            );
        }
        await sleep(10000);
    }

    if (!ada) {
        await telegram.sendMessage(TELEGRAM_CHAT_ID, '📭 Tidak ada percakapan baru.');
    }
}

async function processRetryQueue() {
    const now = Date.now();
    const toRetry = Object.entries(retryQueue).filter(([, v]) => v.nextRetry <= now);
    if (toRetry.length === 0) return;

    for (const [groupName, item] of toRetry) {
        const success = await processSingleGroup(groupName, item.messages, item.label);
        if (success) {
            await telegram.sendMessage(TELEGRAM_CHAT_ID,
                `✅ Berhasil rangkum *${groupName}* setelah retry ke-${item.attempts}`,
                { parse_mode: 'Markdown' }
            );
        } else {
            item.attempts++;
            if (item.attempts > 3) {
                await telegram.sendMessage(TELEGRAM_CHAT_ID,
                    `❌ Gagal rangkum *${groupName}* setelah 3x percobaan.\nKetik /rangkumgrup untuk coba manual.`,
                    { parse_mode: 'Markdown' }
                );
                delete retryQueue[groupName];
            } else {
                item.nextRetry = Date.now() + 2 * 60 * 1000;
                await telegram.sendMessage(TELEGRAM_CHAT_ID,
                    `⚠️ Masih gagal *${groupName}*\nRetry dalam 2 menit (percobaan ${item.attempts}/3)`,
                    { parse_mode: 'Markdown' }
                );
            }
        }
        await sleep(10000);
    }
}

async function fetchMissedMessages() {
    const lastOnline = loadLastOnline();
    if (!lastOnline) return;
    const offlineDuration = Math.round((Date.now() - lastOnline.timestamp) / 60000);
    if (offlineDuration < 2) return;

    await telegram.sendMessage(TELEGRAM_CHAT_ID,
        `🔄 *Mengambil pesan terlewat...*\nOffline ~${offlineDuration} menit (sejak ${lastOnline.waktu})`,
        { parse_mode: 'Markdown' }
    );

    try {
        const chats = await waClient.getChats();
        const groups = chats.filter(c => c.isGroup);
        let totalFetched = 0;

        for (const group of groups) {
            try {
                const messages = await group.fetchMessages({ limit: 100 });
                const missed = messages.filter(m => m.timestamp * 1000 > lastOnline.timestamp && !m.fromMe);
                if (missed.length === 0) continue;

                const buffer = loadBuffer(group.name);
                const existingTexts = new Set(buffer);

                for (const msg of missed) {
                    const contact = await msg.getContact();
                    const sender = contact.pushname || contact.number;
                    const time = new Date(msg.timestamp * 1000).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });
                    const entry = msg.hasMedia
                        ? `[${time}] ${sender}: <mengirim foto/media>`
                        : `[${time}] ${sender}: ${msg.body}`;
                    if (!existingTexts.has(entry)) {
                        buffer.push(entry);
                        existingTexts.add(entry);
                        totalFetched++;
                    }
                }
                if (missed.length > 0) saveBuffer(group.name, buffer);
            } catch (err) {
                console.error(`Error fetch ${group.name}:`, err.message);
            }
        }

        await telegram.sendMessage(TELEGRAM_CHAT_ID,
            `✅ *Selesai ambil pesan terlewat*\nTotal: ${totalFetched} pesan dari ${groups.length} grup`,
            { parse_mode: 'Markdown' }
        );
    } catch (err) {
        console.error('Error fetch missed:', err);
    }
}

async function updateAllMasterSummaries() {
    const groups = getAllGroups();
    await telegram.sendMessage(TELEGRAM_CHAT_ID, '🔄 Memperbarui master summary semua grup...');

    for (const sanitized of groups) {
        const groupName = getOriginalGroupName(sanitized);
        const master = loadMaster(groupName);
        const history7 = loadHistory7Days(groupName);
        if (!history7) continue;

        try {
            const prompt = `Update master summary grup ${groupName}.
Master saat ini: ${master.ringkasan}
7 hari terakhir: ${history7}
Buat master summary baru max 200 kata, Bahasa Indonesia.`;

            const newMaster = await callGroq(prompt, 400);
            saveMaster(groupName, {
                grup: groupName,
                terakhir_update: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
                ringkasan: newMaster
            });
            await sleep(10000);
        } catch (err) {
            console.error(`Error master ${groupName}:`, err);
        }
    }

    await telegram.sendMessage(TELEGRAM_CHAT_ID, '✅ Master summary semua grup diperbarui.');
}

function scheduleDaily() {
    setInterval(() => {
        const wib = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
        const h = wib.getHours(), m = wib.getMinutes(), d = wib.getDay();
        if (h === 7 && m === 0) summarizeAll('Pagi — aktivitas malam 17.00-07.00 WIB');
        if (h === 17 && m === 0) summarizeAll('Sore — aktivitas siang 07.00-17.00 WIB');
        if (d === 1 && h === 0 && m === 0) updateAllMasterSummaries();
        saveLastOnline();
    }, 60 * 1000);

    setInterval(async () => { await processRetryQueue(); }, 30 * 1000);
    setInterval(() => { resetTokenIfNeeded(); }, 30 * 1000);
}

// ===== SEND HELPERS =====

async function sendMarkdown(text) {
    const maxLen = 4000;
    if (text.length <= maxLen) {
        try { await telegram.sendMessage(TELEGRAM_CHAT_ID, text, { parse_mode: 'Markdown' }); }
        catch { await telegram.sendMessage(TELEGRAM_CHAT_ID, text); }
        return;
    }
    const parts = [];
    let current = '';
    for (const line of text.split('\n')) {
        if ((current + '\n' + line).length > maxLen) { parts.push(current); current = line; }
        else { current += (current ? '\n' : '') + line; }
    }
    if (current) parts.push(current);
    for (const part of parts) {
        try { await telegram.sendMessage(TELEGRAM_CHAT_ID, part, { parse_mode: 'Markdown' }); }
        catch { await telegram.sendMessage(TELEGRAM_CHAT_ID, part); }
    }
}

async function sendPlain(text) {
    const maxLen = 4000;
    if (text.length <= maxLen) { await telegram.sendMessage(TELEGRAM_CHAT_ID, text); return; }
    const parts = [];
    let current = '';
    for (const line of text.split('\n')) {
        if ((current + '\n' + line).length > maxLen) { parts.push(current); current = line; }
        else { current += (current ? '\n' : '') + line; }
    }
    if (current) parts.push(current);
    for (const part of parts) await telegram.sendMessage(TELEGRAM_CHAT_ID, part);
}

async function sendGroupPicker(action, page = 0, label = '', filterHasMessages = false) {
    const result = buildGroupKeyboard(action, page, filterHasMessages);
    if (!result) {
        await telegram.sendMessage(TELEGRAM_CHAT_ID,
            filterHasMessages ? '📭 Tidak ada grup dengan pesan baru.' : '📭 Belum ada grup terpantau.'
        );
        return;
    }
    const { inline_keyboard, groups, totalPages } = result;
    const total = filterHasMessages
        ? groups.filter(g => loadBuffer(g).length > 0).length
        : groups.length;

    await telegram.sendMessage(TELEGRAM_CHAT_ID,
        `${label}\nTotal: ${total} grup | Halaman ${page + 1}/${totalPages}`,
        { reply_markup: { inline_keyboard } }
    );
}

// ===== MENU =====

const MENU_TEXT =
    '📌 *Daftar Perintah Summary Bot*\n\n' +
    '*📋 Rangkuman:*\n' +
    '/rangkum — Rangkum semua grup sekarang\n' +
    '/rangkumgrup — Pilih grup untuk dirangkum\n' +
    '/status — Status perekaman & pesan per grup\n' +
    '/daftargrup — Daftar semua grup dipantau\n' +
    '/stop — Stop perekaman\n' +
    '/mulai — Mulai perekaman\n\n' +
    '*🧠 Konteks & Memory:*\n' +
    '/master — Pilih grup lihat master summary\n' +
    '/weekly — Pilih grup lihat digest minggu ini\n' +
    '/history — Pilih grup lihat 7 rangkuman terakhir\n' +
    '/hapushistory — Pilih grup hapus history\n' +
    '/hapusmaster — Pilih grup reset master & weekly\n\n' +
    '*🔧 Perbaikan:*\n' +
    '/restart — Restart bot\n' +
    '/clearsesi — Hapus sesi & scan QR ulang\n' +
    '/reconnect — Paksa reconnect WhatsApp\n' +
    '/cekram — Cek kondisi RAM & Swap VPS\n' +
    '/retryqueue — Lihat antrian retry saat ini\n\n' +
    '*📊 Log & Monitor:*\n' +
    '/log — Lihat 20 log terakhir\n' +
    '/logerror — Lihat error terakhir\n' +
    '/clearlog — Bersihkan log\n' +
    '/pesanterakhir — Lihat 5 pesan terakhir per grup\n\n' +
    '*ℹ️ Umum:*\n' +
    '/menu — Tampilkan daftar perintah ini';

// ===== TELEGRAM & WHATSAPP =====

const telegram = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const waClient = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        protocolTimeout: 60000
    }
});

// ===== WHATSAPP EVENTS =====

waClient.on('qr', async (qr) => {
    qrcode.generate(qr, { small: true });
    try {
        const qrBuffer = await QRCode.toBuffer(qr);
        await telegram.sendPhoto(TELEGRAM_CHAT_ID, qrBuffer, {
            caption: '📱 *QR Code Baru!*\n\nCara scan:\n1. Buka WhatsApp\n2. Tap titik tiga (⋮)\n3. Linked Devices\n4. Link a Device\n5. Scan gambar ini\n\n⚠️ Expired dalam 20 detik.',
            parse_mode: 'Markdown'
        });
    } catch (err) { console.error('Gagal kirim QR:', err); }
});

waClient.on('ready', async () => {
    console.log('WhatsApp Bot siap!');
    saveLastOnline();
    await telegram.sendMessage(TELEGRAM_CHAT_ID,
        '✅ *Summary Bot Aktif*\n\nJadwal rangkuman otomatis:\n• 07.00 WIB — aktivitas malam\n• 17.00 WIB — aktivitas siang\n\nKetik /menu untuk daftar perintah.',
        { parse_mode: 'Markdown' }
    );
    setTimeout(async () => { await fetchMissedMessages(); }, 5000);
});

waClient.on('disconnected', async (reason) => {
    console.log('WhatsApp terputus:', reason);
    saveLastOnline();
    await telegram.sendMessage(TELEGRAM_CHAT_ID,
        `⚠️ *WhatsApp Terputus*\n\nAlasan: ${reason}\nMencoba reconnect...`,
        { parse_mode: 'Markdown' }
    );
    try { await waClient.initialize(); }
    catch { await telegram.sendMessage(TELEGRAM_CHAT_ID, '❌ *Gagal Reconnect*\n\nQR code akan dikirim.', { parse_mode: 'Markdown' }); }
});

waClient.on('authenticated', () => {
    console.log('WhatsApp authenticated');
    telegram.sendMessage(TELEGRAM_CHAT_ID, '✅ *WhatsApp tersambung kembali!*', { parse_mode: 'Markdown' });
});

process.on('SIGINT', async () => {
    saveLastOnline();
    await telegram.sendMessage(TELEGRAM_CHAT_ID, '⛔ *Summary Bot Nonaktif*', { parse_mode: 'Markdown' });
    process.exit(0);
});

process.on('SIGTERM', async () => {
    saveLastOnline();
    await telegram.sendMessage(TELEGRAM_CHAT_ID, '⛔ *Summary Bot Nonaktif*', { parse_mode: 'Markdown' });
    process.exit(0);
});

waClient.on('message_create', async (msg) => {
    if (!isRecording) return;
    const chatId = msg.fromMe ? msg.to : msg.from;
    if (!chatId.includes('@g.us')) return;

    const chat = await msg.getChat();
    const contact = await msg.getContact();
    const groupName = chat.name;
    const sender = contact.pushname || contact.number;
    const time = new Date(msg.timestamp * 1000).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });

    const messages = loadBuffer(groupName);
    messages.push(msg.hasMedia
        ? `[${time}] ${sender}: <mengirim foto/media>`
        : `[${time}] ${sender}: ${msg.body}`
    );
    saveBuffer(groupName, messages);

    const master = loadMaster(groupName);
    if (master.grup !== groupName) saveMaster(groupName, { ...master, grup: groupName });
});

// ===== CALLBACK QUERY (Inline Keyboard) =====

telegram.on('callback_query', async (query) => {
    const data = query.data;
    const msgId = query.message.message_id;
    await telegram.answerCallbackQuery(query.id);

    if (data === 'cancel') {
        await telegram.editMessageText('❌ Dibatalkan.', { chat_id: TELEGRAM_CHAT_ID, message_id: msgId });
        return;
    }

    if (data === 'noop') return;

    if (data.startsWith('page:')) {
        const [, action, pageStr] = data.split(':');
        const page = parseInt(pageStr);
        const filterHasMessages = action === 'rangkumgrup';
        const result = buildGroupKeyboard(action, page, filterHasMessages);
        if (!result) return;
        const total = filterHasMessages
            ? result.groups.filter(g => loadBuffer(g).length > 0).length
            : result.groups.length;
        await telegram.editMessageText(
            `Pilih grup:\nTotal: ${total} grup | Halaman ${page + 1}/${result.totalPages}`,
            { chat_id: TELEGRAM_CHAT_ID, message_id: msgId, reply_markup: { inline_keyboard: result.inline_keyboard } }
        );
        return;
    }

    if (data.startsWith('eksekusi_hapushistory:')) {
        const sanitized = data.replace('eksekusi_hapushistory:', '');
        const groupName = getOriginalGroupName(sanitized);
        const dir = path.join(DATA_DIR, sanitized, 'history');
        try {
            if (fs.existsSync(dir)) fs.readdirSync(dir).forEach(f => fs.unlinkSync(path.join(dir, f)));
            await telegram.editMessageText(`✅ History grup *${groupName}* berhasil dihapus.`, {
                chat_id: TELEGRAM_CHAT_ID, message_id: msgId, parse_mode: 'Markdown'
            });
        } catch (err) {
            await telegram.editMessageText(`❌ Gagal hapus: ${err.message}`, { chat_id: TELEGRAM_CHAT_ID, message_id: msgId });
        }
        return;
    }

    if (data.startsWith('eksekusi_hapusmaster:')) {
        const sanitized = data.replace('eksekusi_hapusmaster:', '');
        const groupName = getOriginalGroupName(sanitized);
        saveMaster(groupName, { grup: groupName, terakhir_update: '-', ringkasan: 'Belum ada data.' });
        saveWeekly(groupName, { minggu: '-', ringkasan: 'Belum ada data minggu ini.' });
        await telegram.editMessageText(`✅ Master & weekly grup *${groupName}* direset.`, {
            chat_id: TELEGRAM_CHAT_ID, message_id: msgId, parse_mode: 'Markdown'
        });
        return;
    }

    const colonIdx = data.indexOf(':');
    if (colonIdx === -1) return;
    const action = data.substring(0, colonIdx);
    const sanitized = data.substring(colonIdx + 1);
    const groupName = getOriginalGroupName(sanitized);

    if (action === 'master') {
        await telegram.editMessageText('⏳ Mengambil master summary...', { chat_id: TELEGRAM_CHAT_ID, message_id: msgId });
        const master = loadMaster(groupName);
        await sendPlain(`📌 Master Summary: ${groupName}\n\nTerakhir update: ${master.terakhir_update}\n\n${master.ringkasan}`);
        await telegram.deleteMessage(TELEGRAM_CHAT_ID, msgId);
        return;
    }

    if (action === 'weekly') {
        await telegram.editMessageText('⏳ Mengambil weekly digest...', { chat_id: TELEGRAM_CHAT_ID, message_id: msgId });
        const weekly = loadWeekly(groupName);
        await sendPlain(`📅 Weekly Digest: ${groupName}\n\nMinggu: ${weekly.minggu}\n\n${weekly.ringkasan}`);
        await telegram.deleteMessage(TELEGRAM_CHAT_ID, msgId);
        return;
    }

    if (action === 'history') {
        await telegram.editMessageText('⏳ Mengambil history...', { chat_id: TELEGRAM_CHAT_ID, message_id: msgId });
        const history = loadHistory7Days(groupName);
        if (!history) {
            await telegram.editMessageText(`📭 Belum ada history untuk grup ${groupName}`, { chat_id: TELEGRAM_CHAT_ID, message_id: msgId });
            return;
        }
        await sendPlain(`📂 History 7 Hari: ${groupName}\n\n${history}`);
        await telegram.deleteMessage(TELEGRAM_CHAT_ID, msgId);
        return;
    }

    if (action === 'rangkumgrup') {
        const messages = loadBuffer(groupName);
        if (messages.length === 0) {
            await telegram.editMessageText(`📭 Tidak ada pesan baru dari grup *${groupName}*`, {
                chat_id: TELEGRAM_CHAT_ID, message_id: msgId, parse_mode: 'Markdown'
            });
            return;
        }
        await telegram.editMessageText(`⏳ Merangkum grup *${groupName}*...`, {
            chat_id: TELEGRAM_CHAT_ID, message_id: msgId, parse_mode: 'Markdown'
        });
        const success = await processSingleGroup(groupName, messages);
        if (!success) {
            retryQueue[groupName] = { messages: [...messages], attempts: 1, label: '', nextRetry: Date.now() + 2 * 60 * 1000 };
            await telegram.sendMessage(TELEGRAM_CHAT_ID,
                `⚠️ Gagal rangkum *${groupName}*\nAkan dicoba ulang otomatis dalam 2 menit (percobaan 1/3)`,
                { parse_mode: 'Markdown' }
            );
        }
        return;
    }

    if (action === 'hapushistory') {
        await telegram.editMessageText(`⚠️ Yakin hapus SEMUA history grup:\n*${groupName}*?`, {
            chat_id: TELEGRAM_CHAT_ID, message_id: msgId, parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[
                { text: '✅ Ya, Hapus', callback_data: `eksekusi_hapushistory:${sanitized}` },
                { text: '❌ Batal', callback_data: 'cancel' }
            ]]}
        });
        return;
    }

    if (action === 'hapusmaster') {
        await telegram.editMessageText(`⚠️ Yakin reset master & weekly grup:\n*${groupName}*?`, {
            chat_id: TELEGRAM_CHAT_ID, message_id: msgId, parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[
                { text: '✅ Ya, Reset', callback_data: `eksekusi_hapusmaster:${sanitized}` },
                { text: '❌ Batal', callback_data: 'cancel' }
            ]]}
        });
        return;
    }
});

// ===== PERINTAH TELEGRAM =====

telegram.onText(/\/menu/, async (msg) => {
    await telegram.sendMessage(TELEGRAM_CHAT_ID, MENU_TEXT, { parse_mode: 'Markdown' });
});

telegram.onText(/\/rangkum$/, async (msg) => {
    await telegram.sendMessage(TELEGRAM_CHAT_ID, '⏳ Merangkum semua grup...');
    await summarizeAll();
});

telegram.onText(/\/rangkumgrup/, async (msg) => {
    await sendGroupPicker('rangkumgrup', 0, '📋 Pilih grup yang akan dirangkum:', true);
});

telegram.onText(/\/master$/, async (msg) => {
    await sendGroupPicker('master', 0, '📌 Pilih grup untuk lihat master summary:');
});

telegram.onText(/\/weekly$/, async (msg) => {
    await sendGroupPicker('weekly', 0, '📅 Pilih grup untuk lihat weekly digest:');
});

telegram.onText(/\/history$/, async (msg) => {
    await sendGroupPicker('history', 0, '📂 Pilih grup untuk lihat history 7 hari:');
});

telegram.onText(/\/hapushistory$/, async (msg) => {
    await sendGroupPicker('hapushistory', 0, '🗑 Pilih grup yang historynya akan dihapus:');
});

telegram.onText(/\/hapusmaster$/, async (msg) => {
    await sendGroupPicker('hapusmaster', 0, '⚠️ Pilih grup yang master summarynya akan direset:');
});

telegram.onText(/\/status/, async (msg) => {
    const groups = getAllGroups();
    let text = '📊 *Status Perekaman*\n\n';
    text += `Mode: ${isRecording ? '✅ Aktif' : '⛔ Stop'}\n`;
    text += `Jadwal: 07.00 & 17.00 WIB\n`;
    text += `Retry queue: ${Object.keys(retryQueue).length} grup\n\n`;
    text += '*Pesan belum dirangkum:*\n';
    let ada = false;
    for (const s of groups) {
        const g = getOriginalGroupName(s);
        const m = loadBuffer(g);
        if (m.length > 0) { text += `- ${g}: ${m.length} pesan\n`; ada = true; }
    }
    if (!ada) text += '- Belum ada pesan terekam';
    await telegram.sendMessage(TELEGRAM_CHAT_ID, text, { parse_mode: 'Markdown' });
});

telegram.onText(/\/daftargrup/, async (msg) => {
    const groups = getAllGroups();
    if (groups.length === 0) { await telegram.sendMessage(TELEGRAM_CHAT_ID, '📭 Belum ada grup terpantau.'); return; }
    let text = `Daftar Grup Dipantau (${groups.length} grup):\n\n`;
    groups.forEach((s, i) => {
        const n = getOriginalGroupName(s);
        text += `${i + 1}. ${n} (${loadBuffer(n).length} pesan)\n`;
    });
    await sendPlain(text);
});

telegram.onText(/\/stop/, async (msg) => {
    isRecording = false;
    await telegram.sendMessage(TELEGRAM_CHAT_ID, '⛔ Perekaman dihentikan. Ketik /mulai untuk melanjutkan.');
});

telegram.onText(/\/mulai/, async (msg) => {
    isRecording = true;
    await telegram.sendMessage(TELEGRAM_CHAT_ID, '✅ Perekaman dilanjutkan.');
});

telegram.onText(/\/pesanterakhir/, async (msg) => {
    const groups = getAllGroups();
    let ada = false;
    for (const s of groups) {
        const g = getOriginalGroupName(s);
        const m = loadBuffer(g);
        if (m.length === 0) continue;
        ada = true;
        const last5 = m.slice(-5);
        let text = `📨 ${g}\n(5 pesan terakhir)\n\n`;
        last5.forEach(p => { text += `${p}\n`; });
        await sendPlain(text);
    }
    if (!ada) await telegram.sendMessage(TELEGRAM_CHAT_ID, '📭 Belum ada pesan terekam.');
});

telegram.onText(/\/retryqueue/, async (msg) => {
    const keys = Object.keys(retryQueue);
    if (keys.length === 0) { await telegram.sendMessage(TELEGRAM_CHAT_ID, '✅ Tidak ada grup dalam antrian retry.'); return; }
    let text = `🔄 *Antrian Retry (${keys.length} grup):*\n\n`;
    keys.forEach(name => {
        const item = retryQueue[name];
        const nextIn = Math.round((item.nextRetry - Date.now()) / 1000);
        text += `- ${name}: percobaan ${item.attempts}/3, retry dalam ${nextIn}s\n`;
    });
    await telegram.sendMessage(TELEGRAM_CHAT_ID, text, { parse_mode: 'Markdown' });
});

telegram.onText(/\/restart/, async (msg) => {
    await telegram.sendMessage(TELEGRAM_CHAT_ID, '🔄 Merestart bot...');
    saveLastOnline();
    setTimeout(() => { process.exit(0); }, 1000);
});

telegram.onText(/\/clearsesi/, async (msg) => {
    await telegram.sendMessage(TELEGRAM_CHAT_ID, '🗑 Menghapus sesi lama...');
    saveLastOnline();
    setTimeout(() => {
        try { execSync('rm -rf .wwebjs_auth'); } catch (e) { }
        process.exit(0);
    }, 1000);
});

telegram.onText(/\/reconnect/, async (msg) => {
    await telegram.sendMessage(TELEGRAM_CHAT_ID, '🔄 Mencoba reconnect WhatsApp...');
    try { await waClient.destroy(); await waClient.initialize(); }
    catch { await telegram.sendMessage(TELEGRAM_CHAT_ID, '❌ Gagal reconnect. Coba /clearsesi.'); }
});

telegram.onText(/\/cekram/, async (msg) => {
    try {
        const lines = execSync('free -h').toString().split('\n');
        const m = lines[1].split(/\s+/);
        const s = lines[2].split(/\s+/);
        await telegram.sendMessage(TELEGRAM_CHAT_ID,
            `💾 Status Resource VPS\n\nRAM:\nTotal: ${m[1]}\nTerpakai: ${m[2]}\nTersedia: ${m[6]}\n\nSwap:\nTotal: ${s[1]}\nTerpakai: ${s[2]}\nTersedia: ${s[3]}\n\nBot Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
        );
    } catch (err) { await telegram.sendMessage(TELEGRAM_CHAT_ID, `❌ Gagal cek RAM: ${err.message}`); }
});

telegram.onText(/\/log/, async (msg) => {
    try {
        const log = execSync('tail -n 20 ~/.pm2/logs/summary-bot-out.log').toString();
        await sendPlain('📋 20 Log Terakhir:\n\n' + (log.trim() || 'Kosong'));
    } catch (err) { await telegram.sendMessage(TELEGRAM_CHAT_ID, `❌ Gagal ambil log: ${err.message}`); }
});

telegram.onText(/\/logerror/, async (msg) => {
    try {
        const log = execSync('tail -n 20 ~/.pm2/logs/summary-bot-error.log').toString();
        await sendPlain('🚨 20 Error Terakhir:\n\n' + (log.trim() || '✅ Tidak ada error.'));
    } catch (err) { await telegram.sendMessage(TELEGRAM_CHAT_ID, `❌ Gagal ambil log: ${err.message}`); }
});

telegram.onText(/\/clearlog/, async (msg) => {
    try {
        execSync('pm2 flush summary-bot');
        await telegram.sendMessage(TELEGRAM_CHAT_ID, '✅ Log berhasil dibersihkan.');
    } catch (err) { await telegram.sendMessage(TELEGRAM_CHAT_ID, `❌ Gagal bersihkan log: ${err.message}`); }
});

// ===== KEEP-ALIVE =====
setInterval(async () => {
    try {
        const memLine = execSync('free').toString().split('\n')[1].split(/\s+/);
        const pct = Math.round((parseInt(memLine[2]) / parseInt(memLine[1])) * 100);
        console.log(`RAM: ${pct}% | Token: ${tokenUsedThisMinute}/${SAFE_TPM}`);
        if (pct > 80) {
            await telegram.sendMessage(TELEGRAM_CHAT_ID,
                `⚠️ *Peringatan RAM*\n\nRAM terpakai: ${pct}%\nKetik /cekram untuk detail.`,
                { parse_mode: 'Markdown' }
            );
        }
    } catch (err) { console.log('Keep-alive error:', err.message); }
}, 10 * 60 * 1000);

// ===== START =====
scheduleDaily();
waClient.initialize();
