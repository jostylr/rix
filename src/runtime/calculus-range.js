import {
    Integer,
    Rational,
    RationalInterval,
    RationalIntervalSet,
    asRationalIntervalSet,
    rangeAbsoluteValue,
    rangeAdd,
    rangeDivide,
    rangeIntegerPower,
    rangeMultiply,
    rangeNegate,
    rangeSubtract,
} from "@ratmath/core";
import { rangeDiagnosticAction, rangeMathPolicy } from "./range-policy.js";

export const CALCULUS_GRAPH_RANGE_SCHEMA = "rix.numerics.calculus-graph-range@1";
export const CALCULUS_GRAPH_RANGE_CHECKER = "rix.runtime.calculus-graph-range-checker@1";

const text = (value) => ({ type: "string", value: String(value) });
const sequence = (values) => ({ type: "sequence", values });
const map = (entries) => ({
    type: "map",
    entries: new Map(entries.map(([key, value]) => [String(key).toLowerCase(), value])),
});

function mapValue(value, key) {
    if (value?.type !== "map" || !(value.entries instanceof Map)) return undefined;
    const wanted = String(key);
    if (value.entries.has(wanted)) return value.entries.get(wanted);
    const lower = wanted.toLowerCase();
    if (value.entries.has(lower)) return value.entries.get(lower);
    for (const [candidate, entry] of value.entries) {
        if (String(candidate).toLowerCase() === lower) return entry;
    }
    return undefined;
}

function textValue(value) {
    if (typeof value === "string") return value;
    if (value?.type === "string") return value.value;
    return null;
}

function integerValue(value, fallback) {
    if (value instanceof Integer) return value.value;
    if (value instanceof Rational && value.denominator === 1n) return value.numerator;
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
    return fallback;
}

function isExpression(value) {
    return value?.type === "map" &&
        textValue(mapValue(value, "schema")) === "rix.calculus.expression@1";
}

function expressionKind(value) {
    return textValue(mapValue(value, "kind"));
}

function expressionChildren(value, key) {
    const children = mapValue(value, key);
    if (!children || children.type !== "sequence" || !Array.isArray(children.values)) {
        throw new Error(`Calculus ${key} must be an Array`);
    }
    return children.values;
}

/** Deterministic identity compatible with Calculus.StructuralKey. */
export function calculusGraphStructuralKey(expression) {
    if (!isExpression(expression)) throw new Error("Expected a Calculus expression graph");
    const kind = expressionKind(expression);
    if (kind === "constant") return `constant(${String(mapValue(expression, "value"))})`;
    if (kind === "variable") return `variable(${textValue(mapValue(expression, "name"))})`;
    if (kind === "operator") {
        const operation = textValue(mapValue(expression, "operation"));
        const children = expressionChildren(expression, "operands")
            .map(calculusGraphStructuralKey).join(";");
        return `operator(${operation};${children})`;
    }
    if (kind === "apply") {
        const semanticId = textValue(mapValue(expression, "semanticid"));
        const children = expressionChildren(expression, "arguments")
            .map(calculusGraphStructuralKey).join(";");
        return `apply(${semanticId};${children})`;
    }
    throw new Error(`Unsupported Calculus expression kind ${String(kind)}`);
}

function exactRational(value) {
    if (value instanceof Rational) return value;
    if (value instanceof Integer) return new Rational(value.value);
    return null;
}

function trimPolynomial(coefficients) {
    const result = [...coefficients];
    while (result.length > 1 && result.at(-1).equals(Rational.zero)) result.pop();
    return result;
}

function polynomialAdd(left, right, subtract = false) {
    const length = Math.max(left.length, right.length);
    const result = [];
    for (let index = 0; index < length; index += 1) {
        const a = left[index] ?? Rational.zero;
        const b = right[index] ?? Rational.zero;
        result.push(subtract ? a.subtract(b) : a.add(b));
    }
    return trimPolynomial(result);
}

function polynomialNegate(value) {
    return trimPolynomial(value.map((coefficient) => coefficient.negate()));
}

