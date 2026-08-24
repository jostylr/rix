import { describe, expect, test } from "bun:test";
import {
    createGraphicViewState,
    describeGraphicNode,
    enhanceGraphicViews,
    graphicPointFromClient,
    graphicViewBox,
    panGraphicViewport,
    resetGraphicViewport,
    zoomGraphicViewport,
} from "../../src/tools/graphic-view.js";

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

describe("shared Graphic viewport and exact inspection", () => {
    test("zooms around a stable anchor, pans, resets, and publishes shared schemas", () => {
        const state = createGraphicViewState(200, 100);
        zoomGraphicViewport(state, 2, [50, 25]);
        expect(state.viewport).toMatchObject({ schema: "rix.viewport@1", zoom: 2, pan: [-50, -25] });
        expect(graphicViewBox(state)).toEqual({ x: 25, y: 12.5, width: 100, height: 50 });

        panGraphicViewport(state, 20, 5);
        expect(graphicViewBox(state)).toEqual({ x: 15, y: 10, width: 100, height: 50 });
        resetGraphicViewport(state);
        expect(graphicViewBox(state)).toEqual({ x: 0, y: 0, width: 200, height: 100 });
        expect(state.selection).toEqual({ schema: "rix.selection@1", ids: [], focus: null });
    });

    test("retains selection across viewport normalization", () => {
        const target = { selection: { schema: "rix.selection@1", ids: ["root"], focus: "root" } };
        createGraphicViewState(100, 60, target);
        zoomGraphicViewport(target, 4);
        createGraphicViewState(120, 80, target);
        expect(target.viewport.zoom).toBe(4);
        expect(target.selection).toEqual({ schema: "rix.selection@1", ids: ["root"], focus: "root" });
    });

    test("describes retained exact values rather than lowered pointer decimals", () => {
        const path = {
            kind: "path",
            commands: null,
            points: [["1/3", "2/5"], ["7/3", "11/5"]],
        };
        expect(describeGraphicNode(path, String, [2.2, 2.1]))
            .toBe("Path · 2 exact points · nearest (7/3, 11/5)");
        expect(describeGraphicNode({ kind: "circle", center: ["1/3", "2/5"], radius: "5/7" }, String))
            .toBe("Circle · exact center (1/3, 2/5) · exact radius 5/7");
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
