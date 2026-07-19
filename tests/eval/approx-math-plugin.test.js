import { describe, expect, test } from "bun:test";
import { Rational, RationalInterval } from "@ratmath/core";
import { createDefaultRegistry, createDefaultSystemContext, parseAndEvaluate } from "../../src/eval/evaluator.js";
import { loadApproxMathPlugin } from "../../examples/approx-math/approx-math-plugin.js";

describe("approximate math plugin", () => {
    test("transcendental functions are absent from the default system", () => {
        expect(() => parseAndEvaluate(".Sin(1)"))
            .toThrow("Unknown system capability: SIN");
    });

    test("plugin installs Float conversion and PascalCase methods below .float", () => {
        const systemContext = createDefaultSystemContext();
        const registry = createDefaultRegistry();
        loadApproxMathPlugin(systemContext, registry);

        expect(parseAndEvaluate(".float.Sin(1).Value()", { systemContext, registry }))
            .toEqual({ type: "string", value: String(Math.sin(1)) });
        expect(parseAndEvaluate(".float.Float(1/3).Value()", { systemContext, registry }))
            .toEqual({ type: "string", value: String(1 / 3) });
        expect(parseAndEvaluate(".float(1/3).Value()", { systemContext, registry }))
            .toEqual({ type: "string", value: String(1 / 3) });
        expect(() => parseAndEvaluate(".float.sin(1)", { systemContext, registry }))
            .toThrow("Unknown system member 'float.sin'");
    });

    test("Float interval and decimal rounding methods return exact numeric values", () => {
        const systemContext = createDefaultSystemContext();
        const registry = createDefaultRegistry();
        loadApproxMathPlugin(systemContext, registry);

        const enclosure = parseAndEvaluate(".float.Interval(.float(1/3))", { systemContext, registry });
        expect(enclosure).toBeInstanceOf(RationalInterval);
        expect(enclosure.low).toBeInstanceOf(Rational);
        expect(enclosure.low.equals(enclosure.high)).toBe(true);

        expect(parseAndEvaluate(".float.Round(.float(1.25), 1)", { systemContext, registry }).toString()).toBe("6/5");
        expect(parseAndEvaluate(".float.Floor(.float(1.25), 1)", { systemContext, registry }).toString()).toBe("6/5");
        expect(parseAndEvaluate(".float.Ceiling(.float(1.25), 1)", { systemContext, registry }).toString()).toBe("13/10");
    });

    test("generic Min and Max promote mixed exact and Float values through the plugin comparison variant", () => {
        const systemContext = createDefaultSystemContext();
        const registry = createDefaultRegistry();
        loadApproxMathPlugin(systemContext, registry);

        expect(parseAndEvaluate(".Min(2/3, .float(3/4)).Value()", { systemContext, registry }))
            .toEqual({ type: "string", value: String(2 / 3) });
        expect(parseAndEvaluate(".Max(2/3, .float(3/4)).Value()", { systemContext, registry }))
            .toEqual({ type: "string", value: String(3 / 4) });
    });
});
