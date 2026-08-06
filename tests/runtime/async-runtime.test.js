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
});
