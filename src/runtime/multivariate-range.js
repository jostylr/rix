import {
    Integer,
    Rational,
    RationalInterval,
    RationalIntervalSet,
    asRationalIntervalSet,
    rangeAdd,
    rangeDivide,
    rangeIntegerPower,
    rangeMultiply,
    rangeNegate,
    rangeSubtract,
} from "@ratmath/core";
import {
    calculusGraphStructuralKey,
    checkCalculusDerivativeTransformation,
    derivativeObligationChecks,
    evaluateCalculusGraphRange,
} from "./calculus-range.js";
import { rangeMathPolicy } from "./range-policy.js";

export const RATIONAL_BOX_SCHEMA = "rix.numerics.rational-box@1";
export const MULTIVARIATE_RANGE_REQUEST_SCHEMA = "rix.numerics.multivariate-range-request@1";
export const JACOBIAN_BOX_RANGE_SCHEMA = "rix.numerics.jacobian-box-range@1";
export const AFFINE_BOX_RANGE_SCHEMA = "rix.numerics.affine-box-range@1";
export const TAYLOR_MODEL_BOX_RANGE_SCHEMA = "rix.numerics.taylor-model-box-range@1";
export const MULTIVARIATE_RANGE_CHECKER = "rix.runtime.multivariate-range-checker@1";
export const KRAWCZYK_BOX_SCHEMA = "rix.numerics.krawczyk-box@1";
export const KRAWCZYK_CHECKER = "rix.runtime.krawczyk-checker@1";

const text = (value) => ({ type: "string", value: String(value) });
const sequence = (values) => ({ type: "sequence", values });
const map = (entries) => ({
    type: "map",
    entries: new Map(entries.map(([key, value]) => [String(key).toLowerCase(), value])),
});

function mapValue(value, key) {
    if (value && typeof value === "object" && value.type !== "map" && !Array.isArray(value)) {
        if (Object.hasOwn(value, key)) return value[key];
        const lower = String(key).toLowerCase();
        for (const [candidate, entry] of Object.entries(value)) {
            if (candidate.toLowerCase() === lower) return entry;
        }
    }
    if (value?.type !== "map" || !(value.entries instanceof Map)) return undefined;
    const lower = String(key).toLowerCase();
    for (const [candidate, entry] of value.entries) {
        if (String(candidate).toLowerCase() === lower) return entry;
    }
    return undefined;
}

function textValue(value) {
    if (typeof value === "string") return value;
    return value?.type === "string" ? value.value : null;
}

function values(value) {
    if (Array.isArray(value)) return value;
    return value?.type === "sequence" && Array.isArray(value.values) ? value.values : null;
}

function integerValue(value, fallback) {
    if (value instanceof Integer) return value.value;
    if (value instanceof Rational && value.denominator === 1n) return value.numerator;
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
    return fallback;
}

function exactRational(value) {
    if (value instanceof Rational) return value;
    if (value instanceof Integer) return new Rational(value.value);
    if (typeof value === "bigint" || typeof value === "string" ||
        (typeof value === "number" && Number.isSafeInteger(value))) return new Rational(value);
    return null;
}

function portable(value) {
    if (value === undefined || value === null || value === false) return null;
    if (value === true) return new Integer(1n);
    if (value instanceof Integer || value instanceof Rational ||
        value instanceof RationalInterval || value instanceof RationalIntervalSet) return value;
    if (typeof value === "bigint") return new Integer(value);
    if (typeof value === "number" && Number.isSafeInteger(value)) return new Integer(BigInt(value));
    if (typeof value === "string") return text(value);
    if (Array.isArray(value)) return sequence(value.map(portable));
    if (value instanceof Map) return map([...value].map(([key, entry]) => [key, portable(entry)]));
    if (value?.type === "map" || value?.type === "sequence" || value?.type === "string") return value;
    if (typeof value === "object") {
        return map(Object.entries(value).map(([key, entry]) => [key, portable(entry)]));
    }
    return text(value);
}

function normalizedConventions(value) {
    return Object.freeze({
        zeroPowerZero: textValue(mapValue(value, "zeropowerzero")) ??
            value?.zeroPowerZero ?? "undefined",
    });
}

function bindingMap(axes) {
    return map([...axes].map(([name, range]) => [name, range]));
}

function point(value) {
    return RationalIntervalSet.point(value);
}

function resultRange(record) {
    return record.range;
}

function add(left, right) {
    return resultRange(rangeAdd(left, right));
}

function subtract(left, right) {
    return resultRange(rangeSubtract(left, right));
}

function multiply(left, right) {
    return resultRange(rangeMultiply(left, right));
}

function divide(left, right) {
    return resultRange(rangeDivide(left, right));
}

function negate(value) {
    return resultRange(rangeNegate(value));
}

function integerPower(value, exponent, conventions) {
    return resultRange(rangeIntegerPower(value, exponent, conventions));
}

function rangeUnion(ranges) {
    return ranges.reduce((result, value) => result.union(value), RationalIntervalSet.empty);
}

function normalizeAxis(name, value) {
    const range = asRationalIntervalSet(value);
    if (range.componentCount !== 1 || !range.isBounded || range.isEmpty) {
        throw new Error(`rationalBoxAxisMustBeOneBoundedInterval:${name}`);
    }
    const component = range.components[0];
    if (!component.lowClosed || !component.highClosed) {
        throw new Error(`rationalBoxAxisMustBeClosed:${name}`);
    }
    return range;
}

