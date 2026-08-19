import {
    Integer,
    Rational,
    RationalIntervalSet,
    rangeAbsoluteValue,
    rangeAdd,
    rangeDivide,
    rangeIntegerPower,
    rangeMultiply,
    rangeNegate,
    rangeReciprocal,
    rangeSubtract,
} from "@ratmath/core";
import {
    calculusGraphStructuralKey,
    checkCalculusDerivativeTransformation,
    recognizeCalculusGraph,
    substituteCalculusGraphVariable,
} from "./calculus-range.js";

export const RANGE_EVIDENCE_SCHEMA = "rix.numerics.range-evidence@1";
export const RANGE_CHECKER_VOCABULARY = "rix.numerics.range-checker@1";

const DEFAULT_LIMITS = Object.freeze({
    maxNodes: 10_000,
    maxComponents: 10_000,
    maxPolynomialDegree: 256,
});

function exactRational(value) {
    if (value instanceof Rational) return value;
    if (value instanceof Integer) return new Rational(value.value);
    if (typeof value === "bigint" || typeof value === "string" ||
        (typeof value === "number" && Number.isSafeInteger(value))) return new Rational(value);
    throw new Error("polynomialCoefficientNotExactRational");
}

function normalizePolynomial(value) {
    if (!Array.isArray(value) || value.length === 0) throw new Error("invalidPolynomial");
    const polynomial = value.map(exactRational);
    while (polynomial.length > 1 && polynomial.at(-1).equals(Rational.zero)) polynomial.pop();
    return polynomial;
}

function samePolynomial(left, right) {
    try {
        const a = normalizePolynomial(left);
        const b = normalizePolynomial(right);
        return a.length === b.length && a.every((coefficient, index) => coefficient.equals(b[index]));
    } catch {
        return false;
    }
}

function zeroPolynomial(value) {
    return value.length === 1 && value[0].equals(Rational.zero);
}

function polynomialDerivative(value) {
    if (value.length === 1) return [Rational.zero];
    return value.slice(1).map((coefficient, index) =>
        coefficient.multiply(new Rational(BigInt(index + 1))));
}

function polynomialNegatedRemainder(dividend, divisor) {
    if (zeroPolynomial(divisor)) throw new Error("polynomialDivisionByZero");
    const remainder = normalizePolynomial(dividend);
    const divisorDegree = divisor.length - 1;
    while (!zeroPolynomial(remainder) && remainder.length - 1 >= divisorDegree) {
        const offset = remainder.length - divisor.length;
        const scale = remainder.at(-1).divide(divisor.at(-1));
        for (let index = 0; index < divisor.length; index += 1) {
            remainder[index + offset] = remainder[index + offset]
                .subtract(divisor[index].multiply(scale));
        }
        while (remainder.length > 1 && remainder.at(-1).equals(Rational.zero)) remainder.pop();
    }
    return remainder.map((coefficient) => coefficient.negate());
}

function sturmSequence(polynomial, maxDegree) {
    const source = normalizePolynomial(polynomial);
    if (zeroPolynomial(source)) throw new Error("identicallyZeroPolynomial");
    if (source.length - 1 > maxDegree) throw new Error("polynomialDegreeLimit");
    if (source.length === 1) return [source];
    const sequence = [source, normalizePolynomial(polynomialDerivative(source))];
    while (!zeroPolynomial(sequence.at(-1))) {
        const remainder = normalizePolynomial(polynomialNegatedRemainder(
            sequence.at(-2), sequence.at(-1),
        ));
        if (zeroPolynomial(remainder)) break;
        sequence.push(remainder);
    }
    return sequence;
}

function samePolynomialSequence(left, right) {
    return Array.isArray(left) && left.length === right.length &&
        left.every((polynomial, index) => samePolynomial(polynomial, right[index]));
}

function polynomialSignAt(polynomial, point) {
    const x = exactRational(point);
    let value = Rational.zero;
    for (let index = polynomial.length - 1; index >= 0; index -= 1) {
        value = value.multiply(x).add(polynomial[index]);
    }
    return value.numerator < 0n ? -1 : value.numerator > 0n ? 1 : 0;
}

function signVariations(sequence, point) {
    const signs = sequence.map((polynomial) => polynomialSignAt(polynomial, point))
        .filter((sign) => sign !== 0);
    let variations = 0;
    for (let index = 1; index < signs.length; index += 1) {
        if (signs[index] !== signs[index - 1]) variations += 1;
    }
    return variations;
}

function polynomialSignBeside(polynomial, point, side) {
    if (side !== "left" && side !== "right") throw new Error("invalidRootSide");
    let derivative = normalizePolynomial(polynomial);
    let order = 0;
    while (!zeroPolynomial(derivative)) {
        const sign = polynomialSignAt(derivative, point);
        if (sign !== 0) return side === "left" && order % 2 === 1 ? -sign : sign;
        derivative = normalizePolynomial(polynomialDerivative(derivative));
        order += 1;
    }
    return 0;
}

