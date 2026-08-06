/**
 * FIFO bounded scheduler used by RiX structured-concurrency scopes.
 *
 * A scheduler admits source items, not individual awaits. Callers decide the
 * lifetime of an item by keeping the promise returned from run() pending until
 * the item has passed through its complete fused pipeline region.
 */
export class AsyncScheduler {
    constructor(limit) {
        if (!Number.isSafeInteger(limit) || limit < 1) {
            throw new Error("Async concurrency limit must be a positive safe integer");
        }
        this.limit = limit;
        this.active = 0;
        this.queue = [];
        this.cancelled = false;
        this.cancelReason = null;
        this.idleWaiters = [];
    }

    run(task) {
        if (this.cancelled) return Promise.reject(this.cancelReason);
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.#admit();
        });
    }

    cancel(reason = new Error("Async scope cancelled")) {
        if (this.cancelled) return;
        this.cancelled = true;
        this.cancelReason = reason;
        const queued = this.queue.splice(0);
        for (const entry of queued) entry.reject(reason);
        this.#notifyIdle();
    }

    waitForIdle() {
        if (this.active === 0 && this.queue.length === 0) return Promise.resolve();
        return new Promise((resolve) => this.idleWaiters.push(resolve));
    }

    #admit() {
        while (!this.cancelled && this.active < this.limit && this.queue.length > 0) {
            const entry = this.queue.shift();
            this.active++;
            Promise.resolve()
                .then(entry.task)
                .then(entry.resolve, (error) => {
                    // Fail fast: stop admitting queued siblings before the
                    // rejected item releases its slot.
                    this.cancel(error);
                    entry.reject(error);
                })
                .finally(() => {
                    this.active--;
                    this.#admit();
                    this.#notifyIdle();
                });
        }
    }

    #notifyIdle() {
        if (this.active !== 0 || this.queue.length !== 0) return;
        const waiters = this.idleWaiters.splice(0);
        for (const resolve of waiters) resolve();
    }
}

export const BACKGROUND_TASKS_ENV = "__async_background_tasks__";
export const BACKGROUND_ERRORS_ENV = "__async_background_errors__";

export function registerBackgroundTask(context, task) {
    const tasks = context.getEnv(BACKGROUND_TASKS_ENV, new Set());
    context.setEnv(BACKGROUND_TASKS_ENV, tasks);
    tasks.add(task);
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
