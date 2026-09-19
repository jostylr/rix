import { asyncLimits, asyncLimitFault, normalizeAsyncFailure, appendAsyncFailures } from "./async-policy.js";

/**
 * FIFO bounded scheduler used by RiX structured-concurrency scopes.
 *
 * A scheduler admits source items, not individual awaits. Callers decide the
 * lifetime of an item by keeping the promise returned from run() pending until
 * the item has passed through its complete fused pipeline region. An admitted
 * item may temporarily yield its ticket while a nested structural fan-out runs
 * and reacquire it before continuing.
 */
export class AsyncScheduler {
    constructor(limit, options = {}) {
        if (!Number.isSafeInteger(limit) || limit < 1) {
            throw new Error("Async concurrency limit must be a positive safe integer");
        }
        this.limits = asyncLimits(options);
        this.limit = Math.min(limit, this.limits.concurrency);
        this.pending = 0;
        this.groups = new Set();
        this.active = 0;
        this.queue = [];
        this.cancelled = false;
        this.cancelReason = null;
        this.idleWaiters = [];
        this.nextTaskId = 1;
        this.nextObservationOrder = 1;
        this.admitScheduled = false;
        this.defaultGroup = this.createGroup(this.limit);
    }

    snapshot() {
        return { executor: "event-loop", limit: this.limit, active: this.active, pending: this.pending, queued: this.queue.length, cancellation: this.cancelReason?.message ?? (this.cancelled ? String(this.cancelReason) : "none") };
    }

    createGroup(limit = this.limit, parent = null) {
        if (!Number.isSafeInteger(limit) || limit < 1) {
            throw new Error("Async concurrency limit must be a positive safe integer");
        }
        const group = {
            limit: Math.min(limit, parent?.limit ?? this.limit),
            parent,
            children: new Set(),
            inFlight: 0,
            pending: 0,
            droppedErrors: 0,
            cancelled: false,
            cancelReason: null,
            primaryError: null,
            suppressedErrors: [],
            branchAdmissions: new Map(),
            controller: new AbortController(),
        };
        group.signal = group.controller.signal;
        parent?.children.add(group);
        this.groups.add(group);
        return group;
    }

    run(task, group = this.defaultGroup, options = {}) {
        const cancellation = this.#cancellationFor(group);
        if (cancellation) return Promise.reject(cancellation);
        if (this.queue.length >= this.limits.queued || this.pending + this.queue.length >= this.limits.outstanding) {
            return Promise.reject(asyncLimitFault("admission queue", this.limits.queued));
        }
        return new Promise((resolve, reject) => {
            const id = this.nextTaskId++;
            this.queue.push({
                kind: "task",
                task,
                resolve,
                reject,
                group,
                path: options.path || `task ${id}`,
                taskPath: options.taskPath ? [...options.taskPath] : null,
                branchPath: Array.isArray(options.branchPath) ? [...options.branchPath] : null,
            });
            this.#scheduleAdmit();
        });
    }

    suspend(ticket) {
        if (!ticket?.active || ticket.finished) return false;
        ticket.active = false;
        this.active--;
        this.#adjustInFlight(ticket.group, -1);
        this.#scheduleAdmit();
        this.#notifyIdle();
        return true;
    }

    resume(ticket) {
        if (!ticket || ticket.active) return Promise.resolve();
        if (ticket.finished) return Promise.reject(new Error("Cannot resume a completed async task"));
        if (ticket.resumePromise) return ticket.resumePromise;
        const cancellation = this.#cancellationFor(ticket.group);
        if (cancellation) return Promise.reject(cancellation);
        // A suspended task already owns an outstanding-work reservation.
        ticket.resumePromise = new Promise((resolve, reject) => {
            this.queue.push({ kind: "resume", ticket, group: ticket.group, branchPath: null, resolve, reject });
            this.#scheduleAdmit();
        }).finally(() => { ticket.resumePromise = null; });
        return ticket.resumePromise;
    }

