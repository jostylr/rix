import { describe, expect, test } from "bun:test";
import {
    Context,
    RendererRegistry,
    createDefaultRegistry,
    createDefaultSystemContext,
    formatValue,
    parseAndEvaluate,
} from "../../src/index.js";
import { createDefinition as createGifDefinition } from "../../plugins/render-gif/gif.plugin.rix.js";
import { createDefinition as createPngDefinition } from "../../plugins/render-png/png.plugin.rix.js";

function runtime() {
    return {
        context: new Context(),
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    };
}

describe("Phase 1 statistics plugin", () => {
    test("keeps descriptive statistics and linear quantiles exact", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("stats");
            summary := .stats.Summary([1/3, 2/3, 5/3, 7/3]);
            [
                .stats.Count([]),
                summary[:mean],
                summary[:median],
                summary[:q1],
                summary[:populationVariance],
                summary[:sampleVariance]
            ]
        `, runtime());
        expect(formatValue(result)).toBe("[0, 1..1/4, 1..1/6, 7/12, 91/144, 91/108]");
    });

    test("builds plot-ready summaries and portable histogram/box graphics", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("stats");
            values := [1, 2, 2, 3, 5, 8];
            histogram := .stats.Histogram(values, 3);
            [
                .stats.SummaryTable(values),
                histogram,
                .stats.HistogramGraphic(histogram),
                .stats.BoxPlot(values)
            ]
        `, runtime());
        expect(result.values[0]).toMatchObject({ type: "output", kind: "table" });
        expect(result.values[1].entries.get("schema").value).toBe("rix.stats.histogram@1");
        expect(result.values[1].entries.get("bins").values.map((bin) => bin.entries.get("count").value)).toEqual([4n, 1n, 1n]);
        expect(result.values[2]).toMatchObject({ type: "output", kind: "graphic" });
        expect(result.values[3]).toMatchObject({ type: "output", kind: "graphic" });
    });

    test("reports empty and sample-size edge cases", () => {
        expect(() => parseAndEvaluate('.Plugin.Load("stats"); .stats.Mean([])', runtime())).toThrow("at least one value");
        expect(() => parseAndEvaluate('.Plugin.Load("stats"); .stats.SampleVariance([1])', runtime())).toThrow("at least two values");
        expect(() => parseAndEvaluate('.Plugin.Load("stats"); .stats.Quantile([1,2], 3/2)', runtime())).toThrow("between 0 and 1");
    });
});

describe("Phase 1 complex visualization plugin", () => {
    test("uses documented exact phase and magnitude color fixtures", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("complex-viz");
            [
                .complexViz.PhaseSector(.Complex.FromParts(2, 1)),
                .complexViz.PhaseSector(.Complex.FromParts(-1, 2)),
                .complexViz.MagnitudeBand(.Complex.FromParts(1/4, 0)),
                .complexViz.Color(.Complex.FromParts(1, 0)),
                .complexViz.Color(.complexViz.Pole()),
                .complexViz.Color(.complexViz.Unresolved(:budget))
            ]
        `, runtime());
        expect(formatValue(result)).toBe("[0, 2, small, #ef4444, #ffffff, #64748b]");
    });

    test("marks exact zeros and poles and renders through SVG and Canvas", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("complex-viz");
            rational := .complexViz.RationalFunction((z) -> z^2 - 1, (z) -> z);
            coloring := .complexViz.DomainColoring({=
                fn=rational,
                domain={= re=[-5/2, 5/2], im=[-5/2, 5/2] },
                resolution=[5, 5],
                size=[100, 100]
            });
            .Plugin.Load("svg");
            .Plugin.Load("canvas");
            [coloring, .svg.Render(coloring).Get("content"), .canvas.Render(coloring).Get("content")]
        `, runtime());
        const graphic = result.values[0];
        expect(graphic.children).toHaveLength(25);
        expect(graphic.metadata.get("poles").value).toBe(1n);
        expect(graphic.metadata.get("zeros").value).toBe(2n);
        expect(result.values[1].value).toContain("<rect");
        expect(JSON.parse(result.values[2].value).commands).toHaveLength(25);
    });
});

describe("Phase 1 GIF renderer", () => {
    test("expands a deterministic timeline through PNG with exact delays", () => {
        const registry = new RendererRegistry();
        registry.register(createPngDefinition((_svg, { width, height }) => ({
            content: new Uint8Array([137, 80, 78, 71, width, height]),
            toolchain: "fixture-png",
            width,
            height,
        })));
        let received = null;
        registry.register(createGifDefinition((frames, options) => {
            received = { frames, options };
            return { content: new Uint8Array([71, 73, 70, 56, 57, 97]), toolchain: "fixture-gif" };
        }));
        const timeline = parseAndEvaluate(`
            scene := (offset) -> .Graphics.Graphic([40, 30], [
                .Graphics.Circle([10 + offset, 15], 5, {= fill="#2563eb" })
            ]);
            .Timeline.Sequence({= duration=1, entries=[{: scene, [0, 20] }] })
        `, runtime());
        const result = registry.render(timeline, "gif", null, { format: formatValue });
        expect([...result.content]).toEqual([71, 73, 70, 56, 57, 97]);
        expect(received.frames).toHaveLength(2);
        expect(received.options).toEqual({ delays: [50, 50], loop: 0 });
        expect(result.metadata).toMatchObject({ frameCount: 2, delays: [50, 50], width: 40, height: 30 });
    });

    test("keeps host encoding unavailable as an explicit diagnostic", () => {
        const registry = new RendererRegistry();
        registry.register(createPngDefinition(() => ({ content: new Uint8Array([1]), width: 10, height: 10 })));
        registry.register(createGifDefinition());
        const slides = parseAndEvaluate(`
            frame := .Graphics.Graphic([10, 10], []);
            .Slides([.Slide(frame), .Slide(frame)])
        `, runtime());
        expect(() => registry.render(slides, "gif")).toThrow("approved host encoder");
    });
});