function signVariationsBeside(sequence, point, side) {
    const signs = sequence.map((polynomial) => polynomialSignBeside(polynomial, point, side))
        .filter((sign) => sign !== 0);
    let variations = 0;
    for (let index = 1; index < signs.length; index += 1) {
        if (signs[index] !== signs[index - 1]) variations += 1;
    }
    return variations;
}

function endpointPolicyTopology(endpointPolicy, component) {
    const expected = {
        open: [false, false],
        closed: [true, true],
        leftClosed: [true, false],
        rightClosed: [false, true],
    }[endpointPolicy];
    if (!expected) return;
    if (component.lowClosed !== expected[0] || component.highClosed !== expected[1]) {
        throw new Error("rootEndpointPolicyTopologyMismatch");
    }
}

function rootCountOnSet(sequence, input, endpointPolicy) {
    const set = asSet(input);
    if (set.isEmpty || set.componentCount !== 1) throw new Error("rootCountRequiresConnectedInput");
    const component = set.components[0];
    if (component.low === null || component.high === null) throw new Error("rootCountRequiresBoundedInput");
    const lowIsRoot = polynomialSignAt(sequence[0], component.low) === 0;
    const highIsRoot = polynomialSignAt(sequence[0], component.high) === 0;
    if (endpointPolicy === "endpointsNotRoots") {
        if (lowIsRoot || highIsRoot) throw new Error("rootAtCountEndpoint");
        return signVariations(sequence, component.low) - signVariations(sequence, component.high);
    }
    if (!["open", "closed", "leftClosed", "rightClosed"].includes(endpointPolicy)) {
        throw new Error("unsupportedRootEndpointPolicy");
    }
    endpointPolicyTopology(endpointPolicy, component);
    if (component.low.equals(component.high)) return lowIsRoot ? 1 : 0;
    const interior = signVariationsBeside(sequence, component.low, "right") -
        signVariationsBeside(sequence, component.high, "left");
    return interior + (component.lowClosed && lowIsRoot ? 1 : 0) +
        (component.highClosed && highIsRoot ? 1 : 0);
}

function sturmSequenceFact(value, maxDegree) {
    if (value?.type !== "sturmSequence") throw new Error("expectedSturmSequenceFact");
    const polynomial = normalizePolynomial(value.polynomial);
    const sequence = sturmSequence(polynomial, maxDegree);
    if (!samePolynomialSequence(value.sequence, sequence)) throw new Error("sturmSequenceMismatch");
    return { ...value, polynomial, sequence };
}

function asSet(value) {
    return value instanceof RationalIntervalSet ? value : new RationalIntervalSet(value);
}

function sameSet(left, right) {
    try {
        return asSet(left).equals(asSet(right));
    } catch {
        return false;
    }
}

function exactSetFact(value) {
    if (value?.type !== "exactSet") throw new Error("expectedExactSetFact");
    return asSet(value.set);
}

function sameIdentity(left, right) {
    return typeof left === "string" && left.length > 0 && left === right;
}

function derivativeRangeFact(value) {
    if (value?.type !== "derivativeRange" ||
        typeof value.functionGraph !== "string" ||
        typeof value.derivativeGraph !== "string" ||
        typeof value.variable !== "string") {
        throw new Error("wrongDerivativeRangeFact");
    }
    const input = asSet(value.input);
    const range = asSet(value.range);
    const domainCoverage = value.domainCoverage ?? value.domainWitness?.coverage;
    if (input.isEmpty || input.componentCount !== 1) throw new Error("monotonicityRequiresConnectedInput");
    if (range.isEmpty) throw new Error("emptyDerivativeRange");
    if (domainCoverage !== "allDefined") throw new Error("derivativeDomainNotCovered");
    return { ...value, input, range, domainCoverage };
}

function derivativeIdentityFact(value) {
    if (value?.type !== "derivativeIdentity" ||
        typeof value.functionGraph !== "string" ||
        typeof value.derivativeGraph !== "string" ||
        typeof value.variable !== "string" ||
        !Array.isArray(value.obligations)) {
        throw new Error("wrongDerivativeIdentityFact");
    }
    return value;
}

function monotonicityFact(value) {
    if (value?.type !== "monotonicity" ||
        typeof value.functionGraph !== "string" ||
        !["nondecreasing", "nonincreasing", "constant"].includes(value.direction)) {
        throw new Error("wrongMonotonicityFact");
    }
    return { ...value, input: asSet(value.input) };
}

function rangeEnclosureFact(value) {
    if (value?.type !== "rangeEnclosure" || typeof value.subject !== "string") {
        throw new Error("wrongRangeEnclosureFact");
    }
    return {
        ...value,
        input: asSet(value.input),
        range: asSet(value.range),
        exclusions: value.exclusions || [],
    };
}