function polynomialMultiply(left, right) {
    const result = Array.from(
        { length: left.length + right.length - 1 },
        () => Rational.zero,
    );
    for (let i = 0; i < left.length; i += 1) {
        for (let j = 0; j < right.length; j += 1) {
            result[i + j] = result[i + j].add(left[i].multiply(right[j]));
        }
    }
    return trimPolynomial(result);
}

function polynomialPower(value, exponent) {
    let power = exponent;
    let factor = value;
    let result = [Rational.one];
    while (power > 0n) {
        if ((power & 1n) === 1n) result = polynomialMultiply(result, factor);
        power >>= 1n;
        if (power > 0n) factor = polynomialMultiply(factor, factor);
    }
    return trimPolynomial(result);
}

function isZeroPolynomial(value) {
    return value.length === 1 && value[0].equals(Rational.zero);
}

function rationalGraphValue(numerator, denominator = [Rational.one], restrictions = []) {
    return {
        numerator: trimPolynomial(numerator),
        denominator: trimPolynomial(denominator),
        restrictions: [...restrictions],
    };
}

function rationalGraphAdd(left, right, subtract = false) {
    return rationalGraphValue(
        polynomialAdd(
            polynomialMultiply(left.numerator, right.denominator),
            polynomialMultiply(right.numerator, left.denominator),
            subtract,
        ),
        polynomialMultiply(left.denominator, right.denominator),
        [...left.restrictions, ...right.restrictions],
    );
}

function rationalGraphMultiply(left, right) {
    return rationalGraphValue(
        polynomialMultiply(left.numerator, right.numerator),
        polynomialMultiply(left.denominator, right.denominator),
        [...left.restrictions, ...right.restrictions],
    );
}

function recognizeRationalGraphNode(expression, variable) {
    const kind = expressionKind(expression);
    if (kind === "constant") {
        const value = exactRational(mapValue(expression, "value"));
        if (!value) throw new Error("nonRationalGraphConstant");
        return rationalGraphValue([value]);
    }
    if (kind === "variable") {
        const name = textValue(mapValue(expression, "name"))?.toLowerCase();
        if (name !== variable) throw new Error(`unexpectedGraphVariable:${String(name)}`);
        return rationalGraphValue([Rational.zero, Rational.one]);
    }
    if (kind !== "operator") {
        if (kind === "apply") {
            throw new Error(`semanticApplicationNotPolynomial:${textValue(mapValue(expression, "semanticid"))}`);
        }
        throw new Error(`unsupportedGraphKind:${String(kind)}`);
    }
    const operation = textValue(mapValue(expression, "operation"));
    const operands = expressionChildren(expression, "operands");
    if (operation === "negate") {
        if (operands.length !== 1) throw new Error("graphOperatorArity");
        const value = recognizeRationalGraphNode(operands[0], variable);
        return rationalGraphValue(
            polynomialNegate(value.numerator),
            value.denominator,
            value.restrictions,
        );
    }
    if (operands.length !== 2) throw new Error("graphOperatorArity");
    const left = recognizeRationalGraphNode(operands[0], variable);
    if (operation === "power") {
        const exponent = exactIntegerConstant(operands[1]);
        if (exponent === null) throw new Error("graphPowerRequiresIntegerConstant");
        if (exponent >= 0n) {
            return rationalGraphValue(
                polynomialPower(left.numerator, exponent),
                polynomialPower(left.denominator, exponent),
                exponent === 0n
                    ? [...left.restrictions, `zeroPowerZero:${calculusGraphStructuralKey(operands[0])}`]
                    : left.restrictions,
            );
        }
        if (isZeroPolynomial(left.numerator)) throw new Error("identicallyZeroDenominator");
        return rationalGraphValue(
            polynomialPower(left.denominator, -exponent),
            polynomialPower(left.numerator, -exponent),
            [...left.restrictions, calculusGraphStructuralKey(operands[0])],
        );
    }
    const right = recognizeRationalGraphNode(operands[1], variable);
    if (operation === "add") return rationalGraphAdd(left, right);
    if (operation === "subtract") return rationalGraphAdd(left, right, true);
    if (operation === "multiply") return rationalGraphMultiply(left, right);
    if (operation === "divide") {
        if (isZeroPolynomial(right.numerator)) throw new Error("identicallyZeroDenominator");
        const divisorKnownNonzeroConstant = right.numerator.length === 1 &&
            right.denominator.length === 1 && !right.numerator[0].equals(Rational.zero);
        return rationalGraphValue(
            polynomialMultiply(left.numerator, right.denominator),
            polynomialMultiply(left.denominator, right.numerator),
            [
                ...left.restrictions,
                ...right.restrictions,
                ...(divisorKnownNonzeroConstant ? [] : [calculusGraphStructuralKey(operands[1])]),
            ],
        );
    }
    throw new Error(`unsupportedGraphOperator:${String(operation)}`);
}

