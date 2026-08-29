import { describe, expect, test } from "bun:test";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    parseAndEvaluate,
} from "../../src/index.js";
import { Rational } from "@ratmath/core";

function runtime() {
    return {
        context: new Context(),
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    };
}

function entry(value, name) {
    return value.entries.get(name);
}

function text(value) {
    return value?.value ?? value;
}

describe("general scalar interval Newton", () => {
    test("conditionally proves a unique root using a first-derivative interval without a second derivative", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            .numerics.IntervalNewton(
                (x)->x^2-2,
                (x)->2*x,
                1:2,
                {= absoluteWidth=1/100000, maxWork=30, trace=1 }
            )
        `, runtime());

        expect(text(entry(result, "status"))).toBe("enclosed");
        expect(text(entry(result, "classification"))).toBe("unique");
        expect(text(entry(result, "rootexistence"))).toBe("unique");
        expect(text(entry(result, "evidencelevel"))).toBe("assumed");
        expect(entry(result, "certified")).toBeNull();
        const interval = entry(result, "interval");
        expect(interval.low.multiply(interval.low).lessThanOrEqual(new Rational(2n))).toBe(true);
        expect(interval.high.multiply(interval.high).greaterThanOrEqual(new Rational(2n))).toBe(true);
        expect(entry(result, "achievedwidth").lessThanOrEqual(new Rational(1n, 100000n))).toBe(true);
        expect(entry(result, "trace").values.length).toBeGreaterThan(1);
    });

    test("excludes a box when the Newton image is disjoint", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            .numerics.IntervalNewton((x)->x^2+1,(x)->2*x,1:2,{= maxWork=5 })
        `, runtime());

        expect(text(entry(result, "status"))).toBe("excluded");
        expect(text(entry(result, "classification"))).toBe("excluded");
        expect(text(entry(result, "rootexistence"))).toBe("none");
        expect(entry(result, "interval")).toBeNull();
        expect(entry(entry(result, "work"), "calls").value).toBe(2n);
    });

    test("returns an unresolved derivative-zero result instead of dividing through zero", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            .numerics.IntervalNewton((x)->x^2,(x)->2*x,(-1):1,{= maxWork=5 })
        `, runtime());

        expect(text(entry(result, "status"))).toBe("unknown");
        expect(text(entry(result, "classification"))).toBe("derivativeContainsZero");
        expect(text(entry(result, "rootexistence"))).toBe("unproved");
        expect(entry(result, "diagnostics").values.map(text)).toContain("derivativeContainsZero");
    });

    test("uses a Kantorovich-certified starting ball as a complementary contraction input", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            root := .numerics.Kantorovich(
                (x)->x^2-2,
                (x)->2*x,
                {=
                    interval=1:2,initial=3/2,derivativeLower=2,
                    secondDerivativeUpper=2,secondDerivative=(x)->2
                }
            );
            contracted := .numerics.IntervalNewton(
                (x)->x^2-2,(x)->2*x,root[:initialEnclosure],
                {= absoluteWidth=1/10000,maxWork=20 }
            );
            [root[:initialEnclosure],contracted]
        `, runtime());

        const initial = result.values[0];
        const contracted = result.values[1];
        expect(text(entry(contracted, "classification"))).toBe("unique");
        expect(initial.contains(entry(contracted, "interval"))).toBe(true);
    });

    test("reports bounded work separately from a proved uniqueness classification", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            .numerics.IntervalNewton(
                (x)->x^2-2,(x)->2*x,1:2,
                {= absoluteWidth=1/1000000000000,maxCalls=2,maxIterations=1 }
            )
        `, runtime());

        expect(text(entry(result, "status"))).toBe("budgetExhausted");
        expect(text(entry(result, "classification"))).toBe("unique");
        expect(entry(entry(result, "work"), "exhausted").value).toBe(1n);
    });
});
