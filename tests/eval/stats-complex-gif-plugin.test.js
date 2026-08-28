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

describe("statistics plugin", () => {
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
        expect(formatValue(parseAndEvaluate('.Plugin.Load("stats"); .stats.Variance([5])', runtime()))).toBe("0");
        expect(() => parseAndEvaluate('.Plugin.Load("stats"); .stats.NormalCDF(0, 0, 0)', runtime())).toThrow("positive exact Rational");
    });

    test("builds certified confidence records with explicit methods", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("stats");
            mean := .stats.MeanConfidence([1,2,3,4],9/10,{= knownStandardDeviation=2 });
            proportion := .stats.ProportionConfidence(7,10,9/10);
            [
                mean[:schema],mean[:method],mean[:estimate],mean[:count],mean[:certified],
                proportion[:method],proportion[:estimate],proportion[:count],proportion[:certified]
            ]
        `, runtime());
        expect(formatValue(result)).toBe("[rix.stats.confidence@1, normalKnownScale, 2..1/2, 4, 1, wilsonScore, 7/10, 10, 1]");
    });

    test("fits exact simple regressions and emits portable diagnostics", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("stats");
            model := .stats.LinearRegression([1,2,3,4],[3,5,7,9]);
            [
                model[:slope],model[:intercept],model[:rSquared],model[:sse],
                model[:residuals],.stats.Predict(model,5),
                .stats.RegressionTable(model),.stats.ResidualTable(model)
            ]
        `, runtime());
        expect(formatValue({ type: "sequence", values: result.values.slice(0, 6) })).toBe("[2, 1, 1, 0, [0, 0, 0, 0], 11]");
        expect(result.values[6]).toMatchObject({ type: "output", kind: "table" });
        expect(result.values[7]).toMatchObject({ type: "output", kind: "table" });
    });

    test("consumes probability simulation records without losing provenance", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("probability");
            .Plugin.Load("stats");
            run := .probability.Dice(1,6).Simulate(5,{= seed=7 });
            summary := .stats.SimulationSummary(run);
            [summary[:sourceFamily],summary[:sourceCount],summary[:sourceSeed],summary[:sourceSamplingPolicy],summary[:count]]
        `, runtime());
        expect(formatValue(result)).toBe("[dice, 5, 7, exactUniformDice, 5]");
    });

    test("consumes probability distribution records without inventing moments", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("probability");
            .Plugin.Load("stats");
            dice := .stats.DistributionSummary(.probability.Dice(2,6));
            cauchy := .stats.DistributionSummary(.probability.Cauchy());
            [dice[:schema],dice[:family],dice[:mean],dice[:variance],dice[:momentStatus],cauchy[:mean],cauchy[:variance],cauchy[:momentStatus]]
        `, runtime());
        expect(formatValue(result)).toBe("[rix.stats.distribution-summary@1, dice, 7, 5..5/6, available, _, _, unavailable]");
    });
});

describe("Phase 1 and 2 complex visualization plugin", () => {
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

    test("consumes certified complex enclosures and publishes Cayley color metadata", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("complex-viz");
            enclosure := .complex.FromParts(1,1).Refine({= absoluteWidth=1/1000,maxWork=100 });
            cayley := .complexViz.CayleyColor(.Complex.FromParts(3,4));
            [.complexViz.Color(enclosure),cayley[:schema],cayley[:magnitude],
             cayley[:direction],cayley[:phaseSector],cayley[:color]]
        `, runtime());
        expect(formatValue(result)).toBe("[#ef4444, rix.complex-viz.cayley-color@1, 5, 1/2, 1, #9a3412]");
    });

    test("creates Scene3D magnitude surfaces and exact Riemann-sphere points", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("complex-viz");
            surface := .complexViz.Surface({=
                fn=(z)->z^2,height=:magnitudeSquared,
                domain={= re=[-1,1],im=[-1,1] },resolution=[3,3]
            });
            sphere := .complexViz.RiemannSphere([
                .Complex.FromParts(0,0),.Complex.FromParts(1,0),.Complex.FromParts(0,1)
            ],{= branchcut=:nonpositiveRealAxis });
            [surface[:schema],surface[:metadata][:schema],surface[:children][1][:vertices].Len(),
             surface[:children][1][:triangles].Len(),surface[:metadata][:unresolved],
             sphere[:metadata][:schema],sphere[:metadata][:projection],sphere[:children][1][:points]]
        `, runtime());
        expect(formatValue(result)).toBe("[rix.scene3d@1, rix.complex-viz.surface@1, 9, 8, 0, rix.complex-viz.riemann-sphere@1, inverseStereographic, [[0, 0, -1], [1, 0, 0], [0, 1, 0]]]");
    });
});

