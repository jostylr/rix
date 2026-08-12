import { describe, expect, test } from "bun:test";
import { enhanceGraphicViews, graphicPointFromClient } from "../../src/tools/graphic-view.js";

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

test("Graphic actions emit semantic records for pointer and keyboard activation", () => {
    const listeners = new Map();
    const action = {
        dataset: { rixGraphicAction: "left", rixGraphicTarget: "graph:current" },
        addEventListener(name, listener) { listeners.set(name, listener); },
        getAttribute(name) { return name === "aria-label" ? "Go left" : null; },
    };
    const status = { textContent: "" };
    const graphic = {
        dataset: {},
        matches(selector) { return selector === ".rix-output-graphic"; },
        querySelector(selector) {
            if (selector === "svg.rix-output-svg") return {};
            if (selector === ".rix-output-graphic-status") return status;
            return null;
        },
        querySelectorAll(selector) {
            if (selector === "[data-rix-graphic-action]") return [action];
            return [];
        },
        dispatchEvent() {},
    };
    const received = [];
    enhanceGraphicViews(graphic, {
        onAction(detail) {
            received.push(detail);
            return { type: "result", revision: received.length };
        },
    });
    listeners.get("click")({ preventDefault() {}, stopPropagation() {} });
    listeners.get("keydown")({ key: "Enter", preventDefault() {}, stopPropagation() {} });
    listeners.get("keydown")({ key: "ArrowLeft" });
    expect(received).toEqual([
        { type: "graphic:action", actionId: "left", targetId: "graph:current", source: "pointer" },
        { type: "graphic:action", actionId: "left", targetId: "graph:current", source: "keyboard" },
    ]);
    expect(status.textContent).toBe("Go left selected");
});
