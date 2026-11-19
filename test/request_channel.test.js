// RequestChannel against a fake gateway: one that echoes `ref` (the protocol now) and one that does not (an older
// gateway). Run: npm test (node --test). Timers are real but short.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { RequestChannel } from "../src/core.js";

const A = "@svc/a:::AService";
const B = "@svc/b:::BService";
const SUB = "@svc/a|||Changes";
const sha = (t) => createHash("sha256").update(t).digest("hex");
const tick = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A channel over a fake socket: `sent` holds the frames; `open` false makes sending throw. */
function fake(o = {}) {
    const sent = [];
    const state = { open: true };
    const channel = new RequestChannel({
        send: (text) => { if (!state.open) throw new Error("closed"); sent.push(JSON.parse(text)); },
        digest: sha,
        ...o,
    });
    return { channel, sent, state };
}
/** The gateway's reply to a frame — with its `ref` (echo) or without (an older gateway). */
const reply = (frame, fields, echo = true) => ({
    op: frame.interface ?? frame.subscribe ?? frame.unsubscribe,
    token: frame.token,
    ...(echo ? { ref: frame.ref } : {}),
    ...fields,
});
const settled = (p) => p.then((v) => ({ ok: v }), (e) => ({ err: e }));

test("a request carries its interface, request, token, ttl and a ref", async () => {
    const { channel, sent } = fake();
    const r = settled(channel.request(A, { subject: "x" }, { timeout: 3000 }));
    await tick();
    assert.deepEqual(sent[0], { interface: A, request: { subject: "x" }, token: sha(A), ttl: 3000, ref: "1" });
    channel.close();
    await r;
});

test("echoing gateway: requests to one interface, answered out of order, each get their own reply", async () => {
    const { channel, sent } = fake();
    const first = channel.request(A, { n: 1 });
    await tick();
    channel.receive(reply(sent[0], { result: "r1", statusCode: 200 })); // learns the gateway echoes ref
    assert.equal((await first).result, "r1");
    const ps = [1, 2, 3].map((n) => channel.request(A, { n }));
    await tick();
    assert.equal(sent.length, 4, "all three sent at once");
    for (const i of [3, 1, 2]) channel.receive(reply(sent[i], { result: `r${sent[i].request.n}` }));
    assert.deepEqual((await Promise.all(ps)).map((r) => r.result), ["r1", "r2", "r3"]);
    assert.equal(channel.pending, 0);
});

test("a reply's error rejects with the reply; a reply with result null resolves", async () => {
    const { channel, sent } = fake();
    const bad = settled(channel.request(A, {}));
    const empty = channel.request(B, {});
    await tick();
    channel.receive(reply(sent[0], { error: "No such thing", statusCode: 500 }));
    channel.receive(reply(sent[1], { result: null, statusCode: 200 }));
    assert.equal((await bad).err.error, "No such thing");
    assert.equal((await empty).result, null);
});

test("echoing gateway: a timed-out request's late reply is dropped, never given to another", async () => {
    const { channel, sent } = fake();
    channel.request(B, {}); await tick(); channel.receive(reply(sent[0], { result: 1 })); // learn echo
    const slow = settled(channel.request(A, {}, { timeout: 20 }));
    await tick();
    assert.match((await slow).err.message, /No response in 0.02s/);
    const next = channel.request(A, {});
    await tick();
    assert.equal(channel.receive(reply(sent[1], { result: "late" })), false, "late reply dropped");
    channel.receive(reply(sent[2], { result: "mine" }));
    assert.equal((await next).result, "mine");
});

test("older gateway (no ref): one request per interface at a time; other interfaces run alongside", async () => {
    const { channel, sent } = fake();
    const a1 = channel.request(A, { n: 1 });
    const a2 = channel.request(A, { n: 2 });
    const b1 = channel.request(B, { n: 1 });
    await tick();
    assert.deepEqual(sent.map((f) => [f.interface, f.request.n]), [[A, 1], [B, 1]], "A's second waits its turn");
    channel.receive(reply(sent[0], { result: "a1" }, false));
    await tick();
    assert.equal(sent.length, 3);
    assert.deepEqual([sent[2].interface, sent[2].request.n], [A, 2]);
    channel.receive(reply(sent[2], { result: "a2" }, false));
    channel.receive(reply(sent[1], { result: "b1" }, false));
    assert.deepEqual([(await a1).result, (await a2).result, (await b1).result], ["a1", "a2", "b1"]);
    assert.equal(channel.echoesRef, false);
});