function partitionFact(value) {
    if (value?.type !== "partition") throw new Error("expectedPartitionFact");
    return {
        ...value,
        parent: asSet(value.parent),
        pieces: (value.pieces || []).map(asSet),
    };
}

function criticalPointsFact(value) {
    if (value?.type !== "criticalPoints" || value.complete !== true ||
        typeof value.functionGraph !== "string" ||
        typeof value.derivativeGraph !== "string" ||
        typeof value.variable !== "string" ||
        !Array.isArray(value.isolatingComponents)) {
        throw new Error("expectedCriticalPointsFact");
    }
    return {
        ...value,
        searchSet: asSet(value.searchSet),
        isolatingComponents: value.isolatingComponents.map(asSet),
        polynomial: normalizePolynomial(value.polynomial),
    };
}

function monotonicityPartitionFact(value) {
    if (value?.type !== "monotonicityPartition" ||
        typeof value.functionGraph !== "string" ||
        typeof value.derivativeGraph !== "string" ||
        typeof value.variable !== "string" ||
        !Array.isArray(value.pieces) || !Array.isArray(value.directions) ||
        value.pieces.length !== value.directions.length) {
        throw new Error("expectedMonotonicityPartitionFact");
    }
    return {
        ...value,
        parent: asSet(value.parent),
        pieces: value.pieces.map(asSet),
        roots: (value.roots || []).map(exactRational),
    };
}

function rangeCoverFact(value) {
    if (value?.type === "partition") return partitionFact(value);
    return monotonicityPartitionFact(value);
}

function aggregateDomainCoverage(values) {
    const coverages = values.map((value) => value.domainCoverage);
    if (coverages.includes("unresolved")) return "unresolved";
    if (coverages.every((coverage) => coverage === "noDefinedInputs")) {
        return "noDefinedInputs";
    }
    if (coverages.every((coverage) => coverage === "allDefined")) return "allDefined";
    return "partiallyDefined";
}

function countComponents(value) {
    if (value instanceof RationalIntervalSet) return value.components.length;
    if (Array.isArray(value)) return value.reduce((sum, entry) => sum + countComponents(entry), 0);
    if (!value || typeof value !== "object") return 0;
    if (value.type === "exactSet" && value.set) return countComponents(asSet(value.set));
    if (value.type === "rangeEnclosure" && value.range) return countComponents(asSet(value.range));
    if (value.type === "monotonicityPartition") {
        return (value.pieces || []).reduce((sum, piece) => sum + countComponents(asSet(piece)), 0);
    }
    return 0;
}

function arithmeticRecord(rule, parameters = {}) {
    const operands = parameters.operands || [];
    switch (rule) {
        case "arith.negate": return rangeNegate(operands[0]);
        case "arith.absoluteValue": return rangeAbsoluteValue(operands[0]);
        case "arith.add": return rangeAdd(operands[0], operands[1]);
        case "arith.subtract": return rangeSubtract(operands[0], operands[1]);
        case "arith.multiply": return rangeMultiply(operands[0], operands[1]);
        case "arith.reciprocal": return rangeReciprocal(operands[0]);
        case "arith.divide": return rangeDivide(operands[0], operands[1]);
        case "arith.integerPower": return rangeIntegerPower(
            operands[0],
            parameters.exponent,
            { zeroPowerZero: parameters.zeroPowerZero ?? "undefined" },
        );
        default: return null;
    }
}

function sameExclusions(claimed = [], actual = []) {
    if (claimed.length !== actual.length) return false;
    return claimed.every((entry, index) => entry.reason === actual[index].reason &&
        entry.operand === actual[index].operand &&
        sameSet(entry.excludedSet, actual[index].excludedSet));
}

