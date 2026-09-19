import { normalizeAsyncFailure } from "./async-policy.js";
import { TASK_WORKER_PROTOCOL, inertTaskMessage, decodeTaskValue, validateTaskRequest, restoreTaskRandom } from "./task-worker-protocol.js";
import { evaluationCheckpoint } from "./evaluation-budget.js";
const cancelled = (message = "Task worker cancelled") => new DOMException(message, "AbortError");
const limit = (value, fallback, ceiling, name) => { value ??= fallback; if (!Number.isSafeInteger(value) || value < 1 || value > ceiling) throw new RangeError(`Invalid ${name}`); return value; };
/** A scheduler-owned pool. Worker creation is host supplied; it grants no ambient I/O. */
export class TaskWorkerPool {
    constructor(options = {}) {
        if (typeof options.workerFactory !== "function") throw new TypeError("Task workers require a host workerFactory");
        this.factory = options.workerFactory;
        this.maxWorkers = limit(options.maxWorkers, 2, 64, "worker count");
        this.maxQueued = limit(options.maxQueued, 64, 4096, "task queue");
        this.maxSteps = limit(options.maxSteps, 250_000, 10_000_000, "step budget");
        this.maxTimeMs = limit(options.maxTimeMs, 5000, 60_000, "time budget");
        this.graceMs = limit(options.graceMs, 50, 5000, "cancellation grace");
        this.slots = new Set(); this.queue = []; this.nextId = 1; this.closed = false;
        this.completed = 0; this.terminated = 0;
    }
    snapshot() { return { executor: "task-worker", workers: this.slots.size, active: [...this.slots].filter((slot) => slot.job).length, queued: this.queue.length, completed: this.completed, terminated: this.terminated, closed: this.closed }; }
    remainingBudget(options) {
        const budget = options.context?.getEnv("__evaluation_budget__", null);
        for (const signal of [options.signal, budget?.signal]) if (signal?.aborted) throw signal.reason ?? cancelled();
        const maxSteps = Math.min(this.maxSteps, budget?.maxSteps == null ? this.maxSteps : budget.maxSteps - budget.steps);
        const maxTimeMs = Math.min(this.maxTimeMs, budget?.deadline == null ? this.maxTimeMs : Math.floor(budget.deadline - Date.now()));
        if (!Number.isSafeInteger(maxSteps) || !Number.isSafeInteger(maxTimeMs) || maxSteps <= 0 || maxTimeMs <= 0) throw new Error("Task owner evaluation budget exhausted");
        return { maxSteps, maxTimeMs };
    }
    runTask(task, options = {}) {
        if (this.closed) return Promise.reject(cancelled("Task worker pool closed"));
        if (options.signal?.aborted) return Promise.reject(options.signal.reason || cancelled());
        if (this.queue.length >= this.maxQueued) return Promise.reject(new Error("Task worker queue limit exceeded"));
        try { validateTaskRequest(task); } catch (error) { return Promise.reject(error); }
        return new Promise((resolve, reject) => {
            let remaining;
            try { remaining = this.remainingBudget(options); } catch (error) { reject(normalizeAsyncFailure(error)); return; }
            const job = { id: this.nextId++, task, options, resolve, reject, settled: false, slot: null, ...remaining };
            job.abort = () => this.cancelJob(job, options.signal?.reason || cancelled());
            options.signal?.addEventListener("abort", job.abort, { once: true });
            this.queue.push(job); this.dispatch();
        });
    }
    settle(job, error, value) {
        if (job.settled) return;
        job.settled = true; job.options.signal?.removeEventListener("abort", job.abort);
        if (arguments.length >= 3) job.resolve(value);
        else job.reject(normalizeAsyncFailure(error));
    }
    cancelJob(job, reason) {
        if (job.settled) return;
        this.settle(job, reason);
        if (!job.slot) { this.queue = this.queue.filter((entry) => entry !== job); return; }
        try { job.slot.worker.postMessage({ protocol: TASK_WORKER_PROTOCOL, kind: "cancel", id: job.id }); } catch {}
        job.slot.grace = setTimeout(() => this.retire(job.slot), this.graceMs);
    }
    retire(slot, error = cancelled("Task worker terminated")) {
        if (!this.slots.delete(slot)) return;
        clearTimeout(slot.timer); clearTimeout(slot.grace);
        if (slot.job) this.settle(slot.job, error);
        slot.job = null; this.terminated++;
        try { Promise.resolve(slot.worker.terminate()).catch(() => {}); } catch {}
        this.dispatch();
    }
    createSlot() {
        const worker = this.factory(), slot = { worker, job: null, timer: null, grace: null };
        this.slots.add(slot);
        worker.addEventListener("message", (event) => this.receive(slot, event.data));
        worker.addEventListener("error", (event) => this.retire(slot, new Error(event.message || "Task worker failed")));
        return slot;
    }
    dispatch() {
        if (this.closed) return;
        while (this.queue.length) {
            let slot = [...this.slots].find((candidate) => !candidate.job);
            if (!slot && this.slots.size >= this.maxWorkers) return;
            const job = this.queue.shift();
            try {
                // Queue wait and earlier results can consume the same owner's budget.
                // Check before creating a worker and again immediately before dispatch.
                this.remainingBudget(job.options);
                slot ||= this.createSlot();
                Object.assign(job, this.remainingBudget(job.options));
            } catch (error) { this.settle(job, error); continue; }
            slot.job = job; job.slot = slot;
            slot.timer = setTimeout(() => this.cancelJob(job, cancelled(`Task worker exceeded ${job.maxTimeMs}ms`)), job.maxTimeMs);
            try { slot.worker.postMessage(inertTaskMessage({ protocol: TASK_WORKER_PROTOCOL, kind: "run", id: job.id, task: job.task, maxSteps: job.maxSteps, maxTimeMs: job.maxTimeMs, taskPath: job.options.taskPath || [] })); }
            catch (error) { this.retire(slot, error); }
        }
    }
    receive(slot, input) {
        if (!this.slots.has(slot)) return;
        let message;
        try { message = inertTaskMessage(input); } catch (error) { this.retire(slot, error); return; }
        const job = slot.job;
        if (!job || message.protocol !== TASK_WORKER_PROTOCOL || message.id !== job.id) return;
        clearTimeout(slot.timer); clearTimeout(slot.grace);
        try {
            if (!job.settled) {
                if (!["error", "result"].includes(message.kind) || !Number.isSafeInteger(message.steps) || message.steps < 0 || message.steps > job.maxSteps + 1) throw new Error("Invalid worker result");
                const context = job.options.context, budget = context?.getEnv("__evaluation_budget__", null);
                if (budget) budget.steps += message.steps;
                if (context) evaluationCheckpoint(context);
                if (message.kind === "error") throw Object.assign(new Error(message.message || "Task evaluation failed"), { code: message.code || "TASK_WORKER_ERROR", asyncTaskSegments: job.options.taskPath || [], rixLocation: message.location || null });
                if (message.kind !== "result" || !Number.isSafeInteger(message.steps) || message.steps < 0 || message.steps > job.maxSteps) throw new Error("Invalid worker result");
                const value = decodeTaskValue(message.value);
                if (job.options.signal?.aborted) throw job.options.signal.reason || cancelled();
                if (context) restoreTaskRandom(context, message.random);
                // Reactive ownership never crosses the wire. This host callback may commit
                // validated literals or one atomic batch into its own graph.
                if (job.options.commit) job.options.commit(value);
                this.completed++; this.settle(job, null, value);
            }
        } catch (error) { this.settle(job, error); }
        slot.job = null; this.dispatch();
    }
    async dispose() {
        this.closed = true;
        for (const job of this.queue.splice(0)) this.settle(job, cancelled("Task worker pool closed"));
        const endings = [];
        for (const slot of this.slots) {
            clearTimeout(slot.timer); clearTimeout(slot.grace);
            if (slot.job) this.settle(slot.job, cancelled("Task worker pool closed"));
            try { endings.push(Promise.resolve(slot.worker.terminate())); } catch {}
        }
        this.slots.clear(); await Promise.allSettled(endings);
    }
}
export function createTaskWorkerPool(options) { return new TaskWorkerPool(options); }
