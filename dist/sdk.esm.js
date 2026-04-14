/*!
 * @muffin/atom-websdk v3.0.0
 * Footloose Labs — 2026
 * Includes @muffin/element
 */
import { Lexeme } from '@muffin/element';

const LEXICON = {};

LEXICON.WebMessage = class WebMessage extends Lexeme {
    static name = "WebMessage";

    static schema = {
        interface: null,
        token:     null,
        request:   null,
        subscribe: null,
        ttl:       null
    };

    static request_schema = {
        uid:       null,
        sender:    null,
        params:    {},
        subject:   null,
        objective: {}
    };
};

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

/**
 * DOMComponent prototype extensions — promoted from per-project polyfills.
 * Applied once when atom-websdk loads. Safe to call even if already applied.
 */

function applyDOMExtensions(Muffin) {
    const proto = Muffin.DOMComponent.prototype;

    if (proto.__domExtensionsApplied) return;
    proto.__domExtensionsApplied = true;

    // ─── DOM queries ──────────────────────────────────────────────────────────

    proto.getElement = function(filter) {
        const node = this._getDomNode();
        return node ? node.querySelector(filter) : null;
    };

    proto.getElements = function(filter) {
        const node = this._getDomNode();
        return node ? node.querySelectorAll(filter) : [];
    };

    // ─── Button busy state ────────────────────────────────────────────────────

    proto.toggleBtnBusyState = function(btnEl, state = "busy") {
        if (state === "busy") {
            btnEl.classList.add("busy");
            btnEl.setAttribute("disabled", true);
        } else {
            btnEl.classList.remove("busy");
            btnEl.removeAttribute("disabled");
        }
    };

    // ─── Root attribute toggle ────────────────────────────────────────────────

    proto.toggleRootAttr = function(attrName, attrValue) {
        const node = this._getDomNode();
        if (!node) return;
        if (attrValue) node.setAttribute(attrName, attrValue);
        else node.removeAttribute(attrName);
    };

    // ─── Surface helpers ──────────────────────────────────────────────────────

    proto.toggleSurface = function(surfaceName, state = "switch", toggleClass = "_active") {
        const node = this._getDomNode();
        if (!node) return;
        const el = node.querySelector(`[surface='${surfaceName}']`);
        if (!el) { console.warn(`Muffin: surface "${surfaceName}" not found`); return; }
        const ops = { show: "add", hide: "remove", switch: "toggle" };
        el.classList[ops[state] || "toggle"](toggleClass);
    };

    proto.isSurfaceActive = function(surfaceName, toggleClass = "_active") {
        const node = this._getDomNode();
        if (!node) return false;
        const el = node.querySelector(`[surface='${surfaceName}']`);
        return el ? el.classList.contains(toggleClass) : false;
    };

    proto.toggleTargetSurface = async function(srcEl) {
        const beforeHook = srcEl.getAttribute("before-toggle-hook");
        const afterHook  = srcEl.getAttribute("after-toggle-hook");
        if (beforeHook) { this[beforeHook]?.(srcEl); await _delay(10); }
        this.toggleSurface(srcEl.dataset.target, srcEl.dataset.state, srcEl.dataset["toggle-class"]);
        if (afterHook) setTimeout(() => this[afterHook]?.(srcEl), 10);
    };

    // ─── Tab helpers ──────────────────────────────────────────────────────────

    proto.toggleTargetTab = function(srcEl) {
        const targetTab   = srcEl.dataset.targettab;
        const tabGroup    = srcEl.dataset.tabgroup;
        if (!targetTab || !this._getDomNode()) return;

        const parentControlled = srcEl.hasAttribute("parent-controlled");

        let activeToggleEl;
        this._getDomNode()
            .querySelectorAll(`[data-tabgroup="${tabGroup}"][data-targettab]`)
            .forEach(el => {
                if (el.dataset.targettab === targetTab) {
                    el.classList.add("_active");
                    this.toggleSurface(el.dataset.targettab, "show");
                    if (!el.hasAttribute("disabled")) activeToggleEl = el;
                } else {
                    el.classList.remove("_active");
                    this.toggleSurface(el.dataset.targettab, "hide");
                }
            });

        if (!parentControlled &&
            targetTab === this.uiVars.activeTab &&
            tabGroup  === this.uiVars.activeTabGroup) return;

        this.uiVars.activeTab      = targetTab;
        this.uiVars.activeTabGroup = tabGroup;

        if (activeToggleEl) {
            const onOpen = activeToggleEl.getAttribute("on-open");
            if (onOpen && this[onOpen]) this[onOpen].call(this, this.uiVars.activeTab, srcEl);
        }
    };

    // ─── Child load awaiter ───────────────────────────────────────────────────

    proto.awaitChildLoad = function(childName, timeout = 3000) {
        return new Promise((resolve, reject) => {
            if (this.composedScope[childName]) return resolve(this.composedScope[childName]);
            this.interface.on("child-composed", child => {
                if (child === childName) resolve(this.composedScope[childName]);
            });
            setTimeout(() => reject(new Error(`Muffin: awaitChildLoad timed out for "${childName}"`)), timeout);
        });
    };

    // ─── Batch subscriptions ──────────────────────────────────────────────────

    proto.initSubscriptions = function(subscriptionsArr) {
        return Promise.all(subscriptionsArr.map(sub => {
            return Muffin.WebInterface.subscribe(
                `${sub.host}|||${sub.interface}`,
                this.interface.name,
                sub.localInterfaceEvent
            );
        }));
    };

    // ─── Clipboard ────────────────────────────────────────────────────────────

    proto.copyToClipboard = function(srcEl) {
        navigator.clipboard.writeText(srcEl.dataset.text);
        this.notifyUser(`<i class='fas fa-check-circle'></i> Copied`);
    };

    // ─── Notifications ────────────────────────────────────────────────────────

    proto.notifyUser = function(msgTxt, duration = 4000, interfaceSuffix = ":::notify-foreground") {
        const text = (msgTxt instanceof HTMLElement) ? msgTxt.dataset.msg : msgTxt;
        Muffin.PostOffice.publishToInterface(`NotificationManager${interfaceSuffix}`, {
            msgTxt: text,
            duration
        });
    };

    // ─── Session user ─────────────────────────────────────────────────────────

    proto.getSessionUser = async function() {
        try {
            const { user_details } = await Muffin.AccountManagerService.getAccountDetails();
            const { name, email } = user_details;
            return { firstName: name.split(" ")[0], fullName: name, email };
        } catch(e) {
            console.error("Muffin: getSessionUser failed —", e);
            return {};
        }
    };

    // ─── Parent/grandparent delegation ───────────────────────────────────────

    proto.callParent = function(srcEl, ev) {
        const args = [srcEl, ev, _extractPassData(srcEl, this.data), _extractPassUiVars(srcEl, this.uiVars)];
        const parent = this.getParent();
        parent[srcEl.dataset.function].call(parent, ...args);
    };

    proto.callGrandParent = function(srcEl, ev) {
        const args = [srcEl, ev, _extractPassData(srcEl, this.data), _extractPassUiVars(srcEl, this.uiVars)];
        const gp = this.getParent()?.getParent();
        if (gp) gp[srcEl.dataset.function].call(gp, ...args);
    };

    // ─── Router ───────────────────────────────────────────────────────────────

    Muffin.Router.prototype.updateHistory = function(title, url) {
        window.history.pushState({ name: title, url }, title, url);
    };
}

