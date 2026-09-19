import { expect, test } from "bun:test";
import { Context } from "../../src/runtime/context.js";
import { createReactiveGraph } from "../../src/runtime/reactive-graph.js";
import { disposeAsyncResources } from "../../src/runtime/async-runtime.js";
import { consumeAsyncStreamSequential, pullRawAsyncStream, closeAsyncStream } from "../../src/runtime/async-stream.js";
import {
    createTimerAsyncStream, createReactiveAsyncStream, createUIEventAsyncStream,
    createStreamHostServices, createHttpAsyncStream, createFileAsyncStream, createWebSocketAsyncStream,
} from "../../src/runtime/async-stream-adapters.js";
import { FakeStreamClock, flushStreamJobs } from "../helpers/stream-clock.js";
const collect = (stream, execution = {}) => consumeAsyncStreamSequential(stream, { kind: "collect", bound: null }, execution);
const strings = (result) => result.values.map((value) => value.value);
const fixtureAccess = (options = {}) => createStreamHostServices({ permissions: ["NET", "FILES"], authorize: ({ reference }) => reference.startsWith("http://fixture/") || reference.startsWith("ws://fixture/") || reference === "fixture.txt", ...options });

class TrackedTarget extends EventTarget {
    listeners = 0;
    addEventListener(...args) { this.listeners++; return super.addEventListener(...args); }
    removeEventListener(...args) { this.listeners--; return super.removeEventListener(...args); }
}

test("timer is cold, demand-paced and exactly finite, with disposal clearing outstanding timers", async () => {
    const clock = new FakeStreamClock(); const context = new Context();
    const stream = createTimerAsyncStream(10, { clock, context, count: 2 });
    expect(clock.timers.size).toBe(0);
    const result = collect(stream); await clock.advance(20);
    expect((await result).values.map((value) => value.value)).toEqual([1n, 2n]);
    expect(clock.timers.size).toBe(0);
    const retained = createTimerAsyncStream(10, { clock, context });
    const pending = pullRawAsyncStream(retained); pending.catch(() => {}); await flushStreamJobs();
    expect(clock.timers.size).toBe(1); await disposeAsyncResources(context);
    await pending.catch(() => {}); expect(clock.timers.size).toBe(0);
    expect(retained._stream.root.closeCount).toBe(1);
});

test("reactive and UI subscriptions begin at first demand and release listeners on early close", async () => {
    const graph = createReactiveGraph({ evaluateFormula: () => null });
    const source = graph.addSource("value", 1);
    const reactive = createReactiveAsyncStream(source, { project: () => source.get() });
    const value = pullRawAsyncStream(reactive); await flushStreamJobs(); source.set(2);
    expect((await value).value).toBe(2); await closeAsyncStream(reactive);

    const target = new TrackedTarget(); const context = new Context();
    const events = createUIEventAsyncStream(target, "change", { context });
    expect(target.listeners).toBe(0);
    const first = pullRawAsyncStream(events); await flushStreamJobs();
    expect(target.listeners).toBe(1); target.dispatchEvent(new Event("change"));
    expect((await first).value.value).toBe("change");
    await disposeAsyncResources(context); expect(target.listeners).toBe(0);
    expect(() => createUIEventAsyncStream(target, "click", { overflowPolicy: "block" })).toThrow("blocking");
});

test("host transport and script grants intersect; denied calls never touch a service", async () => {
    let reads = 0;
    const services = fixtureAccess({ fetch: () => { reads++; } });
    expect(() => createHttpAsyncStream("http://outside/", { services })).toThrow("denied");
    const context = new Context();
    context.setEnv("__script_runtime__", { frameStack: [{ permissions: new Set() }] });
    expect(() => createHttpAsyncStream("http://fixture/data", { services, context })).toThrow("grant");
    expect(() => createFileAsyncStream("fixture.txt", { services: fixtureAccess({ permissions: ["NET"] }) })).toThrow("FILES");
    expect(() => createHttpAsyncStream("https://user:pass@fixture/", { services })).toThrow("URL");
    expect(reads).toBe(0);
    // Revocation between construction and first demand is also checked.
    const revoked = createHttpAsyncStream("http://fixture/data", { services }); services.permissions.delete("NET");
    await expect(collect(revoked)).rejects.toMatchObject({ code: "ASYNC_STREAM_PERMISSION" });
    expect(reads).toBe(0);
});

