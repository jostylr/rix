import { Integer } from "@ratmath/core";

/** A recoverable operational failure, distinct from language and control errors. */
export class OperationalFault extends Error {
    constructor(message, options = {}) {
        super(message, options.cause ? { cause: options.cause } : undefined);
        this.name = "OperationalFault";
        this.kind = "fault";
        this.code = options.code || "OPERATIONAL_FAULT";
        this.data = options.data ?? null;
    }
}

export class TimeoutFault extends OperationalFault {
    constructor(timeoutSeconds, options = {}) {
        super(`Async scope timed out after ${timeoutSeconds} seconds`, {
            ...options,
            code: "ASYNC_TIMEOUT",
            data: options.data ?? { timeoutSeconds },
        });
        this.name = "TimeoutFault";
        this.timeoutSeconds = timeoutSeconds;
    }
}

export class CleanupGraceFault extends OperationalFault {
    constructor(graceMs, options = {}) {
        super(`Async cleanup exceeded its ${graceMs}ms grace period`, {
            ...options,
            code: "ASYNC_CLEANUP_GRACE_EXCEEDED",
            data: options.data ?? { graceMs },
        });
        this.name = "CleanupGraceFault";
        this.graceMs = graceMs;
    }
}

export function isOperationalFault(error) {
    return error instanceof OperationalFault || error?.kind === "fault";
}

function dataToRixValue(value, seen = new WeakSet()) {
    if (value === null || value === undefined) return null;
    if (value instanceof Integer || value?.type) return value;
    if (typeof value === "string") return { type: "string", value };
    if (typeof value === "boolean") return new Integer(value ? 1n : 0n);
    if (typeof value === "bigint") return new Integer(value);
    if (typeof value === "number" && Number.isSafeInteger(value)) {
        return new Integer(BigInt(value));
    }
    if (Array.isArray(value)) {
        if (seen.has(value)) return { type: "string", value: "[circular]" };
        seen.add(value);
        return { type: "sequence", values: value.map((entry) => dataToRixValue(entry, seen)) };
    }
    if (typeof value === "object") {
        if (seen.has(value)) return { type: "string", value: "[circular]" };
        seen.add(value);
        return {
            type: "map",
            entries: new Map(Object.entries(value).map(([key, entry]) => [
                key,
                dataToRixValue(entry, seen),
            ])),
        };
    }
    return { type: "string", value: String(value) };
}

export function faultToRixValue(error) {
    const entries = new Map([
        ["code", { type: "string", value: error?.code || "OPERATIONAL_FAULT" }],
        ["message", { type: "string", value: error?.message || "Operational fault" }],
    ]);
    if (error instanceof TimeoutFault || Number.isFinite(error?.timeoutSeconds)) {
        entries.set("timeout", new Integer(BigInt(Math.trunc(error.timeoutSeconds))));
    }
    if (error?.data !== null && error?.data !== undefined) {
        entries.set("data", dataToRixValue(error.data));
    }
    return { type: "map", entries };
}
