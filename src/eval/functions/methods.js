import { ensureMutableReceiver, resolveMethod } from "../../runtime/methods.js";
import { callWithConcreteArgs } from "./functions.js";
import { isLazySequence, materializeLazySequence } from "../../runtime/lazy-sequence.js";

function evaluateArgs(argNodes, evaluate) {
    const evaluatedArgs = [];
    for (const arg of argNodes) {
        if (arg && arg.fn === "SPREAD") {
            let spreadVal = evaluate(arg.args[0]);
            if (isLazySequence(spreadVal)) spreadVal = materializeLazySequence(spreadVal);
            if (spreadVal && (spreadVal.type === "tuple" || spreadVal.type === "sequence" || spreadVal.type === "array" || spreadVal.type === "set")) {
                const items = spreadVal.values || spreadVal.elements || [];
                evaluatedArgs.push(...items);
            } else {
                throw new Error("Spread operator requires an iterable collection (array, tuple, sequence, set)");
            }
        } else {
            evaluatedArgs.push(evaluate(arg));
        }
    }
    return evaluatedArgs;
}

export const methodFunctions = {
    CUSTOM_OPERATOR: {
        impl(args, context, evaluate, systemContext) {
            const [definition, left, right] = args;
            const target = definition?.target;
            if (!target) throw new Error("Custom operator is missing its dispatch target");

            if (target.kind === "function") {
                const fn = context.getCallable(target.name);
                if (!fn) {
                    throw new Error(
                        `Custom operator ${definition.spelling} target '${target.name}' is not defined`,
                    );
                }
                return callWithConcreteArgs(fn, [left, right], context, evaluate);
            }

            if (target.kind === "plugin-method" || target.kind === "system-method") {
                const mount = target.mount;
                if (!mount) {
                    throw new Error(
                        `Custom operator ${definition.spelling} plugin '${target.pluginId}' has no active mount`,
                    );
                }
                const entry = systemContext?.get?.(mount);
                const receiver = entry && Object.hasOwn(entry, "value") ? entry.value : entry;
                if (!receiver) {
                    throw new Error(
                        `Custom operator ${definition.spelling} requires plugin/system object '.${mount}'`,
                    );
                }
                const fn = resolveMethod(receiver, target.method);
                if (fn?.type === "method_builtin") {
                    return fn.impl([receiver, left, right], context, evaluate, callWithConcreteArgs);
                }
                return callWithConcreteArgs(fn, [receiver, left, right], context, evaluate);
            }

            throw new Error(`Unsupported custom operator target kind '${target.kind}'`);
        },
        doc: "Dispatch a statically declared custom operator to a function or plugin method",
    },

    CALL_METHOD: {
        lazy: true,
        impl(args, context, evaluate) {
            const target = evaluate(args[0]);
            const methodName = args[1];
            const callArgs = evaluateArgs(args.slice(2), evaluate);

            if (methodName.endsWith("!")) {
                ensureMutableReceiver(target);
            }

            const fn = resolveMethod(target, methodName);
            if (fn?.type === "method_builtin") {
                return fn.impl([target, ...callArgs], context, evaluate, callWithConcreteArgs);
            }
            return callWithConcreteArgs(fn, [target, ...callArgs], context, evaluate);
        },
        doc: "Resolve and invoke a receiver-first method call",
    },
};
