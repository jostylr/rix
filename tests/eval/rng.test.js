import { describe, expect, test } from "bun:test";
import {
    Context,
    createRngImplementation,
    createDefaultRegistry,
    createDefaultSystemContext,
    parseAndEvaluate,
} from "../../src/index.js";

function runtime(context = new Context()) {
    return {
        context,
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    };
}

function strings(tuple) {
    return tuple.values.map((value) => value.value);
}

describe("lexically scoped RNG", () => {
    test("fresh runtimes have the same fixed default stream", () => {
        const first = parseAndEvaluate(".RAND_NAME(20);", runtime());
        const second = parseAndEvaluate(".RAND_NAME(20);", runtime());
        expect(first.value).toBe(second.value);
    });

    test("RNG creates a fresh stream on every call", () => {
        const result = parseAndEvaluate(`
            .RNG(:default, {= seed=77 });
            first := .RAND_NAME(12);
            .RNG(:default, {= seed=77 });
            second := .RAND_NAME(12);
            {: first, second };
        `, runtime());
        expect(result.values[0].value).toBe(result.values[1].value);
    });

    test("a subscope inherits its parent stream until it installs its own", () => {
        const direct = parseAndEvaluate(`
            .RNG(:default, {= seed=41 });
            first := .RAND_NAME(8);
            second := .RAND_NAME(8);
            {: first, second };
        `, runtime());
        const withLocal = parseAndEvaluate(`
            .RNG(:default, {= seed=41 });
            first := .RAND_NAME(8);
            Local := () -> {;
                .RNG(:default, {= seed=99 });
                .RAND_NAME(100)
            };
            Local();
            second := .RAND_NAME(8);
            {: first, second };
        `, runtime());
        expect(strings(withLocal)).toEqual(strings(direct));

        const inherited = parseAndEvaluate(`
            .RNG(:default, {= seed=41 });
            first := .RAND_NAME(8);
            Consume := () -> .RAND_NAME(8);
            middle := Consume();
            {: first, middle };
        `, runtime());
        expect(strings(inherited)).toEqual(strings(direct));
    });

    test("closures retain the RNG selected in their defining lexical scope", () => {
        const result = parseAndEvaluate(`
            Maker := (seed) -> {;
                .RNG(:default, {= seed=seed });
                () -> .RAND_NAME(10)
            };
            Left := Maker(5);
            Right := Maker(5);
            {: Left(), Left(), Right(), Right() };
        `, runtime());
        expect(result.values[0].value).toBe(result.values[2].value);
        expect(result.values[1].value).toBe(result.values[3].value);
        expect(result.values[0].value).not.toBe(result.values[1].value);
    });

    test("seed=:random delegates to host entropy and custom host implementations are accepted", () => {
        const entropyContext = new Context();
        entropyContext.setEnv("randomSeedSource", () => 123);
        const randomSeeded = parseAndEvaluate(`
            info := .RNG(:default, {= seed=:random });
            {: info.Get("seed"), .RAND_NAME(10) };
        `, runtime(entropyContext));
        const explicit = parseAndEvaluate(`
            .RNG(:default, {= seed=123 });
            .RAND_NAME(10);
        `, runtime());
        expect(randomSeeded.values[0].value).toBe(123n);
        expect(randomSeeded.values[1].value).toBe(explicit.value);

        const hostContext = new Context();
        hostContext.set("constantrng", createRngImplementation(
            "constant",
            () => ({ next() { return 0; } }),
        ));
        const hostResult = parseAndEvaluate(`
            .RNG(constantRng);
            .RAND_NAME(6, "ab");
        `, runtime(hostContext));
        expect(hostResult.value).toBe("aaaaaa");
    });

    test("RationalInterval random methods consume the current scoped RNG", () => {
        const result = parseAndEvaluate(`
            .RNG(:default, {= seed=456 });
            point := (0:1).Random({: 1, 1000 });
            partition := (0:1).RandomPartition({: 4, 1000 });
            .RNG(:default, {= seed=456 });
            {: point, (0:1).Random({: 1, 1000 }), partition.Len() };
        `, runtime());
        expect(result.values[0].equals(result.values[1])).toBe(true);
        expect(result.values[2].value).toBe(4n);
    });
});