/**
 * Recognize an exact univariate polynomial or source-domain-preserving
 * rational function without cancelling denominator restrictions.
 */
export function recognizeCalculusGraph(expression, variableValue) {
    if (!isExpression(expression)) {
        return Object.freeze({ recognized: false, reason: "notCalculusExpression" });
    }
    const variable = textValue(variableValue)?.toLowerCase();
    if (!variable) return Object.freeze({ recognized: false, reason: "invalidPolynomialVariable" });
    try {
        const value = recognizeRationalGraphNode(expression, variable);
        if (isZeroPolynomial(value.denominator)) {
            return Object.freeze({ recognized: false, reason: "identicallyZeroDenominator" });
        }
        let numerator = value.numerator;
        let denominator = value.denominator;
        if (denominator.length === 1 && !denominator[0].equals(Rational.zero)) {
            const scale = denominator[0].reciprocal();
            numerator = numerator.map((coefficient) => coefficient.multiply(scale));
            denominator = [Rational.one];
        }
        const polynomial = denominator.length === 1 && denominator[0].equals(Rational.one) &&
            value.restrictions.length === 0;
        return Object.freeze({
            recognized: true,
            schema: "rix.numerics.calculus-graph-recognition@1",
            kind: polynomial ? "polynomial" : "rationalFunction",
            variable,
            graphIdentity: calculusGraphStructuralKey(expression),
            numerator: Object.freeze(trimPolynomial(numerator)),
            denominator: Object.freeze(trimPolynomial(denominator)),
            sourceDomainRestrictions: Object.freeze([...new Set(value.restrictions)]),
            cancellationPerformed: false,
        });
    } catch (error) {
        return Object.freeze({
            recognized: false,
            schema: "rix.numerics.calculus-graph-recognition@1",
            reason: error.message,
            graphIdentity: calculusGraphStructuralKey(expression),
        });
    }
}

function normalizeBindings(bindings) {
    if (!bindings || bindings.type !== "map" || !(bindings.entries instanceof Map)) {
        throw new Error("Calculus graph range bindings must be a Map");
    }
    const result = new Map();
    for (const [name, value] of bindings.entries) {
        try {
            result.set(String(name).toLowerCase(), asRationalIntervalSet(value));
        } catch {
            throw new Error(`Calculus graph binding ${String(name)} must be an exact rational range`);
        }
    }
    return result;
}

function bindingFingerprint(bindings) {
    return [...bindings.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, value]) => `${name}=${value.toString()}`).join(";");
}

function exactIntegerConstant(expression) {
    if (!isExpression(expression) || expressionKind(expression) !== "constant") return null;
    const value = mapValue(expression, "value");
    const integer = integerValue(value, null);
    return integer;
}

function unionDependencies(left, right) {
    return new Set([...left, ...right]);
}

function disjoint(left, right) {
    for (const value of left) if (right.has(value)) return false;
    return true;
}

function concatExclusions(results, local = []) {
    return [...results.flatMap((result) => result.exclusions), ...local];
}