    cancel(reason = new Error("Async scope cancelled")) {
        if (this.cancelled) return;
        reason = normalizeAsyncFailure(reason);
        this.cancelled = true;
        this.cancelReason = reason;
        for (const group of this.groups) this.#abortGroupTree(group, reason);
        const queued = this.queue.splice(0);
        for (const entry of queued) entry.reject(reason);
        this.#notifyIdle();
    }

    cancelGroup(group, reason = new Error("Async scope cancelled")) {
        if (!group || group.cancelled) return;
        reason = normalizeAsyncFailure(reason);
        const cancelledGroups = new Set();
        const markCancelled = (current) => {
            if (current.cancelled) return;
            current.cancelled = true;
            current.cancelReason = reason;
            current.controller.abort(reason);
            cancelledGroups.add(current);
            for (const child of current.children) markCancelled(child);
        };
        markCancelled(group);
        const retained = [];
        for (const entry of this.queue) {
            if (cancelledGroups.has(entry.group)) entry.reject(reason);
            else retained.push(entry);
        }
        this.queue = retained;
        this.#scheduleAdmit();
        this.#notifyIdle();
    }

    waitForIdle(group = null) {
        if (this.#isIdle(group)) return Promise.resolve();
        return new Promise((resolve) => this.idleWaiters.push({ group, resolve }));
    }

    closeGroup(group) {
        if (!group || !this.#isIdle(group)) return false;
        group.parent?.children.delete(group);
        this.groups.delete(group);
        group.branchAdmissions.clear();
        return true;
    }

    #admit() {
        while (!this.cancelled && this.active < this.limit && this.queue.length > 0) {
            const index = this.#nextAdmissionIndex();
            if (index < 0) break;
            const [entry] = this.queue.splice(index, 1);
            this.#recordBranchAdmission(entry);
            this.active++;
            this.#adjustInFlight(entry.group, 1);
            if (entry.kind === "resume") {
                entry.ticket.active = true;
                entry.resolve();
                continue;
            }
            const ticket = { group: entry.group, active: true, finished: false };
            this.pending++;
            for (let current = entry.group; current; current = current.parent) current.pending++;
            Promise.resolve()
                .then(() => entry.task(ticket))
                .then(entry.resolve, (error) => {
                    entry.reject(this.#observeFailure(entry.group, error, entry.path, entry.taskPath));
                })
                .finally(() => {
                    ticket.finished = true;
                    this.pending--;
                    for (let current = entry.group; current; current = current.parent) current.pending--;
                    // A host may mistakenly return without awaiting its resume.
                    this.queue = this.queue.filter((queued) => {
                        if (queued.ticket !== ticket) return true;
                        queued.reject(new Error("Async task completed before resuming"));
                        return false;
                    });
                    if (ticket.active) {
                        ticket.active = false;
                        this.active--;
                        this.#adjustInFlight(entry.group, -1);
                    }
                    this.#scheduleAdmit();
                    this.#notifyIdle();
                });
        }
    }

    #scheduleAdmit() {
        if (this.admitScheduled) return;
        this.admitScheduled = true;
        queueMicrotask(() => {
            this.admitScheduled = false;
            this.#admit();
        });
    }

    #nextAdmissionIndex() {
        let bestIndex = -1;
        let bestScore = null;
        for (let index = 0; index < this.queue.length; index++) {
            const entry = this.queue[index];
            if (!this.#canAdmit(entry.group)) continue;
            if (!entry.branchPath || entry.branchPath.length === 0) {
                if (bestIndex < 0) return index;
                continue;
            }
            const score = this.#branchScore(entry);
            if (bestIndex < 0 || this.#compareBranchScores(score, bestScore) < 0) {
                bestIndex = index;
                bestScore = score;
            }
        }
        return bestIndex;
    }

    #branchScore(entry) {
        const score = [];
        const prefix = [];
        for (const segment of entry.branchPath) {
            prefix.push(segment);
            score.push(entry.group.branchAdmissions.get(prefix.join("/")) || 0);
        }
        return score;
    }

