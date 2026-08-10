/**
 * Control flow system functions: BLOCK, CASE, LOOP, BREAK, TERNARY
 *
 * All are lazy — they receive raw IR nodes and use the evaluate
 * callback to selectively evaluate branches.
 *
 * Truthiness: only null/undefined is falsy. Everything else is truthy.
 */

import { runtimeDefaults } from "../../runtime/runtime-config.js";
import { PREP_TRIAL_NO_MATCH } from "./core.js";
import { withFinalizerActivationSync } from "../../runtime/finalization.js";
import { UNDECIDED, decisionState } from "../../runtime/decision.js";

/**
 * Unwrap a DEFER node: if the node is { fn: "DEFER", args: [body] },
 * return the body; otherwise return the node itself.
 */
export function unwrapDefer(node) {
    if (node && node.fn === "DEFER" && node.args && node.args.length > 0) {
        return node.args[0];
    }
    return node;
}

function isHoleNode(node) {
    return Boolean(node) && node.fn === "HOLE";
}

export function splitScopedBlockArgs(args) {
    const first = args[0];
    if (
        first &&
        !first.fn &&
        (
            Array.isArray(first.imports) ||
            first.name !== undefined ||
            first.maxIterations !== undefined ||
            first.unlimited === true
        )
    ) {
        return {
            imports: first.imports ?? [],
            containerName: first.name ?? null,
            maxIterations: first.maxIterations,
            unlimited: first.unlimited === true,
            bodyArgs: args.slice(1),
        };
    }
    return {
        imports: [],
        containerName: null,
        maxIterations: undefined,
        unlimited: false,
        bodyArgs: args,
    };
}

class BreakSignal extends Error {
    constructor(targetType, targetName, value) {
        const targetParts = [];
        if (targetType) targetParts.push(targetType);
        if (targetName) targetParts.push(`'${targetName}'`);
        const targetLabel = targetParts.length > 0 ? targetParts.join(" ") : "breakable construct";
        super(`No matching break target found for ${targetLabel}`);
        this.name = "BreakSignal";
        this.kind = "break";
        this.targetType = targetType ?? null;
        this.targetName = targetName ?? null;
        this.value = value;
    }
}

function isBreakSignal(error) {
    return Boolean(error) && error.kind === "break";
}

export function addEvaluationContext(error, detail) {
    if (!error || typeof error !== "object" || isBreakSignal(error)) return error;
    if (!Array.isArray(error.rixEvaluationContexts)) error.rixEvaluationContexts = [];
    if (error.rixEvaluationContexts.includes(detail)) return error;
    error.rixEvaluationContexts.push(detail);
    error.message = `${error.message}\n${detail}`;
    return error;
}

export function matchesBreakTarget(signal, targetType, targetName) {
    if (!isBreakSignal(signal)) return false;
    if (signal.targetType !== null && signal.targetType !== targetType) {
        return false;
    }
    if (signal.targetName !== null && signal.targetName !== targetName) {
        return false;
    }
    return true;
}

function evaluateBreakValue(valueNode, context, evaluate) {
    context.push(undefined, { isolated: true, readThrough: true });
    try {
        return evaluate(valueNode);
    } finally {
        context.pop();
    }
}

/**
 * Evaluate a node in the current scope, sharing scope if it's a BLOCK/LOOP/SYSTEM.
 * Used by constructs that create their own scope (like LOOP) so that code-block
 * sub-parts act as grouping rather than creating an extra isolation boundary.
 * Nested blocks (e.g. { { ... } }) still get their own scope as usual.
 */
function evaluateShared(node, context, evaluate) {
    return context.withSharedBody(node, () => evaluate(node));
}

function applyImports(imports, context) {
    for (const spec of imports) {
        if (spec.mode === "alias") {
            context.importAlias(spec.local, spec.source);
        } else {
            context.importCopy(spec.local, spec.source);
        }
    }
}

export { evaluateShared };

