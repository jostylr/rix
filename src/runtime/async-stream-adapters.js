import { Integer } from "@ratmath/core";
import { createAsyncStream, createHotAsyncStream, pullRawAsyncStream, closeAsyncStream, asyncStreamMethodHelpers } from "./async-stream.js";
import { registerAsyncResource } from "./async-runtime.js";
import { getHostAdapter } from "./host-adapter.js";
import { OperationalFault } from "./operational-fault.js";
import { ASYNC_STREAM_CLOCK_ENV, defaultStreamClock, streamAlarm, abortableStreamWait } from "./async-stream-clock.js";

const integer = asyncStreamMethodHelpers.positiveInteger;
const text = (value) => value?.type === "string" ? value.value : value;
const string = (value) => ({ type: "string", value });
const fault = (code, message) => new OperationalFault(message, { code });

function own(stream, options) {
    if (options.context) registerAsyncResource(options.context, stream._stream.root, (_root, reason) => closeAsyncStream(stream, reason));
    return stream;
}

export function createTimerAsyncStream(milliseconds, options = {}) {
    const duration = integer(milliseconds, "TimerStream milliseconds");
    if (duration > 2147483647) throw new Error("TimerStream duration exceeds the host timer limit");
    const count = options.count === undefined ? null : integer(options.count, "TimerStream count", { allowZero: true });
    const clock = options.clock || defaultStreamClock;
    const controller = new AbortController();
    let index = 0;
    let alarm;
    return own(createAsyncStream({
        label: options.label || "timer", limits: options.limits, clock, finite: count !== null,
        async next(signal) {
            if (count !== null && index >= count) return { done: true };
            alarm = streamAlarm(clock, duration, controller.signal);
            try { await abortableStreamWait(alarm.promise, signal); }
            finally { alarm.cancel(); alarm = null; }
            return controller.signal.aborted ? { done: true } : { done: false, value: new Integer(BigInt(++index)) };
        },
        close(reason) { controller.abort(reason); alarm?.cancel(); },
    }), options);
}

/** Subscription starts on first demand; only explicit Latest/drop policies discard. */
export function createSubscriptionAsyncStream(subscribe, options = {}) {
    if (typeof subscribe !== "function") throw new TypeError("Stream subscription must be a host function");
    let unsubscribe;
    let started = false;
    const hot = createHotAsyncStream({
        ...options, overflowPolicy: options.overflowPolicy || "error",
        async unsubscribe() { await unsubscribe?.(); unsubscribe = null; },
    });
    return own(createAsyncStream({
        label: options.label || "subscription", limits: options.limits, finite: options.finite === true,
        inspect: hot.stream._stream.root.inspect,
        async next(signal) {
            if (!started) {
                started = true;
                // Host producers using block must await push; event adapters reject it below.
                const cleanup = subscribe(hot.push, hot.fault, hot.end);
                if (cleanup && typeof cleanup.then === "function") {
                    cleanup.then((lateCleanup) => lateCleanup?.()).catch(() => {});
                    throw new TypeError("Stream subscriptions must return their cleanup synchronously");
                }
                if (cleanup != null && typeof cleanup !== "function") throw new TypeError("Stream subscription cleanup must be a function");
                unsubscribe = cleanup;
            }
            return pullRawAsyncStream(hot.stream, signal);
        },
        close: (reason) => closeAsyncStream(hot.stream, reason),
    }), options);
}

export function createReactiveAsyncStream(source, options = {}) {
    if (typeof source?.subscribe !== "function") throw new TypeError("ReactiveStream requires an explicitly supplied reactive source");
    if (options.overflowPolicy === "block") throw new Error("Reactive callbacks cannot use blocking overflow");
    return createSubscriptionAsyncStream((push, fail) => source.subscribe((event) => {
        try {
            const value = options.project ? options.project(event)
                : source.type === "reactive_node" ? source.get()
                : { type: "map", entries: new Map([
                    ["event", string(String(event?.type || "reactive"))],
                    ["epoch", new Integer(BigInt(event?.epoch || 0))],
                    ["changed", { type: "sequence", values: (event?.changed || []).map(string) }],
                ]) };
            push(value);
        }
        catch (error) { fail(error); }
    }), { ...options, label: options.label || "reactive" });
}

