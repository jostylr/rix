import { describe, expect, test } from "bun:test";
import { CertifiedApproximation, RationalInterval } from "@ratmath/core";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    parseAndEvaluate,
    undecidedReason,
} from "../../src/index.js";

function runtime() {
    return {
        context: new Context(),
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    };
}

function entry(map, key) {
    return map.entries.get(String(key).toLowerCase());
}

function textValue(value) {
    return value?.value ?? null;
}

describe("Ball plugin", () => {
    test("is bundled as an opt-in pure RiX plugin with EnclosableReal metadata", async () => {
        const options = runtime();
        const info = parseAndEvaluate('.Plugin.Info("ball")', options);

        expect(textValue(entry(info, "kind"))).toBe("rix");
        expect(textValue(entry(info, "mount"))).toBe("ball");
        expect(entry(info, "provides").values.map(textValue)).toContain("rix.enclosable-real@1");
        expect(() => parseAndEvaluate(".ball(1, 0)", options)).toThrow("available but not loaded");
        const value = parseAndEvaluate('.Plugin.Load("ball"); .ball(1, 0)', options);
        expect(textValue(entry(value, "valueKind"))).toBe("ball");
        expect(value._ext.get("__type").value).toBe("Ball");

        const reference = await Bun.file(new URL("../../plugins/ball/ball.js", import.meta.url)).text();
        expect(reference).toContain("Reference host implementation for comparison");
    });

    test("constructs semantic exact midpoint-radius balls and exposes their records", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("ball");
            b = .ball(3/2, 1/4);
            {: b, b.Midpoint(), b.Radius(), b.Lower(), b.Upper(), b.Contains(7/4), b.Record() }
        `, options);

        const ball = result.values[0];
        expect(textValue(entry(ball, "valueKind"))).toBe("ball");
        expect(ball._ext.get("__type").value).toBe("Ball");
        expect(result.values.slice(1, 5).map(String)).toEqual(["3/2", "1/4", "5/4", "7/4"]);
        expect(result.values[5].value).toBe(1n);
        expect(textValue(entry(result.values[6], "schema"))).toBe("rix.ball@1");
        expect(entry(result.values[6], "interval")).toBeInstanceOf(RationalInterval);
        expect(() => parseAndEvaluate('b.Set!("radius", 2)', options)).toThrow("immutable value");
    });

    test("rounds both endpoints outward to a requested dyadic grid", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("ball");
            original = .ball(1/3, 1/10);
            rounded = original.RoundOut(4);
            {: original, rounded, rounded.Contains(original) }
        `, options);

        expect(entry(result.values[1], "interval").toString()).toBe("3/16:7/16");
        expect(result.values[2].value).toBe(1n);
        expect(entry(result.values[1], "interval").contains(entry(result.values[0], "interval"))).toBe(true);

        const negative = parseAndEvaluate(".ball(-1/3, 1/10).RoundOut(4)", options);
        expect(entry(negative, "interval").toString()).toBe("-7/16:-3/16");
    });

    test("performs exact outward interval arithmetic with exact scalar promotion", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("ball");
            a = .ball(2, 1/10);
            b = .ball(3, 1/5);
            {: a+b, a-b, a*b, a/b, -a, a+1 }
        `, options);

        expect(result.values.map((ball) => entry(ball, "interval").toString())).toEqual([
            "47/10:53/10",
            "-13/10:-7/10",
            "133/25:168/25",
            "19/32:3/4",
            "-21/10:-19/10",
            "29/10:31/10",
        ]);
        expect(() => parseAndEvaluate("a / .ball(0, 1)", options)).toThrow("containing zero");
    });

    test("square-root recipes produce a deterministic nested chain of certified balls", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("ball");
            root = .ball.Sqrt(2);
            {: root, root.Ball(0), root.Ball(1), root.Ball(2), root.Ball(8), .ball.Sqrt(9).Ball(0) }
        `, options);

        expect(textValue(entry(result.values[0], "valueKind"))).toBe("nestedBallReal");
        const chain = result.values.slice(1, 5);
        expect(chain.map((ball) => entry(ball, "interval").toString())).toEqual([
            "0:2",
            "1:2",
            "1:3/2",
            "181/128:91/64",
        ]);
        for (let index = 1; index < chain.length; index += 1) {
            expect(entry(chain[index - 1], "interval").contains(entry(chain[index], "interval"))).toBe(true);
        }
        for (const ball of chain) {
            const interval = entry(ball, "interval");
            const parameter = entry(result.values[0], "parameter");
            expect(interval.low.multiply(interval.low).lessThanOrEqual(parameter)).toBe(true);
            expect(interval.high.multiply(interval.high).greaterThanOrEqual(parameter)).toBe(true);
        }
        expect(entry(result.values[5], "interval").toString()).toBe("3:3");
    });

    test("implements the shared certified refinement contract", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            .Plugin.Load("ball");
            {: 
                .numerics.Refine(.ball.Sqrt(2), {= absoluteWidth=1/1000, maxWork=20 }),
                .numerics.Refine(.ball.Sqrt(2), {= absoluteWidth=1/1000, maxWork=3 }),
                .numerics.Refine(.ball(3/2, 1/4), {= absoluteWidth=1/1000, maxWork=20 })
            }
        `, options);

        const [enclosed, exhausted, finite] = result.values;
        expect(textValue(entry(enclosed, "status"))).toBe("enclosed");
        expect(textValue(entry(enclosed, "backend"))).toBe("ball");
        expect(entry(enclosed, "certified").value).toBe(1n);
        expect(entry(enclosed, "goalMet").value).toBe(1n);
        expect(entry(enclosed, "achievedWidth").toString()).toBe("1/1024");
        expect(entry(enclosed, "approximation")).toBeInstanceOf(CertifiedApproximation);

        expect(textValue(entry(exhausted, "status"))).toBe("budgetExhausted");
        expect(entry(exhausted, "achievedWidth").toString()).toBe("1/4");
        expect(entry(entry(exhausted, "work"), "calls").value).toBe(3n);
        expect(textValue(entry(finite, "status"))).toBe("resolutionFloor");
        expect(entry(finite, "certified").value).toBe(1n);
    });

    test("lets Halo comparisons refine nested balls and preserve bounded undecided results", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("ball")', options);

        expect(parseAndEvaluate(".ball.Sqrt(2) < {~ 3/2, 1/1000 }", options).value).toBe(1n);
        expect(parseAndEvaluate(".ball.Sqrt(2) > {~ 3/2, 1/1000 }", options)).toBeNull();

        const undecided = parseAndEvaluate(".ball.Sqrt(2) < {~ 3/2, 1/1000, {= maxCalls=0 } }", options);
        expect(undecidedReason(undecided)).toBe("budgetExhausted");

        const overlap = parseAndEvaluate(".ball(3/2, 1/4) < {~ 3/2, 1/1000 }", options);
        expect(undecidedReason(overlap)).toBe("resolutionFloor");
    });

    test("rejects invalid radii, radicands, and dyadic precisions", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("ball")', options);

        expect(() => parseAndEvaluate(".ball(1, -1)", options)).toThrow("nonnegative");
        expect(() => parseAndEvaluate(".ball.Sqrt(-1)", options)).toThrow("nonnegative");
        expect(() => parseAndEvaluate(".ball(1).RoundOut(-1)", options)).toThrow("nonnegative");
    });
});
