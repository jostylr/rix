/** Host-injectable monotonic milliseconds. No wall-clock timestamps enter stream order. */
export const ASYNC_STREAM_CLOCK_ENV = "__async_stream_clock__";
export const defaultStreamClock = Object.freeze({
    now: () => performance.now(),
    setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
    clearTimeout: (timer) => clearTimeout(timer),
});

export function streamAbortReason(signal) {
    return signal?.reason || Object.assign(new Error("Async stream cancelled"), { kind: "cancellation" });
}

export function abortableStreamWait(promise, signal) {
    if (!signal) return Promise.resolve(promise);
    // Observe the losing promise, including when the signal was already cancelled.
    const observed = Promise.resolve(promise);
    if (signal.aborted) { observed.catch(() => {}); return Promise.reject(streamAbortReason(signal)); }
    return new Promise((resolve, reject) => {
        const abort = () => { cleanup(); reject(streamAbortReason(signal)); };
        const cleanup = () => signal.removeEventListener("abort", abort);
        signal.addEventListener("abort", abort, { once: true });
        observed.then((value) => { cleanup(); resolve(value); }, (error) => { cleanup(); reject(error); });
    });
}

export function streamAlarm(clock, milliseconds, signal) {
    let timer;
    let abort;
    let settle;
    const promise = new Promise((resolve, reject) => {
        settle = resolve;
        abort = () => {
            if (timer !== undefined) clock.clearTimeout(timer);
            timer = undefined;
            signal?.removeEventListener("abort", abort);
            reject(streamAbortReason(signal));
        };
        if (signal?.aborted) { reject(streamAbortReason(signal)); return; }
        timer = clock.setTimeout(() => { timer = undefined; signal?.removeEventListener("abort", abort); resolve(true); }, milliseconds);
        signal?.addEventListener("abort", abort, { once: true });
    });
    function cancel() {
        if (timer !== undefined) clock.clearTimeout(timer);
        timer = undefined;
        signal?.removeEventListener("abort", abort);
        settle?.(false);
    }
    // A timer can be cancelled before its owner awaits the race.
    promise.catch(() => {});
    return { promise, cancel };
}
