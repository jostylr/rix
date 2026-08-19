import { describe, expect, test } from "bun:test";
import { RationalIntervalSet } from "@ratmath/core";
import {
    RANGE_CHECKER_VOCABULARY,
    RANGE_EVIDENCE_SCHEMA,
    checkRangeEvidence,
} from "../../src/runtime/range-evidence-checker.js";

const set = (components) => new RationalIntervalSet(components);
const fact = (value) => ({ type: "exactSet", set: value });
const document = (nodes, root = nodes.at(-1)?.id) => ({
    schema: RANGE_EVIDENCE_SCHEMA,
    vocabulary: RANGE_CHECKER_VOCABULARY,
    codomain: "real",
    root,
    nodes,
});

describe("range evidence checker v1 exact kernel", () => {
    test("checks exact unions and rejects a changed conclusion", () => {
        const left = set({ low: 0, high: 1 });
        const right = set({ low: 2, high: 3 });
        const nodes = [
            { id: "left", rule: "given.input", premises: [], conclusion: fact(left) },
            { id: "right", rule: "given.constant", premises: [], conclusion: fact(right) },
            {
                id: "union", rule: "set.union", premises: ["left", "right"],
                conclusion: fact(left.union(right)),
            },
        ];
        expect(checkRangeEvidence(document(nodes))).toMatchObject({
            accepted: true,
            evidenceLevel: "checkedEvidence",
            trustedDependencies: [],
        });

        nodes[2] = { ...nodes[2], conclusion: fact(set({ low: 0, high: 3 })) };
        expect(checkRangeEvidence(document(nodes))).toMatchObject({
            accepted: false,
            diagnostics: ["setClaimMismatch"],
        });
    });

    test("checks exact partitions including endpoint topology", () => {
        const good = document([{
            id: "partition",
            rule: "partition.cover",
            premises: [],
            conclusion: {
                type: "partition",
                parent: set({ low: 0, high: 2 }),
                pieces: [
                    set({ low: 0, high: 1, lowClosed: true, highClosed: false }),
                    set({ low: 1, high: 2, lowClosed: true, highClosed: true }),
                ],
            },
        }]);
        expect(checkRangeEvidence(good).accepted).toBe(true);

        const overlap = document([{
            ...good.nodes[0],
            conclusion: {
                ...good.nodes[0].conclusion,
                pieces: [set({ low: 0, high: 1 }), set({ low: 1, high: 2 })],
            },
        }]);
        expect(checkRangeEvidence(overlap)).toMatchObject({
            accepted: false,
            diagnostics: ["partitionOverlap"],
        });
    });

    test("assembles partition ranges as an exact union or explicit hull", () => {
        const parent = set({ low: 0, high: 2 });
        const pieces = [
            set({ low: 0, high: 1, highClosed: false }),
            set({ low: 1, high: 2 }),
        ];
        const partition = {
            id: "partition",
            rule: "partition.cover",
            premises: [],
            conclusion: { type: "partition", parent, pieces },
        };
        const leaves = [
            {
                id: "left-range", rule: "trusted.range", premises: [],
                conclusion: {
                    type: "rangeEnclosure", subject: "graph.piecewise@1",
                    input: pieces[0], range: set({ low: 0, high: 1 }),
                    domainCoverage: "allDefined", exclusions: [],
                },
            },
            {
                id: "right-range", rule: "trusted.range", premises: [],
                conclusion: {
                    type: "rangeEnclosure", subject: "graph.piecewise@1",
                    input: pieces[1], range: set({ low: 3, high: 4 }),
                    domainCoverage: "allDefined", exclusions: [],
                },
            },
        ];
        const unionRange = set([{ low: 0, high: 1 }, { low: 3, high: 4 }]);
        const assemble = (rule, range) => ({
            id: "assembled",
            rule,
            premises: ["partition", "left-range", "right-range"],
            conclusion: {
                type: "rangeEnclosure", subject: "graph.piecewise@1",
                input: parent, range, domainCoverage: "allDefined", exclusions: [],
            },
        });
        const options = { resolveTrusted: () => true };
        expect(checkRangeEvidence(document([
            partition, ...leaves, assemble("range.assembleUnion", unionRange),
        ]), options)).toMatchObject({ accepted: true, conclusion: { domainCoverage: "allDefined" } });
        expect(checkRangeEvidence(document([
            partition, ...leaves, assemble("range.assembleHull", set({ low: 0, high: 4 })),
        ]), options)).toMatchObject({ accepted: true });
        expect(checkRangeEvidence(document([
            partition, ...leaves, assemble("range.assembleUnion", set({ low: 0, high: 4 })),
        ]), options)).toMatchObject({ accepted: false, diagnostics: ["assembledRangeMismatch"] });
    });

    test("recomputes arithmetic range and domain claims", () => {
        const input = set({ low: -1, high: 1 });
        const reciprocal = {
            id: "reciprocal",
            rule: "arith.reciprocal",
            premises: [],
            parameters: { operands: [input] },
            conclusion: {
                type: "rangeEnclosure",
                subject: "rix.core.range.reciprocal@1",
                input: [input],
                range: set([
                    { low: null, high: -1, lowClosed: false, highClosed: true },
                    { low: 1, high: null, lowClosed: true, highClosed: false },
                ]),
                domainCoverage: "partiallyDefined",
                exclusions: [{
                    reason: "divisionByZero",
                    operand: 1,
                    excludedSet: RationalIntervalSet.point(0),
                }],
            },
        };
        expect(checkRangeEvidence(document([reciprocal]))).toMatchObject({
            accepted: true,
            conclusion: { domainCoverage: "partiallyDefined" },
        });

        reciprocal.conclusion = { ...reciprocal.conclusion, domainCoverage: "allDefined" };
        expect(checkRangeEvidence(document([reciprocal]))).toMatchObject({
            accepted: false,
            diagnostics: ["rangeClaimMismatch"],
        });
    });

    test("fails closed for cycles, unknown rules, resource limits, and trust", () => {
        expect(checkRangeEvidence(document([{
            id: "cycle", rule: "set.union", premises: ["cycle"], conclusion: fact(set([])),
        }]))).toMatchObject({ accepted: false, diagnostics: ["evidenceCycle"] });

        expect(checkRangeEvidence(document([{
            id: "future", rule: "magic.sampled", premises: [], conclusion: fact(set([])),
        }]))).toMatchObject({ accepted: false, diagnostics: ["unsupportedRule"] });

        const trusted = document([{
            id: "trusted", rule: "trusted.range", premises: [],
            conclusion: { type: "rangeEnclosure", range: set({ low: 0, high: 1 }) },
        }]);
        expect(checkRangeEvidence(trusted, { resolveTrusted: () => true })).toMatchObject({
            accepted: true,
            evidenceLevel: "trustedCapability",
            trustedDependencies: ["trusted"],
        });
        expect(checkRangeEvidence(trusted, {
            pureCheckedOnly: true,
            resolveTrusted: () => true,
        })).toMatchObject({ accepted: false, diagnostics: ["trustedLeafRejected"] });

        expect(checkRangeEvidence(trusted, { limits: { maxNodes: 0 } }))
            .toMatchObject({ accepted: false, diagnostics: ["resourceLimit"] });
    });

    test("rejects malformed, incomplete, mismatched, and stale evidence", () => {
        const malformed = document([{
            id: "bad-premises", rule: "given.input", premises: "none",
            conclusion: fact(set({ low: 0, high: 1 })),
        }]);
        expect(checkRangeEvidence(malformed)).toMatchObject({
            accepted: false,
            diagnostics: ["invalidPremises"],
        });

        const incomplete = document([{
            id: "partition", rule: "partition.cover", premises: [],
            conclusion: {
                type: "partition",
                parent: set({ low: 0, high: 2 }),
                pieces: [set({ low: 0, high: 1 })],
            },
        }]);
        expect(checkRangeEvidence(incomplete)).toMatchObject({
            accepted: false,
            diagnostics: ["incompletePartition"],
        });

        const capabilityLeaf = (identity, revision) => document([{
            id: "provider", rule: "trusted.range", premises: [],
            provider: { identity, revision },
            conclusion: { type: "rangeEnclosure", range: set({ low: 0, high: 1 }) },
        }]);
        const current = { identity: "example.temperature@1", revision: "sha256:current" };
        const resolver = (node) => node.provider?.identity === current.identity &&
            node.provider?.revision === current.revision;

        expect(checkRangeEvidence(
            capabilityLeaf("example.other@1", current.revision),
            { resolveTrusted: resolver },
        )).toMatchObject({ accepted: false, diagnostics: ["unresolvedTrustedLeaf"] });
        expect(checkRangeEvidence(
            capabilityLeaf(current.identity, "sha256:stale"),
            { resolveTrusted: resolver },
        )).toMatchObject({ accepted: false, diagnostics: ["unresolvedTrustedLeaf"] });
    });

    test("checks derivative sign and monotone endpoint enclosure", () => {
        const input = set({ low: 1, high: 2 });
        const nodes = [
            {
                id: "derivative-range",
                rule: "trusted.derivativeRange",
                premises: [],
                provider: { identity: "example.square-derivative@1", revision: "current" },
                conclusion: {
                    type: "derivativeRange",
                    functionGraph: "graph.square@1",
                    derivativeGraph: "graph.two-x@1",
                    variable: "x",
                    input,
                    range: set({ low: 2, high: 4 }),
                    domainCoverage: "allDefined",
                },
            },
            {
                id: "monotone",
                rule: "monotone.derivativeSign",
                premises: ["derivative-range"],
                conclusion: {
                    type: "monotonicity",
                    functionGraph: "graph.square@1",
                    input,
                    direction: "nondecreasing",
                },
            },
            {
                id: "low",
                rule: "trusted.range",
                premises: [],
                conclusion: {
                    type: "rangeEnclosure",
                    subject: "graph.square@1",
                    input: RationalIntervalSet.point(1),
                    range: RationalIntervalSet.point(1),
                    domainCoverage: "allDefined",
                    exclusions: [],
                },
            },
            {
                id: "high",
                rule: "trusted.range",
                premises: [],
                conclusion: {
                    type: "rangeEnclosure",
                    subject: "graph.square@1",
                    input: RationalIntervalSet.point(2),
                    range: RationalIntervalSet.point(4),
                    domainCoverage: "allDefined",
                    exclusions: [],
                },
            },
            {
                id: "range",
                rule: "range.monotoneEndpoints",
                premises: ["monotone", "low", "high"],
                conclusion: {
                    type: "rangeEnclosure",
                    subject: "graph.square@1",
                    input,
                    range: set({ low: 1, high: 4 }),
                    domainCoverage: "allDefined",
                    exclusions: [],
                },
            },
        ];
        const accepted = checkRangeEvidence(document(nodes), { resolveTrusted: () => true });
        expect(accepted).toMatchObject({
            accepted: true,
            certified: true,
            evidenceLevel: "trustedCapability",
            conclusion: { subject: "graph.square@1", domainCoverage: "allDefined" },
        });
        expect(accepted.conclusion.range.toString()).toBe("[1,4]");

        const wrongSign = structuredClone(nodes.slice(0, 2));
        wrongSign[1].conclusion.direction = "nonincreasing";
        // structuredClone loses class prototypes, so restore exact set fields.
        wrongSign[0].conclusion.input = input;
        wrongSign[0].conclusion.range = set({ low: 2, high: 4 });
        wrongSign[1].conclusion.input = input;
        expect(checkRangeEvidence(document(wrongSign), { resolveTrusted: () => true }))
            .toMatchObject({ accepted: false, diagnostics: ["derivativeSignMismatch"] });

        const mismatched = [...nodes];
        mismatched[3] = {
            ...nodes[3],
            conclusion: { ...nodes[3].conclusion, subject: "graph.other@1" },
        };
        expect(checkRangeEvidence(document(mismatched), { resolveTrusted: () => true }))
            .toMatchObject({ accepted: false, diagnostics: ["monotoneEndpointIdentityMismatch"] });

        const domainWitnessForm = [...nodes];
        domainWitnessForm[0] = {
            ...nodes[0],
            conclusion: {
                ...nodes[0].conclusion,
                domainCoverage: undefined,
                domainWitness: { coverage: "allDefined" },
            },
        };
        expect(checkRangeEvidence(document(domainWitnessForm), { resolveTrusted: () => true }))
            .toMatchObject({ accepted: true, certified: true });

        const openInput = set({ low: 1, high: 2, lowClosed: false });
        const openNodes = nodes.map((node) => ({
            ...node,
            conclusion: node.conclusion.input?.equals?.(input)
                ? { ...node.conclusion, input: openInput }
                : node.conclusion,
        }));
        expect(checkRangeEvidence(document(openNodes), { resolveTrusted: () => true }))
            .toMatchObject({ accepted: false, diagnostics: ["monotoneEndpointsRequireClosedBoundedInput"] });

        const disconnectedInput = new RationalIntervalSet([
            { low: 1, high: "3/2" },
            { low: "7/4", high: 2 },
        ]);
        const disconnected = structuredClone(nodes.slice(0, 2));
        disconnected[0].conclusion.input = disconnectedInput;
        disconnected[0].conclusion.range = set({ low: 2, high: 4 });
        disconnected[1].conclusion.input = disconnectedInput;
        expect(checkRangeEvidence(document(disconnected), { resolveTrusted: () => true }))
            .toMatchObject({ accepted: false, diagnostics: ["monotonicityRequiresConnectedInput"] });
    });

    test("recomputes Sturm sequences, root counts, and complete isolations", () => {
        const polynomial = [0, -1, 0, 1]; // x^3 - x
        const sequence = [
            polynomial,
            [-1, 0, 3],
            [0, "2/3"],
            [1],
        ];
        const sturm = {
            id: "sturm",
            rule: "polynomial.sturmSequence",
            premises: [],
            conclusion: { type: "sturmSequence", polynomial, sequence },
        };
        const count = {
            id: "count",
            rule: "polynomial.rootCount",
            premises: ["sturm"],
            conclusion: {
                type: "rootCount",
                polynomial,
                input: set({ low: -2, high: 2 }),
                endpointPolicy: "endpointsNotRoots",
                count: 3,
            },
        };
        expect(checkRangeEvidence(document([sturm, count]))).toMatchObject({
            accepted: true,
            evidenceLevel: "checkedEvidence",
            conclusion: { count: 3 },
        });

        const isolation = {
            id: "isolated",
            rule: "polynomial.isolateRoots",
            premises: ["sturm"],
            conclusion: {
                type: "isolatedRoots",
                polynomial,
                searchSet: set({ low: -2, high: 2 }),
                isolatingComponents: [
                    set({ low: "-3/2", high: "-3/4" }),
                    set({ low: "-1/4", high: "1/4" }),
                    set({ low: "3/4", high: "3/2" }),
                ],
                endpointPolicy: "endpointsNotRoots",
                complete: true,
            },
        };
        expect(checkRangeEvidence(document([sturm, isolation]))).toMatchObject({
            accepted: true,
            conclusion: { rootCount: 3, complete: true },
        });

        const badSequence = {
            ...sturm,
            conclusion: { ...sturm.conclusion, sequence: [...sequence.slice(0, -1), [2]] },
        };
        expect(checkRangeEvidence(document([badSequence])))
            .toMatchObject({ accepted: false, diagnostics: ["sturmSequenceMismatch"] });

        const incomplete = {
            ...isolation,
            conclusion: {
                ...isolation.conclusion,
                isolatingComponents: isolation.conclusion.isolatingComponents.slice(0, 2),
            },
        };
        expect(checkRangeEvidence(document([sturm, incomplete])))
            .toMatchObject({ accepted: false, diagnostics: ["incompleteRootIsolation"] });

        const endpointRoot = {
            ...count,
            conclusion: { ...count.conclusion, input: set({ low: -1, high: 2 }) },
        };
        expect(checkRangeEvidence(document([sturm, endpointRoot])))
            .toMatchObject({ accepted: false, diagnostics: ["rootAtCountEndpoint"] });

        const repeatedSturm = {
            id: "repeated-sturm",
            rule: "polynomial.sturmSequence",
            premises: [],
            conclusion: {
                type: "sturmSequence",
                polynomial: [1, -2, 1],
                sequence: [[1, -2, 1], [-2, 2]],
            },
        };
        const repeatedCount = {
            id: "repeated-count",
            rule: "polynomial.rootCount",
            premises: ["repeated-sturm"],
            conclusion: {
                type: "rootCount",
                polynomial: [1, -2, 1],
                input: set({ low: 0, high: 2 }),
                endpointPolicy: "endpointsNotRoots",
                count: 1,
            },
        };
        expect(checkRangeEvidence(document([repeatedSturm, repeatedCount])))
            .toMatchObject({ accepted: true, conclusion: { count: 1 } });
        expect(checkRangeEvidence(document([sturm]), { limits: { maxPolynomialDegree: 2 } }))
            .toMatchObject({ accepted: false, diagnostics: ["polynomialDegreeLimit"] });
    });
});
