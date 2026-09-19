import { Context } from "./context.js";
import { SystemContext } from "./system-context.js";
import { createDefaultRegistry, createDefaultSystemContext, evaluateAsync } from "../eval/evaluator.js";
import { createEvaluationBudget, evaluationCheckpoint } from "./evaluation-budget.js";
import { TASK_WORKER_PROTOCOL, inertTaskMessage, validateTaskRequest, restoreTaskRandom, snapshotTaskRandom, encodeTaskValue } from "./task-worker-protocol.js";
import { disposeAsyncResources, drainBackgroundTasks } from "./async-runtime.js";
/** Install only in a dedicated task worker, never the editor execution service. */
export function installTaskWorker(endpoint) {
    let active = null;
    // Only the validated pure core task subset can execute here. Build its
    // callable definitions once; every request still receives new capability
    // descriptors, captured values, random state, budget and ordinary context.
    let registry = null, core = null;
    endpoint.addEventListener("message", async ({ data }) => {
        let message;
        try { message = inertTaskMessage(data); } catch { return; }
        if (message.protocol !== TASK_WORKER_PROTOCOL || !Number.isSafeInteger(message.id)) return;
        if (message.kind === "cancel") { if (active?.id === message.id) active.controller.abort(new DOMException("Task cancelled", "AbortError")); return; }
        if (message.kind !== "run" || active) return;
        const controller = new AbortController(), context = new Context();
        active = { id: message.id, controller };
        const reply = (payload) => endpoint.postMessage(inertTaskMessage({ protocol: TASK_WORKER_PROTOCOL, id: message.id, ...payload }));
        let response;
        try {
            if (!Number.isSafeInteger(message.maxSteps) || message.maxSteps < 1 || message.maxSteps > 10_000_000 || !Number.isSafeInteger(message.maxTimeMs) || message.maxTimeMs < 1 || message.maxTimeMs > 60_000) throw new Error("Invalid task budget");
            const { task, captured } = validateTaskRequest(message.task);
            registry ||= createDefaultRegistry();
            core ||= createDefaultSystemContext();
            const system = new SystemContext(new Map(task.grants.map((name) => [name, core.get(name)])), true);
            for (const [name, value] of captured.entries) context.set(name, value);
            restoreTaskRandom(context, task.random);
            if (task.rangePolicy) context.setScopedEnv("__range_math_policy__", task.rangePolicy);
            const budget = createEvaluationBudget({ maxSteps: message.maxSteps, maxTimeMs: message.maxTimeMs, signal: controller.signal });
            context.setEnv("__evaluation_budget__", budget);
            context.setEnv("__system_context__", system); context.setEnv("__registry__", registry);
            const value = await evaluateAsync(task.ir, context, registry, system);
            evaluationCheckpoint(context);
            response = { kind: "result", value: encodeTaskValue(value), random: snapshotTaskRandom(context), steps: budget.steps };
        } catch (error) {
            response = { kind: "error", message: String(error?.message || error).slice(0, 4096), code: String(error?.code || "TASK_WORKER_ERROR").slice(0, 100), location: error?.rixLocation || null, steps: Number.isSafeInteger(message.maxSteps) && message.maxSteps > 0 ? Math.min(message.maxSteps + 1, context.getEnv("__evaluation_budget__", null)?.steps || 0) : 0 };
        } finally {
            try { await disposeAsyncResources(context); await drainBackgroundTasks(context); }
            catch (error) { response = { kind: "error", message: String(error?.message || error).slice(0, 4096), code: "TASK_WORKER_CLEANUP", steps: response?.steps || 0 }; }
            active = null;
        }
        // Completion makes the slot reusable. Announce it only after cleanup
        // and clearing `active`, including synchronous validation failures.
        reply(response);
    });
}
if (typeof self !== "undefined" && typeof document === "undefined" && typeof self.postMessage === "function") installTaskWorker(self);