// ─── Private helpers ─────────────────────────────────────────────────────────

function _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function _extractPassData(srcEl, data) {
    if (!srcEl.hasAttribute("pass-data")) return {};
    return srcEl.getAttribute("pass-data").split(",").reduce((acc, k) => {
        const key = k.trim(); acc[key] = data[key]; return acc;
    }, {});
}

function _extractPassUiVars(srcEl, uiVars) {
    if (!srcEl.hasAttribute("pass-uivars")) return {};
    return srcEl.getAttribute("pass-uivars").split(",").reduce((acc, k) => {
        const key = k.trim(); acc[key] = uiVars[key]; return acc;
    }, {});
}

// ─── Array / String / JSON utilities ─────────────────────────────────────────
// Applied once globally — these are pure utilities with no Muffin dependency

function applyGlobalUtilities() {
    if (Array.prototype.splitIntoMultipleArrays) return;

    Object.defineProperty(Array.prototype, "splitIntoMultipleArrays", {
        value(chunkSize) {
            const result = [];
            for (let i = 0; i < this.length; i += chunkSize) result.push(this.slice(i, i + chunkSize));
            return result;
        },
        enumerable: false
    });

    Object.defineProperty(String.prototype, "ellipsify", {
        value(threshold = 9, fromStart = 6, fromEnd = 6) {
            return this.length > threshold
                ? `${this.substr(0, fromStart)}......${this.substr(-fromEnd)}`
                : this;
        },
        enumerable: false
    });
}

const API_LEXICON = { ...LEXICON };

