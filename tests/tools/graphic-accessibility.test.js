import { describe, expect, test } from "bun:test";
import {
    createAudioTracePlan,
    createGraphicsTextPlan,
    graphicValueExactness,
    renderGraphicAccessibilityHtml,
} from "../../src/tools/graphic-accessibility.js";
import {
    audioTraceFrequency,
    createAudioTraceState,
    stepAudioTrace,
} from "../../src/tools/audio-trace-view.js";

const rational = (numerator, denominator = 1n) => ({ numerator: BigInt(numerator), denominator: BigInt(denominator) });
const format = (value) => value?.numerator !== undefined
    ? `${value.numerator}/${value.denominator}`
    : String(value);

function graphicFixture() {
    const series = [
        new Map([
            ["id", "quadratic"],
            ["label", "Quadratic"],
            ["data", [[-1, 1], [0, 0], [1, 1]]],
            ["originalData", [[rational(-1), rational(1)], [rational(0), rational(0)], [rational(1), rational(1)]]],
        ]),
        new Map([
            ["id", "line"],
            ["label", "Line"],
            ["data", [[-1, -1], [0, 0], [1, 1]]],
            ["originalData", [[rational(-1), rational(-1)], [rational(0), rational(0)], [rational(1), rational(1)]]],
        ]),
    ];
    return {
        type: "output",
        kind: "graphic",
        size: [640, 360],
        children: [{ type: "output", kind: "path", points: [[0, 1], [1, 0], [2, 1]], children: [] }],
        metadata: new Map([["plot", new Map([
            ["kind", "function"],
            ["title", "Accessible curves"],
            ["xLabel", "input"],
            ["yLabel", "output"],
            ["view", new Map([["xmin", rational(-1)], ["xmax", rational(1)], ["ymin", rational(-1)], ["ymax", rational(1)]])],
            ["series", series],
            ["marks", [new Map([["point", [rational(0), rational(0)]], ["label", "Origin"]])]],
            ["unresolvedRegions", [new Map([["bounds", [rational(1, 3), rational(1, 2)]]])]],
        ])]]),
    };
}

describe("renderer-neutral graphic accessibility plans", () => {
    test("preserves exact spellings, semantic events, and uncertainty in the text plan", () => {
        const plan = createGraphicsTextPlan(graphicFixture(), format);
        expect(plan.schema).toBe("rix.graphics.text@1");
        expect(plan.title).toBe("Accessible curves");
        expect(plan.axes[0]).toMatchObject({ axis: "x", label: "input", scale: "linear" });
        expect(plan.axes[0].range.minimumText).toBe("-1/1");
        expect(plan.series[0].exactness).toBe("exact");
        expect(plan.series[0].samples[1]).toMatchObject({ xText: "0/1", yText: "0/1", exactness: "exact" });
        expect(plan.pointsOfInterest.some((event) => event.type === "axis-crossing" && event.exactness === "exact")).toBe(true);
        expect(plan.pointsOfInterest.some((event) => event.type === "selected-mark" && event.label.includes("Origin"))).toBe(true);
        expect(plan.pointsOfInterest.some((event) => event.type === "intersection")).toBe(true);
        expect(plan.unresolved).toEqual(["Unresolved region 1: 1/3, 1/2"]);
        expect(plan.objects[0]).toMatchObject({ role: "path", description: "Path with 3 retained points" });
    });

    test("labels sampled evidence as non-certified and produces an audio plan", () => {
        const graphic = graphicFixture();
        const plot = graphic.metadata.get("plot");
        plot.get("series")[0].set("originalData", []);
        plot.get("series")[0].set("data", [[-1, -1], [0.2, 0.5], [1, -1]]);
        const text = createGraphicsTextPlan(graphic, format);
        expect(text.series[0].events.some((event) => event.type === "sampled-axis-crossing" && event.label.includes("not a certified root"))).toBe(true);
        expect(text.series[0].events.some((event) => event.type === "sampled-extremum" && event.label.includes("not a certified extremum"))).toBe(true);

        const audio = createAudioTracePlan(graphic, format);
        expect(audio).toMatchObject({ schema: "rix.audio-trace@1", supported: true });
        expect(audio.series).toHaveLength(2);
        expect(audio.events.some((event) => event.type === "selected-mark")).toBe(true);
    });

    test("renders complete static controls and text when JavaScript or audio is absent", () => {
        const html = renderGraphicAccessibilityHtml(graphicFixture(), format);
        expect(html).toContain('data-rix-graphics-text-schema="rix.graphics.text@1"');
        expect(html).toContain('data-rix-audio-trace-schema="rix.audio-trace@1"');
        expect(html).toContain("No audio plays until Play is pressed");
        expect(html).not.toContain("intermediate samples omitted");
        expect(html).toContain("Origin at (0/1, 0/1); exact");
    });
});

describe("audio trace transport math", () => {
    test("maps the retained vertical range logarithmically into pitch", () => {
        expect(audioTraceFrequency(-1, { minimum: -1, maximum: 1 })).toBeCloseTo(220);
        expect(audioTraceFrequency(0, { minimum: -1, maximum: 1 })).toBeCloseTo(440);
        expect(audioTraceFrequency(1, { minimum: -1, maximum: 1 })).toBeCloseTo(880);
    });

    test("normalizes persistent state and clamps keyboard stepping to the selected domain", () => {
        const plan = createAudioTracePlan(graphicFixture(), format);
        const state = createAudioTraceState(plan, { startIndex: 1, endIndex: 2, sampleIndex: 1 });
        expect(stepAudioTrace(plan, state, 1)).toMatchObject({ index: 2 });
        expect(stepAudioTrace(plan, state, 1)).toMatchObject({ index: 2 });
        expect(stepAudioTrace(plan, state, -1)).toMatchObject({ index: 1 });
    });

    test("distinguishes exact, certified, approximate, and unresolved values", () => {
        expect(graphicValueExactness(rational(1, 3))).toBe("exact");
        expect(graphicValueExactness({ type: "RationalInterval" })).toBe("certified-enclosure");
        expect(graphicValueExactness(1 / 3)).toBe("approximate");
        expect(graphicValueExactness(null)).toBe("unresolved");
    });
});