function mergeCoverage(children, localCoverage, localReliable = true) {
    const coverages = children.map((child) => child.coverage);
    if (coverages.includes("unresolved")) return "unresolved";
    if (coverages.includes("noDefinedInputs")) return "noDefinedInputs";
    if (!localReliable && localCoverage !== "allDefined") return "unresolved";
    if (localCoverage === "noDefinedInputs") return "noDefinedInputs";
    if (localCoverage === "partiallyDefined") return "partiallyDefined";
    const partials = coverages.filter((coverage) => coverage === "partiallyDefined").length;
    if (partials === 0) return "allDefined";
    return partials === 1 ? "partiallyDefined" : "unresolved";
}

function operationRecord(operation, operands, exponent = null, zeroPowerZero = "undefined") {
    switch (operation) {
        case "negate": return rangeNegate(operands[0]);
        case "absoluteValue": return rangeAbsoluteValue(operands[0]);
        case "add": return rangeAdd(operands[0], operands[1]);
        case "subtract": return rangeSubtract(operands[0], operands[1]);
        case "multiply": return rangeMultiply(operands[0], operands[1]);
        case "divide": return rangeDivide(operands[0], operands[1]);
        case "integerPower": return rangeIntegerPower(operands[0], exponent, { zeroPowerZero });
        default: throw new Error(`Unsupported exact graph operation ${operation}`);
    }
}

function graphNodeResult(fields) {
    return {
        range: fields.range,
        coverage: fields.coverage,
        exclusions: Object.freeze(fields.exclusions || []),
        certified: fields.certified,
        exactImage: fields.exactImage,
        dependencies: fields.dependencies,
        nodeId: fields.nodeId,
    };
}

function appendTrace(state, rule, key, premises, conclusion, parameters = {}) {
    const id = `n${state.trace.length + 1}`;
    state.trace.push(Object.freeze({ id, rule, key, premises, conclusion, parameters }));
    return id;
}

function exactSetConclusion(result) {
    return Object.freeze({
        type: "rangeEnclosure",
        range: result.range,
        domainCoverage: result.coverage,
        exclusions: result.exclusions,
    });
}

function evaluateSameExpression(operation, child, operandKey, graphKey, state) {
    if (operation === "subtract") {
        const record = rangeMultiply(child.range, Rational.zero);
        const result = graphNodeResult({
            range: record.range,
            coverage: child.coverage,
            exclusions: child.exclusions,
            certified: child.certified,
            exactImage: child.coverage !== "unresolved",
            dependencies: child.dependencies,
            nodeId: null,
        });
        result.nodeId = appendTrace(
            state, "graph.sameInputSubtract", graphKey, [child.nodeId],
            exactSetConclusion(result), { operandIdentity: operandKey },
        );
        return result;
    }

    const excludesZero = !child.range.containsValue(Rational.zero);
    const localReliable = child.exactImage || excludesZero || child.range.isEmpty;
    let record;
    if (localReliable) {
        record = rangeIntegerPower(child.range, 0, { zeroPowerZero: "undefined" });
    } else {
        const nonzero = child.range.intersection([
            { low: null, high: 0, lowClosed: false, highClosed: false },
            { low: 0, high: null, lowClosed: false, highClosed: false },
        ]);
        record = {
            range: nonzero.isEmpty ? RationalIntervalSet.empty : RationalIntervalSet.point(1),
            domain: { coverage: "unresolved", exclusions: [] },
        };
    }
    const coverage = mergeCoverage([child], record.domain.coverage, localReliable);
    const localExclusions = localReliable && child.range.containsValue(Rational.zero)
        ? [{ reason: "divisionByZero", operand: 1, excludedSet: RationalIntervalSet.point(0) }]
        : [];
    const result = graphNodeResult({
        range: record.range,
        coverage,
        exclusions: concatExclusions([child], localExclusions),
        certified: child.certified && coverage !== "unresolved",
        exactImage: localReliable && coverage !== "unresolved",
        dependencies: child.dependencies,
        nodeId: null,
    });
    result.nodeId = appendTrace(
        state, "graph.sameInputDivide", graphKey, [child.nodeId],
        exactSetConclusion(result), { operandIdentity: operandKey },
    );
    return result;
}