export const controlFunctions = {
    SEQ: {
        lazy: true,
        impl(args, context, evaluate) {
            let result = null;
            for (const arg of args) {
                result = evaluate(arg);
            }
            return result;
        },
        doc: "Expression sequence: evaluate arguments left-to-right in the current scope and return the last value",
    },

    BLOCK: {
        lazy: true,
        impl(args, context, evaluate) {
            const { imports, containerName, bodyArgs } = splitScopedBlockArgs(args);
            const shareCurrentScope = context.consumeSharedBody("BLOCK");
            if (!shareCurrentScope) context.push(undefined, { isolated: true });
            try {
                return withFinalizerActivationSync(context, () => {
                    applyImports(imports, context);
                    let result = null;
                    try {
                        for (const stmt of bodyArgs) {
                            result = evaluate(stmt);
                        }
                    } catch (error) {
                        if (matchesBreakTarget(error, "block", containerName)) {
                            return error.value;
                        }
                        throw error;
                    }
                    return result;
                });
            } finally {
                if (!shareCurrentScope) context.pop();
            }
        },
        doc: "Sequential block execution, returns last value",
    },

    CASE: {
        lazy: true,
        impl(args, context, evaluate) {
            const { containerName, bodyArgs } = splitScopedBlockArgs(args);
            // CASE receives DEFER-wrapped elements from {? ... }
            // Each element is either:
            //   DEFER(CONDITION(test, action))  —  a condition ? action branch
            //   DEFER(PREP_TRIAL(...))          —  an ordered prepared-trial arm
            //   DEFER(expr)                      —  a default (fallback) branch
            try {
                for (let i = 0; i < bodyArgs.length; i++) {
                    const inner = unwrapDefer(bodyArgs[i]);

                    // Check if this is a CONDITION node (from `cond ? action`)
                    if (inner && inner.fn === "CONDITION") {
                        const condResult = evaluate(inner.args[0]);
                        const state = decisionState(condResult);
                        if (state === "truth") {
                            return evaluate(inner.args[1]);
                        }
                        if (state === "undecided") return UNDECIDED;
                        // Not truthy — try next branch
                        continue;
                    }

                    if (inner && inner.fn === "PREP_TRIAL") {
                        const result = evaluate({ ...inner, fn: "PREP_TRIAL_CASE" });
                        if (result === PREP_TRIAL_NO_MATCH) {
                            continue;
                        }
                        return result;
                    }

                    // Not a CONDITION node — it's a default/fallback
                    return evaluate(inner);
                }
            } catch (error) {
                if (matchesBreakTarget(error, "case", containerName)) {
                    return error.value;
                }
                throw error;
            }
            return null;
        },
        doc: "Ordered case expression with condition arms, prepared-trial arms, and an optional fallback",
    },

    LOOP: {
        lazy: true,
        impl(args, context, evaluate) {
            // LOOP(init, condition, body[, update[, after]])
            // The 3-argument form uses the body as the whole iteration step.
            // All args are DEFER nodes
            const { imports, containerName, maxIterations: configuredMax, unlimited, bodyArgs } = splitScopedBlockArgs(args);
            if (bodyArgs.length > 5) {
                throw new Error(`LOOP expected at most 5 arguments, got ${bodyArgs.length}`);
            }
            const [rawInitNode, rawCondNode, rawBodyNode, rawUpdateNode, rawAfterNode] = bodyArgs.map(unwrapDefer);
            const initNode = isHoleNode(rawInitNode) ? null : rawInitNode;
            const condNode = isHoleNode(rawCondNode) ? null : rawCondNode;
            const bodyNode = isHoleNode(rawBodyNode) ? null : rawBodyNode;
            const updateNode = isHoleNode(rawUpdateNode) ? null : rawUpdateNode;
            const afterNode = isHoleNode(rawAfterNode) ? null : rawAfterNode;

            const shareCurrentScope = context.consumeSharedBody("LOOP");
            if (!shareCurrentScope) context.push(undefined, { isolated: true });
            try {
                applyImports(imports, context);
                // Init — code blocks in loop positions share the loop's scope
                try {
                    if (initNode) evaluateShared(initNode, context, evaluate);

                    let result = null;
                    let iterations = 0;
                    const maxIterations = unlimited
                        ? null
                        : configuredMax ?? context.getEnv("defaultLoopMax", runtimeDefaults.defaultLoopMax);

                    while (true) {
                        if (condNode) {
                            let condResult;
                            try {
                                condResult = evaluateShared(condNode, context, evaluate);
                            } catch (error) {
                                throw addEvaluationContext(error, `while evaluating loop condition before iteration ${iterations + 1}`);
                            }
                            const state = decisionState(condResult);
                            if (state === "undecided") return UNDECIDED;
                            if (state === "null") break;
                        }

                        // The max check happens after the condition passes and before the next body run.
                        if (maxIterations !== null && iterations >= maxIterations) {
                            throw new Error(`Loop exceeded max iteration count: ${maxIterations}`);
                        }

                        if (bodyNode) {
                            try {
                                result = evaluateShared(bodyNode, context, evaluate);
                            } catch (error) {
                                throw addEvaluationContext(error, `while evaluating loop body, iteration ${iterations + 1}`);
                            }
                        }

                        if (updateNode) {
                            try {
                                evaluateShared(updateNode, context, evaluate);
                            } catch (error) {
                                throw addEvaluationContext(error, `while evaluating loop update after iteration ${iterations + 1}`);
                            }
                        }

                        iterations++;
                    }
                    if (afterNode) {
                        return evaluateShared(afterNode, context, evaluate);
                    }
                    return result;
                } catch (error) {
                    if (matchesBreakTarget(error, "loop", containerName)) {
                        return error.value;
                    }
                    throw error;
                }
            } finally {
                if (!shareCurrentScope) context.pop();
            }
        },
        doc: "Loop construct with init, condition, body[, update[, after]]",
    },

    TERNARY: {
        lazy: true,
        impl(args, context, evaluate) {
            // args[0] = condition (evaluated)
            // args[1] = true branch (DEFER)
            // args[2] = null branch (DEFER)
            // args[3] = undecided branch (DEFER)
            const condResult = evaluate(args[0]);
            const state = decisionState(condResult);
            const branch = state === "truth" ? args[1] : state === "null" ? args[2] : args[3];
            const marker = state === "truth" ? "?:" : state === "null" ? "?_" : "??";
            try {
                return evaluate(unwrapDefer(branch));
            } catch (error) {
                throw addEvaluationContext(error, `while evaluating '${marker}' branch`);
            }
        },
        doc: "Decision conditional: condition ?: truthExpr ?_ nullExpr ?? undecidedExpr",
    },

    BREAK: {
        lazy: true,
        impl(args, context, evaluate) {
            const meta = args[0] && !args[0].fn ? args[0] : {};
            const valueNode = args[0] && !args[0].fn ? args[1] : args[0];
            const value = evaluateBreakValue(valueNode, context, evaluate);
            throw new BreakSignal(meta.targetType, meta.targetName, value);
        },
        doc: "Structured break block that exits the nearest matching breakable construct",
    },

    SYSTEM: {
        lazy: true,
        impl(args, context, evaluate) {
            const { imports, containerName, bodyArgs } = splitScopedBlockArgs(args);
            const shareCurrentScope = context.consumeSharedBody("SYSTEM");
            if (!shareCurrentScope) context.push(undefined, { isolated: true });
            try {
                applyImports(imports, context);
                let result = null;
                for (const stmt of bodyArgs) {
                    result = evaluate(stmt);
                }
                return result;
            } finally {
                if (!shareCurrentScope) context.pop();
            }
        },
        doc: "Mathematical system container, currently evaluates as a block",
    },
};
