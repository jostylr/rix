import { Integer, Rational } from "@ratmath/core";

function int(value) {
    return new Integer(BigInt(value));
}

function bool(value) {
    return value ? int(1) : null;
}

function stringObj(value) {
    return { type: "string", value };
}

export function Is(value) {
    return bool(value?.type === "float" && typeof value.value === "number");
}

export function From(value) {
    const number = numberFrom(value);
    if (Number.isNaN(number)) throw new Error("Cannot convert value to Float");
    return { type: "float", value: number };
}

export function Value(value) {
    if (!value || value.type !== "float") throw new Error("Float Value expects a Float");
    return stringObj(String(value.value));
}

export function Export(value) {
    if (!value || value.type !== "float") throw new Error("Float export expects a Float");
    return {
        type: "map",
        entries: new Map([
            ["type", stringObj("Float")],
            ["data", { type: "map", entries: new Map([["value", stringObj(String(value.value))]]) }],
            ["cache", null],
            ["version", int(1)],
        ]),
    };
}

export function Import(value) {
    const data = value?.entries?.get("data");
    return From(Number(data?.entries?.get("value")?.value));
}

export function Add(x, y) { return From(numberFrom(x) + numberFrom(y)); }
export function Sub(x, y) { return From(numberFrom(x) - numberFrom(y)); }
export function Mul(x, y) { return From(numberFrom(x) * numberFrom(y)); }
export function Div(x, y) { return From(numberFrom(x) / numberFrom(y)); }
export function Pow(x, y) { return From(numberFrom(x) ** numberFrom(y)); }
export function Neg(x) { return From(-numberFrom(x)); }

export function Eq(x, y) { return bool(numberFrom(x) === numberFrom(y)); }
export function Lt(x, y) { return bool(numberFrom(x) < numberFrom(y)); }
export function Gt(x, y) { return bool(numberFrom(x) > numberFrom(y)); }
export function Lte(x, y) { return bool(numberFrom(x) <= numberFrom(y)); }
export function Gte(x, y) { return bool(numberFrom(x) >= numberFrom(y)); }

export function Abs(x) { return From(Math.abs(numberFrom(x))); }
export function Sqrt(x) { return From(Math.sqrt(numberFrom(x))); }
export function Sin(x) { return From(Math.sin(numberFrom(x))); }
export function Cos(x) { return From(Math.cos(numberFrom(x))); }
export function Tan(x) { return From(Math.tan(numberFrom(x))); }
export function Asin(x) { return From(Math.asin(numberFrom(x))); }
export function Acos(x) { return From(Math.acos(numberFrom(x))); }
export function Atan(x) { return From(Math.atan(numberFrom(x))); }
export function Atan2(y, x) { return From(Math.atan2(numberFrom(y), numberFrom(x))); }
export function Log(x) { return From(Math.log(numberFrom(x))); }
export function Ln(x) { return From(Math.log(numberFrom(x))); }
export function Log10(x) { return From(Math.log10(numberFrom(x))); }
export function Exp(x) { return From(Math.exp(numberFrom(x))); }

function numberFrom(value) {
    if (value?.type === "float") return value.value;
    if (value instanceof Integer) return Number(value.value);
    if (value instanceof Rational) return Number(value.numerator) / Number(value.denominator);
    if (typeof value === "number") return value;
    if (typeof value === "bigint") return Number(value);
    if (value?.type === "string") return Number(value.value);
    return Number(value);
}