function normalizeAxes(source) {
    const raw = textValue(mapValue(source, "schema")) === RATIONAL_BOX_SCHEMA
        ? mapValue(source, "axes")
        : source;
    if (raw?.type !== "map" || !(raw.entries instanceof Map)) {
        if (raw instanceof Map) {
            return new Map([...raw].map(([name, value]) => [
                String(name).toLowerCase(), normalizeAxis(name, value),
            ]).sort(([left], [right]) => left.localeCompare(right)));
        }
        throw new Error("rationalBoxRequiresMapBindings");
    }
    const axes = [...raw.entries].map(([name, value]) => [
        String(name).toLowerCase(), normalizeAxis(name, value),
    ]).sort(([left], [right]) => left.localeCompare(right));
    if (axes.length < 1 || axes.length > 16) throw new Error("rationalBoxDimensionOutOfRange");
    if (new Set(axes.map(([name]) => name)).size !== axes.length) {
        throw new Error("duplicateRationalBoxAxis");
    }
    return new Map(axes);
}

export function createRationalBox(source) {
    const axes = normalizeAxes(source);
    return Object.freeze({
        schema: RATIONAL_BOX_SCHEMA,
        valueKind: "rationalBox",
        dimension: axes.size,
        variables: Object.freeze([...axes.keys()]),
        axes,
    });
}

export function createMultivariateRangeRequest(expression, source, options = map([])) {
    const box = createRationalBox(source);
    return Object.freeze({
        schema: MULTIVARIATE_RANGE_REQUEST_SCHEMA,
        valueKind: "multivariateRangeRequest",
        expression,
        box,
        options,
    });
}

function midpoint(component) {
    return component.low.add(component.high).divide(new Rational(2));
}

function axisRadius(component) {
    return component.high.subtract(component.low).divide(new Rational(2));
}

function axisWidth(component) {
    return component.high.subtract(component.low);
}

function splitBox(box) {
    let selected = null;
    let selectedWidth = null;
    for (const [name, range] of box.axes) {
        const width = axisWidth(range.components[0]);
        if (selectedWidth === null || width.greaterThan(selectedWidth)) {
            selected = name;
            selectedWidth = width;
        }
    }
    if (selectedWidth.equals(Rational.zero)) return null;
    const component = box.axes.get(selected).components[0];
    const middle = midpoint(component);
    const make = (low, high) => {
        const axes = new Map(box.axes);
        axes.set(selected, new RationalIntervalSet(new RationalInterval(low, high)));
        return createRationalBox(axes);
    };
    return [make(component.low, middle), make(middle, component.high)];
}

function partitionBoxes(box, options) {
    const requested = integerValue(mapValue(options, "maxsubboxes"), 1n);
    if (requested < 1n || requested > 256n) throw new Error("maxSubboxesOutOfRange");
    const boxes = [box];
    while (boxes.length < Number(requested)) {
        let index = -1;
        let width = null;
        for (let boxIndex = 0; boxIndex < boxes.length; boxIndex += 1) {
            for (const range of boxes[boxIndex].axes.values()) {
                const candidate = axisWidth(range.components[0]);
                if (width === null || candidate.greaterThan(width)) {
                    index = boxIndex;
                    width = candidate;
                }
            }
        }
        if (index < 0 || width.equals(Rational.zero)) break;
        const split = splitBox(boxes[index]);
        if (!split) break;
        boxes.splice(index, 1, ...split);
    }
    return boxes;
}

function centerAxes(box) {
    return new Map([...box.axes].map(([name, range]) => [
        name, point(midpoint(range.components[0])),
    ]));
}

function deltaAxes(box) {
    return new Map([...box.axes].map(([name, range]) => {
        const radius = axisRadius(range.components[0]);
        return [name, new RationalIntervalSet(new RationalInterval(radius.negate(), radius))];
    }));
}

function collectionParts(collection, wantedKind) {
    if (textValue(mapValue(collection, "schema")) !== "rix.calculus.derivative-collection@1") {
        throw new Error("expectedCalculusDerivativeCollection");
    }
    const kind = textValue(mapValue(collection, "kind"));
    const variables = values(mapValue(collection, "variables"))?.map(textValue);
    const sources = values(mapValue(collection, "sources"));
    let results = values(mapValue(collection, "results"));
    if (!variables || !sources || !results) throw new Error("malformedDerivativeCollection");
    if (wantedKind === "gradient" && kind === "jacobian" && sources.length === 1) {
        results = values(results[0]);
    } else if (kind !== wantedKind) {
        throw new Error(`expected${wantedKind}DerivativeCollection`);
    }
    return { kind, variables: variables.map((name) => name.toLowerCase()), sources, results };
}

function checkedGradient(expression, collection, box) {
    const parts = collectionParts(collection, "gradient");
    if (parts.sources.length !== 1 ||
        calculusGraphStructuralKey(parts.sources[0]) !== calculusGraphStructuralKey(expression) ||
        parts.results.length !== parts.variables.length) {
        throw new Error("gradientSourceOrShapeMismatch");
    }
    if (parts.variables.length !== box.dimension ||
        parts.variables.some((name, index) => name !== box.variables[index])) {
        throw new Error("gradientVariablesMustMatchBox");
    }
    const identities = parts.results.map((result) => checkCalculusDerivativeTransformation(result));
    if (identities.some((identity, index) =>
        !identity.accepted || identity.order !== 1 ||
        identity.variable !== parts.variables[index])) {
        throw new Error("uncheckedGradientTransformation");
    }
    return { ...parts, identities };
}

