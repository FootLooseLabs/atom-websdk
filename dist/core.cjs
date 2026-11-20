/*!
 * @muffin/atom-websdk/core v3.5.1
 * Footloose Labs — 2026
 */
'use strict';

/**
 * RequestChannel — how a request over the web interface is matched to its reply. Runtime-neutral: no DOM, no window,
 * no Muffin, no socket of its own. The browser SDK (WebRequestSdk) and Node clients (`@muffin/atom-websdk/core`) each
 * give it a way to send a text frame and feed it every parsed message that arrives; it does the rest.
 *
 * The protocol (docs/api/web-request-sdk.md, "Requests and replies"):
 * - every request carries `ref`, unique on this channel; a gateway that speaks it copies `ref` into the reply, so each
 *   reply settles exactly the request it answers — any number in flight at once, to any interface, in any order;
 * - a reply names its interface in `op` and carries `token` (sha-256 of the interface address), as before;
 * - a gateway that does not echo `ref` (an older one) is matched by `op` alone, which cannot tell two requests to one
 *   interface apart: until a reply shows `ref` echoed, requests to one interface go one at a time, and one that timed
 *   out keeps its turn until its late reply arrives (or `lateReplyGrace` passes), so a late reply is never taken by
 *   the next request. Learnt per connection: `close()` forgets it.
 *
 * A request settles once: with the reply (resolved; rejected when its `error` is truthy), on its timeout, on
 * the channel closing, or when it cannot be sent. Rejections keep the SDK's shapes: the reply itself, or { message }.
 */

const RECEPTIVE = ":::";
const EXPRESSIVE = "|||";
const EVENT_PREFIX = "EVENT:::";

/** What a reply is the reply to: an interface address, or `null` for anything that is not a reply (events, pongs). */
function replyKeyOf(msg) {
    if (!msg || typeof msg !== "object") return null;
    const op = msg.op;
    if (typeof op !== "string" || op.startsWith(EVENT_PREFIX)) return null;
    return op;
}

class RequestChannel {
    /**
     * @param {object} o
     * @param {(text: string) => void} o.send — sends one frame; throws when the connection is not open
     * @param {(text: string) => (string | Promise<string>)} o.digest — sha-256 hex of a text (the request's token)
     * @param {number} [o.lateReplyGrace=10000] — how long a timed-out request keeps its turn on a gateway without `ref`
     */
    constructor({ send, digest, lateReplyGrace = 10000 } = {}) {
        if (typeof send !== "function" || typeof digest !== "function") {
            throw new Error("RequestChannel needs send(text) and digest(text)");
        }
        this._send = send;
        this._digest = digest;
        this._lateReplyGrace = lateReplyGrace;
        this._seq = 0;
        this._byRef = new Map();      // ref → entry: every request sent and not yet settled (and late-reply holders)
        this._turns = new Map();      // interface → { current: entry | null, waiting: entry[] } — without `ref` only
        this._echoes = null;          // does the gateway echo `ref`? null: not known yet on this connection
    }

    /** True once a reply on this connection carried `ref`: requests then run side by side. */
    get echoesRef() { return this._echoes === true; }

    /** How many requests are waiting for a reply (sent, or waiting their turn). */
    get pending() {
        let n = 0;
        for (const e of this._byRef.values()) if (!e.settled) n += 1;
        for (const t of this._turns.values()) n += t.waiting.length;
        return n;
    }

    /**
     * Ask an interface. `address` with ":::" is a request (`payload` is its request message); with "|||" a
     * subscription. Resolves with the reply; rejects with the reply when it carries an error, or with { message }.
     * @param {string} address
     * @param {object|null} payload
     * @param {{ timeout?: number, key?: string }} [o] — timeout in ms (default 5000; also sent as the request's ttl);
     *   key: the `op` its reply names, when that is not the address (matching without `ref` only)
     */
    request(address, payload, { timeout = 5000, key } = {}) {
        if (typeof address !== "string" || (!address.includes(RECEPTIVE) && !address.includes(EXPRESSIVE))) {
            return Promise.reject({ error: `Invalid interface "${address}"` });
        }
        return this._enqueue(address.includes(RECEPTIVE) ? "request" : "subscribe", address, payload, timeout, key);
    }

    /**
     * End a subscription ("|||" address) on the gateway: its events stop coming. Resolves with the acknowledgement;
     * rejects with it when the gateway has no such subscription, or with { message }.
     */
    unsubscribe(address, { timeout = 5000 } = {}) {
        if (typeof address !== "string" || !address.includes(EXPRESSIVE)) {
            return Promise.reject({ error: `Invalid subscription "${address}"` });
        }
        return this._enqueue("unsubscribe", address, null, timeout);
    }