    #compareBranchScores(left, right) {
        const length = Math.max(left.length, right.length);
        for (let index = 0; index < length; index++) {
            const a = left[index] ?? 0;
            const b = right[index] ?? 0;
            if (a !== b) return a - b;
        }
        return 0;
    }

    #recordBranchAdmission(entry) {
        if (!entry.branchPath || entry.branchPath.length === 0) return;
        const prefix = [];
        for (const segment of entry.branchPath) {
            prefix.push(segment);
            const key = prefix.join("/");
            if (entry.group.branchAdmissions.has(key) || entry.group.branchAdmissions.size < this.limits.branchRecords) {
                entry.group.branchAdmissions.set(key, (entry.group.branchAdmissions.get(key) || 0) + 1);
            }
        }
    }

    #canAdmit(group) {
        if (this.cancelled) return false;
        for (let current = group; current; current = current.parent) {
            if (current.cancelled || current.inFlight >= current.limit) return false;
        }
        return true;
    }

    #observeFailure(group, error, path, taskPath) {
        error = normalizeAsyncFailure(error);
        error.asyncTaskPath ??= path;
        if (taskPath) error.asyncTaskSegments ??= [...taskPath];
        error.asyncObservationOrder ??= this.nextObservationOrder++;
        error.asyncObservedAt ??= performance.now();
        error.asyncScheduler ??= this.snapshot();
        if (!group.primaryError) {
            group.primaryError = error;
            this.cancelGroup(group, error);
            return error;
        }
        if (error === group.primaryError || error === group.cancelReason) return error;
        if (group.suppressedErrors.length < this.limits.errors) {
            group.suppressedErrors.push(error);
            appendAsyncFailures(group.primaryError, [error], this.limits.errors);
        } else {
            group.droppedErrors++;
            group.primaryError.asyncDroppedErrors = (group.primaryError.asyncDroppedErrors || 0) + 1;
        }
        return error;
    }

    #adjustInFlight(group, delta) {
        for (let current = group; current; current = current.parent) {
            current.inFlight += delta;
        }
    }

    #cancellationFor(group) {
        if (this.cancelled) return this.cancelReason;
        for (let current = group; current; current = current.parent) {
            if (current.cancelled) return current.cancelReason;
        }
        return null;
    }

    #abortGroupTree(group, reason) {
        if (!group) return;
        group.cancelled = true;
        group.cancelReason = reason;
        group.controller.abort(reason);
        for (const child of group.children) this.#abortGroupTree(child, reason);
    }

    #isDescendant(group, ancestor) {
        for (let current = group; current; current = current.parent) {
            if (current === ancestor) return true;
        }
        return false;
    }

    #isIdle(group) {
        if (!group) return this.pending === 0 && this.queue.length === 0;
        if (group.pending !== 0) return false;
        return !this.queue.some((entry) => this.#isDescendant(entry.group, group));
    }

    #notifyIdle() {
        const pending = [];
        for (const waiter of this.idleWaiters) {
            if (this.#isIdle(waiter.group)) waiter.resolve();
            else pending.push(waiter);
        }
        this.idleWaiters = pending;
    }
}

export const BACKGROUND_TASKS_ENV = "__async_background_tasks__";
export const BACKGROUND_ERRORS_ENV = "__async_background_errors__";
const asyncResources = new WeakMap();
const disposingContexts = new WeakSet();

