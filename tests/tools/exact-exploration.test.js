import { expect, test } from "bun:test";
import { Rational, RationalInterval } from "@ratmath/core";
import { parseAndEvaluate, renderGraphicSvg, renderOutputHtml } from "../../src/index.js";
import { createExactNumberLineGraphic, traceExactArithmetic } from "../../src/tools/exact-exploration.js";

test("number-line normalization is exact for huge/narrow values and preserves orientation", () => {
    const denominator = 10n ** 400n;
    const reversed = new RationalInterval(new Rational(2n, denominator), new Rational(1n, denominator));
    const graphic = createExactNumberLineGraphic([{ id: "tiny", label: "Tiny reversed interval", value: reversed }]);
    const path = graphic.children.find((node) => node.style.get("id") === "tiny");
    expect(path.points[0][0].greaterThan(path.points[1][0])).toBe(true);
    const svg = renderGraphicSvg(graphic, String);
    expect(svg).toContain("Retained Tiny reversed interval");
    expect(svg).toContain(String(reversed.start));
    expect(svg).toContain("reversed");
    expect(renderOutputHtml(graphic, String)).toContain(String(reversed.end));
    expect(createExactNumberLineGraphic([{ value: new Rational(1) }, { value: new Rational(2) }], { maximum: 1 }).metadata.get("exploration").omitted).toBe(1);
    expect(() => createExactNumberLineGraphic([{ value: new Rational(2n ** 17000n) }])).toThrow("16384-bit limit");
});

test("arithmetic trace retains nested evidence, widening and undefined divisor regions", () => {
    const trace = traceExactArithmetic("(1:2) * ((3:4) + 1)", parseAndEvaluate);
    expect(String(trace.result.value)).toBe("4:10");
    expect(trace.result.status).toBe("certified-enclosure");
    expect(trace.steps.some((step) => step.widened && step.reason.includes("Interval width grew"))).toBe(true);
    expect(trace.steps.some((step) => step.operator === "+")).toBe(true);
    const undefinedTrace = traceExactArithmetic("1 / (-1:1)", parseAndEvaluate);
    expect(undefinedTrace.result.status).toBe("undefined");
    expect(undefinedTrace.result.reason).toContain("contains zero");
});

test("trace limits preserve partial work and never replay calls or assignments", () => {
    const calls = [];
    const resolve = (source) => { calls.push(source); return parseAndEvaluate(source); };
    expect(traceExactArithmetic("Dangerous()", resolve).result.status).toBe("unresolved");
    expect(calls).toEqual([]);
    traceExactArithmetic("x := 10", resolve);
    expect(calls).toEqual([]);
    const partial = traceExactArithmetic("1 + 2 + 3 + 4", resolve, { maxNodes: 4 });
    expect(partial.exhausted).toBe(true);
    expect(partial.visited).toBeLessThanOrEqual(4);
    expect(partial.steps.length).toBeGreaterThan(0);
    expect(partial.diagnostics[0]).toContain("partial steps are retained");
    expect(traceExactArithmetic("1".repeat(8193), resolve).diagnostics[0]).toContain("8192-character");
});