function checkNode(node, premises, options) {
    const conclusion = node.conclusion;
    switch (node.rule) {
        case "given.input":
        case "given.constant": {
            const set = exactSetFact(conclusion);
            return { fact: { ...conclusion, set }, trusted: false };
        }
        case "trusted.range":
        case "trusted.domain":
        case "trusted.derivativeRange": {
            if (options.pureCheckedOnly) throw new Error("trustedLeafRejected");
            if (typeof options.resolveTrusted !== "function" || options.resolveTrusted(node) !== true) {
                throw new Error("unresolvedTrustedLeaf");
            }
            return { fact: conclusion, trusted: true };
        }
        case "set.normalize": {
            const source = asSet(node.parameters?.set);
            const claimed = exactSetFact(conclusion);
            if (!claimed.equals(source)) throw new Error("setClaimMismatch");
            return { fact: { ...conclusion, set: claimed }, trusted: false };
        }
        case "set.union":
        case "set.intersection": {
            if (premises.length < 1) throw new Error("missingPremise");
            const sets = premises.map((premise) => exactSetFact(premise.fact));
            const actual = sets.slice(1).reduce(
                (value, next) => node.rule === "set.union" ? value.union(next) : value.intersection(next),
                sets[0],
            );
            const claimed = exactSetFact(conclusion);
            if (!claimed.equals(actual)) throw new Error("setClaimMismatch");
            return { fact: { ...conclusion, set: claimed }, trusted: false };
        }
        case "set.hull": {
            if (premises.length !== 1) throw new Error("wrongPremiseCount");
            const actual = exactSetFact(premises[0].fact).hull();
            const claimed = exactSetFact(conclusion);
            const actualSet = actual === null ? RationalIntervalSet.empty : new RationalIntervalSet(actual);
            if (!claimed.equals(actualSet)) throw new Error("setClaimMismatch");
            return { fact: { ...conclusion, set: claimed }, trusted: false };
        }
        case "set.include": {
            if (conclusion?.type !== "setInclusion") throw new Error("wrongConclusionType");
            const subset = asSet(conclusion.subset);
            const superset = asSet(conclusion.superset);
            if (!superset.contains(subset)) throw new Error("setInclusionFailed");
            return { fact: { ...conclusion, subset, superset }, trusted: false };
        }
        case "partition.cover": {
            if (conclusion?.type !== "partition") throw new Error("wrongConclusionType");
            const parent = asSet(conclusion.parent);
            const pieces = (conclusion.pieces || []).map(asSet);
            if (pieces.some((piece) => piece.isEmpty || !parent.contains(piece))) {
                throw new Error("invalidPartitionPiece");
            }
            for (let left = 0; left < pieces.length; left += 1) {
                for (let right = left + 1; right < pieces.length; right += 1) {
                    if (!pieces[left].intersection(pieces[right]).isEmpty) {
                        throw new Error("partitionOverlap");
                    }
                }
            }
            const union = pieces.reduce((value, piece) => value.union(piece), RationalIntervalSet.empty);
            if (!union.equals(parent)) throw new Error("incompletePartition");
            return { fact: { ...conclusion, parent, pieces }, trusted: false };
        }
        case "range.assembleUnion":
        case "range.assembleHull": {
            if (premises.length < 2) throw new Error("missingPremise");
            const partition = rangeCoverFact(premises[0].fact);
            const pieces = premises.slice(1).map((premise) => rangeEnclosureFact(premise.fact));
            const claimed = rangeEnclosureFact(conclusion);
            if (pieces.length !== partition.pieces.length) throw new Error("rangePartitionCountMismatch");
            if (!claimed.input.equals(partition.parent) || pieces.some((piece, index) =>
                !sameIdentity(piece.subject, claimed.subject) ||
                !piece.input.equals(partition.pieces[index]))) {
                throw new Error("rangePartitionIdentityMismatch");
            }
            const union = pieces.reduce(
                (value, piece) => value.union(piece.range),
                RationalIntervalSet.empty,
            );
            const hull = union.hull();
            const actual = node.rule === "range.assembleUnion"
                ? union
                : hull === null ? RationalIntervalSet.empty : new RationalIntervalSet(hull);
            const coverage = aggregateDomainCoverage(pieces);
            const exclusions = pieces.flatMap((piece) => piece.exclusions);
            if (!claimed.range.equals(actual) || claimed.domainCoverage !== coverage ||
                !sameExclusions(claimed.exclusions, exclusions)) {
                throw new Error("assembledRangeMismatch");
            }
            return {
                fact: { ...claimed, range: actual, domainCoverage: coverage, exclusions },
                trusted: false,
            };
        }
        case "polynomial.sturmSequence": {
            if (premises.length !== 0) throw new Error("wrongPremiseCount");
            const fact = sturmSequenceFact(conclusion, options.limits.maxPolynomialDegree);
            return { fact, trusted: false };
        }
        case "polynomial.rootCount": {
            if (premises.length !== 1) throw new Error("wrongPremiseCount");
            const sturm = sturmSequenceFact(
                premises[0].fact,
                options.limits.maxPolynomialDegree,
            );
            if (conclusion?.type !== "rootCount" ||
                !samePolynomial(conclusion.polynomial, sturm.polynomial) ||
                !Number.isSafeInteger(conclusion.count) || conclusion.count < 0) {
                throw new Error("wrongRootCountFact");
            }
            const input = asSet(conclusion.input);
            const actual = rootCountOnSet(sturm.sequence, input, conclusion.endpointPolicy);
            if (conclusion.count !== actual) throw new Error("rootCountMismatch");
            return {
                fact: { ...conclusion, polynomial: sturm.polynomial, input, count: actual },
                trusted: false,
            };
        }
        case "polynomial.isolateRoots": {
            if (premises.length !== 1) throw new Error("wrongPremiseCount");
            const sturm = sturmSequenceFact(
                premises[0].fact,
                options.limits.maxPolynomialDegree,
            );
            if (conclusion?.type !== "isolatedRoots" || conclusion.complete !== true ||
                !samePolynomial(conclusion.polynomial, sturm.polynomial) ||
                !Array.isArray(conclusion.isolatingComponents)) {
                throw new Error("wrongIsolatedRootsFact");
            }
            if (conclusion.isolatingComponents.length > options.limits.maxComponents) {
                throw new Error("resourceLimit");
            }
            const searchSet = asSet(conclusion.searchSet);
            const isolatingComponents = conclusion.isolatingComponents.map(asSet);
            if (isolatingComponents.some((component) => component.isEmpty ||
                component.componentCount !== 1 || !searchSet.contains(component))) {
                throw new Error("invalidRootIsolationComponent");
            }
            for (let left = 0; left < isolatingComponents.length; left += 1) {
                for (let right = left + 1; right < isolatingComponents.length; right += 1) {
                    if (!isolatingComponents[left].intersection(isolatingComponents[right]).isEmpty) {
                        throw new Error("overlappingRootIsolation");
                    }
                }
            }
            const endpointPolicy = conclusion.endpointPolicy;
            const isolatedCount = isolatingComponents.reduce((sum, component) => {
                const count = rootCountOnSet(sturm.sequence, component, endpointPolicy);
                if (count !== 1) throw new Error("rootIsolationCountMismatch");
                return sum + count;
            }, 0);
            let totalCount = 0;
            for (const component of searchSet.components) {
                totalCount += rootCountOnSet(
                    sturm.sequence,
                    new RationalIntervalSet(component),
                    endpointPolicy,
                );
            }
            if (isolatedCount !== totalCount) throw new Error("incompleteRootIsolation");
            return {
                fact: {
                    ...conclusion,
                    polynomial: sturm.polynomial,
                    searchSet,
                    isolatingComponents,
                    rootCount: totalCount,
                },
                trusted: false,
            };
        }
        case "polynomial.completeCriticalPoints": {
            if (premises.length !== 2) throw new Error("wrongPremiseCount");
            const identity = derivativeIdentityFact(premises[0].fact);
            const isolated = premises[1].fact;
            if (isolated?.type !== "isolatedRoots" || isolated.complete !== true ||
                !Array.isArray(isolated.isolatingComponents)) {
                throw new Error("expectedIsolatedRootsFact");
            }
            if (identity.obligations.length !== 0) {
                throw new Error("criticalPointDomainObligationsNotDischarged");
            }
            const recognition = recognizeCalculusGraph(
                identity.derivativeExpression,
                identity.variable,
            );
            if (!recognition.recognized || recognition.kind !== "polynomial" ||
                !sameIdentity(recognition.graphIdentity, identity.derivativeGraph) ||
                !samePolynomial(recognition.numerator, isolated.polynomial)) {
                throw new Error("criticalPointPolynomialMismatch");
            }
            if (conclusion?.type !== "criticalPoints" || conclusion.complete !== true ||
                !sameIdentity(conclusion.functionGraph, identity.functionGraph) ||
                !sameIdentity(conclusion.derivativeGraph, identity.derivativeGraph) ||
                typeof conclusion.variable !== "string" ||
                conclusion.variable.toLowerCase() !== identity.variable.toLowerCase() ||
                conclusion.endpointPolicy !== isolated.endpointPolicy ||
                !sameSet(conclusion.searchSet, isolated.searchSet) ||
                !Array.isArray(conclusion.isolatingComponents) ||
                conclusion.isolatingComponents.length !== isolated.isolatingComponents.length ||
                conclusion.isolatingComponents.some((component, index) =>
                    !sameSet(component, isolated.isolatingComponents[index]))) {
                throw new Error("criticalPointIdentityMismatch");
            }
            return {
                fact: {
                    ...conclusion,
                    variable: identity.variable,
                    searchSet: asSet(isolated.searchSet),
                    isolatingComponents: isolated.isolatingComponents.map(asSet),
                    polynomial: recognition.numerator,
                },
                trusted: false,
            };
        }
        case "polynomial.monotonicityPartition": {
            if (premises.length !== 1) throw new Error("wrongPremiseCount");
            const critical = criticalPointsFact(premises[0].fact);
            if (critical.endpointPolicy !== "closed") {
                throw new Error("monotonicityPartitionRequiresClosedRootPolicy");
            }
            if (critical.searchSet.isEmpty || critical.searchSet.componentCount !== 1) {
                throw new Error("monotonicityPartitionRequiresConnectedInput");
            }
            const component = critical.searchSet.components[0];
            if (component.low === null || component.high === null ||
                !component.lowClosed || !component.highClosed) {
                throw new Error("monotonicityPartitionRequiresClosedBoundedInput");
            }
            const roots = critical.isolatingComponents.map((isolation) => {
                if (isolation.componentCount !== 1) throw new Error("criticalPointNotExactRational");
                const isolated = isolation.components[0];
                if (isolated.low === null || isolated.high === null ||
                    !isolated.lowClosed || !isolated.highClosed ||
                    !isolated.low.equals(isolated.high)) {
                    throw new Error("criticalPointNotExactRational");
                }
                return isolated.low;
            }).sort((left, right) => left.lessThan(right) ? -1 : left.greaterThan(right) ? 1 : 0);
            if (roots.some((root, index) => index > 0 && root.equals(roots[index - 1]))) {
                throw new Error("duplicateCriticalPoint");
            }
            const breakpoints = [component.low];
            for (const root of roots) {
                if (component.low.lessThan(root) && root.lessThan(component.high)) breakpoints.push(root);
            }
            if (!component.low.equals(component.high)) breakpoints.push(component.high);
            const pieces = [];
            const directions = [];
            if (breakpoints.length === 1) {
                pieces.push(RationalIntervalSet.point(breakpoints[0]));
                directions.push("constant");
            } else {
                for (let index = 1; index < breakpoints.length; index += 1) {
                    const low = breakpoints[index - 1];
                    const high = breakpoints[index];
                    const piece = new RationalIntervalSet({ low, high });
                    const midpoint = low.add(high).divide(new Rational(2));
                    const sign = polynomialSignAt(critical.polynomial, midpoint);
                    if (sign === 0) throw new Error("incompleteCriticalPointPartition");
                    pieces.push(piece);
                    directions.push(sign > 0 ? "nondecreasing" : "nonincreasing");
                }
            }
            const claimed = monotonicityPartitionFact(conclusion);
            if (!sameIdentity(claimed.functionGraph, critical.functionGraph) ||
                !sameIdentity(claimed.derivativeGraph, critical.derivativeGraph) ||
                claimed.variable.toLowerCase() !== critical.variable.toLowerCase() ||
                !claimed.parent.equals(critical.searchSet) ||
                claimed.endpointPolicy !== critical.endpointPolicy ||
                claimed.pieces.length !== pieces.length ||
                claimed.pieces.some((piece, index) => !piece.equals(pieces[index])) ||
                claimed.directions.some((direction, index) => direction !== directions[index]) ||
                claimed.roots.length !== roots.length ||
                claimed.roots.some((root, index) => !root.equals(roots[index]))) {
                throw new Error("monotonicityPartitionMismatch");
            }
            return {
                fact: { ...claimed, parent: critical.searchSet, pieces, directions, roots },
                trusted: false,
            };
        }
        case "derivative.graph": {
            if (premises.length !== 0) throw new Error("wrongPremiseCount");
            const claimed = derivativeIdentityFact(conclusion);
            const checked = checkCalculusDerivativeTransformation(node.parameters?.transformation);
            if (!checked.accepted) throw new Error(checked.reason);
            if (!sameIdentity(claimed.functionGraph, checked.functionGraph) ||
                !sameIdentity(claimed.derivativeGraph, checked.derivativeGraph) ||
                claimed.variable.toLowerCase() !== checked.variable ||
                claimed.obligations.length !== checked.obligationDescriptors.length ||
                claimed.obligations.some((value, index) =>
                    value !== checked.obligationDescriptors[index])) {
                throw new Error("derivativeIdentityMismatch");
            }
            return {
                fact: {
                    ...claimed,
                    variable: checked.variable,
                    obligations: checked.obligationDescriptors,
                    sourceExpression: checked.source,
                    derivativeExpression: checked.expression,
                },
                trusted: false,
            };
        }
        case "monotone.derivativeSign": {
            if (premises.length !== 1 && premises.length !== 2) throw new Error("wrongPremiseCount");
            const identity = premises.length === 2
                ? derivativeIdentityFact(premises[0].fact)
                : null;
            const derivative = derivativeRangeFact(premises.at(-1).fact);
            const claimed = monotonicityFact(conclusion);
            if (identity && (!sameIdentity(identity.functionGraph, derivative.functionGraph) ||
                !sameIdentity(identity.derivativeGraph, derivative.derivativeGraph) ||
                identity.variable.toLowerCase() !== derivative.variable.toLowerCase())) {
                throw new Error("derivativeRangeIdentityMismatch");
            }
            if (!sameIdentity(claimed.functionGraph, derivative.functionGraph) ||
                !claimed.input.equals(derivative.input)) {
                throw new Error("monotonicityIdentityMismatch");
            }
            const nonnegative = new RationalIntervalSet({
                low: 0, high: null, lowClosed: true, highClosed: false,
            });
            const nonpositive = new RationalIntervalSet({
                low: null, high: 0, lowClosed: false, highClosed: true,
            });
            const zero = RationalIntervalSet.point(0);
            const signValid = claimed.direction === "constant"
                ? derivative.range.equals(zero)
                : claimed.direction === "nondecreasing"
                    ? nonnegative.contains(derivative.range)
                    : nonpositive.contains(derivative.range);
            if (!signValid) throw new Error("derivativeSignMismatch");
            return {
                fact: {
                    ...claimed,
                    derivativeGraph: derivative.derivativeGraph,
                    variable: derivative.variable,
                },
                trusted: false,
            };
        }
        case "monotone.compose": {
            if (premises.length !== 3) throw new Error("wrongPremiseCount");
            const inner = monotonicityFact(premises[0].fact);
            const outer = monotonicityFact(premises[1].fact);
            const innerImage = rangeEnclosureFact(premises[2].fact);
            const claimed = monotonicityFact(conclusion);
            const innerExpression = node.parameters?.innerExpression;
            const outerExpression = node.parameters?.outerExpression;
            const composedExpression = node.parameters?.composedExpression;
            const outerVariable = node.parameters?.outerVariable;
            let actualComposition;
            try {
                actualComposition = substituteCalculusGraphVariable(
                    outerExpression,
                    outerVariable,
                    innerExpression,
                );
            } catch {
                throw new Error("invalidMonotoneCompositionGraph");
            }
            const innerGraph = calculusGraphStructuralKey(innerExpression);
            const outerGraph = calculusGraphStructuralKey(outerExpression);
            const composedGraph = calculusGraphStructuralKey(composedExpression);
            if (calculusGraphStructuralKey(actualComposition) !== composedGraph ||
                !sameIdentity(inner.functionGraph, innerGraph) ||
                !sameIdentity(outer.functionGraph, outerGraph) ||
                !sameIdentity(innerImage.subject, innerGraph) ||
                !sameIdentity(claimed.functionGraph, composedGraph) ||
                !inner.input.equals(innerImage.input) ||
                !claimed.input.equals(inner.input)) {
                throw new Error("monotoneCompositionIdentityMismatch");
            }
            if (innerImage.domainCoverage !== "allDefined" ||
                innerImage.exclusions.length !== 0 || innerImage.range.isEmpty ||
                !outer.input.contains(innerImage.range)) {
                throw new Error("monotoneCompositionDomainMismatch");
            }
            let direction;
            if (inner.direction === "constant" || outer.direction === "constant") {
                direction = "constant";
            } else if (outer.direction === "nondecreasing") {
                direction = inner.direction;
            } else {
                direction = inner.direction === "nondecreasing"
                    ? "nonincreasing"
                    : "nondecreasing";
            }
            if (claimed.direction !== direction) throw new Error("monotoneCompositionDirectionMismatch");
            return {
                fact: {
                    ...claimed,
                    innerFunctionGraph: innerGraph,
                    outerFunctionGraph: outerGraph,
                },
                trusted: false,
            };
        }
        case "monotone.polynomialPiece": {
            if (premises.length !== 1) throw new Error("wrongPremiseCount");
            const partition = monotonicityPartitionFact(premises[0].fact);
            const pieceIndex = node.parameters?.pieceIndex;
            if (!Number.isSafeInteger(pieceIndex) || pieceIndex < 0 ||
                pieceIndex >= partition.pieces.length) {
                throw new Error("invalidMonotonicityPieceIndex");
            }
            const claimed = monotonicityFact(conclusion);
            if (!sameIdentity(claimed.functionGraph, partition.functionGraph) ||
                !claimed.input.equals(partition.pieces[pieceIndex]) ||
                claimed.direction !== partition.directions[pieceIndex]) {
                throw new Error("monotonicityPieceMismatch");
            }
            return {
                fact: {
                    ...claimed,
                    derivativeGraph: partition.derivativeGraph,
                    variable: partition.variable,
                    criticalRoots: partition.roots,
                },
                trusted: false,
            };
        }
        case "range.monotoneEndpoints": {
            if (premises.length !== 3) throw new Error("wrongPremiseCount");
            const monotonicity = monotonicityFact(premises[0].fact);
            const lowEndpoint = rangeEnclosureFact(premises[1].fact);
            const highEndpoint = rangeEnclosureFact(premises[2].fact);
            const claimed = rangeEnclosureFact(conclusion);
            if (monotonicity.input.componentCount !== 1 || monotonicity.input.isEmpty) {
                throw new Error("monotonicityRequiresConnectedInput");
            }
            const component = monotonicity.input.components[0];
            if (component.low === null || component.high === null ||
                !component.lowClosed || !component.highClosed) {
                throw new Error("monotoneEndpointsRequireClosedBoundedInput");
            }
            const lowInput = RationalIntervalSet.point(component.low);
            const highInput = RationalIntervalSet.point(component.high);
            if (!sameIdentity(monotonicity.functionGraph, lowEndpoint.subject) ||
                !sameIdentity(monotonicity.functionGraph, highEndpoint.subject) ||
                !sameIdentity(monotonicity.functionGraph, claimed.subject) ||
                !lowEndpoint.input.equals(lowInput) ||
                !highEndpoint.input.equals(highInput) ||
                !claimed.input.equals(monotonicity.input)) {
                throw new Error("monotoneEndpointIdentityMismatch");
            }
            if (lowEndpoint.domainCoverage !== "allDefined" ||
                highEndpoint.domainCoverage !== "allDefined" ||
                claimed.domainCoverage !== "allDefined") {
                throw new Error("monotoneEndpointDomainMismatch");
            }
            if (lowEndpoint.range.isEmpty || highEndpoint.range.isEmpty) {
                throw new Error("emptyEndpointRange");
            }
            const endpointUnion = lowEndpoint.range.union(highEndpoint.range);
            const hull = endpointUnion.hull();
            const actual = hull === null
                ? RationalIntervalSet.empty
                : new RationalIntervalSet(hull);
            if (!claimed.range.equals(actual) || claimed.exclusions.length !== 0) {
                throw new Error("monotoneEndpointRangeMismatch");
            }
            return { fact: { ...claimed, range: actual }, trusted: false };
        }
        default: {
            const record = arithmeticRecord(node.rule, node.parameters);
            if (!record) throw new Error("unsupportedRule");
            if (conclusion?.type !== "rangeEnclosure") throw new Error("wrongConclusionType");
            if (!sameSet(conclusion.range, record.range) ||
                conclusion.domainCoverage !== record.domain.coverage ||
                !sameExclusions(conclusion.exclusions, record.domain.exclusions)) {
                throw new Error("rangeClaimMismatch");
            }
            return {
                fact: {
                    ...conclusion,
                    range: asSet(conclusion.range),
                    exclusions: record.domain.exclusions,
                },
                trusted: false,
            };
        }
    }
}