function checkedHessian(expression, collection, box) {
    const parts = collectionParts(collection, "hessian");
    if (parts.sources.length !== 1 ||
        calculusGraphStructuralKey(parts.sources[0]) !== calculusGraphStructuralKey(expression) ||
        parts.results.length !== parts.variables.length) {
        throw new Error("hessianSourceOrShapeMismatch");
    }
    if (parts.variables.length !== box.dimension ||
        parts.variables.some((name, index) => name !== box.variables[index])) {
        throw new Error("hessianVariablesMustMatchBox");
    }
    const rows = parts.results.map((row) => values(row));
    if (rows.some((row) => !row || row.length !== parts.variables.length)) {
        throw new Error("hessianShapeMismatch");
    }
    const identities = rows.map((row) => row.map(checkCalculusDerivativeTransformation));
    if (identities.some((row, rowIndex) => row.some((identity, columnIndex) =>
        !identity.accepted || identity.order !== 2 ||
        identity.variables[0] !== parts.variables[rowIndex] ||
        identity.variables[1] !== parts.variables[columnIndex]))) {
        throw new Error("uncheckedHessianTransformation");
    }
    return { ...parts, rows, identities };
}

function checkedJacobian(expressions, collection, box) {
    const sources = values(expressions);
    if (!sources || sources.length !== box.dimension) {
        throw new Error("krawczykSystemDimensionMismatch");
    }
    const parts = collectionParts(collection, "jacobian");
    if (parts.sources.length !== sources.length ||
        parts.sources.some((source, index) =>
            calculusGraphStructuralKey(source) !== calculusGraphStructuralKey(sources[index]))) {
        throw new Error("jacobianSourceMismatch");
    }
    if (parts.variables.length !== box.dimension ||
        parts.variables.some((name, index) => name !== box.variables[index])) {
        throw new Error("jacobianVariablesMustMatchBox");
    }
    const rows = parts.results.map((row) => values(row));
    if (rows.length !== box.dimension ||
        rows.some((row) => !row || row.length !== box.dimension)) {
        throw new Error("jacobianShapeMismatch");
    }
    const identities = rows.map((row) => row.map(checkCalculusDerivativeTransformation));
    if (identities.some((row) => row.some((identity, columnIndex) =>
        !identity.accepted || identity.order !== 1 ||
        identity.variable !== parts.variables[columnIndex]))) {
        throw new Error("uncheckedJacobianTransformation");
    }
    return { ...parts, sources, rows, identities };
}

function checkedGraphRange(expression, axes, options, conventions) {
    const result = evaluateCalculusGraphRange(expression, bindingMap(axes), options, conventions);
    if (!result.certified || result.domainStatus !== "allDefined") {
        throw new Error("graphRangeNotCertifiedOnBox");
    }
    return result;
}

function discharge(identity, axes, options, conventions) {
    const checks = derivativeObligationChecks(
        identity, bindingMap(axes), options, conventions,
    );
    if (checks.some((check) => !check.discharged)) {
        throw new Error("derivativeObligationNotDischargedOnBox");
    }
    return checks;
}

function failure(schema, strategy, expression, source, options, conventions, reason) {
    return Object.freeze({
        schema, strategy, status: "unknown", certified: false,
        domainStatus: "unresolved", range: RationalIntervalSet.empty,
        diagnostics: Object.freeze([reason]),
        evidence: Object.freeze({
            kind: "multivariateRange", checker: MULTIVARIATE_RANGE_CHECKER,
            strategy, expression, source, options, conventions,
        }),
    });
}

export function evaluateJacobianBoxRange(expression, derivativeCollection, source, options = map([]), conventions = {}) {
    const strategy = "jacobianSubdivision";
    try {
        conventions = normalizedConventions(conventions);
        const box = createRationalBox(source);
        const gradient = checkedGradient(expression, derivativeCollection, box);
        const partitions = partitionBoxes(box, options);
        const records = partitions.map((partition) => {
            const centers = centerAxes(partition);
            const deltas = deltaAxes(partition);
            let enclosure = checkedGraphRange(expression, centers, options, conventions).range;
            const derivativeRanges = [];
            const obligationChecks = [];
            for (let index = 0; index < gradient.variables.length; index += 1) {
                const identity = gradient.identities[index];
                obligationChecks.push(...discharge(identity, partition.axes, options, conventions));
                const derivative = checkedGraphRange(
                    identity.expression, partition.axes, options, conventions,
                ).range;
                derivativeRanges.push(derivative);
                enclosure = add(enclosure, multiply(derivative, deltas.get(gradient.variables[index])));
            }
            return Object.freeze({
                box: partition, center: centers, range: enclosure,
                derivativeRanges: Object.freeze(derivativeRanges),
                obligationChecks: Object.freeze(obligationChecks),
            });
        });
        return Object.freeze({
            schema: JACOBIAN_BOX_RANGE_SCHEMA, strategy, status: "enclosed",
            certified: true, domainStatus: "allDefined",
            range: rangeUnion(records.map((record) => record.range)),
            interval: rangeUnion(records.map((record) => record.range)).toRationalInterval(),
            box, partitions: Object.freeze(records),
            work: Object.freeze({ subboxes: records.length, dimension: box.dimension }),
            evidence: Object.freeze({
                kind: "multivariateRange", checker: MULTIVARIATE_RANGE_CHECKER,
                strategy, expression, derivativeCollection, source: box, options, conventions,
            }),
        });
    } catch (error) {
        return failure(JACOBIAN_BOX_RANGE_SCHEMA, strategy, expression, source, options, conventions, error.message);
    }
}

