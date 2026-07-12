import { Integer, Rational } from "@ratmath/core";

let nextGeneratorId = 1;

function int(value) {
    return new Integer(BigInt(value));
}

export function isRationalScalar(value) {
    return value instanceof Integer || value instanceof Rational;
}

function rationalParts(value) {
    if (value instanceof Integer) return [value.value, 1n];
    if (value instanceof Rational) return [value.numerator, value.denominator];
    return null;
}

function rationalFrom(value, label = "value") {
    if (value instanceof Integer || value instanceof Rational) return value;
    if (typeof value === "bigint") return new Integer(value);
    if (typeof value === "number" && Number.isInteger(value)) return new Integer(BigInt(value));
    throw new Error(`${label} must be an exact Integer or Rational`);
}

function isZero(value) {
    const parts = rationalParts(value);
    return parts ? parts[0] === 0n : false;
}

function isOne(value) {
    const parts = rationalParts(value);
    return parts ? parts[0] === parts[1] : false;
}

function isNegative(value) {
    const parts = rationalParts(value);
    return parts ? parts[0] < 0n : false;
}

function negateRational(value) {
    return int(0).subtract(value);
}

function absRational(value) {
    return isNegative(value) ? negateRational(value) : value;
}

function normalizePolynomial(polynomial) {
    if (!polynomial) return null;
    const values = polynomial.map((value, index) => rationalFrom(value, `minimal polynomial coefficient ${index}`));
    if (values.length < 2 || isZero(values[values.length - 1])) {
        throw new Error("Minimal polynomial must have positive degree and nonzero leading coefficient");
    }
    const lead = values[values.length - 1];
    return values.map((value) => value.divide(lead));
}

export function createExactGenerator(name, options = {}) {
    if (!name) throw new Error("Exact generator requires a name");
    const generator = {
        type: "exact_generator",
        id: options.id || `exact:${nextGeneratorId++}:${name}`,
        name,
        category: options.category || (options.minimalPolynomial ? "algebraic" : "transcendental"),
        minimalPolynomial: normalizePolynomial(options.minimalPolynomial || null),
        _ext: new Map([["key", { type: "string", value: name }], ["immutable", int(1)]]),
    };
    return Object.freeze(generator);
}

export function isExactValue(value) {
    return value?.type === "exact_generator" || value?.type === "exact_expression";
}

function clonePowers(powers) {
    return new Map(powers || []);
}

function monomialKey(powers) {
    return [...powers.entries()]
        .filter(([, exponent]) => exponent !== 0)
        .sort(([a], [b]) => a.id.localeCompare(b.id))
        .map(([generator, exponent]) => `${generator.id}^${exponent}`)
        .join("|");
}

function addRawTerm(target, powers, coefficient) {
    if (isZero(coefficient)) return;
    const clean = new Map([...powers.entries()].filter(([, exponent]) => exponent !== 0));
    const key = monomialKey(clean);
    const existing = target.get(key);
    const next = existing ? existing.coefficient.add(coefficient) : coefficient;
    if (isZero(next)) target.delete(key);
    else target.set(key, { powers: clean, coefficient: next });
}

function reducibleGenerator(powers) {
    for (const [generator, exponent] of powers) {
        const polynomial = generator.minimalPolynomial;
        if (polynomial && exponent >= polynomial.length - 1) return [generator, exponent, polynomial];
    }
    return null;
}

function reduceTerms(rawTerms) {
    const result = new Map();
    const queue = [...rawTerms.values()].map((term) => ({
        powers: clonePowers(term.powers),
        coefficient: term.coefficient,
    }));

    while (queue.length) {
        const term = queue.pop();
        if (isZero(term.coefficient)) continue;
        const reducible = reducibleGenerator(term.powers);
        if (!reducible) {
            addRawTerm(result, term.powers, term.coefficient);
            continue;
        }

        const [generator, exponent, polynomial] = reducible;
        const degree = polynomial.length - 1;
        for (let i = 0; i < degree; i++) {
            if (isZero(polynomial[i])) continue;
            const powers = clonePowers(term.powers);
            const nextExponent = exponent - degree + i;
            if (nextExponent === 0) powers.delete(generator);
            else powers.set(generator, nextExponent);
            queue.push({
                powers,
                coefficient: term.coefficient.multiply(negateRational(polynomial[i])),
            });
        }
    }
    return result;
}

function expressionFromTerms(terms) {
    const reduced = reduceTerms(terms);
    if (reduced.size === 0) return int(0);
    if (reduced.size === 1 && reduced.has("")) return reduced.get("").coefficient;
    return { type: "exact_expression", terms: reduced };
}

function trimPolynomial(polynomial) {
    const result = [...polynomial];
    while (result.length > 0 && isZero(result[result.length - 1])) result.pop();
    return result;
}