function evaluateNode(expression, bindings, state) {
    if (state.nodes >= state.maxNodes) throw new Error("calculusGraphWorkLimit");
    const graphKey = calculusGraphStructuralKey(expression);
    const cacheKey = `${graphKey}|${state.bindingKey}`;
    const cached = state.cache.get(cacheKey);
    if (cached) {
        state.reuses += 1;
        return cached;
    }
    state.nodes += 1;

    const kind = expressionKind(expression);
    let result;
    if (kind === "constant") {
        const value = mapValue(expression, "value");
        const range = asRationalIntervalSet(value);
        result = graphNodeResult({
            range, coverage: "allDefined", exclusions: [], certified: true,
            exactImage: true, dependencies: new Set(), nodeId: null,
        });
        result.nodeId = appendTrace(state, "given.constant", graphKey, [], exactSetConclusion(result));
    } else if (kind === "variable") {
        const name = textValue(mapValue(expression, "name"))?.toLowerCase();
        if (!name || !bindings.has(name)) throw new Error(`missingGraphBinding:${String(name)}`);
        const range = bindings.get(name);
        result = graphNodeResult({
            range, coverage: "allDefined", exclusions: [], certified: true,
            exactImage: true, dependencies: new Set([name]), nodeId: null,
        });
        result.nodeId = appendTrace(
            state, "given.input", graphKey, [], exactSetConclusion(result), { variable: name },
        );
    } else if (kind === "operator") {
        const operation = textValue(mapValue(expression, "operation"));
        const operands = expressionChildren(expression, "operands");
        if (operation === "negate") {
            if (operands.length !== 1) throw new Error("graphOperatorArity");
            const child = evaluateNode(operands[0], bindings, state);
            const record = operationRecord("negate", [child.range]);
            result = graphNodeResult({
                range: record.range,
                coverage: child.coverage,
                exclusions: child.exclusions,
                certified: child.certified,
                exactImage: child.exactImage,
                dependencies: child.dependencies,
                nodeId: null,
            });
            result.nodeId = appendTrace(
                state, "arith.negate", graphKey, [child.nodeId], exactSetConclusion(result),
                { operands: [child.range] },
            );
        } else {
            if (operands.length !== 2) throw new Error("graphOperatorArity");
            const leftKey = calculusGraphStructuralKey(operands[0]);
            const rightKey = calculusGraphStructuralKey(operands[1]);
            const left = evaluateNode(operands[0], bindings, state);
            const right = evaluateNode(operands[1], bindings, state);
            if ((operation === "subtract" || operation === "divide") && leftKey === rightKey) {
                result = evaluateSameExpression(operation, left, leftKey, graphKey, state);
            } else {
                let coreOperation = operation;
                let exponent = null;
                let operationChildren = [left, right];
                if (operation === "power") {
                    exponent = exactIntegerConstant(operands[1]);
                    if (exponent === null) throw new Error("graphPowerRequiresIntegerConstant");
                    coreOperation = "integerPower";
                    operationChildren = [left];
                } else if (!["add", "subtract", "multiply", "divide"].includes(operation)) {
                    throw new Error(`unsupportedGraphOperator:${String(operation)}`);
                }
                const record = operationRecord(
                    coreOperation,
                    operationChildren.map((child) => child.range),
                    exponent,
                    state.zeroPowerZero,
                );
                const independent = operationChildren.length === 1 ||
                    disjoint(left.dependencies, right.dependencies);
                const inputsExact = operationChildren.every((child) => child.exactImage);
                const localReliable = coreOperation !== "divide" || (inputsExact && independent);
                const coverage = mergeCoverage(
                    operationChildren, record.domain.coverage, localReliable,
                );
                const localExclusions = localReliable ? record.domain.exclusions : [];
                const dependencies = operationChildren.length === 1
                    ? new Set(left.dependencies)
                    : unionDependencies(left.dependencies, right.dependencies);
                const certified = operationChildren.every((child) => child.certified) &&
                    coverage !== "unresolved";
                const exactImage = inputsExact && independent && coverage !== "unresolved";
                result = graphNodeResult({
                    range: record.range,
                    coverage,
                    exclusions: concatExclusions(operationChildren, localExclusions),
                    certified,
                    exactImage,
                    dependencies,
                    nodeId: null,
                });
                result.nodeId = appendTrace(
                    state, `arith.${coreOperation}`, graphKey,
                    operationChildren.map((child) => child.nodeId), exactSetConclusion(result),
                    { operands: operationChildren.map((child) => child.range), exponent },
                );
            }
        }
    } else if (kind === "apply") {
        throw new Error(`unsupportedSemanticApplication:${textValue(mapValue(expression, "semanticid"))}`);
    } else {
        throw new Error(`unsupportedGraphKind:${String(kind)}`);
    }

    state.cache.set(cacheKey, result);
    return result;
}

