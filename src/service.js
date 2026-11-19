/**
 * Muffin.Service — base class for web services (static classes: no instantiation needed).
 * Gives each service class its own TTL cache, and named locks shared by all services: one holder at a time per name,
 * the rest waiting in order. A lock is for not asking for the same thing twice at once — not for telling replies
 * apart: every request's reply is matched to it by the SDK (request_channel.js), whatever else is in flight.
 */

/** Named locks: a name's holders take turns in the order they asked. One table for every service. */
class Turns {
    constructor() {
        this._last = new Map();   // name → when the last one to ask for it is done
        this._holder = new Map(); // name → the current holder: { done, release }
    }
    async take(name) {
        const before = this._last.get(name) ?? Promise.resolve();
        let release;
        const done = before.then(() => new Promise(r => { release = r; }));
        this._last.set(name, done);
        await before;
        this._holder.set(name, { done, release });
    }
    give(name) {
        const holder = this._holder.get(name);
        if (!holder) return; // not held: nothing to give
        this._holder.delete(name);
        if (this._last.get(name) === holder.done) this._last.delete(name);
        holder.release();
    }
}

class Service {
    static name = null;

    // ─── Cache: each service class its own ────────────────────────────────────

    static _defaultTTL = 60 * 1000; // 1 min
    static _cacheCleanerInterval = null;

    static get _cache() {
        if (!Object.prototype.hasOwnProperty.call(this, "_ownCache")) {
            Object.defineProperty(this, "_ownCache", { value: new Map(), enumerable: false });
        }
        return this._ownCache;
    }

    static _startCacheCleaner() {
        if (Object.prototype.hasOwnProperty.call(this, "_cacheCleanerInterval") && this._cacheCleanerInterval) return;
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

    // ─── Locks: one holder per name, across all services ──────────────────────

    /** Wait until `interfaceName` is free, then hold it (until unlockInterface). The second argument is not used. */
    static async lockInterface(interfaceName) { await Service._interfaceTurns.take(interfaceName); }
    static unlockInterface(interfaceName) { Service._interfaceTurns.give(interfaceName); }

    /** Wait until `subscriptionInterface` is free, then hold it (until unlockSubscription). */
    static async lockSubscription(subscriptionInterface) { await Service._subscriptionTurns.take(subscriptionInterface); }
    static unlockSubscription(subscriptionInterface) { Service._subscriptionTurns.give(subscriptionInterface); }

    // ─── Instance ─────────────────────────────────────────────────────────────

    constructor() {
        const PostOffice = typeof window !== "undefined" ? window.Muffin?.PostOffice : undefined;
        if (this.constructor.name && PostOffice) {
            this.interface = PostOffice.getOrCreateInterface(this.constructor.name);
        }
    }
}

Service._interfaceTurns = new Turns();
Service._subscriptionTurns = new Turns();

export { Service };
