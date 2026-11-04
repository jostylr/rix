import { Integer } from "@ratmath/core";

function isIndexAssignable(value) {
    return value !== null && typeof value === "object" &&
        (value.type === "sequence" || value.type === "map") &&
        (Array.isArray(value.values) || value.entries instanceof Map);
}

/**
 * Arrays and maps are structurally mutable by default. An operation that
 * builds a new array or map must hand back one that behaves like a literal;
 * a result that is one of the operation's own arguments keeps whatever
 * mutability its owner chose.
 */
export function markFreshMutable(result, args = []) {
    if (!isIndexAssignable(result) || args.includes(result)) return result;
    if (!(result._ext instanceof Map)) result._ext = new Map();
    if (!result._ext.has("_mutable")) result._ext.set("_mutable", new Integer(1n));
    return result;
}

/** Wrap named registry definitions so their freshly built results are mutable. */
export function withFreshMutableResults(definitions, names) {
    for (const name of names) {
        const definition = definitions[name];
        if (!definition) throw new Error(`Unknown collection operation: ${name}`);
        const impl = definition.impl;
        definition.impl = function freshMutableResult(args, ...rest) {
            const result = impl.call(this, args, ...rest);
            if (result && typeof result.then === "function") {
                return result.then((value) => markFreshMutable(value, args));
            }
            return markFreshMutable(result, args);
        };
    }
    return definitions;
}
