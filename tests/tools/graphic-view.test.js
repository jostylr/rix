import { describe, expect, test } from "bun:test";
import { graphicPointFromClient } from "../../src/tools/graphic-view.js";

describe("portable Graphic host interaction helpers", () => {
    test("maps browser pixels into a scaled SVG coordinate space", () => {
        expect(graphicPointFromClient(
            { left: 10, top: 20, width: 400, height: 200 },
            { x: 0, y: 0, width: 200, height: 100 },
            { x: 210, y: 120 },
        )).toEqual([100, 50]);
    });

    test("clamps pointer coordinates to the Graphic view box", () => {
        expect(graphicPointFromClient(
            { left: 0, top: 0, width: 200, height: 100 },
            { x: 10, y: 20, width: 200, height: 100 },
            { x: -50, y: 200 },
        )).toEqual([10, 120]);
    });

    test("rejects empty rendering bounds", () => {
        expect(() => graphicPointFromClient(
            { left: 0, top: 0, width: 0, height: 100 },
            { x: 0, y: 0, width: 200, height: 100 },
            { x: 1, y: 1 },
        )).toThrow("non-empty bounds");
    });
});
