import { describe, expect, test } from "bun:test";
import { AsyncScheduler } from "../../src/runtime/async-runtime.js";

describe("AsyncScheduler cancellation groups", () => {
    test("cancelling a child aborts its descendants but not its parent", async () => {
        const scheduler = new AsyncScheduler(2);
        const child = scheduler.createGroup(1, scheduler.defaultGroup);
        const grandchild = scheduler.createGroup(1, child);
        const reason = new Error("child stopped");

        scheduler.cancelGroup(child, reason);

        expect(child.signal.aborted).toBe(true);
        expect(child.signal.reason).toBe(reason);
        expect(grandchild.signal.aborted).toBe(true);
        expect(grandchild.signal.reason).toBe(reason);
        expect(scheduler.defaultGroup.signal.aborted).toBe(false);
    });

    test("group cancellation rejects queued work but drains an admitted task", async () => {
        const scheduler = new AsyncScheduler(1);
        const child = scheduler.createGroup(1, scheduler.defaultGroup);
        let release;
        const running = scheduler.run(() => new Promise((resolve) => {
            release = resolve;
        }), child);
        const queued = scheduler.run(() => "should not start", child);
        const queuedOutcome = queued.catch((error) => error);
        await Promise.resolve();

        const reason = new Error("scope break");
        scheduler.cancelGroup(child, reason);
        expect(await queuedOutcome).toBe(reason);
        expect(child.signal.aborted).toBe(true);

        release("finished cleanup");
        expect(await running).toBe("finished cleanup");
        await scheduler.waitForIdle(child);
    });

    test("an item can yield and reacquire its ticket around structural fan-out", async () => {
        const scheduler = new AsyncScheduler(1);
        const events = [];
        const first = scheduler.run(async (ticket) => {
            events.push("outer:start");
            expect(scheduler.suspend(ticket)).toBe(true);
            await scheduler.resume(ticket);
            events.push("outer:resumed");
        });
        const second = scheduler.run(() => {
            events.push("sibling");
        });

        await Promise.all([first, second]);
        expect(events).toEqual(["outer:start", "sibling", "outer:resumed"]);
    });

    test("the first observed fatal error is primary and later failures are suppressed", async () => {
        const scheduler = new AsyncScheduler(2);
        const releases = [];
        const first = scheduler.run(() => new Promise((resolve, reject) => releases.push(() => reject(new Error("first")))), undefined, { path: "item 1" });
        const second = scheduler.run(() => new Promise((resolve, reject) => releases.push(() => reject(new Error("second")))), undefined, { path: "item 2" });
        while (releases.length < 2) await Promise.resolve();

        releases[1]();
        const secondError = await second.catch((error) => error);
        releases[0]();
        await first.catch(() => null);
        await scheduler.waitForIdle();

        expect(secondError.message).toBe("second");
        expect(secondError.asyncTaskPath).toBe("item 2");
        expect(secondError.asyncObservationOrder).toBe(1);
        expect(secondError.suppressed).toHaveLength(1);
        expect(secondError.suppressed[0].message).toBe("first");
        expect(secondError.suppressed[0].asyncObservationOrder).toBe(2);
    });
});

const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const flush = async () => { for (let step = 0; step < 12; step++) await Promise.resolve(); };

describe("bounded async ownership", () => {
    test("suspension never counts as completion and duplicate resume retains one permit", async () => {
        const scheduler = new AsyncScheduler(1);
        const suspended = deferred();
        const continueTask = deferred();
        let saved;
        const task = scheduler.run(async (ticket) => {
            saved = ticket;
            scheduler.suspend(ticket);
            suspended.resolve();
            await continueTask.promise;
            const first = scheduler.resume(ticket);
            expect(scheduler.resume(ticket)).toBe(first);
            await first;
        });
        await suspended.promise;
        let idle = false;
        const drained = scheduler.waitForIdle().then(() => { idle = true; });
        await flush();
        expect(scheduler.active).toBe(0);
        expect(scheduler.pending).toBe(1);
        expect(idle).toBe(false);
        continueTask.resolve();
        await task;
        await drained;
        expect(scheduler.active).toBe(0);
        expect(scheduler.pending).toBe(0);
        await expect(scheduler.resume(saved)).rejects.toThrow("completed");
    });

    test("host ceilings, hot admission queues, and cancellation storms stay bounded", async () => {
        const scheduler = new AsyncScheduler(100000, { concurrency: 1, queued: 2, outstanding: 3 });
        expect(scheduler.limit).toBe(1);
        expect(scheduler.createGroup(10000).limit).toBe(1);
        const hold = deferred();
        const first = scheduler.run(() => hold.promise);
        await flush();
        const queued = [scheduler.run(() => 2), scheduler.run(() => 3)];
        const outcomes = Promise.allSettled(queued);
        await expect(scheduler.run(() => 4)).rejects.toMatchObject({ code: "ASYNC_LIMIT_EXCEEDED" });
        expect(scheduler.queue).toHaveLength(2);
        const reason = new Error("cancel storm");
        for (let index = 0; index < 100; index++) scheduler.cancel(reason);
        expect(scheduler.queue).toHaveLength(0);
        expect((await outcomes).map((item) => item.reason)).toEqual([reason, reason]);
        hold.resolve(1);
        expect(await first).toBe(1);
        await scheduler.waitForIdle();
        expect(scheduler.pending).toBe(0);
    });

    test("primitive/frozen failures normalize and retained aggregate failures are capped", async () => {
        const scheduler = new AsyncScheduler(5, { errors: 2 });
        const failures = Array.from({ length: 5 }, () => deferred());
        const tasks = failures.map((gate, index) => scheduler.run(() => gate.promise, undefined, {
            path: `scope / branch ${index + 1}`, taskPath: ["scope", `branch ${index + 1}`],
        }));
        const outcomes = Promise.allSettled(tasks);
        await flush();
        const original = Object.freeze(new Error("first"));
        failures[0].reject(original);
        await flush();
        for (let index = 1; index < failures.length; index++) failures[index].reject(`failure ${index}`);
        const results = await outcomes;
        await scheduler.waitForIdle();
        const primary = scheduler.defaultGroup.primaryError;
        expect(primary.cause).toBe(original);
        expect(results[0].reason).toBe(primary);
        expect(primary.asyncTaskSegments).toEqual(["scope", "branch 1"]);
        expect(primary.suppressed).toHaveLength(2);
        expect(primary.asyncDroppedErrors).toBe(2);
        expect(scheduler.defaultGroup.suppressedErrors).toHaveLength(2);
    });

    test("many nested groups settle and clean up exactly once under cancellation", async () => {
        const scheduler = new AsyncScheduler(3);
        let cleaned = 0;
        const tasks = Array.from({ length: 30 }, (_, index) => {
            const group = scheduler.createGroup(1, scheduler.defaultGroup);
            return scheduler.run(async () => {
                try { await new Promise((resolve) => group.signal.addEventListener("abort", resolve, { once: true })); }
                finally { cleaned++; }
            }, group, { branchPath: [index], path: `branch ${index}` });
        });
        const outcomes = Promise.allSettled(tasks);
        await flush();
        scheduler.cancel(new Error("shutdown"));
        await outcomes;
        await scheduler.waitForIdle();
        expect(cleaned).toBe(3);
        expect(scheduler.active).toBe(0);
        expect(scheduler.pending).toBe(0);
        for (const group of [...scheduler.groups]) expect(scheduler.closeGroup(group)).toBe(true);
        expect(scheduler.groups.size).toBe(0);
    });
});
