/**
 * JavaScript reference implementation retained for comparison with the
 * executable pure-RiX plugin in exact-algebras.plugin.rix.
 *
id: exact-algebras
description: Exact rational quaternion and octonion values.
kind: host
mount: exactAlgebras
exports: [Quaternion, Octonion, Components, Conjugate, NormSquared, Inverse]
groups: [Exact]
permissions: []
defaultEnabled: false
**/

import { Integer, Rational } from "@ratmath/core";

const ZERO = new Rational(0n, 1n);

function toRational(value, label = "component") {
    if (value instanceof Rational) return value;
    if (value instanceof Integer) return new Rational(value.value, 1n);
    if (typeof value === "bigint") return new Rational(value, 1n);
    if (typeof value === "number" && Number.isInteger(value)) {
        return new Rational(BigInt(value), 1n);
    }
    throw new Error(`Exact algebra ${label} must be an Integer or Rational`);
}

function formatComponent(value) {
    return value.denominator === 1n
        ? value.numerator.toString()
        : value.toString();
}

export class ExactCayleyDickson {
    constructor(components) {
        if (components.length !== 4 && components.length !== 8) {
            throw new Error("Exact Cayley-Dickson values require 4 or 8 components");
        }
        this.type = components.length === 4 ? "exact_quaternion" : "exact_octonion";
        this.dimension = components.length;
        this.components = Object.freeze(
            components.map((value, index) => toRational(value, `component ${index}`)),
        );
        Object.freeze(this);
    }

    toString() {
        const name = this.dimension === 4 ? "Quaternion" : "Octonion";
        return `${name}(${this.components.map(formatComponent).join(", ")})`;
    }
}

function isExactAlgebra(value) {
    return value instanceof ExactCayleyDickson;
}

function hasExactAlgebra(left, right) {
    return isExactAlgebra(left) || isExactAlgebra(right);
}

function conjugateComponents(components) {
    if (components.length === 1) return [components[0]];
    const half = components.length / 2;
    return [
        ...conjugateComponents(components.slice(0, half)),
        ...components.slice(half).map((value) => value.negate()),
    ];
}

function addComponents(left, right) {
    return left.map((value, index) => value.add(right[index]));
}

function subtractComponents(left, right) {
    return left.map((value, index) => value.subtract(right[index]));
}

function multiplyComponents(left, right) {
    if (left.length === 1) return [left[0].multiply(right[0])];

    const half = left.length / 2;
    const a = left.slice(0, half);
    const b = left.slice(half);
    const c = right.slice(0, half);
    const d = right.slice(half);

    // Cayley-Dickson convention:
    // (a,b)(c,d) = (ac - conjugate(d)b, da + b conjugate(c)).
    return [
        ...subtractComponents(
            multiplyComponents(a, c),
            multiplyComponents(conjugateComponents(d), b),
        ),
        ...addComponents(
            multiplyComponents(d, a),
            multiplyComponents(b, conjugateComponents(c)),
        ),
    ];
}

function promote(value, dimension) {
    if (isExactAlgebra(value)) {
        if (value.dimension !== dimension) {
            throw new Error("Quaternion and octonion operands must have the same dimension");
        }
        return value;
    }
    const scalar = toRational(value, "scalar operand");
    return new ExactCayleyDickson([
        scalar,
        ...Array.from({ length: dimension - 1 }, () => ZERO),
    ]);
}

function commonDimension(left, right) {
    if (isExactAlgebra(left) && isExactAlgebra(right)) {
        if (left.dimension !== right.dimension) {
            throw new Error("Quaternion and octonion operands must have the same dimension");
        }
        return left.dimension;
    }
    return isExactAlgebra(left) ? left.dimension : isExactAlgebra(right) ? right.dimension : null;
}

function binaryValues(left, right, operation) {
    const dimension = commonDimension(left, right);
    if (dimension === null) return null;
    const a = promote(left, dimension);
    const b = promote(right, dimension);
    return new ExactCayleyDickson(operation(a.components, b.components));
}

function conjugate(value) {
    if (!isExactAlgebra(value)) throw new Error("Conjugate expects a quaternion or octonion");
    return new ExactCayleyDickson(conjugateComponents(value.components));
}

