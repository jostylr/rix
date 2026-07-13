import { describe, expect, test } from "bun:test";
import { Context } from "../../src/runtime/context.js";
import { parseAndEvaluate } from "../../src/eval/evaluator.js";

const strings = (sequence) => sequence.values.map((value) => value.toString());

describe("runtime sequence generators", () => {
    test("eager arithmetic generation counts successful output elements", () => {
        const value = parseAndEvaluate("[2, |+2, |; 5]");
        expect(strings(value)).toEqual(["2", "4", "6", "8", "10"]);
    });

    test("seeds and candidates traverse transforms and filters", () => {
        const value = parseAndEvaluate("[2 |+ 3 |> (x) -> x^2 |? (x) -> x%2==0 |; 5]");
        expect(strings(value)).toEqual(["4", "64", "196", "400", "676"]);
    });

    test("index generation is one-based", () => {
        const value = parseAndEvaluate("[|: (i) -> i^2, |; 5]");
        expect(strings(value)).toEqual(["1", "4", "9", "16", "25"]);
    });

    test("history placeholders address newest values first", () => {
        const value = parseAndEvaluate("F := (a,b)->a+b; [1,1, |> F(_2,_1), |; 7]");
        expect(strings(value)).toEqual(["1", "1", "2", "3", "5", "8", "13"]);
    });

    test("predicate termination includes the triggering value", () => {
        const value = parseAndEvaluate("[2 |+2 |; (x) -> x>10]");
        expect(strings(value)).toEqual(["2", "4", "6", "8", "10", "12"]);
    });

    test("lazy limits and unterminated sources generate on demand", () => {
        const bounded = parseAndEvaluate("[1 |+1 |^5]");
        expect(bounded.type).toBe("lazy_sequence");
        expect(bounded._lazy.cache).toHaveLength(0);
        expect(parseAndEvaluate("g := [1 |+1]; g[8]").toString()).toBe("8");
    });

    test("lazy map and filter remain lazy", () => {
        expect(parseAndEvaluate("g := [1 |+1]; h := g |>> (x)->2*x; h[4]").toString()).toBe("8");
        expect(parseAndEvaluate("g := [1 |+1]; h := g |>? (x)->x%2==0; h[4]").toString()).toBe("8");
    });

    test("iteration exhaustion throws instead of truncating", () => {
        const context = new Context();
        context.setEnv("generatorMaxIterations", 3);
        expect(() => parseAndEvaluate("[1 |+1 |? (x)->_ |;2]", { context }))
            .toThrow("iteration limit");
    });

    test("shallow copy preserves current state while deep copy restarts", () => {
        const context = new Context();
        parseAndEvaluate("g := [1 |+1]; g[3]; h := g; d ::= g", { context });
        expect(context.get("g")._lazy.cache).toHaveLength(3);
        expect(context.get("h")._lazy.cache).toHaveLength(3);
        expect(context.get("d")._lazy.cache).toHaveLength(0);
        expect(context.get("g")).not.toBe(context.get("h"));
    });
});

describe("interval-generated sequences", () => {
    test("stepping and infinite arithmetic sequences are lazy", () => {
        expect(parseAndEvaluate("s := 1:10 :+2; s[5]").toString()).toBe("9");
        expect(parseAndEvaluate("s := 5::+2; s[6]").toString()).toBe("15");
    });

    test("division returns exactly n endpoint-inclusive points", () => {
        const value = parseAndEvaluate("s := 1:5 ::3; s[1:3]");
        expect(strings(value)).toEqual(["1", "3", "5"]);
    });

    test("equal and mediant partitions return touching intervals", () => {
        expect(strings(parseAndEvaluate("1:5 :/:2"))).toEqual(["1:3", "3:5"]);
        expect(parseAndEvaluate("1:2 :~/2").values).toHaveLength(4);
        expect(parseAndEvaluate("1:2 :~2").values.map((level) => level.values.length)).toEqual([2, 1, 2]);
    });

    test("fixed-denominator sampling uses the requested rational grid", () => {
        const value = parseAndEvaluate("0:1 :% (1,1000)", { rng: () => 0.023 });
        expect(value.toString()).toBe("23/1000");
    });

    test("runtime seeding is repeatable", () => {
        const a = parseAndEvaluate(".RANDOMSEED(7); 0:1 :% (3,1000)");
        const b = parseAndEvaluate(".RANDOMSEED(7); 0:1 :% (3,1000)");
        expect(strings(a)).toEqual(strings(b));
    });
});