function expressionKind(expression) {
    return textValue(mapValue(expression, "kind"));
}

function expressionChildren(expression, key) {
    const children = values(mapValue(expression, key));
    if (!children) throw new Error(`malformedCalculusExpression:${key}`);
    return children;
}

function affineRadius(form) {
    let radius = Rational.zero;
    for (const coefficient of form.coefficients.values()) {
        radius = radius.add(coefficient.numerator < 0n ? coefficient.negate() : coefficient);
    }
    return radius;
}

function affineForm(center, coefficients = new Map()) {
    return Object.freeze({ center, coefficients });
}

function combineCoefficients(left, right, leftScale, rightScale) {
    const result = new Map();
    for (const name of new Set([...left.keys(), ...right.keys()])) {
        const value = (left.get(name) ?? Rational.zero).multiply(leftScale)
            .add((right.get(name) ?? Rational.zero).multiply(rightScale));
        if (!value.equals(Rational.zero)) result.set(name, value);
    }
    return result;
}

function affineEvaluate(expression, box, state, conventions) {
    const kind = expressionKind(expression);
    if (kind === "constant") {
        const value = exactRational(mapValue(expression, "value"));
        if (!value) throw new Error("affineRequiresExactRationalConstants");
        return affineForm(value);
    }
    if (kind === "variable") {
        const name = textValue(mapValue(expression, "name"))?.toLowerCase();
        const range = box.axes.get(name);
        if (!range) throw new Error(`unboundAffineVariable:${String(name)}`);
        const component = range.components[0];
        return affineForm(midpoint(component), new Map([[`x:${name}`, axisRadius(component)]]));
    }
    if (kind === "apply") throw new Error("affineSemanticApplicationNeedsRegisteredModel");
    if (kind !== "operator") throw new Error("unsupportedAffineGraphKind");
    const operation = textValue(mapValue(expression, "operation"));
    const operands = expressionChildren(expression, "operands");
    if (operation === "negate") {
        if (operands.length !== 1) throw new Error("affineOperatorArity");
        const inner = affineEvaluate(operands[0], box, state, conventions);
        return affineForm(inner.center.negate(), new Map(
            [...inner.coefficients].map(([name, value]) => [name, value.negate()]),
        ));
    }
    if (operands.length !== 2) throw new Error("affineOperatorArity");
    const left = affineEvaluate(operands[0], box, state, conventions);
    if (operation === "power") {
        const exponent = expressionKind(operands[1]) === "constant"
            ? exactRational(mapValue(operands[1], "value"))
            : null;
        if (!exponent || exponent.denominator !== 1n || exponent.numerator < 0n || exponent.numerator > 32n) {
            throw new Error("affinePowerRequiresSmallNonnegativeInteger");
        }
        if (exponent.numerator === 0n) {
            if (conventions.zeroPowerZero !== "one" && affineRange(left).containsValue(Rational.zero)) {
                throw new Error("zeroPowerZeroInAffineModel");
            }
            return affineForm(Rational.one);
        }
        let result = affineForm(Rational.one);
        for (let index = 0n; index < exponent.numerator; index += 1n) {
            result = affineMultiply(result, left, state);
        }
        return result;
    }
    const right = affineEvaluate(operands[1], box, state, conventions);
    if (operation === "add") return affineForm(
        left.center.add(right.center),
        combineCoefficients(left.coefficients, right.coefficients, Rational.one, Rational.one),
    );
    if (operation === "subtract") return affineForm(
        left.center.subtract(right.center),
        combineCoefficients(left.coefficients, right.coefficients, Rational.one, new Rational(-1)),
    );
    if (operation === "multiply") return affineMultiply(left, right, state);
    if (operation === "divide") {
        if (right.coefficients.size !== 0 || right.center.equals(Rational.zero)) {
            throw new Error("affineDivisionCurrentlyRequiresNonzeroConstantDivisor");
        }
        const reciprocal = right.center.reciprocal();
        return affineForm(
            left.center.multiply(reciprocal),
            new Map([...left.coefficients].map(([name, value]) => [name, value.multiply(reciprocal)])),
        );
    }
    throw new Error(`unsupportedAffineOperator:${String(operation)}`);
}

function affineMultiply(left, right, state) {
    const coefficients = combineCoefficients(
        left.coefficients, right.coefficients, right.center, left.center,
    );
    const nonlinearRadius = affineRadius(left).multiply(affineRadius(right));
    if (!nonlinearRadius.equals(Rational.zero)) {
        state.noise += 1;
        coefficients.set(`nonlinear:${state.noise}`, nonlinearRadius);
    }
    return affineForm(left.center.multiply(right.center), coefficients);
}

function affineRange(form) {
    const radius = affineRadius(form);
    return new RationalIntervalSet(new RationalInterval(
        form.center.subtract(radius), form.center.add(radius),
    ));
}

export function evaluateAffineBoxRange(expression, source, options = map([]), conventions = {}) {
    const strategy = "affineArithmetic";
    try {
        conventions = normalizedConventions(conventions);
        calculusGraphStructuralKey(expression);
        const box = createRationalBox(source);
        const partitions = partitionBoxes(box, options);
        const records = partitions.map((partition) => {
            const state = { noise: 0 };
            const form = affineEvaluate(expression, partition, state, conventions);
            return Object.freeze({ box: partition, form, range: affineRange(form), noiseSymbols: state.noise });
        });
        const range = rangeUnion(records.map((record) => record.range));
        return Object.freeze({
            schema: AFFINE_BOX_RANGE_SCHEMA, strategy, status: "enclosed",
            certified: true, domainStatus: "allDefined", range,
            interval: range.toRationalInterval(), box,
            partitions: Object.freeze(records),
            work: Object.freeze({ subboxes: records.length, dimension: box.dimension }),
            evidence: Object.freeze({
                kind: "multivariateRange", checker: MULTIVARIATE_RANGE_CHECKER,
                strategy, expression, source: box, options, conventions,
            }),
        });
    } catch (error) {
        return failure(AFFINE_BOX_RANGE_SCHEMA, strategy, expression, source, options, conventions, error.message);
    }
}

