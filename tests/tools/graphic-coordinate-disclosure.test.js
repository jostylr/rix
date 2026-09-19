import { expect, test } from "bun:test";
import { coordinateScene, denseLabelScene } from "../fixtures/graphic-coordinate-scenes.js";
import { lowerGraphicSvg, renderOutputHtml } from "../../src/runtime/output.js";
import { createGraphicCoordinateDisclosure, renderGraphicAccessibilityHtml, renderGraphicCoordinateDisclosureHtml } from "../../src/tools/graphic-accessibility.js";
import { createCanvasPlan } from "../../plugins/render-canvas/canvas-plan.js";

test("coordinate disclosures retain huge, narrow, reversed and collided sources with clipping", () => {
    const graphic = coordinateScene();
    const lowered = lowerGraphicSvg(graphic, String, { precision: 3 });
    const disclosure = createGraphicCoordinateDisclosure(graphic, lowered);
    expect(disclosure).toMatchObject({ precision: 3, rounding: "nearest", guarantee: "outward-exact-enclosure" });
    expect(disclosure.entries.some((entry) => entry.exact.length > 400)).toBe(true);
    expect(disclosure.entries).toContainEqual(expect.objectContaining({ exact: "5:4", presentation: "reversed", lower: "4", upper: "5" }));
    expect(disclosure.entries.some((entry) => entry.exact.includes(":" ) && entry.lower === "0" && entry.upper === "0.001")).toBe(true);
    expect(disclosure.collisions.some((entry) => entry.exact.includes("1/3") && entry.exact.includes("1667/5000"))).toBe(true);
    expect(disclosure.clipping).toHaveLength(1);
    expect(disclosure.summary).toContain("1 explicit clip regions can hide geometry");
    expect(lowered.content).toContain("<desc>");
    expect(lowered.content).toContain('data-rix-coordinate-lowering="rix.svg.coordinate-lowering@1"');
    expect(lowered.content).toContain("source 5:4; displayed 4.5; bounds 4 to 5; reversed source order");
    const html = renderGraphicAccessibilityHtml(graphic, String, lowered);
    expect(html).toContain("Coordinate rounding and uncertainty");
    expect(html).toContain("Rounding collisions");
    expect(html).toContain("Exact sources and displayed SVG coordinates");
    expect(renderOutputHtml(graphic, String)).toContain("Coordinate rounding and uncertainty");
});

test("Canvas carries exact source disclosure without claiming certified pixels", () => {
    const plan = createCanvasPlan(coordinateScene(), String, { precision: 3 });
    expect(plan.accessibility.coordinateDisclosure.entries).toContainEqual(expect.objectContaining({ exact: "5:4", presentation: "reversed" }));
    expect(plan.commands.some((command) => command[0] === "circle" && command[1] === 4.5)).toBe(true);
    expect(plan.accessibility.text).toContain("Canvas pixels are not a certified outward enclosure");
    expect(plan.accessibility.text).toContain("bounds 4 to 5");
    expect(plan.accessibility.text).toContain("Second label");
});

test("disclosure text is escaped and approximate inputs never acquire certified bounds", () => {
    const graphic = coordinateScene();
    graphic.children[0].center[0] = 1.23456789;
    const disclosure = createGraphicCoordinateDisclosure(graphic, lowerGraphicSvg(graphic));
    expect(disclosure.entries).toContainEqual(expect.objectContaining({ exact: "1.23456789", certified: false }));
    expect(disclosure.text).toContain("approximate input, no certified bounds");
    const malicious = { ...disclosure, summary: '<script>alert("x")</script>', entries: [{ ...disclosure.entries[0], exact: "</td><script>bad()</script>" }] };
    const html = renderGraphicCoordinateDisclosureHtml(malicious);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
});

test("dense overlapping labels retain every stable semantic identity in SVG, text, and Canvas", () => {
    const graphic = denseLabelScene();
    const lowered = lowerGraphicSvg(graphic, String, { precision: 3 });
    expect(lowered.metadata.collisions.some((collision) => collision.exact.length === 64)).toBe(true);
    const html = renderGraphicAccessibilityHtml(graphic, String, lowered);
    const canvas = createCanvasPlan(graphic, String, { precision: 3 });
    for (let index = 1; index <= 64; index += 1) {
        expect(html).toContain(`data-rix-graphics-text-object="dense-${index}"`);
        expect(lowered.content).toContain(`data-rix-semantic-id="dense-${index}"`);
        expect(canvas.accessibility.text).toContain(`Dense label ${index}`);
    }
});
