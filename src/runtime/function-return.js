// A return is addressed to one dynamic call activation, never to a block or
// a function definition (recursive calls must have different targets).
export class FunctionReturnSignal extends Error {
    constructor(target, value) {
        super("Function return");
        this.name = "FunctionReturnSignal";
        this.target = target;
        this.value = value;
    }
}

export function isFunctionReturnSignal(value) {
    return value instanceof FunctionReturnSignal;
}

export function requireReturnTarget(context) {
    const target = context.functionReturnTargets?.at(-1);
    if (!target?.active) {
        const error = new Error("?_> and ??> require an active function call");
        error.functionReturnFault = true;
        throw error;
    }
    return target;
}

// Explicit return clauses must not disappear into soft prep/trial no-match.
export function isFunctionReturnControl(error) {
    return isFunctionReturnSignal(error) || error?.functionReturnFault === true;
}

export function markReturnPayloadError(error) {
    if (isFunctionReturnSignal(error)) return error;
    if (!(error instanceof Error)) error = new Error(String(error));
    error.functionReturnFault = true;
    return error;
}

export function returnedValue(signal) {
    // Cleanup failures must not be silently discarded as a successful return.
    if (signal.suppressed?.length) throw signal.suppressed[0];
    return signal.value;
}
