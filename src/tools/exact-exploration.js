/** Bounded exact-number exploration built on Core values and RiX parser contracts. */
import { Integer, Rational, RationalInterval } from "@ratmath/core";
import { parse } from "../parser/index.js";

export function exactExplorationInterval(value) {
    if (value instanceof RationalInterval) return new RationalInterval(value.start, value.end);
    if (value instanceof Integer) value = value.toRational();
    return value instanceof Rational ? new RationalInterval(value, value) : null;
}

export function boundedExactExplorationInterval(value) {
    const interval = exactExplorationInterval(value);
    if (!interval) return null;
    if ([interval.start, interval.end].some((endpoint) => endpoint.numerator.toString(2).length + endpoint.denominator.toString(2).length > 16384)) {
        throw new Error("Exact exploration value exceeds the 16384-bit limit");
    }
    return interval;
}

export function createExactNumberLineGraphic(records, { title = "Exact number line", maximum = 64 } = {}) {
    if (!Number.isInteger(maximum) || maximum < 1 || maximum > 256) throw new Error("Number-line record limit must be 1–256");
    const retained = records.slice(0, maximum).map((record, index) => ({ ...record, id: String(record.id || `number-${index + 1}`), value: boundedExactExplorationInterval(record.value) })).filter((record) => record.value);
    if (!retained.length) throw new Error("Number line requires at least one exact rational or interval");
    let low = retained[0].value.low, high = retained[0].value.high;
    for (const { value } of retained) { if (value.low.lessThan(low)) low = value.low; if (value.high.greaterThan(high)) high = value.high; }
    if (low.equals(high)) { low = low.subtract(new Rational(1)); high = high.add(new Rational(1)); }
    const padding = high.subtract(low).divide(new Rational(10));
    low = low.subtract(padding); high = high.add(padding);
    const x = (value) => value.subtract(low).divide(high.subtract(low)).multiply(new Rational(640)).add(new Rational(40));
    const children = [];
    const series = [];
    const colors = ["#2563eb", "#0f766e", "#7c3aed"];
    for (const [index, record] of retained.entries()) {
        const y = new Rational(45 + index * 55), color = colors[index % colors.length];
        const start = [x(record.value.start), y], end = [x(record.value.end), y];
        const point = record.value.start.equals(record.value.end);
        const source = point ? String(record.value.start) : String(record.value);
        const label = `${record.label || record.id}: ${source}${point ? "" : record.value.isAscending ? " (ascending)" : " (reversed)"}`;
        children.push({ type: "output", kind: "path", points: [[new Rational(40), y], [new Rational(680), y]], style: new Map([["stroke", "#cbd5e1"], ["width", 1], ["id", `${record.id}:axis`]]) });
        children.push({ type: "output", kind: "path", points: [start, end], style: new Map([["stroke", color], ["width", 4], ["id", record.id]]) });
        for (const [endpoint, center] of [["start", start], ["end", end]]) children.push({ type: "output", kind: "circle", center, radius: new Rational(5), style: new Map([["fill", color], ["id", `${record.id}:${endpoint}`]]) });
        children.push({ type: "output", kind: "text_mark", position: [new Rational(40), y.subtract(new Rational(12))], text: label.length > 80 ? `${label.slice(0, 77)}…` : label,
            style: new Map([["size", 12], ["fill", "#334155"], ["id", `${record.id}:label`]]) });
        series.push(new Map([["id", record.id], ["label", label], ["data", [start, end]],
            ["originalData", [[record.value.start, new Integer(index)], [record.value.end, new Integer(index)]]]]));
    }
    return { type: "output", kind: "graphic", size: [720, 70 + (retained.length - 1) * 55], children,
        metadata: new Map([["plot", new Map([["title", title], ["kind", "number-line"], ["series", series]])],
            ["exploration", { schema: "rix.exact-number-line@1", records: retained, omitted: Math.max(0, records.length - retained.length), domain: new RationalInterval(low, high) }]]) };
}

