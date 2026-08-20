import { Integer, Rational } from "@ratmath/core";

export const BINARY32 = "binary32";
export const BINARY64 = "binary64";

const FORMAT_INFO = Object.freeze({
    [BINARY32]: Object.freeze({
        bits: 32,
        precisionBits: 24,
        minimumNormal: 2 ** -126,
        minimumSubnormal: 2 ** -149,
        maximumFinite: (2 - 2 ** -23) * 2 ** 127,
    }),
    [BINARY64]: Object.freeze({
        bits: 64,
        precisionBits: 53,
        minimumNormal: 2 ** -1022,
        minimumSubnormal: Number.MIN_VALUE,
        maximumFinite: Number.MAX_VALUE,
    }),
});

function formatText(value) {
    if (value?.type === "string") return value.value;
    if (value instanceof Integer) return String(value.value);
    return value === undefined || value === null ? "" : String(value);
}

export function normalizeFormat(value, fallback = BINARY64) {
    if (value === undefined || value === null) return fallback;
    const normalized = formatText(value).trim().toLowerCase().replaceAll(/[-_]/g, "");
    if (["32", "binary32", "float32", "single"].includes(normalized)) return BINARY32;
    if (["64", "binary64", "float64", "double"].includes(normalized)) return BINARY64;
    throw new Error(`Unknown Float format '${formatText(value)}'; expected binary32 or binary64`);
}

export function formatInfo(format) {
    return FORMAT_INFO[normalizeFormat(format)];
}

export function formatOf(value) {
    return normalizeFormat(value?.format, BINARY64);
}

export function numberFrom(value) {
    if (value?.type && typeof value.value === "number") return value.value;
    if (value instanceof Integer) return Number(value.value);
    if (value instanceof Rational) return Number(value.numerator) / Number(value.denominator);
    if (typeof value === "number") return value;
    if (typeof value === "bigint") return Number(value);
    if (value?.type === "string") return Number(value.value);
    return Number(value);
}

function sourceIsExactFinite(value) {
    return value instanceof Integer || value instanceof Rational || typeof value === "bigint";
}

function sourceIsNonzero(value) {
    if (value instanceof Integer) return value.value !== 0n;
    if (value instanceof Rational) return value.numerator !== 0n;
    if (typeof value === "bigint") return value !== 0n;
    if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
    return false;
}

function explicitlyRepresentsNaN(value) {
    if (typeof value === "number") return Number.isNaN(value);
    if (value?.type && typeof value.value === "number") return Number.isNaN(value.value);
    return value?.type === "string" && /^[+-]?nan$/i.test(value.value.trim());
}

export function roundToFormat(value, format) {
    const number = Number(value);
    return normalizeFormat(format) === BINARY32 ? Math.fround(number) : number;
}

function unique(items) {
    return [...new Set(items.filter(Boolean))];
}

export function classifyFloat(value) {
    const number = numberFrom(value);
    const format = formatOf(value);
    const info = FORMAT_INFO[format];
    if (Number.isNaN(number)) {
        return { format, bits: info.bits, className: "nan", sign: "unordered", finite: false, subnormal: false, negativeZero: false };
    }
    if (!Number.isFinite(number)) {
        return {
            format,
            bits: info.bits,
            className: "infinity",
            sign: number < 0 ? "negative" : "positive",
            finite: false,
            subnormal: false,
            negativeZero: false,
        };
    }
    if (number === 0) {
        const negativeZero = Object.is(number, -0);
        return {
            format,
            bits: info.bits,
            className: "zero",
            sign: negativeZero ? "negative" : "positive",
            finite: true,
            subnormal: false,
            negativeZero,
        };
    }
    const subnormal = Math.abs(number) < info.minimumNormal;
    return {
        format,
        bits: info.bits,
        className: subnormal ? "subnormal" : "normal",
        sign: number < 0 ? "negative" : "positive",
        finite: true,
        subnormal,
        negativeZero: false,
    };
}

function classificationDiagnostics(value) {
    const classification = classifyFloat(value);
    if (classification.className === "nan") return ["nan"];
    if (classification.className === "infinity") return ["infinity"];
    if (classification.className === "subnormal") return ["subnormal"];
    if (classification.negativeZero) return ["negativeZero"];
    return [];
}

export function makeFloat(number, format, nativeType, { diagnostics = [], operation = null } = {}) {
    const selectedFormat = normalizeFormat(format);
    const rounded = roundToFormat(number, selectedFormat);
    const value = {
        type: nativeType,
        value: rounded,
        format: selectedFormat,
        diagnostics: [],
        operation,
    };
    // Browser hosts need a formatting fallback. The Node semantic type keeps
    // display behind its registered ToString method so formatting without an
    // evaluator does not silently bypass the type protocol.
    if (nativeType !== "float") value.toString = () => floatText(value.value);
    value.diagnostics = unique([...diagnostics, ...classificationDiagnostics(value)]);
    return value;
}

export function convertFloat(source, format, nativeType) {
    const selectedFormat = normalizeFormat(format, source?.format || BINARY64);
    const unrounded = numberFrom(source);
    if (Number.isNaN(unrounded) && !explicitlyRepresentsNaN(source)) {
        throw new Error("Cannot convert value to Float");
    }
    const rounded = roundToFormat(unrounded, selectedFormat);
    const diagnostics = [];
    if ((sourceIsExactFinite(source) || Number.isFinite(unrounded)) && !Number.isFinite(rounded) && !Number.isNaN(rounded)) {
        diagnostics.push("overflow");
    }
    if (sourceIsNonzero(source) && rounded === 0) diagnostics.push("underflowToZero");
    const converted = makeFloat(rounded, selectedFormat, nativeType, { diagnostics, operation: "convert" });
    if (source?._ext instanceof Map) converted._ext = new Map(source._ext);
    return converted;
}

