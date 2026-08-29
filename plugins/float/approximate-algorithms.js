import { Integer } from "@ratmath/core";
import {
    BINARY64,
    convertFloat,
    formatInfo,
    formatOf,
    normalizeFormat,
    numberFrom,
    roundToFormat,
} from "./ieee754.js";

const int = (value) => new Integer(BigInt(value));
const string = (value) => ({ type: "string", value: String(value) });
const mapValue = (entries) => ({ type: "map", entries: new Map(entries) });

function sequence(value, label) {
    if (Array.isArray(value)) return value;
    if (value && ["array", "tuple", "sequence"].includes(value.type)) return value.values ?? value.elements;
    throw new Error(`${label} must be an array or tuple`);
}

function optionEntries(value) {
    return value?.type === "map" && value.entries instanceof Map ? value.entries : new Map();
}

function text(value, fallback) {
    return value?.value ?? (value === undefined || value === null ? fallback : String(value));
}

function selectedFormat(values, requested) {
    if (requested !== undefined && requested !== null) return normalizeFormat(requested);
    const formats = [...new Set(values
        .filter((value) => value?.type && typeof value.value === "number")
        .map(formatOf))];
    if (formats.length > 1) {
        throw new Error("Reproducible Float algorithms require one format or an explicit format option");
    }
    return formats[0] ?? BINARY64;
}

function normalizedValues(value, options, nativeType, label) {
    const values = sequence(value, label);
    const format = selectedFormat(values, options.get("format"));
    return { format, values: values.map((entry) => convertFloat(entry, format, nativeType)) };
}

function add(left, right, format) {
    return roundToFormat(left + right, format);
}

function subtract(left, right, format) {
    return roundToFormat(left - right, format);
}

function multiply(left, right, format) {
    return roundToFormat(left * right, format);
}

function divide(left, right, format) {
    return roundToFormat(left / right, format);
}

function pairwise(numbers, format) {
    if (numbers.length === 0) return roundToFormat(0, format);
    if (numbers.length === 1) return numbers[0];
    const middle = Math.floor(numbers.length / 2);
    return add(pairwise(numbers.slice(0, middle), format), pairwise(numbers.slice(middle), format), format);
}

function sumWithPolicy(numbers, format, policy) {
    if (policy === "pairwise") return pairwise(numbers, format);
    if (policy === "sequential") return numbers.reduce((total, value) => add(total, value, format), roundToFormat(0, format));
    if (policy === "compensated") {
        let total = roundToFormat(0, format);
        let compensation = roundToFormat(0, format);
        for (const value of numbers) {
            const adjusted = subtract(value, compensation, format);
            const next = add(total, adjusted, format);
            compensation = subtract(subtract(next, total, format), adjusted, format);
            total = next;
        }
        return total;
    }
    throw new Error(`Unknown reproducible Float policy '${policy}'; expected sequential, pairwise, or compensated`);
}

function errorEstimate(numbers, result, format, operations, nativeType) {
    const unitRoundoff = 2 ** -formatInfo(format).precisionBits;
    const factor = operations * unitRoundoff;
    const magnitude = numbers.reduce((total, value) => total + Math.abs(value), 0);
    const absolute = factor < 1 ? factor / (1 - factor) * magnitude : Infinity;
    const relative = result === 0 ? null : Math.abs(absolute / result);
    return mapValue([
        ["valueKind", string("floatErrorEstimate")], ["schema", string("rix.float.error-estimate@1")],
        ["absolute", convertFloat(absolute, format, nativeType)],
        ["relative", relative === null ? null : convertFloat(relative, format, nativeType)],
        ["model", string("standard-first-order")], ["certified", null],
    ]);
}

function algorithmResult({ algorithm, policy, format, values, result, operations, nativeType }) {
    return mapValue([
        ["valueKind", string("floatAlgorithmResult")], ["schema", string("rix.float.algorithm-result@1")],
        ["algorithm", string(algorithm)], ["policy", string(policy)], ["format", string(format)],
        ["count", int(values.length)], ["status", string("approximate")],
        ["value", convertFloat(result, format, nativeType)],
        ["errorEstimate", errorEstimate(values, result, format, operations, nativeType)],
    ]);
}

function complexParts(value, label) {
    if (value?.type !== "map" || value.entries?.get("schema")?.value !== "rix.float.complex@1") {
        throw new Error(`${label} requires a rix.float.complex@1 value`);
    }
    return [value.entries.get("real"), value.entries.get("imaginary")];
}