function subdivisionCount(options) {
    const raw = mapValue(options, "maxsubintervals");
    const value = integerValue(raw, 1n);
    if (value < 1n || value > 10_000n) throw new Error("maxSubintervals must be between 1 and 10000");
    return Number(value);
}

function maxNodeCount(options) {
    const raw = mapValue(options, "maxwork") ?? mapValue(options, "maxnodes");
    const value = integerValue(raw, 10_000n);
    if (value < 1n || value > 1_000_000n) throw new Error("maxWork must be between 1 and 1000000");
    return Number(value);
}

function subdivideRange(set, maximum) {
    if (maximum <= 1 || set.isEmpty) return [set];
    const components = set.components;
    if (components.some((component) => component.low === null || component.high === null)) {
        return components.map((component) => new RationalIntervalSet(component));
    }
    const perComponent = Math.max(1, Math.floor(maximum / components.length));
    const pieces = [];
    for (const component of components) {
        if (perComponent === 1 || component.low.equals(component.high)) {
            pieces.push(new RationalIntervalSet(component));
            continue;
        }
        const width = component.high.subtract(component.low);
        for (let index = 0; index < perComponent; index += 1) {
            const low = component.low.add(width.multiply(new Rational(BigInt(index), BigInt(perComponent))));
            const high = component.low.add(width.multiply(new Rational(BigInt(index + 1), BigInt(perComponent))));
            pieces.push(new RationalIntervalSet({
                low,
                high,
                lowClosed: index === 0 ? component.lowClosed : true,
                highClosed: index === perComponent - 1 ? component.highClosed : false,
            }));
        }
    }
    return pieces;
}

function aggregateCoverage(results) {
    if (results.some((result) => result.coverage === "unresolved")) return "unresolved";
    const defined = results.filter((result) => result.coverage !== "noDefinedInputs");
    if (defined.length === 0) return "noDefinedInputs";
    if (defined.length !== results.length || results.some((result) =>
        result.coverage === "partiallyDefined")) return "partiallyDefined";
    return "allDefined";
}

function evaluateWithBindings(expression, bindings, options, conventions) {
    const state = {
        cache: new Map(),
        trace: [],
        nodes: 0,
        reuses: 0,
        maxNodes: maxNodeCount(options),
        bindingKey: bindingFingerprint(bindings),
        zeroPowerZero: conventions.zeroPowerZero,
    };
    const result = evaluateNode(expression, bindings, state);
    return { result, state };
}