    _enqueue(kind, address, payload, timeout, key) {
        return new Promise((resolve, reject) => {
            const entry = {
                ref: String(++this._seq),
                kind,
                key: key || address,
                address,
                payload,
                timeout,
                resolve,
                reject,
                timer: null,
                graceTimer: null,
                settled: false,
            };
            if (this._echoes === true) this._dispatch(entry);
            else this._takeTurn(entry);
        });
    }

    /**
     * A message that arrived on the connection, parsed. Settles the request it is the reply to, if any.
     * @returns {boolean} whether it was a reply to a request on this channel
     */
    receive(msg) {
        const key = replyKeyOf(msg);
        if (key === null) return false;

        if (msg.ref !== undefined && msg.ref !== null) {
            if (this._echoes !== true) this._learnEchoes();
            const entry = this._byRef.get(String(msg.ref));
            if (!entry) return false; // its request timed out or the connection it was sent on closed: dropped
            this._settleWithReply(entry, msg);
            return true;
        }

        // a gateway that does not echo `ref`: the reply is the one in flight to that interface
        const turn = this._turns.get(key);
        const entry = turn?.current;
        if (!entry) return false;
        if (this._echoes === null) this._echoes = false;
        this._settleWithReply(entry, msg);
        return true;
    }

    /** The connection closed (or is being replaced): everything waiting is rejected, and what was learnt forgotten. */
    close(message = "The connection closed before a reply arrived") {
        const waiting = [...this._byRef.values()];
        for (const t of this._turns.values()) waiting.push(...t.waiting);
        this._byRef.clear();
        this._turns.clear();
        this._echoes = null;
        for (const entry of waiting) {
            clearTimeout(entry.graceTimer);
            this._finish(entry, () => entry.reject({ message }));
        }
    }

    // ─── Internals ────────────────────────────────────────────────────────────

    async _dispatch(entry) {
        this._byRef.set(entry.ref, entry);
        let frame;
        try {
            const token = await this._digest(entry.address);
            if (entry.settled) return; // closed while the token was made
            frame = entry.kind === "request"
                ? { interface: entry.address, request: entry.payload, token, ttl: entry.timeout, ref: entry.ref }
                : { [entry.kind]: entry.address, token, ref: entry.ref };
            this._send(JSON.stringify(frame));
        } catch (e) {
            if (!entry.settled) this._finish(entry, () => entry.reject({ message: "Socket not connected" }));
            this._release(entry);
            return;
        }
        entry.timer = setTimeout(() => this._timeOut(entry), entry.timeout);
    }

    _takeTurn(entry) {
        let turn = this._turns.get(entry.key);
        if (!turn) this._turns.set(entry.key, (turn = { current: null, waiting: [] }));
        if (turn.current) { turn.waiting.push(entry); return; }
        turn.current = entry;
        this._dispatch(entry);
    }

    _settleWithReply(entry, msg) {
        // an error is a truthy `error`: a subscription's acknowledgement carries `error: false`
        const failed = Boolean(msg.error);
        if (!entry.settled) this._finish(entry, () => (failed ? entry.reject(msg) : entry.resolve(msg)));
        this._release(entry);
    }

    _timeOut(entry) {
        if (entry.settled) return;
        this._finish(entry, () => entry.reject({ message: `No response in ${entry.timeout / 1000}s` }));
        if (this._echoes === true) { this._release(entry); return; }
        // without `ref`, its reply may still come and would be taken as the next one's: it keeps its turn a while
        entry.graceTimer = setTimeout(() => this._release(entry), this._lateReplyGrace);
    }

    /** Settles an entry once, and stops its timer. */
    _finish(entry, settle) {
        if (entry.settled) return;
        entry.settled = true;
        clearTimeout(entry.timer);
        settle();
    }

    /** An entry is done with: off the channel, and the next one to its interface goes. */
    _release(entry) {
        clearTimeout(entry.timer);
        clearTimeout(entry.graceTimer);
        if (this._byRef.get(entry.ref) === entry) this._byRef.delete(entry.ref);
        const turn = this._turns.get(entry.key);
        if (!turn || turn.current !== entry) return;
        turn.current = null;
        const next = turn.waiting.shift();
        if (next) { turn.current = next; this._dispatch(next); }
        else this._turns.delete(entry.key);
    }

    /** The gateway echoes `ref`: turns are no longer needed — whatever waits for one goes now. */
    _learnEchoes() {
        this._echoes = true;
        const turns = [...this._turns.values()];
        this._turns.clear();
        for (const turn of turns) {
            // one that timed out and holds its turn for a late reply: its late reply carries `ref` and is dropped
            if (turn.current?.settled) this._release(turn.current);
            for (const next of turn.waiting) this._dispatch(next);
        }
    }
}

exports.RequestChannel = RequestChannel;
