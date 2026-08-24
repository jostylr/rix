export const EVALUATION_BUDGET_ENV = "__evaluation_budget__";

export class EvaluationLimitError extends Error {
    constructor(message, data = {}) {
        super(message);
        this.name = "EvaluationLimitError";
        this.code = "EVALUATION_LIMIT";
        this.data = data;
    }
}

function positiveLimit(value, label) {
    if (value === undefined || value === null) return null;
    const limit = Number(value);
    if (!Number.isSafeInteger(limit) || limit <= 0) {
        throw new TypeError(`${label} must be a positive safe integer`);
    }
    return limit;
}

export function createEvaluationBudget(options = {}) {
    const maxSteps = positiveLimit(options.maxSteps, "maxSteps");
    const maxTimeMs = positiveLimit(options.maxTimeMs, "maxTimeMs");
    if (maxSteps === null && maxTimeMs === null && !options.signal) return null;
    return {
        maxSteps,
        maxTimeMs,
        steps: 0,
        deadline: maxTimeMs === null ? null : Date.now() + maxTimeMs,
        signal: options.signal || null,
    };
}

export function enterEvaluationBudget(context, options = {}) {
    const existing = context.getEnv(EVALUATION_BUDGET_ENV, null);
    if (existing) return { budget: existing, leave() {} };

    const budget = createEvaluationBudget(options);
    if (!budget) return { budget: null, leave() {} };
    const hadPrevious = context.env?.has(EVALUATION_BUDGET_ENV) === true;
    const previous = context.getEnv(EVALUATION_BUDGET_ENV, undefined);
    context.setEnv(EVALUATION_BUDGET_ENV, budget);
    return {
        budget,
        leave() {
            if (hadPrevious) context.setEnv(EVALUATION_BUDGET_ENV, previous);
            else context.env?.delete(EVALUATION_BUDGET_ENV);
        },
    };
}

export function evaluationCheckpoint(context) {
    const budget = context?.getEnv?.(EVALUATION_BUDGET_ENV, null);
    if (!budget) return;
    if (budget.signal?.aborted) {
        throw budget.signal.reason || new DOMException("Evaluation cancelled", "AbortError");
    }
    budget.steps++;
    if (budget.maxSteps !== null && budget.steps > budget.maxSteps) {
        throw new EvaluationLimitError(
            `Evaluation exceeded its ${budget.maxSteps}-step limit`,
            { maxSteps: budget.maxSteps, steps: budget.steps },
        );
    }
    if (budget.deadline !== null && Date.now() > budget.deadline) {
        throw new EvaluationLimitError(
            `Evaluation exceeded its ${budget.maxTimeMs}ms time limit`,
            { maxTimeMs: budget.maxTimeMs, steps: budget.steps },
        );
    }
}
