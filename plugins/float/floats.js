// Float plugin arithmetic bridge used by the accompanying RiX startup source.
import { Integer } from "@ratmath/core";
import {
    BINARY32,
    BINARY64,
    classifyFloat,
    convertFloat,
    diagnosticsOf,
    floatText,
    formatInfo,
    formatOf,
    nextAfterValue,
    nextValue,
    numberFrom,
    operateFloat,
} from "./ieee754.js";

function int(value) {
    return new Integer(BigInt(value));
}

function bool(value) {
    return value ? int(1) : null;
}

function stringObj(value) {
    return { type: "string", value };
}

function map(entries) {
    return { type: "map", entries: new Map(entries) };
}

function sequence(values) {
    return { type: "sequence", values };
}

export function Is(value) {
    return bool(value?.type === "float" && typeof value.value === "number");
}

export function From(value, format) {
    return convertFloat(value, format, "float");
}

export function Value(value) {
    if (!value || value.type !== "float") throw new Error("Float Value expects a Float");
    return stringObj(floatText(value.value));
}

export function Format(value) {
    if (!Is(value)) throw new Error("Float Format expects a Float");
    return stringObj(formatOf(value));
}

export function Diagnostics(value) {
    if (!Is(value)) throw new Error("Float Diagnostics expects a Float");
    return sequence(diagnosticsOf(value).map(stringObj));
}

export function Classify(value) {
    if (!Is(value)) throw new Error("Float Classify expects a Float");
    const classification = classifyFloat(value);
    const info = formatInfo(classification.format);
    return map([
        ["valueKind", stringObj("floatClassification")],
        ["schema", stringObj("rix.float.classification@1")],
        ["format", stringObj(classification.format)],
        ["bits", int(classification.bits)],
        ["precisionBits", int(info.precisionBits)],
        ["class", stringObj(classification.className)],
        ["sign", stringObj(classification.sign)],
        ["finite", bool(classification.finite)],
        ["subnormal", bool(classification.subnormal)],
        ["negativeZero", bool(classification.negativeZero)],
        ["operation", value.operation ? stringObj(value.operation) : null],
        ["diagnostics", Diagnostics(value)],
    ]);
}

export function Export(value) {
    if (!value || value.type !== "float") throw new Error("Float export expects a Float");
    return {
        type: "map",
        entries: new Map([
            ["type", stringObj("Float")],
            ["data", { type: "map", entries: new Map([
                ["value", stringObj(floatText(value.value))],
                ["format", stringObj(formatOf(value))],
                ["operation", value.operation ? stringObj(value.operation) : null],
                ["diagnostics", Diagnostics(value)],
            ]) }],
            ["cache", null],
            ["version", int(2)],
        ]),
    };
}

export function Import(value) {
    const data = value?.entries?.get("data");
    const restored = From(
        Number(data?.entries?.get("value")?.value),
        data?.entries?.get("format") || BINARY64,
    );
    const storedDiagnostics = data?.entries?.get("diagnostics")?.values;
    if (Array.isArray(storedDiagnostics)) {
        restored.diagnostics = [...new Set(storedDiagnostics.map((item) => item?.value).filter(Boolean))];
    }
    restored.operation = data?.entries?.get("operation")?.value || null;
    return restored;
}

export function Binary32(value) { return From(value, BINARY32); }
export function Binary64(value) { return From(value, BINARY64); }
export function Add(x, y) { return operateFloat("add", [x, y], (left, right) => left + right, "float"); }
export function Sub(x, y) { return operateFloat("sub", [x, y], (left, right) => left - right, "float"); }
export function Mul(x, y) { return operateFloat("mul", [x, y], (left, right) => left * right, "float"); }
export function Div(x, y) { return operateFloat("div", [x, y], (left, right) => left / right, "float"); }
export function Pow(x, y) { return operateFloat("pow", [x, y], (left, right) => left ** right, "float"); }
export function Neg(x) { return operateFloat("neg", [x], (value) => -value, "float"); }

function comparable(x, y) {
    if (formatOf(x) !== formatOf(y)) {
        throw new Error("Mixed binary32/binary64 Float comparison requires an explicit format conversion");
    }
    return [numberFrom(x), numberFrom(y)];
}

export function Eq(x, y) { const [left, right] = comparable(x, y); return bool(left === right); }
export function Lt(x, y) { const [left, right] = comparable(x, y); return bool(left < right); }
export function Gt(x, y) { const [left, right] = comparable(x, y); return bool(left > right); }
export function Lte(x, y) { const [left, right] = comparable(x, y); return bool(left <= right); }
export function Gte(x, y) { const [left, right] = comparable(x, y); return bool(left >= right); }

export function Abs(x) { return operateFloat("abs", [x], Math.abs, "float"); }
export function Sqrt(x) { return operateFloat("sqrt", [x], Math.sqrt, "float"); }
export function Sin(x) { return operateFloat("sin", [x], Math.sin, "float"); }
export function Cos(x) { return operateFloat("cos", [x], Math.cos, "float"); }
export function Tan(x) { return operateFloat("tan", [x], Math.tan, "float"); }
export function Asin(x) { return operateFloat("asin", [x], Math.asin, "float"); }
export function Acos(x) { return operateFloat("acos", [x], Math.acos, "float"); }
export function Atan(x) { return operateFloat("atan", [x], Math.atan, "float"); }
export function Atan2(y, x) { return operateFloat("atan2", [y, x], Math.atan2, "float"); }
export function Log(x) { return operateFloat("log", [x], Math.log, "float"); }
export function Ln(x) { return operateFloat("log", [x], Math.log, "float"); }
export function Log10(x) { return operateFloat("log10", [x], Math.log10, "float"); }
export function Exp(x) { return operateFloat("exp", [x], Math.exp, "float"); }
export function NextUp(x) { return nextValue(x, 1, "float"); }
export function NextDown(x) { return nextValue(x, -1, "float"); }
export function NextAfter(x, target) { return nextAfterValue(x, target, "float"); }
