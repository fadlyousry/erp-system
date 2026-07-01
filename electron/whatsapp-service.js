/**
 * WhatsApp Web.js Service
 * 
 * Uses whatsapp-web.js to connect to WhatsApp via QR code scanning.
 * Supports sending text messages and images (invoices).
 * Session is persisted locally so QR scanning is only needed once.
 */

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

// ─── Defaults ───────────────────────────────────────────
const DEFAULT_COUNTRY_CODE = '20'; // Egypt
const RATE_LIMIT_DELAY_MS = 4000;  // Base: 4 seconds between messages

// ─── Anti-Ban Configuration ─────────────────────────────
const ANTI_BAN = {
    // Typing simulation: min/max milliseconds to "type" before sending
    TYPING_MIN_MS: 2000,
    TYPING_MAX_MS: 5000,
    // Random delay between bulk messages (added on top of RATE_LIMIT_DELAY_MS)
    RANDOM_EXTRA_DELAY_MIN_MS: 1000,
    RANDOM_EXTRA_DELAY_MAX_MS: 6000,
    // After every N messages, take a longer pause
    LONG_PAUSE_EVERY_N: 8,
    LONG_PAUSE_MIN_MS: 15000,  // 15 seconds
    LONG_PAUSE_MAX_MS: 35000,  // 35 seconds
    // "seen" / read simulation delay
    READ_DELAY_MIN_MS: 500,
    READ_DELAY_MAX_MS: 1500,
};

// ─── Phone Number Normaliser ────────────────────────────
function normalizePhoneNumber(phone, countryCode = DEFAULT_COUNTRY_CODE) {
    if (!phone) return null;
    let cleaned = String(phone).replace(/\D/g, '');
    if (!cleaned) return null;
    if (cleaned.startsWith(countryCode) && cleaned.length >= 11) return cleaned;
    if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
    return countryCode + cleaned;
}

function phoneToWhatsAppId(phone, countryCode = DEFAULT_COUNTRY_CODE) {
    const normalized = normalizePhoneNumber(phone, countryCode);
    if (!normalized) return null;
    return normalized + '@c.us';
}