function requireCommonFormat(operands) {
    const formats = operands.map(formatOf);
    const format = formats[0] || BINARY64;
    if (formats.some((candidate) => candidate !== format)) {
        throw new Error("Mixed binary32/binary64 Float arithmetic requires an explicit format conversion");
    }
    return format;
}

export function operateFloat(operation, operands, compute, nativeType) {
    const format = requireCommonFormat(operands);
    const numbers = operands.map(numberFrom);
    const raw = compute(...numbers);
    const rounded = roundToFormat(raw, format);
    const finiteInputs = numbers.every(Number.isFinite);
    const diagnostics = [];

    if (operation === "div" && numbers[1] === 0) {
        diagnostics.push(numbers[0] === 0 ? "invalidOperation" : "divisionByZero");
    } else if (Number.isNaN(raw) && finiteInputs) {
        diagnostics.push("invalidOperation");
    }
    const zeroDivision = operation === "div" && numbers[1] === 0;
    if (finiteInputs && !zeroDivision && !Number.isFinite(rounded) && !Number.isNaN(rounded)) {
        diagnostics.push("overflow");
    }

    const cannotCancelToZero = ["mul", "div", "pow", "sqrt", "exp", "log", "log10"].includes(operation);
    if (finiteInputs && rounded === 0 && cannotCancelToZero && numbers.every((value) => value !== 0) && raw === 0) {
        diagnostics.push("underflowToZero");
    }
    if (format === BINARY32 && rounded === 0 && raw !== 0 && Number.isFinite(raw)) {
        diagnostics.push("underflowToZero");
    }
    if (format === BINARY32 && ["sqrt", "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "log", "log10", "exp", "pow"].includes(operation)) {
        diagnostics.push("binary32RoundedHostMath");
    }
    return makeFloat(rounded, format, nativeType, { diagnostics, operation });
}

function nextBinary64(value, direction) {
    if (Number.isNaN(value)) return NaN;
    if (direction > 0 && value === Infinity) return Infinity;
    if (direction < 0 && value === -Infinity) return -Infinity;
    if (value === 0) return direction > 0 ? Number.MIN_VALUE : -Number.MIN_VALUE;

    const bytes = new ArrayBuffer(8);
    const view = new DataView(bytes);
    view.setFloat64(0, value, false);
    let bits = view.getBigUint64(0, false);
    const increment = (value > 0) === (direction > 0);
    bits = increment ? bits + 1n : bits - 1n;
    view.setBigUint64(0, bits, false);
    return view.getFloat64(0, false);
}

function nextBinary32(value, direction) {
    const rounded = Math.fround(value);
    if (Number.isNaN(rounded)) return NaN;
    if (direction > 0 && rounded === Infinity) return Infinity;
    if (direction < 0 && rounded === -Infinity) return -Infinity;
    if (rounded === 0) return direction > 0 ? 2 ** -149 : -(2 ** -149);

    const bytes = new ArrayBuffer(4);
    const view = new DataView(bytes);
    view.setFloat32(0, rounded, false);
    let bits = view.getUint32(0, false);
    const increment = (rounded > 0) === (direction > 0);
    bits = increment ? bits + 1 : bits - 1;
    view.setUint32(0, bits, false);
    return view.getFloat32(0, false);
}

export function nextValue(value, direction, nativeType = value?.type || "float") {
    const format = formatOf(value);
    const number = numberFrom(value);
    const next = format === BINARY32
        ? nextBinary32(number, direction)
        : nextBinary64(number, direction);
    const diagnostics = Number.isNaN(number) ? ["invalidOperation"] : [];
    const result = makeFloat(next, format, nativeType, {
        diagnostics,
        operation: direction > 0 ? "nextUp" : "nextDown",
    });
    if (value?._ext instanceof Map) result._ext = new Map(value._ext);
    return result;
}

export function nextAfterValue(value, target, nativeType = value?.type || "float") {
    const format = formatOf(value);
    if (target?.type && typeof target.value === "number" && formatOf(target) !== format) {
        throw new Error("NextAfter requires target and value to use the same Float format");
    }
    const current = numberFrom(value);
    const destination = roundToFormat(numberFrom(target), format);
    if (Number.isNaN(current) || Number.isNaN(destination)) {
        const result = makeFloat(NaN, format, nativeType, { diagnostics: ["invalidOperation"], operation: "nextAfter" });
        if (value?._ext instanceof Map) result._ext = new Map(value._ext);
        return result;
    }
    if (current === destination) {
        const result = makeFloat(destination, format, nativeType, { operation: "nextAfter" });
        if (value?._ext instanceof Map) result._ext = new Map(value._ext);
        return result;
    }
    const result = nextValue(value, destination > current ? 1 : -1, nativeType);
    result.operation = "nextAfter";
    return result;
}

export function floatText(value) {
    if (Object.is(value, -0)) return "-0";
    return String(value);
}

export function diagnosticsOf(value) {
    return unique(value?.diagnostics || classificationDiagnostics(value));
}