function normSquared(value) {
    if (!isExactAlgebra(value)) throw new Error("NormSquared expects a quaternion or octonion");
    return value.components.reduce(
        (sum, component) => sum.add(component.multiply(component)),
        ZERO,
    );
}

function inverse(value) {
    const norm = normSquared(value);
    if (norm.numerator === 0n) throw new Error("Zero has no multiplicative inverse");
    return new ExactCayleyDickson(
        conjugateComponents(value.components).map((component) => component.divide(norm)),
    );
}

function multiply(left, right) {
    return binaryValues(left, right, multiplyComponents);
}

function divide(left, right) {
    if (isExactAlgebra(right)) return multiply(left, inverse(right));
    const dimension = commonDimension(left, right);
    if (dimension === null) return null;
    const divisor = toRational(right, "divisor");
    if (divisor.numerator === 0n) throw new Error("Division by zero");
    const value = promote(left, dimension);
    return new ExactCayleyDickson(
        value.components.map((component) => component.divide(divisor)),
    );
}

function equal(left, right) {
    const dimension = commonDimension(left, right);
    if (dimension === null) return null;
    const a = promote(left, dimension);
    const b = promote(right, dimension);
    return a.components.every((value, index) => value.equals(b.components[index]));
}

function constructor(dimension, name) {
    return (args) => {
        if (args.length > dimension) throw new Error(`${name} accepts at most ${dimension} components`);
        return new ExactCayleyDickson([
            ...args,
            ...Array.from({ length: dimension - args.length }, () => ZERO),
        ]);
    };
}

function components(args) {
    const value = args[0];
    if (!isExactAlgebra(value)) throw new Error("Components expects a quaternion or octonion");
    return { type: "sequence", values: [...value.components] };
}

function method(name, impl) {
    return {
        type: "method_builtin",
        name,
        impl: (args) => impl(args.slice(1)),
    };
}

export function createExactAlgebrasCollection() {
    const helpers = new Map([
        ["Quaternion", constructor(4, "Quaternion")],
        ["Octonion", constructor(8, "Octonion")],
        ["Components", components],
        ["Conjugate", (args) => conjugate(args[0])],
        ["NormSquared", (args) => normSquared(args[0])],
        ["Inverse", (args) => inverse(args[0])],
    ]);
    const entries = new Map();
    const extension = new Map([["immutable", new Integer(1n)]]);
    for (const [name, helper] of helpers) {
        entries.set(name, helper);
        entries.set(name.toUpperCase(), helper);
        extension.set(name.toUpperCase(), method(name, helper));
    }
    return { type: "map", entries, _ext: extension };
}

function installArithmeticVariants(registry) {
    if (!registry) return;
    const binary = (name, impl) => registry.installVariant(name, {
        name: `ExactAlgebras.${name}`,
        priority: 100,
        prepare(args) {
            return hasExactAlgebra(args[0], args[1]) ? { args } : false;
        },
        impl: ([left, right]) => impl(left, right),
    });

    binary("ADD", (left, right) => binaryValues(left, right, addComponents));
    binary("SUB", (left, right) => binaryValues(left, right, subtractComponents));
    binary("MUL", multiply);
    binary("DIV", divide);
    binary("EQ", (left, right) => equal(left, right) ? new Integer(1n) : null);
    binary("NEQ", (left, right) => equal(left, right) ? null : new Integer(1n));
    registry.installVariant("NEG", {
        name: "ExactAlgebras.NEG",
        priority: 100,
        prepare(args) {
            return isExactAlgebra(args[0]) ? { args } : false;
        },
        impl: ([value]) => new ExactCayleyDickson(
            value.components.map((component) => component.negate()),
        ),
    });
}

export function install({ systemContext, registry }) {
    const exactAlgebras = createExactAlgebrasCollection();
    systemContext.registerHostValue("exactAlgebras", exactAlgebras, {
        doc: "Exact rational quaternion and octonion constructors and operations",
    });
    installArithmeticVariants(registry);
    return exactAlgebras;
}

export const installExactAlgebrasPlugin = (systemContext, registry) =>
    install({ systemContext, registry });
