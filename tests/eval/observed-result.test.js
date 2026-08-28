import { describe, expect, test } from "bun:test";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    evaluateObserved,
    formatValue,
    lower,
    parse,
    parseAndEvaluate,
    parseAndEvaluateObserved,
    parseAndEvaluateObservedAsync,
} from "../../src/index.js";

function runtime() {
    return {
        context: new Context(),
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    };
}

describe("observed evaluation results", () => {
    test("observes only the reactive source returned by the final expression", () => {
        const options = runtime();
        parseAndEvaluate("$$first := 1; $$second := 2", options);
        const result = parseAndEvaluateObserved("$first; $second", options);
        expect(formatValue(result.value)).toBe("2");
        expect(typeof result.observe).toBe("function");

        const events = [];
        const unsubscribe = result.observe((value, event) => events.push([formatValue(value), event.type]));
        parseAndEvaluate("$first := 8", options);
        expect(events).toEqual([]);
        parseAndEvaluate("$second := 9", options);
        expect(events).toEqual([["9", "reactive:commit"]]);

        unsubscribe();
        parseAndEvaluate("$second := 10", options);
        expect(events).toHaveLength(1);
        result.dispose();
        result.dispose();
    });

    test("derived and ordinary results remain static", () => {
        const options = runtime();
        parseAndEvaluate("$$first := 1; $$second := 2", options);
        expect(parseAndEvaluateObserved("$first + $second", options).observe).toBeNull();
        expect(parseAndEvaluateObserved("42", options).observe).toBeNull();
    });

    test("individual IR evaluation uses the same observation contract", () => {
        const options = runtime();
        parseAndEvaluate("$$view := 3", options);
        const node = lower(parse("$view"))[0];
        const result = evaluateObserved(node, options.context, options.registry, options.systemContext);
        const values = [];
        result.observe((value) => values.push(formatValue(value)));
        parseAndEvaluate("$view := 7", options);
        expect(values).toEqual(["7"]);
        result.dispose();
        expect(() => result.observe(() => {})).toThrow("disposed");
    });

    test("async parsed evaluation returns the same owned handle", async () => {
        const options = runtime();
        const result = await parseAndEvaluateObservedAsync("$$amount := 4; $amount", options);
        const values = [];
        result.observe((value) => values.push(formatValue(value)));
        parseAndEvaluate("$amount := 6", options);
        expect(values).toEqual(["6"]);
        result.dispose();
    });
});