function polynomialAdd(left, right) {
    const length = Math.max(left.length, right.length);
    const result = Array.from({ length }, (_, index) =>
        (left[index] || int(0)).add(right[index] || int(0)));
    return trimPolynomial(result);
}

function polynomialNegate(polynomial) {
    return polynomial.map(negateRational);
}

function polynomialSubtract(left, right) {
    return polynomialAdd(left, polynomialNegate(right));
}

function polynomialMultiply(left, right) {
    if (left.length === 0 || right.length === 0) return [];
    const result = Array.from({ length: left.length + right.length - 1 }, () => int(0));
    for (let i = 0; i < left.length; i++) {
        for (let j = 0; j < right.length; j++) {
            result[i + j] = result[i + j].add(left[i].multiply(right[j]));
        }
    }
    return trimPolynomial(result);
}

function polynomialDivmod(dividend, divisor) {
    const denominator = trimPolynomial(divisor);
    if (denominator.length === 0) throw new Error("Polynomial division by zero");
    let remainder = trimPolynomial(dividend);
    const quotient = Array.from({ length: Math.max(0, remainder.length - denominator.length + 1) }, () => int(0));
    while (remainder.length >= denominator.length && remainder.length > 0) {
        const degree = remainder.length - denominator.length;
        const factor = remainder[remainder.length - 1].divide(denominator[denominator.length - 1]);
        quotient[degree] = quotient[degree].add(factor);
        const shifted = Array.from({ length: degree }, () => int(0)).concat(denominator.map((value) => value.multiply(factor)));
        remainder = polynomialSubtract(remainder, shifted);
    }
    return [trimPolynomial(quotient), remainder];
}

function polynomialExtendedGcd(left, right) {
    if (trimPolynomial(right).length === 0) return [trimPolynomial(left), [int(1)], []];
    const [quotient, remainder] = polynomialDivmod(left, right);
    const [gcd, x1, y1] = polynomialExtendedGcd(right, remainder);
    return [gcd, y1, polynomialSubtract(x1, polynomialMultiply(quotient, y1))];
}

function algebraicPolynomial(value) {
    const terms = toTerms(value);
    let generator = null;
    let maxExponent = 0;
    for (const term of terms.values()) {
        for (const [candidate, exponent] of term.powers) {
            if (exponent < 0 || !candidate.minimalPolynomial) return null;
            if (generator && generator !== candidate) return null;
            generator = candidate;
            maxExponent = Math.max(maxExponent, exponent);
        }
    }
    if (!generator) return null;
    const polynomial = Array.from({ length: maxExponent + 1 }, () => int(0));
    for (const term of terms.values()) {
        const exponent = term.powers.get(generator) || 0;
        if (term.powers.size > (exponent === 0 ? 0 : 1)) return null;
        polynomial[exponent] = polynomial[exponent].add(term.coefficient);
    }
    return { generator, polynomial: trimPolynomial(polynomial) };
}

function expressionFromPolynomial(generator, polynomial) {
    const terms = new Map();
    for (let exponent = 0; exponent < polynomial.length; exponent++) {
        if (isZero(polynomial[exponent])) continue;
        addRawTerm(
            terms,
            exponent === 0 ? new Map() : new Map([[generator, exponent]]),
            polynomial[exponent],
        );
    }
    return expressionFromTerms(terms);
}

function invertSingleAlgebraicExpression(value) {
    const parsed = algebraicPolynomial(value);
    if (!parsed || parsed.polynomial.length === 0) return null;
    const [gcd, coefficient] = polynomialExtendedGcd(parsed.polynomial, parsed.generator.minimalPolynomial);
    if (gcd.length !== 1 || isZero(gcd[0])) return null;
    const normalized = coefficient.map((entry) => entry.divide(gcd[0]));
    const [, reduced] = polynomialDivmod(normalized, parsed.generator.minimalPolynomial);
    return expressionFromPolynomial(parsed.generator, reduced);
}

function toTerms(value) {
    if (value?.type === "exact_expression") return value.terms;
    const terms = new Map();
    if (value?.type === "exact_generator") {
        addRawTerm(terms, new Map([[value, 1]]), int(1));
        return terms;
    }
    addRawTerm(terms, new Map(), rationalFrom(value));
    return terms;
}

function combinePowers(left, right, sign = 1) {
    const powers = clonePowers(left);
    for (const [generator, exponent] of right) {
        const next = (powers.get(generator) || 0) + sign * exponent;
        if (next === 0) powers.delete(generator);
        else powers.set(generator, next);
    }
    return powers;
}

