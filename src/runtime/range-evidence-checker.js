import {
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

export const RANGE_EVIDENCE_SCHEMA = "rix.numerics.range-evidence@1";
export const RANGE_CHECKER_VOCABULARY = "rix.numerics.range-checker@1";

const DEFAULT_LIMITS = Object.freeze({ maxNodes: 10_000, maxComponents: 10_000 });

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

function countComponents(value) {
    if (value instanceof RationalIntervalSet) return value.components.length;
    if (Array.isArray(value)) return value.reduce((sum, entry) => sum + countComponents(entry), 0);
    if (!value || typeof value !== "object") return 0;
    if (value.type === "exactSet" && value.set) return countComponents(asSet(value.set));
    if (value.type === "rangeEnclosure" && value.range) return countComponents(asSet(value.range));
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
 * Check the exact-set, partition, arithmetic, and authority-bound leaf subset
 * of the range-checker v1 vocabulary. Unsupported v1 rules fail closed until
 * their checker modules land.
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
        const result = checkNode(node, premises, options);
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
