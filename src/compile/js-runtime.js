/** Runtime helpers for the deliberately limited ahead-of-time JS experiment. */
import { Integer } from "@ratmath/core";
import { decisionState, UNDECIDED } from "../runtime/decision.js";

export { decisionState, UNDECIDED };
export const NO_MATCH = Symbol("RiX compiled variant did not match");

export function rixModulo(left, right) {
    if (!(left instanceof Integer) || !(right instanceof Integer)) {
        throw new TypeError("Compiled integer % requires RiX Integer operands");
    }
    if (right.value <= 0n) throw new Error("Modulo divisor must be positive");
    const remainder = left.value % right.value;
    return new Integer(remainder < 0n ? remainder + right.value : remainder);
}

export function rixEqual(left, right) {
    if (!(left instanceof Integer) || !(right instanceof Integer)) {
        throw new TypeError("Compiled integer == requires RiX Integer operands");
    }
    return left.equals(right) ? Integer.one : null;
}

export function rixGenerator(start, step, limit) {
    if (!(start instanceof Integer) || !(step instanceof Integer) || !(limit instanceof Integer)) {
        throw new TypeError("Compiled arithmetic generator requires RiX Integer values");
    }
    const count = Number(limit.value);
    if (!Number.isSafeInteger(count) || count < 0) {
        throw new Error("Generator limit must be a non-negative safe integer");
    }
    const values = [];
    let current = start;
    for (let index = 0; index < count; index += 1) {
        values.push(current);
        if (index + 1 < count) current = current.add(step);
    }
    return { type: "sequence", values };
}

export function rixFunction(name, invoke) {
    return Object.freeze({ type: "compiled_function", name, invoke });
}

export function rixMultifunction(name, variants) {
    return Object.freeze({
        type: "compiled_multifunction",
        name,
        variants,
        invoke(...args) {
            for (const variant of variants) {
                const result = variant.invoke(...args);
                if (result !== NO_MATCH) return result;
            }
            return null;
        },
    });
}

export function rixInvoke(callable, ...args) {
    if (callable?.type !== "compiled_function" && callable?.type !== "compiled_multifunction") {
        throw new TypeError("Value is not a compiled RiX callable");
    }
    return callable.invoke(...args);
}

export function rixMap(collection, callable) {
    if (collection?.type !== "sequence" || !Array.isArray(collection.values)) {
        throw new TypeError("Compiled map requires a RiX sequence");
    }
    return {
        type: "sequence",
        values: collection.values.map((value) => rixInvoke(callable, value)),
    };
}
