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
});