export function addScalars(left, right) {
    if (!isExactValue(left) && !isExactValue(right)) return rationalFrom(left).add(rationalFrom(right));
    const terms = new Map();
    for (const term of toTerms(left).values()) addRawTerm(terms, term.powers, term.coefficient);
    for (const term of toTerms(right).values()) addRawTerm(terms, term.powers, term.coefficient);
    return expressionFromTerms(terms);
}

export function subtractScalars(left, right) {
    return addScalars(left, negateScalar(right));
}

export function negateScalar(value) {
    if (!isExactValue(value)) return negateRational(rationalFrom(value));
    const terms = new Map();
    for (const term of toTerms(value).values()) {
        addRawTerm(terms, term.powers, negateRational(term.coefficient));
    }
    return expressionFromTerms(terms);
}

export function multiplyScalars(left, right) {
    if (!isExactValue(left) && !isExactValue(right)) return rationalFrom(left).multiply(rationalFrom(right));
    const terms = new Map();
    for (const a of toTerms(left).values()) {
        for (const b of toTerms(right).values()) {
            addRawTerm(terms, combinePowers(a.powers, b.powers), a.coefficient.multiply(b.coefficient));
        }
    }
    return expressionFromTerms(terms);
}

export function divideScalars(left, right) {
    if (!isExactValue(left) && !isExactValue(right)) return rationalFrom(left).divide(rationalFrom(right));
    const algebraicInverse = invertSingleAlgebraicExpression(right);
    if (algebraicInverse !== null) return multiplyScalars(left, algebraicInverse);
    const denominatorTerms = [...toTerms(right).values()];
    if (denominatorTerms.length !== 1) {
        throw new Error("Division by a multi-term exact expression is not implemented");
    }
    const denominator = denominatorTerms[0];
    const terms = new Map();
    for (const numerator of toTerms(left).values()) {
        addRawTerm(
            terms,
            combinePowers(numerator.powers, denominator.powers, -1),
            numerator.coefficient.divide(denominator.coefficient),
        );
    }
    return expressionFromTerms(terms);
}

function imaginaryGeneratorFrom(value, preferred = null) {
    if (preferred) return preferred;
    for (const term of toTerms(value).values()) {
        for (const generator of term.powers.keys()) {
            if (generator.name === "i") return generator;
        }
    }
    return null;
}

export function complexParts(value, preferredI = null) {
    const imaginary = imaginaryGeneratorFrom(value, preferredI);
    if (!imaginary) return { real: value, imaginary: int(0) };
    const realTerms = new Map();
    const imaginaryTerms = new Map();
    for (const term of toTerms(value).values()) {
        const exponent = term.powers.get(imaginary) || 0;
        if (exponent !== 0 && exponent !== 1) {
            throw new Error("Complex decomposition expected powers of i to be reduced to zero or one");
        }
        const powers = clonePowers(term.powers);
        powers.delete(imaginary);
        addRawTerm(exponent === 0 ? realTerms : imaginaryTerms, powers, term.coefficient);
    }
    return {
        real: expressionFromTerms(realTerms),
        imaginary: expressionFromTerms(imaginaryTerms),
    };
}

export function complexConjugate(value, preferredI = null) {
    const imaginary = imaginaryGeneratorFrom(value, preferredI);
    if (!imaginary) return value;
    const terms = new Map();
    for (const term of toTerms(value).values()) {
        const exponent = term.powers.get(imaginary) || 0;
        addRawTerm(terms, term.powers, exponent % 2 === 0 ? term.coefficient : negateRational(term.coefficient));
    }
    return expressionFromTerms(terms);
}

export function complexFromParts(real, imaginary, iGenerator) {
    if (!iGenerator?.minimalPolynomial) throw new Error("Complex.FromParts requires the configured algebraic generator i");
    return addScalars(real, multiplyScalars(imaginary, iGenerator));
}

export function complexNormSquared(value, preferredI = null) {
    const parts = complexParts(value, preferredI);
    return addScalars(multiplyScalars(parts.real, parts.real), multiplyScalars(parts.imaginary, parts.imaginary));
}

function complexMethod(name, operation) {
    return {
        type: "method_builtin",
        name,
        impl(args) {
            return operation(...args.slice(1));
        },
    };
}

