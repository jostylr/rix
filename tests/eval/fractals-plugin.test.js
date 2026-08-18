import { describe, expect, test } from "bun:test";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    formatValue,
    parseAndEvaluate,
} from "../../src/index.js";

function runtime() {
    return {
        context: new Context(),
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    };
}

describe("fractals plugin", () => {
    test("keeps finite logistic dynamics exact", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("fractals");
            map := .fractals.Logistic(4);
            orbit := .fractals.Orbit(map, 1/2, 4);
            period := .fractals.DetectPeriod(orbit, 3);
            multiplier := .fractals.Multiplier((x) -> 4 - 8*x, [0]);
            [orbit[:values], orbit[:final], period[:status], period[:period], multiplier[:stability]]
        `, runtime());
        expect(formatValue(result)).toBe("[[1/2, 1, 0, 0, 0], 0, detected, 1, repelling]");
    });

    test("produces reusable bifurcation and cobweb records before graphics", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("fractals");
            bifurcation := .fractals.LogisticBifurcation([3,4], {=
                parameterSamples=3, discard=2, keep=2
            });
            cobweb := .fractals.Cobweb(.fractals.Logistic(3), [0,1], 1/2, 3, {= samples=5 });
            [
                bifurcation,
                .fractals.BifurcationGraphic(bifurcation, {= size=[120,80] }),
                cobweb,
                .fractals.CobwebGraphic(cobweb, {= size=[100,100] })
            ]
        `, runtime());
        expect(result.values[0].entries.get("schema").value).toBe("rix.fractals.bifurcation@1");
        expect(result.values[0].entries.get("points").values).toHaveLength(6);
        expect(result.values[1]).toMatchObject({ type: "output", kind: "graphic" });
        expect(result.values[2].entries.get("schema").value).toBe("rix.fractals.cobweb@1");
        expect(result.values[2].entries.get("cobwebpoints").values).toHaveLength(7);
        expect(result.values[3]).toMatchObject({ type: "output", kind: "graphic" });
    });

    test("separates exact escape classification from portable rendering", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("fractals");
            grid := .fractals.Mandelbrot({=
                domain={= re=[-3/2,3/2], im=[-3/2,3/2] },
                resolution=[3,3], maxIterations=4, escapeRadius=2
            });
            center := grid[:cells][5];
            right := grid[:cells][6];
            graphic := .fractals.EscapeGraphic(grid, {= size=[90,90] });
            .Plugin.Load("svg");
            [grid, center[:status], center[:certifiedEscape], right[:status], graphic, .svg.Render(graphic)[:content]]
        `, runtime());
        const grid = result.values[0];
        expect(grid.entries.get("schema").value).toBe("rix.fractals.escape-grid@1");
        expect(grid.entries.get("cells").values).toHaveLength(9);
        expect(formatValue(result.values[1])).toBe("boundedByBudget");
        expect(formatValue(result.values[2])).toBe("0");
        expect(formatValue(result.values[3])).toBe("escaped");
        expect(result.values[4]).toMatchObject({ type: "output", kind: "graphic" });
        expect(result.values[4].children).toHaveLength(9);
        expect(result.values[5].value).toContain("<rect");
    });

    test("does not overclaim finite non-escape or missing periods", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("fractals");
            escape := .fractals.Escape((z) -> z^2, .Complex.FromParts(0,0), {= maxIterations=3 });
            period := .fractals.DetectPeriod([1,2,3,4], 2);
            [escape[:status], escape[:certifiedEscape], period[:status], period[:period]]
        `, runtime());
        expect(formatValue(result)).toBe("[boundedByBudget, 0, notDetected, _]");
    });
});
