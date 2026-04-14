import WEB_MESSAGE_LEXICON from "./lexicon.js";
import { Service } from "./service.js";
import { applyDOMExtensions, applyGlobalUtilities } from "./dom_extensions.js";

const API_LEXICON = { ...WEB_MESSAGE_LEXICON };

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

export { WebRequestSdk, Service, applyAtomWebSDK };
export default WebRequestSdk;