function rangeResult(expression, sourceBindings, options, conventions = { zeroPowerZero: "undefined" }) {
    const bindings = normalizeBindings(sourceBindings);
    const maximumPieces = subdivisionCount(options);
    let partitions = [bindings];
    if (bindings.size === 1 && maximumPieces > 1) {
        const [[name, input]] = bindings.entries();
        partitions = subdivideRange(input, maximumPieces).map((piece) => new Map([[name, piece]]));
    }

    const evaluated = [];
    let totalNodes = 0;
    let totalReuses = 0;
    const trace = [];
    for (const partition of partitions) {
        try {
            const piece = evaluateWithBindings(expression, partition, options, conventions);
            evaluated.push(piece.result);
            totalNodes += piece.state.nodes;
            totalReuses += piece.state.reuses;
            trace.push(Object.freeze({
                bindings: partition,
                root: piece.result.nodeId,
                nodes: Object.freeze(piece.state.trace),
            }));
        } catch (error) {
            return Object.freeze({
                schema: CALCULUS_GRAPH_RANGE_SCHEMA,
                functionId: calculusGraphStructuralKey(expression),
                expression,
                bindings,
                range: RationalIntervalSet.empty,
                status: "unknown",
                certified: false,
                domainStatus: "unresolved",
                exactImage: false,
                goalMet: false,
                diagnostics: Object.freeze([error.message]),
                work: Object.freeze({ nodes: totalNodes, reuses: totalReuses, subintervals: partitions.length }),
                evidence: Object.freeze({
                    kind: "calculusGraphEvaluation",
                    checker: CALCULUS_GRAPH_RANGE_CHECKER,
                    expression,
                    bindings,
                    options,
                    conventions,
                    trace: Object.freeze(trace),
                }),
            });
        }
    }

    const range = evaluated.reduce(
        (combined, piece) => combined.union(piece.range), RationalIntervalSet.empty,
    );
    const domainStatus = aggregateCoverage(evaluated);
    const certified = evaluated.every((piece) => piece.certified) && domainStatus !== "unresolved";
    const exactImage = evaluated.every((piece) => piece.exactImage) && domainStatus !== "unresolved";
    const exclusions = evaluated.flatMap((piece) => piece.exclusions);
    return Object.freeze({
        schema: CALCULUS_GRAPH_RANGE_SCHEMA,
        functionId: calculusGraphStructuralKey(expression),
        expression,
        bindings,
        range,
        status: certified ? "enclosed" : "unknown",
        certified,
        domainStatus,
        exactImage,
        goalMet: certified,
        diagnostics: Object.freeze(certified ? [] : ["calculusGraphRangeUnresolved"]),
        exclusions: Object.freeze(exclusions),
        work: Object.freeze({ nodes: totalNodes, reuses: totalReuses, subintervals: partitions.length }),
        evidence: Object.freeze({
            kind: "calculusGraphEvaluation",
            checker: CALCULUS_GRAPH_RANGE_CHECKER,
            expression,
            bindings,
            options,
            conventions,
            trace: Object.freeze(trace),
        }),
    });
}

export function evaluateCalculusGraphRange(
    expression,
    bindings,
    options = map([]),
    conventions = { zeroPowerZero: "undefined" },
) {
    return rangeResult(expression, bindings, options, conventions);
}

export function checkCalculusGraphRangeResult(candidate) {
    const evidence = candidate?.evidence;
    if (candidate?.schema !== CALCULUS_GRAPH_RANGE_SCHEMA ||
        evidence?.kind !== "calculusGraphEvaluation" ||
        evidence?.checker !== CALCULUS_GRAPH_RANGE_CHECKER) {
        return Object.freeze({ accepted: false, certified: false, reason: "unsupportedGraphRangeEvidence" });
    }
    const recomputed = rangeResult(evidence.expression, map(
        [...evidence.bindings.entries()].map(([key, value]) => [key, value]),
    ), evidence.options, evidence.conventions);
    const accepted = candidate.functionId === recomputed.functionId &&
        candidate.range.equals(recomputed.range) &&
        candidate.domainStatus === recomputed.domainStatus &&
        candidate.certified === recomputed.certified &&
        candidate.exactImage === recomputed.exactImage;
    return Object.freeze({
        accepted,
        certified: accepted && recomputed.certified,
        reason: accepted ? null : "graphRangeClaimMismatch",
        checkedBy: CALCULUS_GRAPH_RANGE_CHECKER,
        functionId: recomputed.functionId,
        domainStatus: recomputed.domainStatus,
    });
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
    if (value instanceof Set) return sequence([...value].map(portable));
    if (value instanceof Map) return map([...value].map(([key, entry]) => [key, portable(entry)]));
    if (value?.type === "map" || value?.type === "sequence" || value?.type === "string") return value;
    if (typeof value === "object") {
        return map(Object.entries(value).map(([key, entry]) => [key, portable(entry)]));
    }
    return text(value);
}

