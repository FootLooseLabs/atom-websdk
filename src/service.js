/**
 * Muffin.Service — base class for all web services.
 * Provides per-class TTL cache, interface locking, and subscription locking.
 * Extend this class rather than writing service logic directly in components.
 */
class Service {
    static name = null;

    // ─── Cache ────────────────────────────────────────────────────────────────

    static _cache = new Map();
    static _defaultTTL = 60 * 1000; // 1 min
    static _cacheCleanerInterval = null;

    static _startCacheCleaner() {
        if (this._cacheCleanerInterval) return;
        this._cacheCleanerInterval = setInterval(() => {
            const now = Date.now();
            for (const [key, { expiry }] of this._cache.entries()) {
                if (expiry < now) this._cache.delete(key);
            }
        }, 30 * 1000);
    }

    static getCached(key) {
        const entry = this._cache.get(key);
        if (!entry) return null;
        if (entry.expiry < Date.now()) { this._cache.delete(key); return null; }
        return entry.value;
    }

    static setCached(key, value, ttl = this._defaultTTL) {
        this._cache.set(key, { value, expiry: Date.now() + ttl });
        this._startCacheCleaner();
    }

    static clearCache(key) {
        if (key) this._cache.delete(key);
        else this._cache.clear();
    }

    // ─── Interface locking ────────────────────────────────────────────────────

    static lockedInterfaces = [];

    static async lockInterface(interfaceName, throttle = 500) {
        while (this.lockedInterfaces.includes(interfaceName)) {
            await new Promise(r => setTimeout(r, throttle));
        }
        this.lockedInterfaces.push(interfaceName);
    }

    static unlockInterface(interfaceName) {
        const idx = this.lockedInterfaces.indexOf(interfaceName);
        if (idx > -1) this.lockedInterfaces.splice(idx, 1);
    }

    // ─── Subscription locking ─────────────────────────────────────────────────

    static lockedSubscriptions = [];

    static async lockSubscription(subscriptionInterface, throttle = 200) {
        while (this.lockedSubscriptions.includes(subscriptionInterface)) {
            await new Promise(r => setTimeout(r, throttle));
        }
        this.lockedSubscriptions.push(subscriptionInterface);
    }

    static unlockSubscription(subscriptionInterface) {
        const idx = this.lockedSubscriptions.indexOf(subscriptionInterface);
        if (idx > -1) this.lockedSubscriptions.splice(idx, 1);
    }

    // ─── Instance ─────────────────────────────────────────────────────────────

    constructor() {
        if (this.constructor.name && window.Muffin?.PostOffice) {
            this.interface = window.Muffin.PostOffice.getOrCreateInterface(this.constructor.name);
        }
    }
}

export { Service };