export function evaluateTaylorModelBoxRange(
    expression, gradientCollection, hessianCollection, source,
    options = map([]), conventions = {},
) {
    const strategy = "multivariateTaylorModel";
    try {
        conventions = normalizedConventions(conventions);
        const box = createRationalBox(source);
        const gradient = checkedGradient(expression, gradientCollection, box);
        const hessian = checkedHessian(expression, hessianCollection, box);
        const partitions = partitionBoxes(box, options);
        const half = point(new Rational(1, 2));
        const records = partitions.map((partition) => {
            const centers = centerAxes(partition);
            const deltas = deltaAxes(partition);
            let enclosure = checkedGraphRange(expression, centers, options, conventions).range;
            const gradientRanges = [];
            const hessianRanges = [];
            const obligationChecks = [];
            for (let index = 0; index < gradient.variables.length; index += 1) {
                const identity = gradient.identities[index];
                obligationChecks.push(...discharge(identity, centers, options, conventions));
                const derivative = checkedGraphRange(identity.expression, centers, options, conventions).range;
                gradientRanges.push(derivative);
                enclosure = add(enclosure, multiply(derivative, deltas.get(gradient.variables[index])));
            }
            let remainder = point(Rational.zero);
            for (let row = 0; row < hessian.variables.length; row += 1) {
                const rangeRow = [];
                for (let column = 0; column < hessian.variables.length; column += 1) {
                    const identity = hessian.identities[row][column];
                    obligationChecks.push(...discharge(identity, partition.axes, options, conventions));
                    const second = checkedGraphRange(identity.expression, partition.axes, options, conventions).range;
                    rangeRow.push(second);
                    let deltaProduct;
                    if (row === column) {
                        const radius = axisRadius(partition.axes.get(hessian.variables[row]).components[0]);
                        deltaProduct = new RationalIntervalSet(new RationalInterval(
                            Rational.zero, radius.multiply(radius),
                        ));
                    } else {
                        deltaProduct = multiply(
                            deltas.get(hessian.variables[row]),
                            deltas.get(hessian.variables[column]),
                        );
                    }
                    remainder = add(remainder, multiply(half, multiply(second, deltaProduct)));
                }
                hessianRanges.push(Object.freeze(rangeRow));
            }
            enclosure = add(enclosure, remainder);
            return Object.freeze({
                box: partition, center: centers, range: enclosure, remainder,
                gradientRanges: Object.freeze(gradientRanges),
                hessianRanges: Object.freeze(hessianRanges),
                obligationChecks: Object.freeze(obligationChecks),
            });
        });
        const range = rangeUnion(records.map((record) => record.range));
        return Object.freeze({
            schema: TAYLOR_MODEL_BOX_RANGE_SCHEMA, strategy, status: "enclosed",
            certified: true, domainStatus: "allDefined", range,
            interval: range.toRationalInterval(), box,
            partitions: Object.freeze(records),
            work: Object.freeze({ subboxes: records.length, dimension: box.dimension }),
            evidence: Object.freeze({
                kind: "multivariateRange", checker: MULTIVARIATE_RANGE_CHECKER,
                strategy, expression, gradientCollection, hessianCollection,
                source: box, options, conventions,
            }),
        });
    } catch (error) {
        return failure(
            TAYLOR_MODEL_BOX_RANGE_SCHEMA, strategy, expression, source,
            options, conventions, error.message,
        );
    }
}

function singletonRational(range, reason) {
    if (!(range instanceof RationalIntervalSet) || range.componentCount !== 1) {
        throw new Error(reason);
    }
    const component = range.components[0];
    if (!component.lowClosed || !component.highClosed ||
        component.low === null || component.high === null ||
        !component.low.equals(component.high)) {
        throw new Error(reason);
    }
    return component.low;
}

function closedComponent(range, reason) {
    if (!(range instanceof RationalIntervalSet) || range.componentCount !== 1) {
        throw new Error(reason);
    }
    const component = range.components[0];
    if (!component.lowClosed || !component.highClosed ||
        component.low === null || component.high === null) {
        throw new Error(reason);
    }
    return component;
}

function rationalIdentity(size) {
    return Array.from({ length: size }, (_, row) =>
        Array.from({ length: size }, (_, column) =>
            row === column ? Rational.one : Rational.zero));
}

export function invertRationalMatrix(source) {
    const size = source.length;
    const augmented = source.map((row, rowIndex) => [
        ...row,
        ...rationalIdentity(size)[rowIndex],
    ]);
    for (let column = 0; column < size; column += 1) {
        let pivot = column;
        while (pivot < size && augmented[pivot][column].equals(Rational.zero)) pivot += 1;
        if (pivot === size) return null;
        if (pivot !== column) [augmented[pivot], augmented[column]] = [augmented[column], augmented[pivot]];
        const divisor = augmented[column][column];
        augmented[column] = augmented[column].map((value) => value.divide(divisor));
        for (let row = 0; row < size; row += 1) {
            if (row === column) continue;
            const factor = augmented[row][column];
            if (factor.equals(Rational.zero)) continue;
            augmented[row] = augmented[row].map((value, index) =>
                value.subtract(factor.multiply(augmented[column][index])));
        }
    }
    return augmented.map((row) => row.slice(size));
}

