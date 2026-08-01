/**
 * JavaScript-number transcendental functions owned by the optional Float
 * plugin. They are intentionally not part of RiX's default system context.
 */

import { Integer, Rational } from "@ratmath/core";

function numberFrom(value) {
    if (value instanceof Integer) return Number(value.value);
    if (value instanceof Rational) return Number(value.numerator) / Number(value.denominator);
    if (typeof value === "bigint") return Number(value);
    if (value?.type === "string") return Number(value.value);
    return Number(value);
}

function finiteNumberFrom(value) {
    const number = numberFrom(value);
    if (Number.isNaN(number)) throw new Error("Math function expected a numeric value");
    return number;
}

function unary(fn) {
    return (args) => fn(finiteNumberFrom(args[0]));
}

function binary(fn) {
    return (args) => fn(finiteNumberFrom(args[0]), finiteNumberFrom(args[1]));
}

export const MATH_FUNCTION_NAMES = [
    "SIN", "COS", "TAN", "ASIN", "ACOS", "ATAN", "ATAN2",
    "LOG", "LN", "LOG10", "EXP",
];

export const mathFunctions = {
    SIN: { impl: unary(Math.sin), pure: true, doc: "Float sine" },
    COS: { impl: unary(Math.cos), pure: true, doc: "Float cosine" },
    TAN: { impl: unary(Math.tan), pure: true, doc: "Float tangent" },
    ASIN: { impl: unary(Math.asin), pure: true, doc: "Float arcsine" },
    ACOS: { impl: unary(Math.acos), pure: true, doc: "Float arccosine" },
    ATAN: { impl: unary(Math.atan), pure: true, doc: "Float arctangent" },
    ATAN2: { impl: binary(Math.atan2), pure: true, doc: "Float two-argument arctangent" },
    LOG: { impl: unary(Math.log), pure: true, doc: "Float natural logarithm" },
    LN: { impl: unary(Math.log), pure: true, doc: "Float natural logarithm" },
    LOG10: { impl: unary(Math.log10), pure: true, doc: "Float base-10 logarithm" },
    EXP: { impl: unary(Math.exp), pure: true, doc: "Float exponential" },
};