/** Inspect only pure arithmetic syntax; reject calls, assignments and control flow. */
export function traceExactArithmetic(source, resolve, { maxNodes = 64, maxDepth = 16 } = {}) {
    if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > 256 || !Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 32) throw new Error("Arithmetic trace limits exceed 256 nodes/32 levels");
    const steps = [], diagnostics = [];
    let visited = 0, exhausted = false;
    const record = (node, sourceText, value, status, reason = null, dependencies = []) => {
        const interval = exactExplorationInterval(value);
        const entry = { id: `step-${steps.length + 1}`, source: sourceText, operator: node.operator || null, value,
            status, reason, dependencies, width: interval ? interval.high.subtract(interval.low) : null };
        steps.push(entry); return entry;
    };
    const visit = (node, depth) => {
        if (visited >= maxNodes || depth > maxDepth) { exhausted = true; return null; }
        visited += 1;
        if (node.type === "Grouping") return visit(node.expression, depth + 1);
        if (node.type === "Number" || node.type === "UserIdentifier" || node.type === "ReactiveRef") {
            const spelling = node.type === "Number" ? node.value : node.type === "ReactiveRef" ? `$${node.name}` : node.name;
            try {
                const response = resolve(spelling);
                const value = response?.type === "result" ? response.value : response;
                if (!boundedExactExplorationInterval(value)) return record(node, spelling, null, "unresolved", "Not a finite exact rational or interval");
                return record(node, spelling, value, value instanceof RationalInterval ? "certified-enclosure" : "exact");
            } catch (error) { return record(node, spelling, null, "unresolved", error.message); }
        }
        if (node.type === "UnaryOperation" && ["+", "-"].includes(node.operator)) {
            const operand = visit(node.operand, depth + 1);
            if (!operand) return null;
            if (operand.value === null) return record(node, `${node.operator}(${operand.source})`, null, operand.status, operand.reason, [operand.id]);
            const value = node.operator === "+" ? operand.value : operand.value.negate();
            return record(node, `${node.operator}(${operand.source})`, value, operand.status, null, [operand.id]);
        }
        if (node.type !== "BinaryOperation" || !["+", "-", "*", "/", ":"].includes(node.operator)) {
            return record(node, "Unsupported expression", null, "unresolved", "Only literal/variable arithmetic is inspected; calls and assignments are never replayed");
        }
        const left = visit(node.left, depth + 1), right = visit(node.right, depth + 1);
        if (!left || !right) return null;
        const expression = `(${left.source} ${node.operator} ${right.source})`;
        if (left.value === null || right.value === null) {
            const undefinedOperand = [left, right].find((entry) => entry.status === "undefined");
            return record(node, expression, null, undefinedOperand ? "undefined" : "unresolved", undefinedOperand ? `Undefined operand: ${undefinedOperand.reason}` : "An operand is unresolved", [left.id, right.id]);
        }
        try {
            const a = exactExplorationInterval(left.value), b = exactExplorationInterval(right.value);
            if (node.operator === "/" && b.low.lessThanOrEqual(Rational.zero) && b.high.greaterThanOrEqual(Rational.zero)) {
                return record(node, expression, null, "undefined", `Divisor ${b} contains zero`, [left.id, right.id]);
            }
            let value;
            if (node.operator === ":") {
                if (!a.start.equals(a.end) || !b.start.equals(b.end)) throw new Error("Interval endpoints must be exact rational points");
                value = new RationalInterval(a.start, b.start);
            } else {
                const method = { "+": "add", "-": "subtract", "*": "multiply", "/": "divide" }[node.operator];
                value = left.value instanceof RationalInterval || right.value instanceof RationalInterval ? a[method](b) : a.start[method](b.start);
            }
            boundedExactExplorationInterval(value);
            const result = record(node, expression, value, value instanceof RationalInterval ? "certified-enclosure" : "exact", null, [left.id, right.id]);
            const before = [left.width, right.width].filter(Boolean);
            result.widened = result.width !== null && before.some((width) => result.width.greaterThan(width));
            if (result.widened) result.reason = "Interval width grew relative to an operand; repeated dependencies are not assumed independent evidence";
            return result;
        } catch (error) { return record(node, expression, null, "undefined", error.message, [left.id, right.id]); }
    };
    let result = null;
    if (typeof source !== "string" || source.length > 8192) diagnostics.push("Trace source exceeds the 8192-character limit");
    else {
        try {
            const nodes = parse(source);
            if (nodes.length !== 1) diagnostics.push("Trace requires one arithmetic expression; statements are not replayed");
            else result = visit(nodes[0], 0);
        } catch (error) { diagnostics.push(error.message); }
    }
    if (exhausted) diagnostics.push(`Trace stopped at its ${maxNodes}-node/${maxDepth}-level budget; partial steps are retained`);
    return { schema: "rix.arithmetic-trace@1", steps, result, exhausted, diagnostics, visited, limits: { maxNodes, maxDepth, maxSourceLength: 8192 } };
}