export function createDefaultComplexCollection(exactCollection) {
    const iGenerator = exactCollection?.entries?.get("i");
    const requireI = () => {
        if (!iGenerator) throw new Error("The active Exact collection does not define i");
        return iGenerator;
    };
    const operations = {
        conjugate: (value) => complexConjugate(value, requireI()),
        re: (value) => complexParts(value, requireI()).real,
        im: (value) => complexParts(value, requireI()).imaginary,
        fromParts: (real, imaginary) => complexFromParts(real, imaginary, requireI()),
        normSquared: (value) => complexNormSquared(value, requireI()),
    };
    const entries = new Map([
        ["i", iGenerator], ["I", iGenerator],
        ["conjugate", operations.conjugate], ["Conjugate", operations.conjugate],
        ["re", operations.re], ["Re", operations.re],
        ["im", operations.im], ["Im", operations.im],
        ["fromparts", operations.fromParts], ["FromParts", operations.fromParts],
        ["normsquared", operations.normSquared], ["NormSquared", operations.normSquared],
    ]);
    return {
        type: "map",
        entries,
        _ext: new Map([
            ["CONJUGATE", complexMethod("Conjugate", operations.conjugate)],
            ["RE", complexMethod("Re", operations.re)],
            ["IM", complexMethod("Im", operations.im)],
            ["FROMPARTS", complexMethod("FromParts", operations.fromParts)],
            ["NORMSQUARED", complexMethod("NormSquared", operations.normSquared)],
            ["immutable", int(1)],
        ]),
    };
}

function integerExponent(value) {
    if (value instanceof Integer) return Number(value.value);
    if (typeof value === "number" && Number.isInteger(value)) return value;
    if (typeof value === "bigint") return Number(value);
    throw new Error("Exact expression exponent must be an integer");
}

export function powScalar(value, exponentValue) {
    const exponent = integerExponent(exponentValue);
    if (exponent === 0) return int(1);
    if (exponent < 0) return divideScalars(int(1), powScalar(value, -exponent));
    let result = int(1);
    let factor = value;
    let n = exponent;
    while (n > 0) {
        if (n % 2 === 1) result = multiplyScalars(result, factor);
        n = Math.floor(n / 2);
        if (n) factor = multiplyScalars(factor, factor);
    }
    return result;
}

function termsEqual(left, right) {
    const a = toTerms(left);
    const b = toTerms(right);
    if (a.size !== b.size) return false;
    for (const [key, term] of a) {
        const other = b.get(key);
        if (!other || !term.coefficient.equals(other.coefficient)) return false;
    }
    return true;
}

export function equalScalars(left, right) {
    if (!isExactValue(left) && !isExactValue(right)) {
        const [leftNumerator, leftDenominator] = rationalParts(rationalFrom(left));
        const [rightNumerator, rightDenominator] = rationalParts(rationalFrom(right));
        return leftNumerator * rightDenominator === rightNumerator * leftDenominator;
    }
    return termsEqual(left, right);
}

function sortedTerms(value) {
    return [...toTerms(value).values()].sort((a, b) => {
        if (a.powers.size === 0) return -1;
        if (b.powers.size === 0) return 1;
        const an = [...a.powers.keys()].map((generator) => generator.name).join("*");
        const bn = [...b.powers.keys()].map((generator) => generator.name).join("*");
        return an.localeCompare(bn);
    });
}

function formatMonomial(powers) {
    return [...powers.entries()]
        .sort(([a], [b]) => a.name.localeCompare(b.name))
        .map(([generator, exponent]) => exponent === 1 ? generator.name : `${generator.name}^${exponent}`)
        .join("*");
}

export function formatExact(value, formatScalar = (scalar) => scalar.toString()) {
    if (value?.type === "exact_generator") return `1~{${value.name}}`;
    const pieces = [];
    for (const term of sortedTerms(value)) {
        const negative = isNegative(term.coefficient);
        const coefficient = absRational(term.coefficient);
        const monomial = formatMonomial(term.powers);
        const body = monomial
            ? `${isOne(coefficient) ? "1" : formatScalar(coefficient)}~{${monomial}}`
            : formatScalar(coefficient);
        if (pieces.length === 0) pieces.push(negative ? `-${body}` : body);
        else pieces.push(`${negative ? "-" : "+"} ${body}`);
    }
    return pieces.join(" ");
}

export function createDefaultExactCollection() {
    const pi = createExactGenerator("pi", { id: "exact:pi", category: "transcendental" });
    const e = createExactGenerator("e", { id: "exact:e", category: "transcendental" });
    const i = createExactGenerator("i", {
        id: "exact:i",
        category: "algebraic",
        minimalPolynomial: [int(1), int(0), int(1)],
    });
    const sqrt2 = createExactGenerator("sqrt2", {
        id: "exact:sqrt2",
        category: "algebraic",
        minimalPolynomial: [int(-2), int(0), int(1)],
    });
    return {
        type: "map",
        entries: new Map([["pi", pi], ["e", e], ["i", i], ["sqrt2", sqrt2]]),
        _ext: new Map([["immutable", int(1)]]),
    };
}

export function exactGeneratorFromPolynomial(name, coefficients) {
    const values = coefficients?.type === "sequence" ? coefficients.values : coefficients;
    if (!Array.isArray(values)) throw new Error("DefineExactGenerator expects an array of polynomial coefficients");
    return createExactGenerator(name, { category: "algebraic", minimalPolynomial: values });
}