test("HTTP and file fixtures preserve split UTF-8, release readers, and enforce byte budgets", async () => {
    let cancelled = 0; let request;
    const encoded = new TextEncoder().encode("aλb");
    const services = fixtureAccess({ fetch: (_reference, options) => {
        request = options;
        return { ok: true, body: new ReadableStream({ start(controller) { controller.enqueue(encoded.slice(0, 2)); controller.enqueue(encoded.slice(2)); controller.close(); }, cancel() { cancelled++; } }) };
    } });
    expect(strings(await collect(createHttpAsyncStream("http://fixture/data", { services })))).toEqual(["a", "λb"]);
    expect(request.redirect).toBe("error"); expect(request.credentials).toBe("omit"); expect(request.signal.aborted).toBe(true);
    let returned = 0;
    const fileServices = fixtureAccess({ openFile: () => ({ async *[Symbol.asyncIterator]() { try { yield "abc"; yield "def"; } finally { returned++; } } }) });
    await expect(collect(createFileAsyncStream("fixture.txt", { services: fileServices, maxTotalBytes: 4 }))).rejects.toMatchObject({ code: "ASYNC_STREAM_BYTE_LIMIT" });
    expect(returned).toBe(1);
    const chunkServices = fixtureAccess({ openFile: () => ({ async *[Symbol.asyncIterator]() { yield "oversized"; } }) });
    await expect(collect(createFileAsyncStream("fixture.txt", { services: chunkServices, maxChunkBytes: 2 }))).rejects.toMatchObject({ code: "ASYNC_STREAM_BYTE_LIMIT" });
});

test("late HTTP bodies are cancelled after owner cancellation and HTTP faults cancel bodies", async () => {
    let release; let cancelled = 0;
    const services = fixtureAccess({ fetch: () => new Promise((resolve) => { release = resolve; }) });
    const stream = createHttpAsyncStream("http://fixture/data", { services });
    const controller = new AbortController();
    const result = collect(stream, { signal: controller.signal }); result.catch(() => {});
    await flushStreamJobs(); controller.abort(new Error("owner cancelled"));
    await expect(result).rejects.toThrow("owner cancelled");
    release({ ok: true, body: { cancel() { cancelled++; } } }); await flushStreamJobs(); expect(cancelled).toBe(1);
    const bad = fixtureAccess({ fetch: () => ({ ok: false, status: 404, body: { cancel() { cancelled++; } } }) });
    await expect(collect(createHttpAsyncStream("http://fixture/missing", { services: bad }))).rejects.toMatchObject({ code: "ASYNC_STREAM_HTTP" });
    expect(cancelled).toBe(2);
});

test("WebSocket fixtures are lazy, preserve message order, bound overflow and close all listeners", async () => {
    class FixtureSocket extends TrackedTarget { closes = 0; close() { this.closes++; } }
    let opened = 0; const socket = new FixtureSocket();
    const services = fixtureAccess({ createWebSocket: () => { opened++; return socket; } });
    const stream = createWebSocketAsyncStream("ws://fixture/events", { services, capacity: 1 });
    expect(opened).toBe(0);
    const first = pullRawAsyncStream(stream); await flushStreamJobs();
    socket.dispatchEvent(new MessageEvent("message", { data: "one" }));
    expect((await first).value.value).toBe("one");
    socket.dispatchEvent(new MessageEvent("message", { data: "two" }));
    socket.dispatchEvent(new MessageEvent("message", { data: "overflow" }));
    await expect(collect(stream)).rejects.toMatchObject({ code: "ASYNC_STREAM_OVERFLOW" });
    expect(socket.closes).toBe(1); expect(socket.listeners).toBe(0); expect(socket.binaryType).toBe("arraybuffer");
});