export function createUIEventAsyncStream(target, eventName, options = {}) {
    if (typeof target?.addEventListener !== "function" || typeof target?.removeEventListener !== "function") throw new TypeError("UIStream requires an explicitly supplied EventTarget");
    if (typeof eventName !== "string" || !eventName || eventName.length > 128) throw new TypeError("UIStream event name must be a bounded string");
    if (options.overflowPolicy === "block") throw new Error("UI callbacks cannot use blocking overflow");
    return createSubscriptionAsyncStream((push, fail) => {
        const listener = (event) => { try { push(options.project ? options.project(event) : string(event.type)); } catch (error) { fail(error); } };
        target.addEventListener(eventName, listener);
        return () => target.removeEventListener(eventName, listener);
    }, { ...options, label: options.label || `ui:${eventName}` });
}

/** Supplying this object never grants script permissions. Both grant sets apply. */
export function createStreamHostServices(options = {}) {
    const permissions = new Set(options.permissions || []);
    return Object.freeze({
        permissions, authorize: options.authorize,
        fetch: options.fetch, openFile: options.openFile, createWebSocket: options.createWebSocket,
        uiTargets: options.uiTargets || new Map(),
    });
}

function transportAccess(kind, reference, options) {
    const services = options.services || getHostAdapter(options.context).streams;
    const permission = kind === "file" ? "FILES" : "NET";
    const runtime = options.context?.getEnv?.("__script_runtime__", null);
    const frame = runtime?.frameStack?.at(-1);
    if (!services?.permissions?.has(permission) || (frame && !frame.permissions?.has(permission))) {
        throw fault("ASYNC_STREAM_PERMISSION", `${kind} streams require an explicit ${permission} host and script grant`);
    }
    reference = text(reference);
    if (typeof reference !== "string" || !reference || reference.length > 8192) throw new TypeError("Stream transport reference must be a bounded string");
    if (kind !== "file") {
        const url = new URL(reference);
        const schemes = kind === "http" ? ["http:", "https:"] : ["ws:", "wss:"];
        if (!schemes.includes(url.protocol) || url.username || url.password) throw new TypeError("Unsupported stream URL");
    }
    if (typeof services.authorize !== "function" || services.authorize({ kind, reference, context: options.context }) !== true) {
        throw fault("ASYNC_STREAM_PERMISSION", `Host denied ${kind} stream reference`);
    }
    return { services, reference };
}

function byteLimits(options) {
    return {
        chunk: Math.min(integer(options.maxChunkBytes ?? 65536, "stream byte chunk limit"), 1048576),
        total: Math.min(integer(options.maxTotalBytes ?? 16777216, "stream total byte limit"), 67108864),
    };
}
function bytes(value) {
    if (typeof value === "string") return new TextEncoder().encode(value);
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    throw new TypeError("Transport streams accept only text or byte chunks");
}

function byteSource(kind, reference, options) {
    // Validate at construction and again at first use (revocation and imported frames).
    transportAccess(kind, reference, options);
    const bounds = byteLimits(options);
    const controller = new AbortController();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let iterator;
    let reader;
    let openedSource;
    let consumed = 0;
    let ended = false;
    return own(createAsyncStream({
        label: `${kind} stream`, limits: options.limits, finite: kind === "file",
        inspect: () => ({ bytes: consumed, maxChunkBytes: bounds.chunk, maxTotalBytes: bounds.total }),
        async next(signal) {
            if (ended) return { done: true };
            if (!iterator) {
                const access = transportAccess(kind, reference, options);
                let source;
                if (kind === "http") {
                    if (typeof access.services.fetch !== "function") throw new Error("Host has no HTTP stream service");
                    const opening = Promise.resolve(access.services.fetch(access.reference, { signal: controller.signal, redirect: "error", credentials: "omit" })).then(async (response) => {
                        if (controller.signal.aborted || !response?.ok) {
                            await response?.body?.cancel?.();
                            if (controller.signal.aborted) throw controller.signal.reason;
                            throw fault("ASYNC_STREAM_HTTP", `HTTP stream failed with status ${response?.status ?? "unknown"}`);
                        }
                        openedSource = response.body;
                        return openedSource;
                    });
                    source = await abortableStreamWait(opening, signal);
                } else {
                    if (typeof access.services.openFile !== "function") throw new Error("Host has no file stream service");
                    const opening = Promise.resolve(access.services.openFile(access.reference, { signal: controller.signal, chunkBytes: bounds.chunk })).then(async (opened) => {
                        if (controller.signal.aborted) {
                            if (opened?.cancel) await opened.cancel();
                            else await opened?.[Symbol.asyncIterator]?.().return?.();
                            throw controller.signal.reason;
                        }
                        openedSource = opened;
                        return openedSource;
                    });
                    source = await abortableStreamWait(opening, signal);
                }
                if (typeof source?.getReader === "function") {
                    reader = source.getReader(); iterator = { next: () => reader.read() };
                } else iterator = source?.[Symbol.asyncIterator]?.();
                if (!iterator) throw new TypeError("Host transport must return an async byte iterable or ReadableStream");
            }
            while (true) {
                const result = await abortableStreamWait(iterator.next(), signal);
                if (result.done) {
                    ended = true;
                    const final = decoder.decode();
                    return final ? { done: false, value: string(final) } : { done: true };
                }
                const chunk = bytes(result.value);
                consumed += chunk.byteLength;
                if (chunk.byteLength > bounds.chunk || consumed > bounds.total) throw fault("ASYNC_STREAM_BYTE_LIMIT", "Transport stream byte budget exceeded");
                const value = decoder.decode(chunk, { stream: true });
                if (value) return { done: false, value: string(value) };
            }
        },
        async close(reason) {
            controller.abort(reason);
            if (reader) { try { await reader.cancel(reason); } finally { reader.releaseLock(); } }
            else if (iterator) await iterator.return?.();
            else if (openedSource?.cancel) await openedSource.cancel(reason);
            else await openedSource?.[Symbol.asyncIterator]?.().return?.();
        },
    }), options);
}
export const createHttpAsyncStream = (reference, options = {}) => byteSource("http", reference, options);
export const createFileAsyncStream = (reference, options = {}) => byteSource("file", reference, options);