describe("shared Phase 3 color scales", () => {
    test("Plot color-scale values drive Plot, Stats, and ComplexViz without private renderer state", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("plot");
            .Plugin.Load("stats");
            .Plugin.Load("complex-viz");
            scale := .plot.ColorScale({=
                colors=["#111111","#eeeeee"],minimum=0,maximum=4
            });
            [
                scale,
                .plot.HeatMap((x,y)->x^2+y^2,[-1,1],[-1,1],{= grid=[2,2],colorScale=scale }),
                .stats.HistogramGraphic([1,2,2,3,4],{= bins=2,colorScale=scale }),
                .complexViz.DomainColoring({=
                    fn=(z)->z,domain={= re=[-1,1],im=[-1,1] },resolution=[2,2],colorScale=scale
                })
            ];
        `, runtime());
        const [scale, heatMap, histogram, coloring] = result.values;
        expect(scale.entries.get("schema").value).toBe("rix.color-scale@1");
        expect(heatMap.metadata.get("plot").entries.get("colorscale").entries.get("schema").value)
            .toBe("rix.color-scale@1");
        expect(histogram.metadata.get("colorscale").entries.get("schema").value)
            .toBe("rix.color-scale@1");
        expect(coloring.metadata.get("colorscale").entries.get("schema").value)
            .toBe("rix.color-scale@1");
        expect(histogram.children.filter(({ kind }) => kind === "rectangle")
            .every(({ style }) => ["#111111", "#eeeeee"].includes(style.get("fill").value))).toBe(true);
    });

    test("shared color scales reject incomplete bounds and foreign records", () => {
        expect(() => parseAndEvaluate(`
            .Plugin.Load("plot");
            .plot.ColorScale({= minimum=0 });
        `, runtime())).toThrow("minimum and maximum must be supplied together");
        expect(() => parseAndEvaluate(`
            .Plugin.Load("stats");
            .stats.HistogramGraphic([1,2],{= colorScale={= schema="foreign" } });
        `, runtime())).toThrow("must use schema rix.color-scale@1");
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
        expect(received.options).toEqual({
            delays: [50, 50], loop: 0, transition: "none", transitionFrames: 0,
            dithering: "floyd-steinberg", palette: "global",
        });
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

    test("Phase 2 preserves transitions, palette policy, and projected Scene3D rotation snapshots", () => {
        const registry = new RendererRegistry();
        registry.register(createPngDefinition((_svg, { width, height }) => ({
            content: new Uint8Array([137, 80, 78, 71]), toolchain: "fixture-png", width, height,
        })));
        let encoderOptions = null;
        registry.register(createGifDefinition((_frames, options) => {
            encoderOptions = options;
            return { content: new Uint8Array([71, 73, 70]), toolchain: "fixture-gif" };
        }));
        const graphic = parseAndEvaluate(`.Graphics.Graphic([40,30],[.Graphics.Circle([20,15],5)])`, runtime());
        const sceneSnapshot = { type: "output", kind: "scene3d_snapshot", value: graphic };
        const snapshots = {
            type: "output", kind: "snapshots", title: "Orbit rotation", caption: null,
            snapshots: [{ content: sceneSnapshot }, { content: sceneSnapshot }],
        };
        const result = registry.render(snapshots, "gif", {
            transition: "crossfade", transitionFrames: 3, dithering: "ordered",
            palette: "adaptive", delays: [0.4, 0.6], loop: 2,
        }, { format: formatValue });
        expect(encoderOptions).toEqual({
            delays: [40, 60], loop: 2, transition: "crossfade", transitionFrames: 3,
            dithering: "ordered", palette: "adaptive",
        });
        expect(result.metadata).toMatchObject({
            schema: "rix.gif.render@2", frameCount: 2, transition: "crossfade",
            transitionFrames: 3, dithering: "ordered", palette: "adaptive",
        });
    });
});
