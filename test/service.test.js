// Muffin.Service without a browser: its cache and locks are plain JavaScript.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Service } from "../src/service.js";

test("each service class has its own cache", () => {
    class A extends Service {}
    class B extends Service {}
    A.setCached("k", "a");
    B.setCached("k", "b");
    assert.equal(A.getCached("k"), "a");
    assert.equal(B.getCached("k"), "b");
    A.clearCache();
    assert.equal(A.getCached("k"), null);
    assert.equal(B.getCached("k"), "b");
    clearInterval(A._cacheCleanerInterval); clearInterval(B._cacheCleanerInterval);
});

test("a lock is held by one at a time, handed on in the order asked, across services", async () => {
    class A extends Service {}
    class B extends Service {}
    const order = [];
    const run = async (svc, n) => {
        await svc.lockInterface("X");
        order.push(`start ${n}`);
        await new Promise((r) => setTimeout(r, 5));
        order.push(`end ${n}`);
        svc.unlockInterface("X");
    };
    await Promise.all([run(A, 1), run(B, 2), run(A, 3)]);
    assert.deepEqual(order, ["start 1", "end 1", "start 2", "end 2", "start 3", "end 3"]);
});

test("unlocking what is not held does nothing; a freed name is free at once", async () => {
    Service.unlockInterface("never");
    await Service.lockInterface("Y");
    Service.unlockInterface("Y");
    Service.unlockInterface("Y");
    const t = Date.now();
    await Service.lockInterface("Y");
    assert.ok(Date.now() - t < 20, "no polling delay");
    Service.unlockInterface("Y");
    await Service.lockSubscription("S");
    Service.unlockSubscription("S");
});

test("the cache's cleaner never keeps the runtime alive", async () => {
    const { Service } = await import("../src/service.js");
    class Kept extends Service { static name = "kept"; }
    Kept.setCached("k", 1);
    assert.equal(Kept._cacheCleanerInterval.hasRef(), false);
});