export function createWebSocketAsyncStream(reference, options = {}) {
    transportAccess("websocket", reference, options);
    if (options.overflowPolicy === "block") throw new Error("WebSocket events cannot use blocking overflow");
    const bounds = byteLimits(options);
    let consumed = 0;
    return createSubscriptionAsyncStream((push, fail, end) => {
        const access = transportAccess("websocket", reference, options);
        if (typeof access.services.createWebSocket !== "function") throw new Error("Host has no WebSocket stream service");
        const socket = access.services.createWebSocket(access.reference);
        socket.binaryType = "arraybuffer";
        const message = (event) => {
            try {
                const chunk = bytes(event.data); consumed += chunk.byteLength;
                if (chunk.byteLength > bounds.chunk || consumed > bounds.total) throw fault("ASYNC_STREAM_BYTE_LIMIT", "WebSocket byte budget exceeded");
                push(string(new TextDecoder("utf-8", { fatal: true }).decode(chunk)));
            } catch (error) { fail(error); }
        };
        const error = () => fail(fault("ASYNC_STREAM_WEBSOCKET", "WebSocket stream failed"));
        socket.addEventListener("message", message);
        socket.addEventListener("error", error);
        socket.addEventListener("close", end);
        return () => {
            socket.removeEventListener("message", message);
            socket.removeEventListener("error", error);
            socket.removeEventListener("close", end);
            socket.close(1000, "RiX stream closed");
        };
    }, { ...options, label: options.label || "websocket stream" });
}

function contextOptions(context) {
    return { context, limits: context.getEnv("asyncLimits", {}), clock: context.getEnv(ASYNC_STREAM_CLOCK_ENV, defaultStreamClock) };
}
export const asyncStreamAdapterCapabilities = {
    TimerStream: { impl: ([duration, count], context) => createTimerAsyncStream(duration, { ...contextOptions(context), ...(count === undefined ? {} : { count }) }), groups: ["Async"], doc: "Cold monotonic timer stream; optional finite tick count" },
    ReactiveStream: { impl: ([source], context) => createReactiveAsyncStream(source, contextOptions(context)), groups: ["Async", "RiXCel"], doc: "Bounded events from an explicitly passed reactive source" },
    UIStream: { impl: ([key, event], context) => createUIEventAsyncStream(getHostAdapter(context).streams?.uiTargets?.get(text(key)), text(event), contextOptions(context)), groups: ["Async"], doc: "Bounded events from a named host-supplied UI target" },
    HttpStream: { impl: ([reference], context) => createHttpAsyncStream(reference, contextOptions(context)), groups: ["Net"], doc: "UTF-8 HTTP byte stream through an explicitly granted host service" },
    FileStream: { impl: ([reference], context) => createFileAsyncStream(reference, contextOptions(context)), groups: ["Files"], doc: "UTF-8 file byte stream through an explicitly granted host service" },
    WebSocketStream: { impl: ([reference], context) => createWebSocketAsyncStream(reference, contextOptions(context)), groups: ["Net"], doc: "Bounded WebSocket messages through an explicitly granted host service" },
};