test("older gateway: a timed-out request keeps its turn — its late reply is not the next one's", async () => {
    const { channel, sent } = fake({ lateReplyGrace: 1000 });
    const slow = settled(channel.request(A, {}, { timeout: 20 }));
    const next = channel.request(A, {});
    assert.ok((await slow).err);
    await tick();
    assert.equal(sent.length, 1, "next still waits");
    channel.receive(reply(sent[0], { result: "late" }, false)); // consumed by the timed-out one
    await tick();
    assert.equal(sent.length, 2);
    channel.receive(reply(sent[1], { result: "mine" }, false));
    assert.equal((await next).result, "mine");
});

test("older gateway: a late reply that never comes frees the turn after the grace", async () => {
    const { channel, sent } = fake({ lateReplyGrace: 30 });
    settled(channel.request(A, {}, { timeout: 10 }));
    const next = channel.request(A, {});
    await wait(60);
    assert.equal(sent.length, 2);
    channel.receive(reply(sent[1], { result: "mine" }, false));
    assert.equal((await next).result, "mine");
});

test("learning the gateway echoes ref releases what waits its turn", async () => {
    const { channel, sent } = fake();
    const a1 = channel.request(A, { n: 1 });
    const a2 = channel.request(A, { n: 2 });
    const a3 = channel.request(A, { n: 3 });
    await tick();
    assert.equal(sent.length, 1);
    channel.receive(reply(sent[0], { result: 1 }));
    await tick();
    assert.equal(sent.length, 3, "the rest go together");
    channel.receive(reply(sent[2], { result: 3 }));
    channel.receive(reply(sent[1], { result: 2 }));
    assert.deepEqual([(await a1).result, (await a2).result, (await a3).result], [1, 2, 3]);
});

test("close rejects everything waiting — sent or waiting its turn — and forgets what it learnt", async () => {
    const { channel, sent } = fake();
    const a1 = settled(channel.request(A, {}));
    const a2 = settled(channel.request(A, {}));
    await tick();
    channel.close();
    for (const r of [await a1, await a2]) assert.match(r.err.message, /connection closed/);
    assert.equal(channel.pending, 0);
    assert.equal(channel.receive(reply(sent[0], { result: 1 })), false, "a reply after close is dropped");
    assert.equal(channel.echoesRef, true, "learnt from that reply's ref");
    channel.close();
    assert.equal(channel.echoesRef, false);
});

test("a request that cannot be sent rejects at once, and the next to its interface goes", async () => {
    const { channel, sent, state } = fake();
    state.open = false;
    const r = await settled(channel.request(A, {}));
    assert.equal(r.err.message, "Socket not connected");
    state.open = true;
    const next = channel.request(A, {});
    await tick();
    channel.receive(reply(sent[0], { result: "ok" }));
    assert.equal((await next).result, "ok");
});

test("subscribe and unsubscribe: their frames, and an acknowledgement's error:false is not an error", async () => {
    const { channel, sent } = fake();
    const sub = channel.request(SUB, null);
    await tick();
    assert.deepEqual(sent[0], { subscribe: SUB, token: sha(SUB), ref: "1" });
    channel.receive(reply(sent[0], { error: false, statusCode: 2, message: "subscription initiated" }));
    assert.equal((await sub).statusCode, 2);
    const unsub = settled(channel.unsubscribe(SUB));
    await tick();
    assert.deepEqual(sent[1], { unsubscribe: SUB, token: sha(SUB), ref: "2" });
    channel.receive(reply(sent[1], { error: "subscription not found", statusCode: 404 }));
    assert.equal((await unsub).err.statusCode, 404);
});

test("events and messages that are not replies are not taken as replies", async () => {
    const { channel, sent } = fake();
    const a = channel.request(A, {});
    await tick();
    assert.equal(channel.receive({ op: `EVENT:::${SUB}`, data: 1 }), false);
    assert.equal(channel.receive({ error: "invalid message format", statusCode: 400 }), false);
    assert.equal(channel.receive("pong"), false);
    channel.receive(reply(sent[0], { result: "ok" }));
    assert.equal((await a).result, "ok");
});

test("invalid addresses are refused without sending", async () => {
    const { channel, sent } = fake();
    assert.ok((await settled(channel.request("nope", {}))).err.error);
    assert.ok((await settled(channel.unsubscribe(A))).err.error);
    assert.equal(sent.length, 0);
});

test("a thousand requests leave nothing behind", async () => {
    const { channel, sent } = fake();
    const ps = Array.from({ length: 1000 }, (_, n) => channel.request(n % 2 ? A : B, { n }));
    await tick();
    for (const f of sent.slice()) channel.receive(reply(f, { result: f.request.n }));
    await tick();
    for (const f of sent.slice(2)) channel.receive(reply(f, { result: f.request.n }));
    const rs = await Promise.all(ps);
    assert.ok(rs.every((r, n) => r.result === n));
    assert.equal(channel.pending, 0);
    assert.equal(channel._byRef.size, 0);
    assert.equal(channel._turns.size, 0);
});