/**
 * Check the implemented exact-set, partition, arithmetic, derivative-sign,
 * monotone-endpoint, polynomial Sturm/root-isolation/monotonicity-partition,
 * and authority-bound leaf subset of the range-checker v1 vocabulary.
 * Unsupported v1 rules fail closed until their checker modules land.
 */
export function checkRangeEvidence(document, options = {}) {
    const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };
    const diagnostics = [];
    const reject = (reason, extra = {}) => Object.freeze({
        accepted: false,
        certified: false,
        vocabulary: RANGE_CHECKER_VOCABULARY,
        conclusion: null,
        evidenceLevel: "heuristic",
        trustedDependencies: Object.freeze([]),
        diagnostics: Object.freeze([reason]),
        work: Object.freeze({ nodes: extra.nodes ?? 0, exactOperations: extra.exactOperations ?? 0 }),
    });

    if (document?.schema !== RANGE_EVIDENCE_SCHEMA ||
        document?.vocabulary !== RANGE_CHECKER_VOCABULARY) return reject("unsupportedSchema");
    if (!Array.isArray(document.nodes) || document.nodes.length > limits.maxNodes) {
        return reject("resourceLimit");
    }
    const byId = new Map();
    for (const node of document.nodes) {
        if (!node || typeof node.id !== "string" || byId.has(node.id)) return reject("duplicateOrInvalidNodeId");
        byId.set(node.id, node);
    }
    if (!byId.has(document.root)) return reject("missingRoot");

    const states = new Map();
    const results = new Map();
    const trustedDependencies = [];
    let exactOperations = 0;
    const visit = (id) => {
        if (!byId.has(id)) throw new Error("danglingPremise");
        if (states.get(id) === "visiting") throw new Error("evidenceCycle");
        if (states.get(id) === "done") return results.get(id);
        states.set(id, "visiting");
        const node = byId.get(id);
        if (!Array.isArray(node.premises)) throw new Error("invalidPremises");
        const premises = node.premises.map(visit);
        const result = checkNode(node, premises, { ...options, limits });
        exactOperations += 1;
        if (countComponents(result.fact) > limits.maxComponents) throw new Error("resourceLimit");
        if (result.trusted) trustedDependencies.push(node.id);
        states.set(id, "done");
        results.set(id, result);
        return result;
    };

    try {
        const root = visit(document.root);
        return Object.freeze({
            accepted: true,
            certified: true,
            vocabulary: RANGE_CHECKER_VOCABULARY,
            conclusion: root.fact,
            evidenceLevel: trustedDependencies.length ? "trustedCapability" : "checkedEvidence",
            trustedDependencies: Object.freeze([...trustedDependencies]),
            diagnostics: Object.freeze(diagnostics),
            work: Object.freeze({ nodes: results.size, exactOperations }),
        });
    } catch (error) {
        return reject(error.message, { nodes: results.size, exactOperations });
    }
}
