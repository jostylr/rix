import { describe, expect, test } from "bun:test";
import { Integer, RationalIntervalSet } from "@ratmath/core";
import { tokenize } from "../../src/parser/tokenizer.js";
import { parse } from "../../src/parser/parser.js";
import { lower } from "../../src/eval/lower.js";
import {
    createDefaultRegistry,
    createDefaultSystemContext,
    evaluate,
} from "../../src/eval/evaluator.js";
import { Context } from "../../src/runtime/context.js";

const systemContext = createDefaultSystemContext();

function evalRiX(code, context = new Context()) {
    const registry = createDefaultRegistry();
    const ir = lower(parse(tokenize(code), () => ({ type: "identifier" })));
    let result = null;
    for (const node of ir) result = evaluate(node, context, registry, systemContext);
    return result;
}

function entry(value, key) {
    return value?.entries?.get(key);
}

function textValue(value) {
    return value?.type === "string" ? value.value : null;
}

describe("exact RangeSet arithmetic", () => {
    test("operators compute exact Cartesian images and attach checked evidence", () => {
        const result = evalRiX(`
            a := (0:1) ~: :RangeSet;
            b := (2:3) ~: :RangeSet;
            {: a + b, a - b, a * b, a / b, -a, a ^ 2, 2 + a, b * 2 }
        `);
        expect(result.values.map((value) => value.toString())).toEqual([
            "[2,4]", "[-3,-1]", "[0,3]", "[0,1/2]",
            "[-1,0]", "[0,1]", "[2,3]", "[4,6]",
        ]);
        for (const value of result.values) {
            expect(value).toBeInstanceOf(RationalIntervalSet);
            const evidence = value._ext.get("rangeEvidence");
            expect(textValue(entry(evidence, "schema")))
                .toBe("rix.numerics.range-operation-result@1");
            expect(entry(evidence, "certified")).toBeInstanceOf(Integer);
            expect(textValue(entry(evidence, "evidenceLevel"))).toBe("checkedEvidence");
            expect(textValue(entry(entry(evidence, "domain"), "coverage")))
                .toBe("allDefined");
        }
    });

    test("named primitives and methods share the same metadata contract", () => {
        const result = evalRiX(`
            x := ((-1):1) ~: :RangeSet;
            a := .RangeReciprocal(x);
            b := x.Reciprocal();
            c := .RangeEvidence(b);
            d := b.RangeEvidence();
            {: a, b, c, d }
        `);
        expect(result.values[0].toString()).toBe("(-inf,-1] U [1,inf)");
        expect(result.values[1].toString()).toBe("(-inf,-1] U [1,inf)");
        for (const evidence of result.values.slice(2)) {
            expect(textValue(entry(evidence, "operation")))
                .toBe("rix.core.range.reciprocal@1");
            expect(textValue(entry(entry(evidence, "domain"), "coverage")))
                .toBe("partiallyDefined");
            expect(entry(evidence, "diagnostics").values.map(textValue))
                .toEqual(["divisionByZero", "partiallyDefined"]);
        }
    });

    test("default 0^0 is excluded while a scope can adopt the combinatorial value", () => {
        const result = evalRiX(`
            z := (0:2) ~: :RangeSet;
            defaultResult := z ^ 0;
            conventional := .RangePolicy({= zeroPowerZero=:one }, z ^ 0);
            {: defaultResult, .RangeEvidence(defaultResult), conventional,
               .RangeEvidence(conventional) }
        `);
        expect(result.values[0].toString()).toBe("[1,1]");
        expect(textValue(entry(entry(result.values[1], "domain"), "coverage")))
            .toBe("partiallyDefined");
        expect(entry(result.values[1], "diagnostics").values.map(textValue))
            .toContain("zeroPowerZero");
        expect(result.values[2].toString()).toBe("[1,1]");
        expect(textValue(entry(entry(result.values[3], "domain"), "coverage")))
            .toBe("allDefined");
        expect(entry(result.values[3], "diagnostics").values).toHaveLength(0);
    });

    test("a wholly undefined image is a certified empty set in report mode", () => {
        const result = evalRiX(`
            zero := (0:0) ~: :RangeSet;
            answer := zero.Reciprocal();
            {: answer, .RangeEvidence(answer) }
        `);
        expect(result.values[0].isEmpty).toBe(true);
        const evidence = result.values[1];
        expect(textValue(entry(entry(evidence, "domain"), "coverage")))
            .toBe("noDefinedInputs");
        expect(entry(evidence, "certified")).toBeInstanceOf(Integer);
    });

    test("strict and category policies throw, and nested scopes inherit settings", () => {
        expect(() => evalRiX(`
            x := ((-1):1) ~: :RangeSet;
            .RangePolicy({= strict=1 }, x.Reciprocal())
        `)).toThrow(/divisionByZero/);

        expect(() => evalRiX(`
            x := ((-1):1) ~: :RangeSet;
            .RangePolicy({= divisionByZero=:throw },
                .RangePolicy({= zeroPowerZero=:one }, x.Reciprocal()))
        `)).toThrow(/divisionByZero/);

        const relaxed = evalRiX(`
            x := ((-1):1) ~: :RangeSet;
            .RangePolicy({= divisionByZero=:report }, x.Reciprocal())
        `);
        expect(relaxed.toString()).toBe("(-inf,-1] U [1,inf)");
    });
});
