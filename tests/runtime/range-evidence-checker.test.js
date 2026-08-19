import { describe, expect, test } from "bun:test";
import { RationalIntervalSet } from "@ratmath/core";
import {
    RANGE_CHECKER_VOCABULARY,
    RANGE_EVIDENCE_SCHEMA,
    checkRangeEvidence,
} from "../../src/runtime/range-evidence-checker.js";
import {
    calculusGraphStructuralKey,
    checkCalculusDerivativeTransformation,
    differentiateCalculusPrimitiveGraph,
    substituteCalculusGraphVariable,
} from "../../src/runtime/calculus-range.js";

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

    test("checks primitive derivative identity before using its range", () => {
        const variable = {
            schema: "rix.calculus.expression@1",
            kind: "variable",
            name: "x",
        };
        const source = {
            schema: "rix.calculus.expression@1",
            kind: "operator",
            operation: "power",
            operands: [
                variable,
                { schema: "rix.calculus.expression@1", kind: "constant", value: 2 },
            ],
        };
        const derived = differentiateCalculusPrimitiveGraph(source, "x");
        const transformation = {
            schema: "rix.calculus.transformation@1",
            operation: "differentiate",
            variable: "x",
            source,
            expression: derived.expression,
            obligations: [],
        };
        const checked = checkCalculusDerivativeTransformation(transformation);
        expect(checked.accepted).toBe(true);
        const input = set({ low: 1, high: 2 });
        const nodes = [
            {
                id: "identity",
                rule: "derivative.graph",
                premises: [],
                parameters: { transformation },
                conclusion: {
                    type: "derivativeIdentity",
                    functionGraph: checked.functionGraph,
                    derivativeGraph: checked.derivativeGraph,
                    variable: "x",
                    obligations: checked.obligationDescriptors,
                },
            },
            {
                id: "derivative-range",
                rule: "trusted.derivativeRange",
                premises: [],
                conclusion: {
                    type: "derivativeRange",
                    functionGraph: checked.functionGraph,
                    derivativeGraph: checked.derivativeGraph,
                    variable: "x",
                    input,
                    range: set({ low: 2, high: 4 }),
                    domainCoverage: "allDefined",
                },
            },
            {
                id: "monotone",
                rule: "monotone.derivativeSign",
                premises: ["identity", "derivative-range"],
                conclusion: {
                    type: "monotonicity",
                    functionGraph: checked.functionGraph,
                    input,
                    direction: "nondecreasing",
                },
            },
        ];
        expect(checkRangeEvidence(document(nodes), { resolveTrusted: () => true }))
            .toMatchObject({ accepted: true, certified: true });

        const changedIdentity = structuredClone(nodes[0]);
        changedIdentity.parameters.transformation.expression = source;
        expect(checkRangeEvidence(document([changedIdentity])))
            .toMatchObject({ accepted: false, diagnostics: ["derivativeGraphMismatch"] });

        const mismatchedRange = [...nodes];
        mismatchedRange[1] = {
            ...nodes[1],
            conclusion: { ...nodes[1].conclusion, derivativeGraph: "graph.wrong@1" },
        };
        expect(checkRangeEvidence(document(mismatchedRange), { resolveTrusted: () => true }))
            .toMatchObject({ accepted: false, diagnostics: ["derivativeRangeIdentityMismatch"] });
    });

    test("checks monotone composition identities, covered images, and direction", () => {
        const constant = (value) => ({
            schema: "rix.calculus.expression@1", kind: "constant", value,
        });
        const variable = (name) => ({
            schema: "rix.calculus.expression@1", kind: "variable", name,
        });
        const operator = (operation, ...operands) => ({
            schema: "rix.calculus.expression@1", kind: "operator", operation, operands,
        });
        const x = variable("x");
        const y = variable("y");
        const innerExpression = operator("add", x, constant(1));
        const outerExpression = operator("power", y, constant(2));
        const composedExpression = substituteCalculusGraphVariable(
            outerExpression, "y", innerExpression,
        );
        const innerGraph = calculusGraphStructuralKey(innerExpression);
        const outerGraph = calculusGraphStructuralKey(outerExpression);
        const composedGraph = calculusGraphStructuralKey(composedExpression);
        const input = set({ low: 1, high: 2 });
        const outerInput = set({ low: 2, high: 4 });
        const innerRange = set({ low: 2, high: 3 });
        const nodes = [
            {
                id: "inner-derivative", rule: "trusted.derivativeRange", premises: [],
                conclusion: {
                    type: "derivativeRange", functionGraph: innerGraph,
                    derivativeGraph: "derivative.inner@1", variable: "x",
                    input, range: RationalIntervalSet.point(1), domainCoverage: "allDefined",
                },
            },
            {
                id: "inner-monotone", rule: "monotone.derivativeSign",
                premises: ["inner-derivative"],
                conclusion: {
                    type: "monotonicity", functionGraph: innerGraph,
                    input, direction: "nondecreasing",
                },
            },
            {
                id: "outer-derivative", rule: "trusted.derivativeRange", premises: [],
                conclusion: {
                    type: "derivativeRange", functionGraph: outerGraph,
                    derivativeGraph: "derivative.outer@1", variable: "y",
                    input: outerInput, range: set({ low: 4, high: 8 }),
                    domainCoverage: "allDefined",
                },
            },
            {
                id: "outer-monotone", rule: "monotone.derivativeSign",
                premises: ["outer-derivative"],
                conclusion: {
                    type: "monotonicity", functionGraph: outerGraph,
                    input: outerInput, direction: "nondecreasing",
                },
            },
            {
                id: "inner-image", rule: "trusted.range", premises: [],
                conclusion: {
                    type: "rangeEnclosure", subject: innerGraph, input,
                    range: innerRange, domainCoverage: "allDefined", exclusions: [],
                },
            },
            {
                id: "composition", rule: "monotone.compose",
                premises: ["inner-monotone", "outer-monotone", "inner-image"],
                parameters: {
                    innerExpression, outerExpression, outerVariable: "y", composedExpression,
                },
                conclusion: {
                    type: "monotonicity", functionGraph: composedGraph,
                    input, direction: "nondecreasing",
                },
            },
        ];
        const options = { resolveTrusted: () => true };
        expect(checkRangeEvidence(document(nodes), options))
            .toMatchObject({ accepted: true, certified: true });

        const wrongDirection = [...nodes];
        wrongDirection[5] = {
            ...nodes[5],
            conclusion: { ...nodes[5].conclusion, direction: "nonincreasing" },
        };
        expect(checkRangeEvidence(document(wrongDirection), options)).toMatchObject({
            accepted: false, diagnostics: ["monotoneCompositionDirectionMismatch"],
        });

        const wrongGraph = [...nodes];
        wrongGraph[5] = {
            ...nodes[5],
            parameters: { ...nodes[5].parameters, composedExpression: outerExpression },
            conclusion: { ...nodes[5].conclusion, functionGraph: outerGraph },
        };
        expect(checkRangeEvidence(document(wrongGraph), options)).toMatchObject({
            accepted: false, diagnostics: ["monotoneCompositionIdentityMismatch"],
        });

        const uncovered = [...nodes];
        uncovered[4] = {
            ...nodes[4],
            conclusion: { ...nodes[4].conclusion, range: set({ low: 2, high: 5 }) },
        };
        expect(checkRangeEvidence(document(uncovered), options)).toMatchObject({
            accepted: false, diagnostics: ["monotoneCompositionDomainMismatch"],
        });
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

    test("binds complete polynomial derivative roots to the checked source graph", () => {
        const constant = (value) => ({
            schema: "rix.calculus.expression@1", kind: "constant", value,
        });
        const variable = {
            schema: "rix.calculus.expression@1", kind: "variable", name: "x",
        };
        const operator = (operation, ...operands) => ({
            schema: "rix.calculus.expression@1", kind: "operator", operation, operands,
        });
        const source = operator(
            "subtract",
            operator("power", variable, constant(3)),
            variable,
        );
        const derived = differentiateCalculusPrimitiveGraph(source, "x");
        const transformation = {
            schema: "rix.calculus.transformation@1",
            operation: "differentiate",
            variable: "x",
            source,
            expression: derived.expression,
            obligations: [],
        };
        const checked = checkCalculusDerivativeTransformation(transformation);
        expect(checked.accepted).toBe(true);
        const polynomial = [-1, 0, 3];
        const searchSet = set({ low: -2, high: 2 });
        const isolatingComponents = [
            set({ low: -1, high: "-1/2" }),
            set({ low: "1/2", high: 1 }),
        ];
        const nodes = [
            {
                id: "identity", rule: "derivative.graph", premises: [],
                parameters: { transformation },
                conclusion: {
                    type: "derivativeIdentity",
                    functionGraph: checked.functionGraph,
                    derivativeGraph: checked.derivativeGraph,
                    variable: "x",
                    obligations: [],
                },
            },
            {
                id: "sturm", rule: "polynomial.sturmSequence", premises: [],
                conclusion: {
                    type: "sturmSequence", polynomial,
                    sequence: [polynomial, [0, 6], [1]],
                },
            },
            {
                id: "roots", rule: "polynomial.isolateRoots", premises: ["sturm"],
                conclusion: {
                    type: "isolatedRoots", polynomial, searchSet, isolatingComponents,
                    endpointPolicy: "endpointsNotRoots", complete: true,
                },
            },
            {
                id: "critical", rule: "polynomial.completeCriticalPoints",
                premises: ["identity", "roots"],
                conclusion: {
                    type: "criticalPoints",
                    functionGraph: checked.functionGraph,
                    derivativeGraph: checked.derivativeGraph,
                    variable: "x",
                    searchSet,
                    isolatingComponents,
                    endpointPolicy: "endpointsNotRoots",
                    complete: true,
                },
            },
        ];
        expect(checkRangeEvidence(document(nodes))).toMatchObject({
            accepted: true,
            certified: true,
            conclusion: { complete: true, polynomial: expect.any(Array) },
        });

        const changed = [...nodes];
        changed[3] = {
            ...nodes[3],
            conclusion: { ...nodes[3].conclusion, derivativeGraph: "graph.other@1" },
        };
        expect(checkRangeEvidence(document(changed))).toMatchObject({
            accepted: false, diagnostics: ["criticalPointIdentityMismatch"],
        });
        const changedVariable = [...nodes];
        changedVariable[3] = {
            ...nodes[3], conclusion: { ...nodes[3].conclusion, variable: "y" },
        };
        expect(checkRangeEvidence(document(changedVariable))).toMatchObject({
            accepted: false, diagnostics: ["criticalPointIdentityMismatch"],
        });
    });

    test("counts endpoint roots with explicit one-sided topology", () => {
        const polynomial = [0, 1];
        const sturm = {
            id: "sturm", rule: "polynomial.sturmSequence", premises: [],
            conclusion: {
                type: "sturmSequence", polynomial,
                sequence: [polynomial, [1]],
            },
        };
        const count = (input, endpointPolicy, expected) => ({
            id: "count", rule: "polynomial.rootCount", premises: ["sturm"],
            conclusion: {
                type: "rootCount", polynomial, input, endpointPolicy, count: expected,
            },
        });
        const cases = [
            [set({ low: 0, high: 1 }), "closed", 1],
            [set({ low: 0, high: 1, highClosed: false }), "leftClosed", 1],
            [set({ low: 0, high: 1, lowClosed: false }), "rightClosed", 0],
            [set({ low: -1, high: 1, lowClosed: false, highClosed: false }), "open", 1],
            [RationalIntervalSet.point(0), "closed", 1],
        ];
        for (const [input, endpointPolicy, expected] of cases) {
            expect(checkRangeEvidence(document([sturm, count(input, endpointPolicy, expected)])))
                .toMatchObject({ accepted: true, conclusion: { count: expected } });
        }

        expect(checkRangeEvidence(document([
            sturm, count(set({ low: 0, high: 1 }), "endpointsNotRoots", 1),
        ]))).toMatchObject({ accepted: false, diagnostics: ["rootAtCountEndpoint"] });
        expect(checkRangeEvidence(document([
            sturm, count(set({ low: 0, high: 1, highClosed: false }), "closed", 1),
        ]))).toMatchObject({
            accepted: false, diagnostics: ["rootEndpointPolicyTopologyMismatch"],
        });

        const repeatedPolynomial = [1, -2, 1];
        const repeatedSturm = {
            id: "repeated-sturm", rule: "polynomial.sturmSequence", premises: [],
            conclusion: {
                type: "sturmSequence", polynomial: repeatedPolynomial,
                sequence: [repeatedPolynomial, [-2, 2]],
            },
        };
        const repeatedCount = (input, endpointPolicy, expected) => ({
            id: "repeated-count", rule: "polynomial.rootCount",
            premises: ["repeated-sturm"],
            conclusion: {
                type: "rootCount", polynomial: repeatedPolynomial,
                input, endpointPolicy, count: expected,
            },
        });
        expect(checkRangeEvidence(document([
            repeatedSturm, repeatedCount(set({ low: 1, high: 2 }), "closed", 1),
        ]))).toMatchObject({ accepted: true, conclusion: { count: 1 } });
        expect(checkRangeEvidence(document([
            repeatedSturm,
            repeatedCount(set({ low: 1, high: 2, lowClosed: false }), "rightClosed", 0),
        ]))).toMatchObject({ accepted: true, conclusion: { count: 0 } });
    });

    test("forms and consumes a checked polynomial monotonicity partition", () => {
        const constant = (value) => ({
            schema: "rix.calculus.expression@1", kind: "constant", value,
        });
        const variable = {
            schema: "rix.calculus.expression@1", kind: "variable", name: "x",
        };
        const operator = (operation, ...operands) => ({
            schema: "rix.calculus.expression@1", kind: "operator", operation, operands,
        });
        const source = operator(
            "subtract",
            operator("power", variable, constant(3)),
            operator("multiply", constant(3), variable),
        );
        const derived = differentiateCalculusPrimitiveGraph(source, "x");
        const transformation = {
            schema: "rix.calculus.transformation@1",
            operation: "differentiate",
            variable: "x",
            source,
            expression: derived.expression,
            obligations: [],
        };
        const checked = checkCalculusDerivativeTransformation(transformation);
        const polynomial = [-3, 0, 3];
        const parent = set({ low: -2, high: 2 });
        const roots = [new RationalIntervalSet({ low: -1, high: -1 }),
            new RationalIntervalSet({ low: 1, high: 1 })];
        const pieces = [
            set({ low: -2, high: -1 }),
            set({ low: -1, high: 1 }),
            set({ low: 1, high: 2 }),
        ];
        const directions = ["nondecreasing", "nonincreasing", "nondecreasing"];
        const nodes = [
            {
                id: "identity", rule: "derivative.graph", premises: [],
                parameters: { transformation },
                conclusion: {
                    type: "derivativeIdentity", functionGraph: checked.functionGraph,
                    derivativeGraph: checked.derivativeGraph, variable: "x", obligations: [],
                },
            },
            {
                id: "sturm", rule: "polynomial.sturmSequence", premises: [],
                conclusion: {
                    type: "sturmSequence", polynomial,
                    sequence: [polynomial, [0, 6], [3]],
                },
            },
            {
                id: "roots", rule: "polynomial.isolateRoots", premises: ["sturm"],
                conclusion: {
                    type: "isolatedRoots", polynomial, searchSet: parent,
                    isolatingComponents: roots, endpointPolicy: "closed", complete: true,
                },
            },
            {
                id: "critical", rule: "polynomial.completeCriticalPoints",
                premises: ["identity", "roots"],
                conclusion: {
                    type: "criticalPoints", functionGraph: checked.functionGraph,
                    derivativeGraph: checked.derivativeGraph, variable: "x", searchSet: parent,
                    isolatingComponents: roots, endpointPolicy: "closed", complete: true,
                },
            },
            {
                id: "partition", rule: "polynomial.monotonicityPartition",
                premises: ["critical"],
                conclusion: {
                    type: "monotonicityPartition", functionGraph: checked.functionGraph,
                    derivativeGraph: checked.derivativeGraph, variable: "x", parent,
                    pieces, directions, roots: [-1, 1], endpointPolicy: "closed",
                },
            },
            ...pieces.map((input, pieceIndex) => ({
                id: `monotone-${pieceIndex}`,
                rule: "monotone.polynomialPiece",
                premises: ["partition"],
                parameters: { pieceIndex },
                conclusion: {
                    type: "monotonicity", functionGraph: checked.functionGraph,
                    input, direction: directions[pieceIndex],
                },
            })),
        ];
        expect(checkRangeEvidence(document(nodes))).toMatchObject({
            accepted: true,
            certified: true,
            conclusion: { direction: "nondecreasing", criticalRoots: expect.any(Array) },
        });

        const wrongDirection = [...nodes];
        wrongDirection.at(-1).conclusion = {
            ...wrongDirection.at(-1).conclusion, direction: "nonincreasing",
        };
        expect(checkRangeEvidence(document(wrongDirection))).toMatchObject({
            accepted: false, diagnostics: ["monotonicityPieceMismatch"],
        });

        const nonExactIsolations = [set({ low: -1, high: "-1/2" }), roots[1]];
        const nonExactRoots = [...nodes.slice(0, 2), {
            ...nodes[2], conclusion: {
                ...nodes[2].conclusion, isolatingComponents: nonExactIsolations,
            },
        }, {
            ...nodes[3], conclusion: {
                ...nodes[3].conclusion, isolatingComponents: nonExactIsolations,
            },
        }, nodes[4]];
        expect(checkRangeEvidence(document(nonExactRoots))).toMatchObject({
            accepted: false,
            diagnostics: ["criticalPointNotExactRational"],
        });
    });
});