export function calculusGraphRangeValue(expression, bindings, options, context) {
    const policy = rangeMathPolicy(context);
    const conventions = Object.freeze({ zeroPowerZero: policy.zeroPowerZero });
    const result = evaluateCalculusGraphRange(expression, bindings, options, conventions);
    const check = checkCalculusGraphRangeResult(result);
    const interval = result.range.toRationalInterval();
    const value = map([
        ["valueKind", text("calculusGraphRange")],
        ["schema", text(result.schema)],
        ["functionId", text(result.functionId)],
        ["expression", expression],
        ["bindings", bindings],
        ["status", text(result.status)],
        ["range", result.range],
        ["interval", interval],
        ["certified", portable(check.certified)],
        ["domainStatus", text(result.domainStatus)],
        ["exactImage", portable(result.exactImage)],
        ["goalMet", portable(result.goalMet)],
        ["evidenceLevel", text(check.certified ? "checkedEvidence" : "heuristic")],
        ["work", portable(result.work)],
        ["diagnostics", portable(result.diagnostics)],
        ["exclusions", portable(result.exclusions || [])],
        ["evidence", portable(result.evidence)],
        ["checker", portable(check)],
    ]);
    if (check.certified) {
        result.range._ext = new Map([["rangeEvidence", map([
            ["schema", text(result.schema)],
            ["functionId", text(result.functionId)],
            ["domainStatus", text(result.domainStatus)],
            ["evidence", portable(result.evidence)],
            ["checker", portable(check)],
        ])]]);
    }
    const diagnosticCategories = [
        ...(result.exclusions || []).map((entry) => entry.reason),
        ...(result.domainStatus === "allDefined" ? [] : [result.domainStatus]),
    ];
    const throwing = diagnosticCategories.find((category) =>
        rangeDiagnosticAction(policy, category) === "throw");
    if (throwing) {
        const error = new Error(`Calculus graph range encountered ${throwing}`);
        error.rangeEvidence = value;
        throw error;
    }
    return value;
}

export function calculusGraphRangeCheckValue(value) {
    if (value?.type !== "map") {
        return portable({ accepted: false, certified: false, reason: "notCalculusGraphRange" });
    }
    const evidence = mapValue(value, "evidence");
    const expression = mapValue(evidence, "expression");
    const bindings = mapValue(evidence, "bindings");
    const options = mapValue(evidence, "options") ?? map([]);
    const conventionValue = mapValue(evidence, "conventions");
    const zeroPowerZero = textValue(mapValue(conventionValue, "zeropowerzero")) ?? "undefined";
    if (textValue(mapValue(value, "schema")) !== CALCULUS_GRAPH_RANGE_SCHEMA ||
        textValue(mapValue(evidence, "kind")) !== "calculusGraphEvaluation" ||
        textValue(mapValue(evidence, "checker")) !== CALCULUS_GRAPH_RANGE_CHECKER ||
        !isExpression(expression) || bindings?.type !== "map") {
        return portable({
            accepted: false,
            certified: false,
            reason: "unsupportedGraphRangeEvidence",
            checkedBy: CALCULUS_GRAPH_RANGE_CHECKER,
        });
    }
    const recomputed = evaluateCalculusGraphRange(expression, bindings, options, { zeroPowerZero });
    const range = mapValue(value, "range");
    const accepted = range instanceof RationalIntervalSet &&
        textValue(mapValue(value, "functionid")) === recomputed.functionId &&
        range.equals(recomputed.range) &&
        textValue(mapValue(value, "domainstatus")) === recomputed.domainStatus &&
        (mapValue(value, "certified") instanceof Integer) === recomputed.certified &&
        (mapValue(value, "exactimage") instanceof Integer) === recomputed.exactImage;
    return portable({
        accepted,
        certified: accepted && recomputed.certified,
        reason: accepted ? null : "graphRangeClaimMismatch",
        checkedBy: CALCULUS_GRAPH_RANGE_CHECKER,
        functionId: recomputed.functionId,
        domainStatus: recomputed.domainStatus,
    });
}

export function calculusGraphRecognitionValue(expression, variable) {
    return portable(recognizeCalculusGraph(expression, variable));
}
