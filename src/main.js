import WEB_MESSAGE_LEXICON from "./lexicon.js";
import { Service } from "./service.js";
import { RequestChannel } from "./request_channel.js";
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
        // requests and their replies, matched by ref (request_channel.js); one channel across reconnects
        this._channel = new RequestChannel({
            send: text => {
                if (this._socketState !== 1 || !this._connection) throw new Error("Socket not connected");
                this._connection.send(text);
            },
            digest: text => this._generateToken(text)
        });
        // where each subscription's events go: interface → the local PostOffice socket and label of each route
        this._eventRoutes = new Map();
    }

    // ─── Connection ───────────────────────────────────────────────────────────

    async connect() {
        this._socketState = 2;

        return new Promise((resolve, reject) => {
            const url = `${this.config.api_protocol}${this.config.hostName}/${this.config.path}/${this.clientId}?auth=${this.token}`;
            this._connection = Muffin.PostOffice.addSocket(WebSocket, this.label, url);
            this._connection.autoRetryOnClose = false;
            const socket = this._connection.socket;
            // what waits on this socket is answered on it or not at all: when it ends, the channel lets go of it —
            // unless a newer socket has already replaced it (that one's requests are not this one's)
            const ended = () => { if (this._connection?.socket === socket) this._channel.close(); };

            this._connection.socket.onerror = ev => {
                const msg = ev.target?.readyState === 3
                    ? "Connection closed or could not be established"
                    : "Connection failed";
                console.error("Muffin.WebRequestSdk onerror:", ev, msg);
                this._cancelKeepAlive();
                this._socketState = 0;
                ended();
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
                ended();
                this.eventInterface.dispatchMessage("close", new Error(msg));
            };

            this._connection.socket.onmessage = ev => {
                if (ev.data === "pong") return;
                let msg;
                try {
                    msg = JSON.parse(ev.data);
                } catch(e) {
                    this.eventInterface.dispatchMessage("error", e);
                    return;
                }
                // the request it answers, if any — then the events anyone listens to, as before
                this._channel.receive(msg);
                try {
                    if (msg.error) {
                        this.eventInterface.dispatchMessage("agent-error", msg);
                    } else {
                        this.eventInterface.dispatchMessage("incoming-msg", msg);
                        if (msg.op?.includes("EVENT:::")) {
                            this.eventInterface.dispatchMessage("incoming-event", msg);
                            this._routeEvent(msg);
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

    disconnect() {
        this._cancelKeepAlive();
        this._socketState = 0;
        this._channel.close("The connection was closed");
        if (this._connection?.socket) {
            const { socket } = this._connection;
            // Remove framework handlers first so onclose doesn't trigger a
            // reconnect or error event after a voluntary disconnect.
            socket.onclose = null;
            socket.onerror = null;
            if (socket.readyState === WebSocket.OPEN ||
                socket.readyState === WebSocket.CONNECTING) {
                socket.close(1000, 'Client disconnect');
            }
        }
        this._connection = null;
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
    // Every request goes through the channel (request_channel.js): it carries a ref, and its reply is matched by it —
    // any number in flight to one interface, each answered with its own reply.

    /**
     * Ask an interface: `interfaceAddr` "host:::Service" with a request message, or "host|||Name" to subscribe.
     * Resolves with the reply ({ op, result, statusCode, … }); rejects with the reply when it carries an error, or
     * with { message } (no reply in time, connection closed or not open).
     * options: MAX_RESPONSE_TIME (ms, default 5000; also how long the gateway waits for the service).
     */
    async webrequest(interfaceAddr, requestMsg, options = {}) {
        if (!interfaceAddr) return Promise.reject({ error: "No interface provided" });
        return this._channel.request(interfaceAddr, requestMsg ?? null, {
            timeout: options.MAX_RESPONSE_TIME ?? 5000,
            key: options.opLabel
        });
    }

    /**
     * `request(interfaceAddr, requestMsg, options)` — the same as webrequest.
     * Deprecated form, kept working: `request(lexemeLabel, frame, opLabel?, options?)` — a lexicon frame
     * ({ interface, request } or { subscribe }); without opLabel it is only sent (communicate), as it always was.
     */
    async request(target, msg, third, fourth) {
        if (typeof target === "string" && (target.includes(":::") || target.includes("|||"))) {
            return this.webrequest(target, msg, third ?? {});
        }
        if (!this.LEXICON[target] || msg == null || typeof msg !== "object") {
            return Promise.reject({ error: `request: "${target}" is neither an interface address nor a lexeme` });
        }
        if (!third) {
            this.communicate(target, msg);
            return { message: "Message sent. No opLabel provided." };
        }
        return this.webrequest(msg.interface || msg.subscribe, msg.request ?? null, { ...(fourth ?? {}), opLabel: third });
    }

    /**
     * Subscribe to "host|||Name": its events are dispatched on the PostOffice socket `localSocketName` (default
     * "global") as `targetMsgLabel` (default the event's op). Subscribing again with the same socket and label adds
     * nothing: each event is delivered once per route.
     */
    async websubscribe(interfaceAddr, localSocketName = "global", targetMsgLabel, options = {}) {
        await this.webrequest(interfaceAddr, null, options);
        let routes = this._eventRoutes.get(interfaceAddr);
        if (!routes) this._eventRoutes.set(interfaceAddr, (routes = new Map()));
        routes.set(`${localSocketName}\u0000${targetMsgLabel ?? ""}`, { localSocketName, targetMsgLabel });
        return true;
    }

    /** End a subscription: the gateway stops its events, and none are routed any more. Resolves with its acknowledgement. */
    async webunsubscribe(interfaceAddr, options = {}) {
        this._eventRoutes.delete(interfaceAddr);
        return this._channel.unsubscribe(interfaceAddr, { timeout: options.MAX_RESPONSE_TIME ?? 5000 });
    }

    _routeEvent(msg) {
        const routes = this._eventRoutes.get(msg.op.slice("EVENT:::".length));
        if (!routes) return;
        for (const { localSocketName, targetMsgLabel } of routes.values()) {
            const localSocket = Muffin.PostOffice.sockets[localSocketName] || Muffin.PostOffice.sockets.global;
            localSocket.dispatchMessage(targetMsgLabel || msg.op, msg);
        }
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
