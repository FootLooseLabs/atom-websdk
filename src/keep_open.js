/**
 * Keeping a connection open — WebRequestSdk's `reconnect` option. Once connect() has been called, the connection is
 * opened again whenever it closes, until disconnect(): at once when the page is shown again or the device is back
 * online, else after a growing wait (`backoff`, in ms; the last repeats). While the device is offline it waits for it
 * to be online, and a socket the network took away is closed at once (no close comes over a network that is not
 * there). Each time it is open again its subscriptions are made again at the gateway, then `resumed` is dispatched —
 * for whatever waited on events to read what it missed.
 *
 * Browser only for the page and network signals (window, document, navigator); without them it still reopens after
 * each wait.
 */

export const BACKOFF = [1000, 2000, 4000, 8000, 16000, 30000];

export class KeepOpen {
    constructor(sdk, { backoff = BACKOFF } = {}) {
        if (!Array.isArray(backoff) || !backoff.length) throw new Error("Muffin.WebRequestSdk: reconnect.backoff must be a list of waits (ms)");
        this._sdk = sdk;
        this._backoff = backoff;
        this._kept = false;
        this._attempts = 0;
        this._timer = null;
        this._watching = false;
        this.everOpened = false;
    }

    /** connect() was called: kept open from now on. */
    start() {
        this._kept = true;
        this._watch();
    }

    /** disconnect(): not opened again until connect(). */
    stop() {
        this._kept = false;
        this._clear();
    }

    get kept() { return this._kept; }

    /** Open: the waits start over; when it was open before, its subscriptions are made again and `resumed` is said. */
    async opened() {
        this._attempts = 0;
        this._clear();
        const again = this.everOpened;
        this.everOpened = true;
        if (!again) return;
        await this._sdk._subscribeAgain();
        this._sdk.eventInterface.dispatchMessage("resumed");
    }

    /** Closed, or an attempt failed: while kept, opened again — once online — after the next wait. */
    lost() {
        if (!this._kept) return;
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
            this._sdk._setState("offline");   // the "online" event opens it again
            return;
        }
        this._sdk._setState("reconnecting");
        if (this._timer) return;
        const wait = this._backoff[Math.min(this._attempts, this._backoff.length - 1)];
        this._attempts += 1;
        this._timer = setTimeout(() => { this._timer = null; this.now(); }, wait);
    }

    /** Open it again now, when kept and not open nor opening (a failure: lost() again, the next wait). */
    now() {
        const sdk = this._sdk;
        if (!this._kept || sdk.connected || sdk._connecting) return;
        this._clear();
        sdk.connect().catch(() => this.lost());
    }

    _clear() {
        if (this._timer) clearTimeout(this._timer);
        this._timer = null;
    }

    _watch() {
        if (this._watching || typeof window === "undefined") return;
        this._watching = true;
        window.addEventListener("online", () => this.now());
        window.addEventListener("offline", () => {
            if (!this._kept) return;
            const socket = this._sdk._connection?.socket;
            if (socket && socket.readyState <= 1) socket.close();   // CONNECTING or OPEN: its close says the rest
            else this._sdk._setState("offline");
        });
        if (typeof document !== "undefined") {
            document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") this.now(); });
        }
    }
}