/** Shared checked graph/derivative boundary for validated nonlinear solvers. */
export function checkedSystemBoxData(expressions, jacobianCollection, source, options = map([]), conventions = {}) {
    conventions = normalizedConventions(conventions);
    const box = createRationalBox(source);
    if (box.dimension < 1 || box.dimension > 16) throw new Error("rationalBoxDimensionOutOfRange");
    const jacobian = checkedJacobian(expressions, jacobianCollection, box);
    const centers = centerAxes(box);
    const obligationChecks = [];
    let graphEvaluations = 0;
    const evaluate = (expression, axes) => {
        graphEvaluations += 1;
        const range = checkedGraphRange(expression, axes, options, conventions).range;
        closedComponent(range, "validatedSystemRequiresClosedBoundedRange");
        return range.toRationalInterval();
    };
    const functionRange = jacobian.sources.map((expression) => evaluate(expression, box.axes));
    const functionAtCenter = jacobian.sources.map((expression) => evaluate(expression, centers));
    const jacobianRange = jacobian.identities.map((row) => row.map((identity) => {
        obligationChecks.push(...discharge(identity, box.axes, options, conventions));
        return evaluate(identity.expression, box.axes);
    }));
    return { box, center: box.variables.map((name) => singletonRational(centers.get(name), "validatedCenterMustBeExact")),
        functionRange, functionAtCenter, jacobianRange, obligationChecks, graphEvaluations, conventions };
}

function krawczykLimits(options) {
    const rawIterations = integerValue(
        mapValue(options, "maxiterations"),
        integerValue(mapValue(options, "maxwork"), 8n),
    );
    if (rawIterations < 1n || rawIterations > 64n) {
        throw new Error("krawczykMaxIterationsOutOfRange");
    }
    const trace = integerValue(mapValue(options, "trace"), 0n) !== 0n;
    return { maxIterations: Number(rawIterations), trace };
}

function krawczykFailure(expressions, jacobianCollection, source, options, conventions, reason) {
    return Object.freeze({
        schema: KRAWCZYK_BOX_SCHEMA,
        valueKind: "krawczykResult",
        strategy: "krawczyk",
        status: "unknown",
        classification: "invalidEvidence",
        rootExistence: "unproved",
        certified: false,
        inputBox: null,
        box: null,
        operatorBox: null,
        diagnostics: Object.freeze([reason]),
        work: Object.freeze({ iterations: 0, graphEvaluations: 0, exhausted: false }),
        trace: Object.freeze([]),
        evidence: Object.freeze({
            kind: "krawczyk",
            checker: KRAWCZYK_CHECKER,
            expressions,
            jacobianCollection,
            source,
            options,
            conventions,
        }),
    });
}

function boxEquals(left, right) {
    if (!left || !right || left.dimension !== right.dimension ||
        left.variables.some((name, index) => name !== right.variables[index])) return false;
    return left.variables.every((name) => left.axes.get(name).equals(right.axes.get(name)));
}

