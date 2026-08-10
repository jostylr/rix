import { describe, expect, test } from "bun:test";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    parseAndEvaluate,
} from "../../src/index.js";

function runtime() {
    return {
        context: new Context(),
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    };
}

function entry(value, key) {
    const wanted = key.toLowerCase();
    return [...value.entries].find(([candidate]) => String(candidate).toLowerCase() === wanted)?.[1];
}

function ints(value) {
    return value.values.map((item) => Number(item.value));
}

describe("radix plugin", () => {
    test("loads as a bundled plugin and extends exact numeric values", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("radix");
            (1/6).Expansion(10, {= maxDigits=20 });
        `, options);

        expect(entry(result, "status").value).toBe("complete");
        expect(ints(entry(result, "integerDigits"))).toEqual([0]);
        expect(ints(entry(result, "nonRepeatingDigits"))).toEqual([1]);
        expect(ints(entry(result, "repeatingDigits"))).toEqual([6]);
        expect(entry(result, "complete").value).toBe(1n);
    });

    test("terminating and truncated expansions remain explicit", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("radix");
            {:
                (1/8).Expansion(10),
                (1/7).Expansion(10, {= maxDigits=3 })
            };
        `, options);
        const [terminating, truncated] = result.values;
        expect(ints(entry(terminating, "nonRepeatingDigits"))).toEqual([1, 2, 5]);
        expect(entry(terminating, "terminating").value).toBe(1n);
        expect(entry(truncated, "status").value).toBe("budgetExhausted");
        expect(ints(entry(truncated, "nonRepeatingDigits"))).toEqual([1, 4, 2]);
        expect(entry(truncated, "repeatingDigits")).toBeNull();
    });

    test("finite digits, period analysis, and printable strings are exact", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("radix");
            {:
                (1/7).Digits(10, {= count=8 }),
                (1/7).Digits(10, {= }),
                (1/7).PeriodLength(10),
                (1/8).PeriodLength(10),
                (1/7).RadixString(10),
                23.RadixString(10)
            };
        `, options);
        expect(ints(result.values[0])).toEqual([1, 4, 2, 8, 5, 7, 1, 4]);
        expect(ints(result.values[1])).toEqual([1]);
        expect(result.values[2].value).toBe(6n);
        expect(result.values[3].value).toBe(0n);
        expect(result.values[4].value).toBe("0.(142857)");
        expect(result.values[5].value).toBe("23");
    });

    test("recognizes a repeat reached exactly at the digit budget", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("radix");
            (1/3).Expansion(10, {= maxDigits=1 });
        `, runtime());
        expect(entry(result, "status").value).toBe("complete");
        expect(ints(entry(result, "repeatingDigits"))).toEqual([3]);
    });

    test("period work exhaustion has both structured and throwing forms", () => {
        const options = runtime();
        const info = parseAndEvaluate(`
            .Plugin.Load("radix");
            (1/97).PeriodInfo(10, {= maxWork=3 });
        `, options);
        expect(entry(info, "status").value).toBe("budgetExhausted");
        expect(entry(info, "periodLength")).toBeNull();
        expect(() => parseAndEvaluate(
            "(1/97).PeriodLength(10, {= maxWork=3 });",
            options,
        )).toThrow("PeriodLength exceeded maxWork=3");
    });

    test("extension methods follow plugin mount visibility", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("radix");', options);
        expect(parseAndEvaluate("(1/3).RadixString(10);", options).value).toBe("0.(3)");
        const restricted = options.systemContext.withhold("radix");
        expect(() => parseAndEvaluate("(1/3).RadixString(10);", {
            context: new Context(),
            registry: options.registry,
            systemContext: restricted,
        })).toThrow("Method not found: RADIXSTRING");
    });
});