const CONFIGS = {
    sandbox_local: {
        hostName:           "localhost:8877",
        path:               "wsapi",
        channelInstanceSig: 12,
        api_protocol:       "ws://"
    },
    sandbox: {
        hostName:           "wsapi.footloose.io/",
        path:               "wsapi",
        channelInstanceSig: 12,
        api_protocol:       "wss://"
    }
};

class WebRequestSdk {

    constructor(options = {}, lazyload = true) {
        if (!window.Muffin) throw new Error("Muffin.WebRequestSdk: window.Muffin not found — load element first");

        this.eventInterface = Muffin.PostOffice.getOrCreateInterface("WebRequestSdk");
        this.LEXICON        = API_LEXICON;
        this.label          = options.name     || "sandbox_ws";
        this.clientId       = options.client_id || "";
        this.token          = options.token     || "";
        this.keepAliveTimeout = options.keepAliveTimeout || 60000;

        if (options.label) {
            this.config = CONFIGS[options.label];
            if (!this.config) throw new Error(`Muffin.WebRequestSdk: unknown config label "${options.label}"`);
        } else if (options.config) {
            this.config = options.config;
        } else {
            throw new Error("Muffin.WebRequestSdk: provide either config label or custom config object");
        }

        this._connection   = null;
        this._socketState  = 0; // 0=disconnected 1=connected 2=connecting
        this._keepAliveTimer = null;
    }

    // ─── Connection ───────────────────────────────────────────────────────────

    async connect() {
        this._eventSubscriptions = new Set();
        this._socketState = 2;

        return new Promise((resolve, reject) => {
            const url = `${this.config.api_protocol}${this.config.hostName}/${this.config.path}/${this.clientId}?auth=${this.token}`;
            this._connection = Muffin.PostOffice.addSocket(WebSocket, this.label, url);
            this._connection.autoRetryOnClose = false;

            this._connection.socket.onerror = ev => {
                const msg = ev.target?.readyState === 3
                    ? "Connection closed or could not be established"
                    : "Connection failed";
                console.error("Muffin.WebRequestSdk onerror:", ev, msg);
                this._cancelKeepAlive();
                this._socketState = 0;
                this.eventInterface.dispatchMessage("error", new Error(msg));
                reject({ state: this._socketState, msg });
            };

            this._connection.socket.onopen = ev => {
                this._startKeepAlive();
                this._socketState = 1;
                this.eventInterface.dispatchMessage("connect");
                resolve({ state: this._socketState, msg: "connection established" });
            };

            this._connection.socket.onclose = ev => {
                const msg = "Connection closed by server or network lost";
                console.error("Muffin.WebRequestSdk onclose:", ev, msg);
                this._cancelKeepAlive();
                this._socketState = 0;
                this.eventInterface.dispatchMessage("close", new Error(msg));
            };

            this._connection.socket.onmessage = ev => {
                if (ev.data === "pong") return;
                try {
                    const msg = JSON.parse(ev.data);
                    if (msg.error) {
                        this.eventInterface.dispatchMessage("agent-error", msg);
                    } else {
                        this.eventInterface.dispatchMessage("incoming-msg", msg);
                        if (msg.op?.includes("EVENT:::")) {
                            this.eventInterface.dispatchMessage("incoming-event", msg);
                        } else {
                            this.eventInterface.dispatchMessage("incoming-response", msg);
                        }
                    }
                } catch(e) {
                    this.eventInterface.dispatchMessage("error", e);
                }
            };
        });
    }

    _startKeepAlive() {
        this._cancelKeepAlive();
        this._keepAliveTimer = setInterval(() => {
            this._connection.send("ping");
        }, this.keepAliveTimeout);
    }

    _cancelKeepAlive() {
        if (this._keepAliveTimer) {
            clearInterval(this._keepAliveTimer);
            this._keepAliveTimer = null;
        }
    }

    // ─── Send ─────────────────────────────────────────────────────────────────

    communicate(lexemeLabel, msg) {
        const inflection = this._inflect(lexemeLabel, msg);
        if (!inflection) return;
        if (this._socketState !== 1) {
            console.error("Muffin.WebRequestSdk: socket not connected");
            return;
        }
        this._connection.send(inflection);
    }

    _inflect(lexemeLabel, msg) {
        if (!lexemeLabel || msg == null) { console.error("Muffin.WebRequestSdk: invalid request"); return; }
        const lexeme = this.LEXICON[lexemeLabel];
        if (!lexeme) { console.error(`Muffin.WebRequestSdk: unknown lexeme "${lexemeLabel}"`); return; }
        try {
            const inflection = lexeme.inflect(msg === "random" ? {} : msg);
            return inflection?.stringify();
        } catch(e) {
            console.error(`Muffin.WebRequestSdk: inflection failed for "${lexemeLabel}" —`, e);
        }
    }