function complexValue(real, imaginary, format, nativeType, operation = "construct") {
    return mapValue([
        ["valueKind", string("floatComplex")], ["schema", string("rix.float.complex@1")],
        ["format", string(format)], ["real", convertFloat(real, format, nativeType)],
        ["imaginary", convertFloat(imaginary, format, nativeType)], ["operation", string(operation)],
        ["status", string("approximate")],
    ]);
}

function commonComplex(left, right, label) {
    const first = complexParts(left, label);
    const second = complexParts(right, label);
    const format = formatOf(first[0]);
    if ([...first, ...second].some((value) => formatOf(value) !== format)) {
        throw new Error(`${label} requires both operands to use the same Float format`);
    }
    return { first: first.map(numberFrom), second: second.map(numberFrom), format };
}

export function createApproximateAlgorithms(nativeType) {
    return {
        Sum(valuesValue, optionsValue) {
            const options = optionEntries(optionsValue);
            const { format, values } = normalizedValues(valuesValue, options, nativeType, "float.Sum values");
            const numbers = values.map(numberFrom);
            const policy = text(options.get("policy"), "pairwise").toLowerCase();
            const result = sumWithPolicy(numbers, format, policy);
            return algorithmResult({ algorithm: "sum", policy, format, values: numbers, result,
                operations: Math.max(0, numbers.length - 1), nativeType });
        },
        Dot(leftValue, rightValue, optionsValue) {
            const options = optionEntries(optionsValue);
            const leftSource = sequence(leftValue, "float.Dot left");
            const rightSource = sequence(rightValue, "float.Dot right");
            if (leftSource.length !== rightSource.length) throw new Error("float.Dot vectors must have equal length");
            const all = [...leftSource, ...rightSource];
            const format = selectedFormat(all, options.get("format"));
            const left = leftSource.map((value) => convertFloat(value, format, nativeType));
            const right = rightSource.map((value) => convertFloat(value, format, nativeType));
            const products = left.map((value, index) => multiply(numberFrom(value), numberFrom(right[index]), format));
            const policy = text(options.get("policy"), "pairwise").toLowerCase();
            const result = sumWithPolicy(products, format, policy);
            return algorithmResult({ algorithm: "dot", policy, format, values: products, result,
                operations: Math.max(0, products.length * 2 - 1), nativeType });
        },
        Complex(real, imaginary, formatValue) {
            const format = selectedFormat([real, imaginary], formatValue);
            return complexValue(real, imaginary, format, nativeType);
        },
        ComplexAdd(left, right) {
            const { first, second, format } = commonComplex(left, right, "float.ComplexAdd");
            return complexValue(add(first[0], second[0], format), add(first[1], second[1], format), format, nativeType, "add");
        },
        ComplexSub(left, right) {
            const { first, second, format } = commonComplex(left, right, "float.ComplexSub");
            return complexValue(subtract(first[0], second[0], format), subtract(first[1], second[1], format), format, nativeType, "sub");
        },
        ComplexMul(left, right) {
            const { first: [a, b], second: [c, d], format } = commonComplex(left, right, "float.ComplexMul");
            return complexValue(
                subtract(multiply(a, c, format), multiply(b, d, format), format),
                add(multiply(a, d, format), multiply(b, c, format), format),
                format, nativeType, "mul",
            );
        },
        ComplexDiv(left, right) {
            const { first: [a, b], second: [c, d], format } = commonComplex(left, right, "float.ComplexDiv");
            const denominator = add(multiply(c, c, format), multiply(d, d, format), format);
            return complexValue(
                divide(add(multiply(a, c, format), multiply(b, d, format), format), denominator, format),
                divide(subtract(multiply(b, c, format), multiply(a, d, format), format), denominator, format),
                format, nativeType, "div",
            );
        },
        ComplexConjugate(value) {
            const [real, imaginary] = complexParts(value, "float.ComplexConjugate");
            const format = formatOf(real);
            return complexValue(real, -numberFrom(imaginary), format, nativeType, "conjugate");
        },
        ComplexAbs(value) {
            const [real, imaginary] = complexParts(value, "float.ComplexAbs");
            const format = formatOf(real);
            return convertFloat(Math.hypot(numberFrom(real), numberFrom(imaginary)), format, nativeType);
        },
    };
}

export const FLOAT_ALGORITHM_EXPORTS = [
    "Sum", "Dot", "Complex", "ComplexAdd", "ComplexSub", "ComplexMul", "ComplexDiv", "ComplexConjugate", "ComplexAbs",
];