export function evaluateKrawczykBox(
    expressions, jacobianCollection, source, options = map([]), conventions = {},
) {
    try {
        conventions = normalizedConventions(conventions);
        const inputBox = createRationalBox(source);
        const jacobian = checkedJacobian(expressions, jacobianCollection, inputBox);
        const limits = krawczykLimits(options);
        let current = inputBox;
        let operatorBox = null;
        let center = null;
        let functionAtCenter = null;
        let midpointJacobian = null;
        let jacobianRange = null;
        let preconditioner = null;
        let classification = "contracted";
        let rootExistence = "unproved";
        let iterations = 0;
        let graphEvaluations = 0;
        let stopped = false;
        const trace = [];
        const obligationChecks = [];

        while (!stopped && iterations < limits.maxIterations) {
            iterations += 1;
            const centers = centerAxes(current);
            center = current.variables.map((name) =>
                singletonRational(centers.get(name), "krawczykCenterMustBeExact"));
            const deltas = deltaAxes(current);

            functionAtCenter = jacobian.sources.map((expression) => {
                graphEvaluations += 1;
                return singletonRational(
                    checkedGraphRange(expression, centers, options, conventions).range,
                    "krawczykRequiresExactRationalCenterValues",
                );
            });

            midpointJacobian = jacobian.identities.map((row) => row.map((identity) => {
                obligationChecks.push(...discharge(identity, current.axes, options, conventions));
                graphEvaluations += 1;
                return singletonRational(
                    checkedGraphRange(identity.expression, centers, options, conventions).range,
                    "krawczykRequiresExactRationalMidpointJacobian",
                );
            }));
            preconditioner = invertRationalMatrix(midpointJacobian);
            if (!preconditioner) {
                classification = "singularPreconditioner";
                stopped = true;
                if (limits.trace) trace.push(Object.freeze({
                    iteration: iterations, inputBox: current, center: Object.freeze(center),
                    functionAtCenter: Object.freeze(functionAtCenter),
                    midpointJacobian: Object.freeze(midpointJacobian.map(Object.freeze)),
                    classification,
                }));
                break;
            }

            jacobianRange = jacobian.identities.map((row) => row.map((identity) => {
                graphEvaluations += 1;
                return checkedGraphRange(identity.expression, current.axes, options, conventions).range;
            }));

            const operatorAxes = new Map();
            for (let row = 0; row < current.dimension; row += 1) {
                let base = center[row];
                for (let column = 0; column < current.dimension; column += 1) {
                    base = base.subtract(preconditioner[row][column].multiply(functionAtCenter[column]));
                }
                let operator = point(base);
                for (let axis = 0; axis < current.dimension; axis += 1) {
                    let coefficient = point(row === axis ? Rational.one : Rational.zero);
                    for (let column = 0; column < current.dimension; column += 1) {
                        coefficient = subtract(
                            coefficient,
                            multiply(point(preconditioner[row][column]), jacobianRange[column][axis]),
                        );
                    }
                    operator = add(operator, multiply(
                        coefficient, deltas.get(current.variables[axis]),
                    ));
                }
                closedComponent(operator, "krawczykOperatorMustBeOneClosedInterval");
                operatorAxes.set(current.variables[row], operator);
            }
            operatorBox = createRationalBox(operatorAxes);

            const intersections = new Map();
            let excluded = false;
            let strictInclusion = true;
            let contracted = false;
            for (const name of current.variables) {
                const inputRange = current.axes.get(name);
                const operatorRange = operatorBox.axes.get(name);
                const inputComponent = closedComponent(inputRange, "krawczykInputAxisInvalid");
                const operatorComponent = closedComponent(operatorRange, "krawczykOperatorAxisInvalid");
                const intersection = inputRange.intersection(operatorRange);
                if (intersection.isEmpty) {
                    excluded = true;
                    strictInclusion = false;
                    break;
                }
                intersections.set(name, intersection);
                const intersectionComponent = closedComponent(
                    intersection, "krawczykIntersectionMustBeOneClosedInterval",
                );
                if (!(inputComponent.low.lessThan(operatorComponent.low) &&
                    operatorComponent.high.lessThan(inputComponent.high))) strictInclusion = false;
                if (axisWidth(intersectionComponent).lessThan(axisWidth(inputComponent))) contracted = true;
            }

            let next = current;
            if (excluded) {
                classification = "excluded";
                rootExistence = "none";
                stopped = true;
            } else {
                next = createRationalBox(intersections);
                current = next;
                if (strictInclusion) {
                    classification = "unique";
                    rootExistence = "unique";
                    stopped = true;
                } else if (!contracted) {
                    classification = "stalled";
                    stopped = true;
                } else {
                    classification = "contracted";
                }
            }
            if (limits.trace) trace.push(Object.freeze({
                iteration: iterations,
                inputBox: excluded ? current : (trace.length === 0 ? inputBox : trace.at(-1).outputBox),
                center: Object.freeze(center),
                functionAtCenter: Object.freeze(functionAtCenter),
                midpointJacobian: Object.freeze(midpointJacobian.map(Object.freeze)),
                preconditioner: Object.freeze(preconditioner.map(Object.freeze)),
                jacobianRange: Object.freeze(jacobianRange.map(Object.freeze)),
                operatorBox,
                outputBox: excluded ? null : next,
                classification,
            }));
        }

        const exhausted = !stopped && iterations >= limits.maxIterations;
        const status = classification === "excluded" || classification === "unique"
            ? "classified"
            : exhausted ? "budgetExhausted" : "unknown";
        const diagnostics = classification === "singularPreconditioner"
            ? ["singularMidpointJacobian"]
            : classification === "stalled" ? ["krawczykResolutionFloor"]
                : exhausted ? ["workBudgetReached"] : [];
        return Object.freeze({
            schema: KRAWCZYK_BOX_SCHEMA,
            valueKind: "krawczykResult",
            strategy: "krawczyk",
            status,
            classification,
            rootExistence,
            certified: true,
            inputBox,
            box: classification === "excluded" ? null : current,
            operatorBox,
            center: center ? Object.freeze(center) : null,
            functionAtCenter: functionAtCenter ? Object.freeze(functionAtCenter) : null,
            midpointJacobian: midpointJacobian
                ? Object.freeze(midpointJacobian.map(Object.freeze)) : null,
            preconditioner: preconditioner
                ? Object.freeze(preconditioner.map(Object.freeze)) : null,
            jacobianRange: jacobianRange
                ? Object.freeze(jacobianRange.map(Object.freeze)) : null,
            obligationChecks: Object.freeze(obligationChecks),
            diagnostics: Object.freeze(diagnostics),
            work: Object.freeze({
                iterations,
                graphEvaluations,
                maxIterations: limits.maxIterations,
                exhausted,
            }),
            trace: Object.freeze(trace),
            evidence: Object.freeze({
                kind: "krawczyk",
                checker: KRAWCZYK_CHECKER,
                expressions: jacobian.sources,
                jacobianCollection,
                source: inputBox,
                options,
                conventions,
            }),
        });
    } catch (error) {
        return krawczykFailure(
            expressions, jacobianCollection, source, options, conventions, error.message,
        );
    }
}

