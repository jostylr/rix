import { parseAndEvaluate } from "../../src/eval/evaluator.js";

describe("Unified Brace Syntax Verification", () => {
    test("plain {} is always a block (replaces Set/Map inference)", () => {
        // Previously would have been a Set
        expect(parseAndEvaluate("{ 1, 2, 3 }").toNumber()).toBe(3);

        // Previously would have been a Map
        expect(parseAndEvaluate("{ x := 10; y := 20; x + y }").toNumber()).toBe(30);

        // Block returns the last statement
        expect(parseAndEvaluate("{ a := 5; b := a * 2; b / 2 }").toNumber()).toBe(5);
    });

    test("{$ } is reserved for future async/concurrency syntax", () => {
        expect(() => parseAndEvaluate("{$ x }")).toThrow(/reserved for future async\/concurrency/);
    });

    test("Nested plain braces are nested blocks", () => {
        const code = "{ a := { b := 5; b }; a + 10 }";
        expect(parseAndEvaluate(code).toNumber()).toBe(15);
    });

    test("Mixed containers (explicit sigils)", () => {
        // Explicit Sets are still Sets
        const setResult = parseAndEvaluate("{| 1, 2, 3 |}");
        expect(setResult.type).toBe("set");
        expect(setResult.values.map(v => v.toNumber())).toEqual([1, 2, 3]);

        // Explicit Maps are still Maps
        const mapResult = parseAndEvaluate("{= a=1, b=2 }");
        expect(mapResult.type).toBe("map");
        // Verify entries size
        expect(mapResult.entries.size).toBe(2);
    });
});