// ─── Template Message Builder ───────────────────────────
function buildCustomerMessage(customer, messageTemplate) {
    const balance = typeof customer.balance === 'number'
        ? customer.balance.toFixed(2)
        : String(customer.balance || 0);

    let lastPayment = 'لا يوجد';
    if (customer.lastPaymentDate) {
        try {
            const d = new Date(customer.lastPaymentDate);
            if (!isNaN(d.getTime())) {
                lastPayment = d.toLocaleDateString('ar-EG', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            }
        } catch {
            lastPayment = 'غير محدد';
        }
    }

    return messageTemplate
        .replace(/\{اسم_العميل\}/g, customer.name || '')
        .replace(/\{المبلغ\}/g, balance)
        .replace(/\{تاريخ_آخر_دفعة\}/g, lastPayment);
}

// ─── Sleep Utility ──────────────────────────────────────
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Random Int in Range ────────────────────────────────
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Random Delay ───────────────────────────────────────
function randomDelay(minMs, maxMs) {
    return sleep(randomInt(minMs, maxMs));
}

// ─── Add invisible variation to message (anti-pattern detection) ─
function addMessageVariation(text) {
    if (!text) return text;
    // Add a zero-width space at a random position to make each message unique
    // This prevents WhatsApp from detecting identical bulk messages
    const chars = ['\u200B', '\u200C', '\u200D', '\uFEFF'];
    const char = chars[Math.floor(Math.random() * chars.length)];
    const pos = randomInt(1, Math.max(1, text.length - 1));
    return text.slice(0, pos) + char + text.slice(pos);
}

// ─── WhatsApp Service Class ─────────────────────────────
class WhatsAppService {
    constructor() {
        this.client = null;
        this.status = 'disconnected'; // disconnected | connecting | qr_pending | connected
        this.qrDataUrl = null;
        this._eventHandlers = {};
        this._initPromise = null;
    }

    on(event, handler) {
        if (!this._eventHandlers[event]) {
            this._eventHandlers[event] = [];
        }
        this._eventHandlers[event].push(handler);
    }

    _emit(event, ...args) {
        const handlers = this._eventHandlers[event];
        if (handlers) {
            handlers.forEach(h => {
                try { h(...args); } catch (err) {
                    console.error(`[WhatsApp] Event handler error (${event}):`, err);
                }
            });
        }
    }

    async initialize(sessionPath) {
        // Prevent double initialization
        if (this._initPromise) {
            return this._initPromise;
        }

        if (this.status === 'connected') {
            return { success: true, status: 'already_connected' };
        }

        this._initPromise = this._doInitialize(sessionPath);
        try {
            return await this._initPromise;
        } finally {
            this._initPromise = null;
        }
    }

    async _doInitialize(sessionPath) {
        // Destroy previous client if exists
        if (this.client) {
            try { await this.client.destroy(); } catch { /* ignore */ }
            this.client = null;
        }

        this.status = 'connecting';
        this._emit('status', this.getStatus());

        return new Promise((resolve, reject) => {
            try {
                this.client = new Client({
                    authStrategy: new LocalAuth({
                        dataPath: sessionPath
                    }),
                    puppeteer: {
                        headless: true,
                        args: [
                            '--no-sandbox',
                            '--disable-setuid-sandbox',
                            '--disable-dev-shm-usage',
                            '--disable-gpu',
                            '--no-first-run'
                        ]
                    }
                });

                let resolved = false;

                this.client.on('qr', async (qr) => {
                    console.log('[WhatsApp] QR code received');
                    this.status = 'qr_pending';
                    try {
                        this.qrDataUrl = await QRCode.toDataURL(qr, {
                            width: 280,
                            margin: 2,
                            color: { dark: '#1e293b', light: '#ffffff' }
                        });
                    } catch {
                        this.qrDataUrl = null;
                    }
                    this._emit('qr', this.qrDataUrl);
                    this._emit('status', this.getStatus());
                });

                this.client.on('ready', () => {
                    console.log('[WhatsApp] ✓ Client is ready');
                    this.status = 'connected';
                    this.qrDataUrl = null;
                    this._emit('ready');
                    this._emit('status', this.getStatus());
                    if (!resolved) {
                        resolved = true;
                        resolve({ success: true, status: 'connected' });
                    }
                });

                this.client.on('authenticated', () => {
                    console.log('[WhatsApp] ✓ Authenticated');
                });

                this.client.on('auth_failure', (msg) => {
                    console.error('[WhatsApp] ✗ Auth failure:', msg);
                    this.status = 'disconnected';
                    this.qrDataUrl = null;
                    this._emit('auth_failure', msg);
                    this._emit('status', this.getStatus());
                    if (!resolved) {
                        resolved = true;
                        resolve({ success: false, error: 'فشل المصادقة: ' + msg });
                    }
                });

                this.client.on('disconnected', (reason) => {
                    console.log('[WhatsApp] Disconnected:', reason);
                    this.status = 'disconnected';
                    this.qrDataUrl = null;
                    this.client = null;
                    this._emit('disconnected', reason);
                    this._emit('status', this.getStatus());
                });

                // Start initialization (don't await - events will fire)
                this.client.initialize().catch((err) => {
                    console.error('[WhatsApp] Initialize error:', err);
                    this.status = 'disconnected';
                    this._emit('status', this.getStatus());
                    if (!resolved) {
                        resolved = true;
                        resolve({ success: false, error: err.message });
                    }
                });

                // If QR is received, resolve so UI can show it
                // We use a timeout to wait for either QR or ready
                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        // If we're in qr_pending or connecting, that's fine
                        resolve({ success: true, status: this.status });
                    }
                }, 15000);

            } catch (error) {
                console.error('[WhatsApp] Constructor error:', error);
                this.status = 'disconnected';
                reject(error);
            }
        });
    }

    async sendTextMessage(phone, text, { simulateTyping = true } = {}) {
        if (!this.client || this.status !== 'connected') {
            return { success: false, error: 'واتساب غير متصل. يرجى مسح QR Code أولاً.' };
        }

        const chatId = phoneToWhatsAppId(phone);
        if (!chatId) {
            return { success: false, error: 'رقم هاتف غير صالح.' };
        }

        try {
            const isRegistered = await this.client.isRegisteredUser(chatId);
            if (!isRegistered) {
                return { success: false, error: 'هذا الرقم غير مسجل في واتساب.' };
            }

            // ── Anti-Ban: Simulate human behavior ──
            if (simulateTyping) {
                try {
                    const chat = await this.client.getChatById(chatId);
                    
                    // 1. Simulate "seen" (mark as read)
                    await randomDelay(ANTI_BAN.READ_DELAY_MIN_MS, ANTI_BAN.READ_DELAY_MAX_MS);
                    
                    // 2. Simulate typing indicator
                    await chat.sendStateTyping();
                    await randomDelay(ANTI_BAN.TYPING_MIN_MS, ANTI_BAN.TYPING_MAX_MS);
                    await chat.clearState();
                } catch (typingErr) {
                    // If typing simulation fails, continue sending anyway
                    console.warn('[WhatsApp] Typing simulation failed (non-critical):', typingErr.message);
                }
            }

            // 3. Add invisible variation to prevent duplicate detection
            const variedText = addMessageVariation(text);

            await this.client.sendMessage(chatId, variedText);
            return { success: true };
        } catch (error) {
            console.error('[WhatsApp] Send text error:', error);
            return { success: false, error: error.message };
        }
    }

    async sendImageMessage(phone, base64Image, caption = '') {
        if (!this.client || this.status !== 'connected') {
            return { success: false, error: 'واتساب غير متصل.' };
        }

        const chatId = phoneToWhatsAppId(phone);
        if (!chatId) {
            return { success: false, error: 'رقم هاتف غير صالح.' };
        }

        try {
            const isRegistered = await this.client.isRegisteredUser(chatId);
            if (!isRegistered) {
                return { success: false, error: 'هذا الرقم غير مسجل في واتساب.' };
            }

            // ── Anti-Ban: Simulate typing before sending image ──
            try {
                const chat = await this.client.getChatById(chatId);
                await randomDelay(ANTI_BAN.READ_DELAY_MIN_MS, ANTI_BAN.READ_DELAY_MAX_MS);
                await chat.sendStateRecording(); // Show "recording" for media
                await randomDelay(ANTI_BAN.TYPING_MIN_MS, ANTI_BAN.TYPING_MAX_MS);
                await chat.clearState();
            } catch (typingErr) {
                console.warn('[WhatsApp] Typing simulation failed (non-critical):', typingErr.message);
            }

            const media = new MessageMedia('image/png', base64Image, 'invoice.png');
            const variedCaption = caption ? addMessageVariation(caption) : '';
            await this.client.sendMessage(chatId, media, { caption: variedCaption });
            return { success: true };
        } catch (error) {
            console.error('[WhatsApp] Send image error:', error);
            return { success: false, error: error.message };
        }
    }

    async checkNumber(phone) {
        if (!this.client || this.status !== 'connected') {
            return { registered: false, error: 'واتساب غير متصل.' };
        }

        const chatId = phoneToWhatsAppId(phone);
        if (!chatId) {
            return { registered: false, error: 'رقم غير صالح.' };
        }

        try {
            const isRegistered = await this.client.isRegisteredUser(chatId);
            return { registered: isRegistered };
        } catch (error) {
            return { registered: false, error: error.message };
        }
    }

    getStatus() {
        return {
            status: this.status,
            isConnected: this.status === 'connected',
            qrDataUrl: this.qrDataUrl
        };
    }

    async disconnect() {
        try {
            if (this.client) {
                await this.client.logout();
                await this.client.destroy();
            }
        } catch (error) {
            console.error('[WhatsApp] Disconnect error:', error);
        }
        this.client = null;
        this.status = 'disconnected';
        this.qrDataUrl = null;
        this._emit('status', this.getStatus());
        this._emit('disconnected', 'manual');
    }

    async destroy() {
        try {
            if (this.client) {
                await this.client.destroy();
            }
        } catch (error) {
            console.error('[WhatsApp] Destroy error:', error);
        }
        this.client = null;
        this.status = 'disconnected';
        this.qrDataUrl = null;
    }

    async reset(sessionPath) {
        console.log('[WhatsApp] Resetting service...');
        await this.destroy();
        
        if (fs.existsSync(sessionPath)) {
            try {
                // Delete session directory to force new QR
                fs.rmSync(sessionPath, { recursive: true, force: true });
                console.log('[WhatsApp] Session directory cleared');
            } catch (err) {
                console.error('[WhatsApp] Failed to delete session folder:', err);
            }
        }
        
        return await this.initialize(sessionPath);
    }
}

// ─── Singleton Instance ─────────────────────────────────
let _instance = null;

function getWhatsAppService() {
    if (!_instance) {
        _instance = new WhatsAppService();
    }
    return _instance;
}

// ─── Exports ────────────────────────────────────────────
module.exports = {
    WhatsAppService,
    getWhatsAppService,
    normalizePhoneNumber,
    phoneToWhatsAppId,
    buildCustomerMessage,
    addMessageVariation,
    sleep,
    randomInt,
    randomDelay,
    RATE_LIMIT_DELAY_MS,
    DEFAULT_COUNTRY_CODE,
    ANTI_BAN
};
