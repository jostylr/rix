/**
 * Deprecated runtime-only derived view of a subscribable RiX value.
 *
 * FormulaSheet and Binding both expose subscribe(listener). A LiveView uses
 * that small contract so renderers can refresh any derived output without
 * knowing which interactive object produced the change. New RiX code should
 * name an ordinary reactive output and return a tracked `$name` read instead.
 */

import { Integer } from "@ratmath/core";

let nextLiveViewId = 1;

function methods() {
    return new Map([
        ["GET", {
            type: "method_builtin",
            name: "Get",
            impl: ([target]) => target.current,
        }],
        ["SNAPSHOT", {
            type: "method_builtin",
            name: "Snapshot",
            impl: ([target]) => target.current,
        }],
        ["immutable", new Integer(1n)],
    ]);
}

export function isReactiveSource(value) {
    return Boolean(value && typeof value.subscribe === "function");
}

export function isLiveView(value) {
    return Boolean(value && value.type === "output" && value.kind === "live_view");
}

export function createLiveView(source, derive, options = {}) {
    if (!isReactiveSource(source)) {
        throw new Error("LiveView source must support subscriptions, such as a FormulaSheet or Binding");
    }
    if (typeof derive !== "function") throw new Error("LiveView requires a derivation function");

    let current = derive(source);
    let revision = 0;
    let error = null;
    let disposed = false;
    const channel = new Set();
    const id = options.id || `live-view-${nextLiveViewId++}`;
    let view = null;

    const unsubscribeSource = source.subscribe((sourceEvent) => {
        if (disposed) return;
        if (sourceEvent?.type === "formula:error") {
            error = sourceEvent.error;
            const event = Object.freeze({
                type: "live:error",
                view,
                revision,
                sourceEvent,
                error,
            });
            for (const listener of [...channel]) listener(event);
            return;
        }
        const previous = current;
        try {
            current = derive(source);
            revision += 1;
            error = null;
            const event = Object.freeze({
                type: "live:commit",
                view,
                previous,
                value: current,
                revision,
                sourceEvent,
            });
            for (const listener of [...channel]) listener(event);
        } catch (cause) {
            error = cause;
            const event = Object.freeze({
                type: "live:error",
                view,
                revision,
                sourceEvent,
                error: cause,
            });
            for (const listener of [...channel]) listener(event);
        }
    });

    view = Object.freeze({
        type: "output",
        kind: "live_view",
        id,
        source,
        get current() {
            return current;
        },
        get revision() {
            return revision;
        },
        get error() {
            return error;
        },
        subscribe(listener) {
            if (typeof listener !== "function") throw new Error("LiveView subscriber must be a function");
            channel.add(listener);
            return () => channel.delete(listener);
        },
        snapshot() {
            return current;
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            unsubscribeSource?.();
            channel.clear();
        },
        _ext: methods(),
        toString() {
            return `[LiveView ${id} · revision ${revision}]`;
        },
    });
    return view;
}