export function checkKrawczykResult(candidate) {
    const evidence = mapValue(candidate, "evidence");
    if (textValue(mapValue(evidence, "kind")) !== "krawczyk" ||
        textValue(mapValue(evidence, "checker")) !== KRAWCZYK_CHECKER) {
        return Object.freeze({ accepted: false, certified: false, reason: "unsupportedKrawczykEvidence" });
    }
    const recomputed = evaluateKrawczykBox(
        mapValue(evidence, "expressions"),
        mapValue(evidence, "jacobiancollection"),
        mapValue(evidence, "source"),
        mapValue(evidence, "options") ?? map([]),
        mapValue(evidence, "conventions") ?? {},
    );
    const candidateBox = mapValue(candidate, "box");
    let boxMatches = false;
    if (candidateBox === null && recomputed.box === null) {
        boxMatches = true;
    } else if (candidateBox !== null && candidateBox !== undefined && recomputed.box !== null) {
        try {
            boxMatches = boxEquals(createRationalBox(candidateBox), recomputed.box);
        } catch {
            boxMatches = false;
        }
    }
    const claimedCertified = mapValue(candidate, "certified");
    const certified = claimedCertified === true ||
        (claimedCertified instanceof Integer && claimedCertified.value !== 0n);
    const accepted = textValue(mapValue(candidate, "schema")) === recomputed.schema &&
        textValue(mapValue(candidate, "status")) === recomputed.status &&
        textValue(mapValue(candidate, "classification")) === recomputed.classification &&
        textValue(mapValue(candidate, "rootexistence")) === recomputed.rootExistence &&
        certified === recomputed.certified && boxMatches;
    return Object.freeze({
        accepted,
        certified: accepted && recomputed.certified,
        reason: accepted ? null : "krawczykClaimMismatch",
        checkedBy: KRAWCZYK_CHECKER,
        strategy: "krawczyk",
    });
}

export function checkMultivariateRangeResult(candidate) {
    const evidence = mapValue(candidate, "evidence");
    if (textValue(mapValue(evidence, "kind")) !== "multivariateRange" ||
        textValue(mapValue(evidence, "checker")) !== MULTIVARIATE_RANGE_CHECKER) {
        return Object.freeze({ accepted: false, certified: false, reason: "unsupportedMultivariateEvidence" });
    }
    const strategy = textValue(mapValue(evidence, "strategy"));
    const expression = mapValue(evidence, "expression");
    const source = mapValue(evidence, "source");
    const options = mapValue(evidence, "options") ?? map([]);
    const conventions = mapValue(evidence, "conventions") ?? {};
    let recomputed;
    if (strategy === "jacobianSubdivision") {
        recomputed = evaluateJacobianBoxRange(
            expression, mapValue(evidence, "derivativecollection"), source, options, conventions,
        );
    } else if (strategy === "affineArithmetic") {
        recomputed = evaluateAffineBoxRange(expression, source, options, conventions);
    } else if (strategy === "multivariateTaylorModel") {
        recomputed = evaluateTaylorModelBoxRange(
            expression, mapValue(evidence, "gradientcollection"),
            mapValue(evidence, "hessiancollection"), source, options, conventions,
        );
    } else {
        return Object.freeze({ accepted: false, certified: false, reason: "unsupportedMultivariateStrategy" });
    }
    const claimedRange = mapValue(candidate, "range");
    const accepted = claimedRange instanceof RationalIntervalSet &&
        textValue(mapValue(candidate, "schema")) === recomputed.schema &&
        claimedRange.equals(recomputed.range) &&
        (mapValue(candidate, "certified") === true ||
            mapValue(candidate, "certified") instanceof Integer) === recomputed.certified &&
        textValue(mapValue(candidate, "domainstatus")) === recomputed.domainStatus;
    return Object.freeze({
        accepted, certified: accepted && recomputed.certified,
        reason: accepted ? null : "multivariateRangeClaimMismatch",
        checkedBy: MULTIVARIATE_RANGE_CHECKER, strategy,
    });
}

function valueWithCheck(result) {
    const checker = checkMultivariateRangeResult(result);
    if (checker.certified && result.range instanceof RationalIntervalSet) {
        result.range._ext = new Map([["rangeEvidence", portable({
            schema: result.schema,
            strategy: result.strategy,
            domainStatus: result.domainStatus,
            evidence: result.evidence,
            checker,
        })]]);
    }
    return portable({ ...result, checker });
}

export function rationalBoxValue(source) {
    return portable(createRationalBox(source));
}

export function multivariateRangeRequestValue(expression, source, options) {
    return portable(createMultivariateRangeRequest(expression, source, options));
}

export function jacobianBoxRangeValue(expression, derivatives, source, options, context) {
    const policy = rangeMathPolicy(context);
    return valueWithCheck(evaluateJacobianBoxRange(
        expression, derivatives, source, options,
        { zeroPowerZero: policy.zeroPowerZero },
    ));
}

export function affineBoxRangeValue(expression, source, options, context) {
    const policy = rangeMathPolicy(context);
    return valueWithCheck(evaluateAffineBoxRange(
        expression, source, options, { zeroPowerZero: policy.zeroPowerZero },
    ));
}

export function taylorModelBoxRangeValue(expression, gradient, hessian, source, options, context) {
    const policy = rangeMathPolicy(context);
    return valueWithCheck(evaluateTaylorModelBoxRange(
        expression, gradient, hessian, source, options,
        { zeroPowerZero: policy.zeroPowerZero },
    ));
}

export function krawczykBoxValue(expressions, jacobian, source, options, context) {
    const policy = rangeMathPolicy(context);
    const result = evaluateKrawczykBox(
        expressions, jacobian, source, options,
        { zeroPowerZero: policy.zeroPowerZero },
    );
    return portable({ ...result, checker: checkKrawczykResult(result) });
}

export function krawczykCheckValue(candidate) {
    try {
        return portable(checkKrawczykResult(candidate));
    } catch (error) {
        return portable({
            accepted: false,
            certified: false,
            reason: error.message || "malformedKrawczykResult",
        });
    }
}

export function multivariateRangeCheckValue(candidate) {
    return portable(checkMultivariateRangeResult(candidate));
}
