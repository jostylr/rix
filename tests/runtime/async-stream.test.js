import { describe, expect, test } from "bun:test";
import { Integer } from "@ratmath/core";
import {
    asyncStreamFromIterable,
    closeAsyncStream,
    createAsyncStream,
    createHotAsyncStream,
    pullRawAsyncStream,
} from "../../src/runtime/async-stream.js";

const numbers = (values) => values.map((value) => Number(value.value));

async function drainRaw(stream) {
    const values = [];
    while (true) {
        const next = await pullRawAsyncStream(stream);
        if (next.done) return values;
        values.push(next.value);
    }
}

describe("async_stream runtime protocol", () => {
    test("cold iterable streams are lazy, linear, and close exactly once", async () => {
        let pulls = 0;
        let closes = 0;
        const source = createAsyncStream({
            label: "cold test",
            finite: true,
            async next() {
                pulls++;
                return pulls <= 2
                    ? { done: false, value: new Integer(BigInt(pulls)) }
                    : { done: true };
            },
            close() { closes++; },
        });

        expect(pulls).toBe(0);
        expect(numbers(await drainRaw(source))).toEqual([1, 2]);
        await closeAsyncStream(source);
        expect(closes).toBe(1);
        expect(source._stream.root.status).toBe("done");
    });

    test("async iterable pulls are serialized to provide cold backpressure", async () => {
        let current = 0;
        let active = 0;
        let maxActive = 0;
        const iterable = {
            [Symbol.asyncIterator]() {
                return {
                    async next() {
                        active++;
                        maxActive = Math.max(maxActive, active);
                        await Promise.resolve();
                        active--;
                        current++;
                        return current <= 3
                            ? { done: false, value: new Integer(BigInt(current)) }
                            : { done: true };
                    },
                };
            },
        };
        const stream = asyncStreamFromIterable(iterable, { finite: true });
        const results = await Promise.all([
            pullRawAsyncStream(stream),
            pullRawAsyncStream(stream),
            pullRawAsyncStream(stream),
        ]);
        expect(numbers(results.map((result) => result.value))).toEqual([1, 2, 3]);
        expect(maxActive).toBe(1);
    });

    test("hot streams implement drop and error overflow policies", async () => {
        const oldest = createHotAsyncStream({ capacity: 2, overflowPolicy: "drop_oldest" });
        oldest.push(new Integer(1n));
        oldest.push(new Integer(2n));
        oldest.push(new Integer(3n));
        oldest.end();
        expect(numbers(await drainRaw(oldest.stream))).toEqual([2, 3]);

        const latest = createHotAsyncStream({ capacity: 2, overflowPolicy: "drop_latest" });
        latest.push(new Integer(1n));
        latest.push(new Integer(2n));
        expect(latest.push(new Integer(3n))).toBe(false);
        latest.end();
        expect(numbers(await drainRaw(latest.stream))).toEqual([1, 2]);

        const errors = createHotAsyncStream({ capacity: 1, overflowPolicy: "error" });
        errors.push(new Integer(1n));
        errors.push(new Integer(2n));
        await expect(pullRawAsyncStream(errors.stream)).rejects.toMatchObject({
            kind: "fault",
            code: "ASYNC_STREAM_OVERFLOW",
        });
    });

    test("block overflow waits until a consumer creates capacity", async () => {
        let unsubscribes = 0;
        const hot = createHotAsyncStream({
            capacity: 1,
            overflowPolicy: "block",
            unsubscribe() { unsubscribes++; },
        });
        hot.push(new Integer(1n));
        const blocked = hot.push(new Integer(2n));
        expect(blocked).toBeInstanceOf(Promise);
        expect(Number((await pullRawAsyncStream(hot.stream)).value.value)).toBe(1);
        expect(await blocked).toBe(true);
        hot.end();
        expect(numbers(await drainRaw(hot.stream))).toEqual([2]);
        await closeAsyncStream(hot.stream);
        expect(unsubscribes).toBe(1);

        const ended = createHotAsyncStream({ capacity: 1, overflowPolicy: "block" });
        ended.push(new Integer(1n));
        const abandoned = ended.push(new Integer(2n));
        ended.end();
        expect(await abandoned).toBe(false);
        expect(numbers(await drainRaw(ended.stream))).toEqual([1]);
    });
});
