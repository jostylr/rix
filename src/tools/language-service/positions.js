/** UTF-16/LSP position helpers. JavaScript string offsets are already UTF-16. */
export function lineStarts(source) {
    const starts = [0];
    for (let index = 0; index < source.length; index++) {
        if (source.charCodeAt(index) === 10) starts.push(index + 1);
    }
    return starts;
}

export function offsetToPosition(source, offset, starts = lineStarts(source)) {
    const bounded = Math.max(0, Math.min(source.length, Number(offset) || 0));
    let low = 0;
    let high = starts.length;
    while (low + 1 < high) {
        const middle = (low + high) >> 1;
        if (starts[middle] <= bounded) low = middle;
        else high = middle;
    }
    return { line: low, character: bounded - starts[low] };
}

export function positionToOffset(source, position, starts = lineStarts(source)) {
    const line = Math.max(0, Math.min(starts.length - 1, Number(position?.line) || 0));
    const lineStart = starts[line];
    const nextStart = line + 1 < starts.length ? starts[line + 1] : source.length;
    const lineEnd = nextStart > lineStart && source.charCodeAt(nextStart - 1) === 10
        ? nextStart - 1
        : nextStart;
    return Math.max(lineStart, Math.min(lineEnd, lineStart + (Number(position?.character) || 0)));
}

export function offsetsToLspRange(source, range, starts = lineStarts(source)) {
    return {
        start: offsetToPosition(source, range?.start || 0, starts),
        end: offsetToPosition(source, range?.end ?? range?.start ?? 0, starts),
    };
}

export function tokenRange(token) {
    const start = Number.isInteger(token?.pos?.[1]) ? token.pos[1] : (token?.pos?.[0] || 0);
    const end = Number.isInteger(token?.pos?.[2]) ? token.pos[2] : start;
    return { start, end: Math.max(start, end) };
}

export function nodeRange(node) {
    const start = Number.isInteger(node?.pos?.[1]) ? node.pos[1] : (node?.pos?.[0] || 0);
    const end = Number.isInteger(node?.pos?.[2]) ? node.pos[2] : start;
    return { start, end: Math.max(start, end) };
}

