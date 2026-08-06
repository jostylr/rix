/** Internal support for expected error values and scalar pipe skipping. */

export const PIPE_SKIP = Object.freeze({ type: "__pipe_skip__" });

export function isPipeSkip(value) {
    return value === PIPE_SKIP || value?.type === "__pipe_skip__";
}

export function materializePipeSkip(value) {
    return isPipeSkip(value) ? null : value;
}

export function expectedErrorArgs(value) {
    if (!value || value.type !== "tuple" || !Array.isArray(value.values) || value.values.length === 0) {
        return null;
    }
    const tag = value.values[0];
    const spelling = tag?.type === "string" ? tag.value : typeof tag === "string" ? tag : null;
    return spelling === "error" || spelling === ":error" ? value.values.slice(1) : null;
}

export function expectedErrorKind(value) {
    const args = expectedErrorArgs(value);
    if (!args || args.length === 0) return null;
    const kind = args[0];
    if (kind?.type === "string") return kind.value.replace(/^:/, "");
    return typeof kind === "string" ? kind.replace(/^:/, "") : String(kind);
}