export function registerAsyncResource(context, resource, close) {
    if (!context || !resource || typeof close !== "function") return resource;
    if (disposingContexts.has(context)) throw new Error("Cannot acquire async resources during context shutdown");
    let resources = asyncResources.get(context);
    if (!resources) {
        resources = new Map();
        asyncResources.set(context, resources);
    }
    const limit = asyncLimits(context.getEnv("asyncLimits", {})).outstanding;
    if (!resources.has(resource) && resources.size >= limit) throw asyncLimitFault("async resources", limit);
    const taskPath = [...(context.getEnv("__async_task_path__", []) || []), "cleanup"];
    resources.set(resource, async (value, reason) => {
        try { return await close(value, reason); }
        catch (error) {
            const failure = normalizeAsyncFailure(error);
            failure.asyncTaskSegments ??= taskPath;
            failure.asyncTaskPath ??= taskPath.join(" / ");
            throw failure;
        }
    });
    return resource;
}

export function unregisterAsyncResource(context, resource) {
    const resources = asyncResources.get(context);
    if (!resources) return false;
    const removed = resources.delete(resource);
    if (resources.size === 0) asyncResources.delete(context);
    return removed;
}

export async function disposeAsyncResources(context, reason = { kind: "session shutdown" }) {
    const resources = asyncResources.get(context);
    if (!resources || resources.size === 0) return [];
    asyncResources.delete(context);
    disposingContexts.add(context);
    const failures = [];
    const limit = asyncLimits(context.getEnv("asyncLimits", {})).errors;
    for (const [resource, close] of [...resources].reverse()) {
        try {
            await close(resource, reason);
        } catch (error) {
            if (failures.length < limit) failures.push(normalizeAsyncFailure(error));
            else failures.droppedErrors = (failures.droppedErrors || 0) + 1;
        }
    }
    disposingContexts.delete(context);
    return failures;
}

export function reserveBackgroundTask(context) {
    if (disposingContexts.has(context)) throw new Error("Cannot launch background work during context shutdown");
    if (!context.getEnv("__async_background_owner__", null)) context.setEnv("__async_background_owner__", context);
    if (!context.getEnv(BACKGROUND_ERRORS_ENV, null)) context.setEnv(BACKGROUND_ERRORS_ENV, []);
    const tasks = context.getEnv(BACKGROUND_TASKS_ENV, new Set());
    context.setEnv(BACKGROUND_TASKS_ENV, tasks);
    const limits = asyncLimits(context.getEnv("asyncLimits", {}));
    if ((asyncResources.get(context)?.size || 0) >= limits.outstanding) throw asyncLimitFault("async resources", limits.outstanding);
    const limit = limits.background;
    if (tasks.size >= limit) throw asyncLimitFault("background tasks", limit);
    let release;
    const reservation = new Promise((resolve) => { release = resolve; });
    tasks.add(reservation);
    return () => { tasks.delete(reservation); release(); };
}

export function recordBackgroundError(context, error) {
    context = context.getEnv("__async_background_owner__", context);
    error = normalizeAsyncFailure(error);
    const errors = context.getEnv(BACKGROUND_ERRORS_ENV, []);
    const limit = asyncLimits(context.getEnv("asyncLimits", {})).errors;
    if (errors.length < limit) errors.push(error);
    else context.setEnv("__async_dropped_background_errors__", context.getEnv("__async_dropped_background_errors__", 0) + 1);
    context.setEnv(BACKGROUND_ERRORS_ENV, errors);
}

export function registerBackgroundTask(context, task, releaseReservation = null) {
    const tasks = context.getEnv(BACKGROUND_TASKS_ENV, new Set());
    context.setEnv(BACKGROUND_TASKS_ENV, tasks);
    if (!releaseReservation) releaseReservation = reserveBackgroundTask(context);
    tasks.add(task);
    releaseReservation();
    task.then(
        () => tasks.delete(task),
        () => tasks.delete(task),
    );
    return task;
}

export async function drainBackgroundTasks(context) {
    const tasks = context.getEnv(BACKGROUND_TASKS_ENV, new Set());
    while (tasks.size > 0) {
        await Promise.allSettled([...tasks]);
    }
    return context.getEnv(BACKGROUND_ERRORS_ENV, []);
}