    // ─── Request / subscribe ──────────────────────────────────────────────────

    async request(lexemeLabel, msg, opLabel, options = { MAX_RESPONSE_TIME: 5000 }) {
        return new Promise((resolve, reject) => {
            this._waitForConnection(async () => {
                if (this._socketState !== 1) return reject({ message: "Socket not connected" });
                this.communicate(lexemeLabel, msg);
                if (!opLabel) return resolve({ message: "Message sent. No opLabel provided." });

                this.eventInterface.on("incoming-msg",  m => { if (m.op === opLabel && m.result != null) resolve(m); });
                this.eventInterface.on("agent-error",   m => { if (m.op === opLabel && m.error  != null) reject(m); });
                setTimeout(() => reject({ message: `No response in ${options.MAX_RESPONSE_TIME / 1000}s` }), options.MAX_RESPONSE_TIME);
            });
        });
    }

    async webrequest(interfaceAddr, requestMsg, options = { MAX_RESPONSE_TIME: 5000 }) {
        return new Promise((resolve, reject) => {
            if (!interfaceAddr) return reject({ error: "No interface provided" });

            const isReceptive  = interfaceAddr.includes(":::");
            const isExpressive = interfaceAddr.includes("|||");
            if (!isReceptive && !isExpressive) return reject({ error: `Invalid interface "${interfaceAddr}"` });

            const opLabel = options.opLabel || interfaceAddr;

            const webMsg = isReceptive
                ? { interface: interfaceAddr, request: requestMsg, token: this._generateToken(interfaceAddr), ttl: options.MAX_RESPONSE_TIME }
                : { subscribe: interfaceAddr, token: this._generateToken(interfaceAddr) };

            this.communicate("WebMessage", webMsg);

            this.eventInterface.on("incoming-msg", msg => {
                if (isReceptive  && msg.op === opLabel && msg.result  != null) resolve(msg);
                if (isExpressive && msg.op === opLabel && msg.statusCode === 2) resolve(msg);
            });

            this.eventInterface.on("agent-error", msg => {
                if (msg.op === opLabel && msg.error != null) reject(msg);
            });

            setTimeout(() => reject({ message: `No response in ${options.MAX_RESPONSE_TIME / 1000}s` }), options.MAX_RESPONSE_TIME);
        });
    }

    async websubscribe(interfaceAddr, localSocketName = "global", targetMsgLabel, options = { MAX_RESPONSE_TIME: 5000 }) {
        await this.webrequest(interfaceAddr, null, options);

        const localSocket = Muffin.PostOffice.sockets[localSocketName] || Muffin.PostOffice.sockets.global;

        this.eventInterface.on("incoming-event", msg => {
            if (msg.op === `EVENT:::${interfaceAddr}`) {
                localSocket.dispatchMessage(targetMsgLabel || msg.op, msg);
            }
        });

        return true;
    }

    _waitForConnection(callback) {
        setTimeout(async () => {
            if (this._socketState === 1) {
                callback();
            } else if (this._socketState === 0) {
                try { await this.connect(); } catch(e) { console.error("Muffin.WebRequestSdk: connect failed —", e); }
                this._waitForConnection(callback);
            } else {
                this._waitForConnection(callback);
            }
        }, 1000);
    }

    // ─── Token ────────────────────────────────────────────────────────────────

    async _generateToken(message, algo = "SHA-256") {
        const buf = await crypto.subtle.digest(algo, new TextEncoder().encode(message));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
    }

    // ─── Introspection ────────────────────────────────────────────────────────

    getSerializableIntro() {
        return Object.keys(this.LEXICON).map(key => ({
            label:    key,
            fullName: this.LEXICON[key].name,
            schema:   this.LEXICON[key].schema.request || {}
        }));
    }

    getIntro() { return this.LEXICON; }
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

function applyAtomWebSDK(Muffin) {
    if (!Muffin) throw new Error("atom-websdk: window.Muffin not found — load element first");

    Muffin.WebRequestSdk = WebRequestSdk;
    Muffin.Service       = Service;

    applyDOMExtensions(Muffin);
    applyGlobalUtilities();
}

// Auto-apply when loaded as a browser script (window.Muffin already set by element)
if (typeof window !== "undefined" && window.Muffin) {
    applyAtomWebSDK(window.Muffin);
}

export { Service, WebRequestSdk, applyAtomWebSDK, WebRequestSdk as default };
