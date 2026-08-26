import { describe, expect, test } from "bun:test";
import {
    createGraphicViewState,
    createGraphicHitIndex,
    describeGraphicNode,
    enhanceGraphicViews,
    filterGraphicSelectionCatalog,
    graphicPointFromClient,
    graphicSelectionCatalog,
    graphicSpatialTarget,
    graphicViewBox,
    panGraphicViewport,
    resetGraphicViewport,
    queryGraphicHitIndex,
    serializeGeometryConstructionRecord,
    updateGraphicGesture,
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

    test("one-pointer and two-pointer gestures share the bounded viewport model", () => {
        const state = createGraphicViewState(200, 100);
        expect(updateGraphicGesture(
            state,
            [{ id: 1, x: 20, y: 20 }],
            [{ id: 1, x: 40, y: 30 }],
            { left: 0, top: 0, width: 200, height: 100 },
        )).toEqual({ type: "pan", changed: true });
        expect(state.viewport.pan).toEqual([20, 10]);

        expect(updateGraphicGesture(
            state,
            [{ id: 1, x: 50, y: 50 }, { id: 2, x: 150, y: 50 }],
            [{ id: 1, x: 40, y: 50 }, { id: 2, x: 160, y: 50 }],
            { left: 0, top: 0, width: 200, height: 100 },
        )).toEqual({ type: "pinch", changed: true });
        expect(state.viewport.zoom).toBeCloseTo(1.2);
        expect(graphicViewBox(state).width).toBeCloseTo(200 / 1.2);
    });

    test("gesture updates require real layout bounds and ignore unrelated pointer ids", () => {
        const state = createGraphicViewState(100, 50);
        expect(updateGraphicGesture(
            state,
            [{ id: 1, x: 0, y: 0 }],
            [{ id: 2, x: 10, y: 10 }],
            { width: 100, height: 50 },
        )).toEqual({ type: "none", changed: false });
        expect(() => updateGraphicGesture(state, [], [], { width: 0, height: 50 })).toThrow("non-empty bounds");
    });

    test("builds a direct semantic catalog without making container groups noisy", () => {
        const graphic = {
            children: [{
                type: "output",
                kind: "group",
                children: [
                    { type: "output", kind: "circle", center: [1, 2], radius: 3, children: [] },
                    { type: "output", kind: "text_mark", position: [4, 5], text: "A", children: [] },
                ],
            }],
        };
        const catalog = graphicSelectionCatalog(graphic);
        expect(catalog.map(({ role }) => role)).toEqual(["circle", "text_mark"]);
        expect(catalog[0].label).toContain("exact center (1, 2)");
    });

    test("searches dense semantic catalogs and navigates by retained spatial anchors", () => {
        const catalog = [
            { id: "origin", role: "circle", label: "Origin point", anchor: [0, 0] },
            { id: "east", role: "circle", label: "East point", anchor: [10, 1] },
            { id: "north", role: "text_mark", label: "North label", anchor: [0, -8] },
        ];
        expect(filterGraphicSelectionCatalog(catalog, "circle", "point").map((entry) => entry.id)).toEqual(["origin", "east"]);
        expect(graphicSpatialTarget(catalog, "origin", "right")?.id).toBe("east");
        expect(graphicSpatialTarget(catalog, "origin", "up")?.id).toBe("north");
        expect(() => graphicSpatialTarget(catalog, "origin", "diagonal")).toThrow("left, right, up, or down");
    });

    test("indexes dense screen-space bounds and queries only nearby buckets", () => {
        const entries = Array.from({ length: 1000 }, (_, index) => ({
            id: `point-${index}`,
            bounds: { left: index * 10, right: index * 10 + 3, top: 20, bottom: 23 },
        }));
        const index = createGraphicHitIndex(entries, 32);
        expect(index.schema).toBe("rix.graphics.hit-index@1");
        expect(index.entries).toHaveLength(1000);
        expect(queryGraphicHitIndex(index, [502.5, 22], 4)?.entry.id).toBe("point-50");
        expect(queryGraphicHitIndex(index, [506, 22], 2)).toBeNull();
        expect(() => createGraphicHitIndex([], 0)).toThrow("cell size must be positive");
    });
});

test("geometry construction export is deterministic and omits executable callbacks", () => {
    const record = {
        type: "map",
        entries: new Map([
            ["schema", { type: "string", value: "rix.geometry.construction-record@1" }],
            ["nodes", { type: "array", values: [{
                type: "map",
                entries: new Map([
                    ["id", { type: "symbol", value: "a" }],
                    ["dependsOn", { type: "array", values: [] }],
                    ["construct", () => "not portable"],
                    ["value", { numerator: 1n, denominator: 3n }],
                ]),
            }] }],
        ]),
    };
    const exported = serializeGeometryConstructionRecord(record);
    expect(JSON.parse(exported)).toEqual({
        nodes: [{ dependsOn: [], id: "a", value: { type: "rational", numerator: "1", denominator: "3" } }],
        schema: "rix.geometry.construction-record@1",
    });
    expect(JSON.parse(exported).nodes[0]).not.toHaveProperty("construct");
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

test("positioned Graphic actions retain pointer and keyboard cursor coordinates", () => {
    const listeners = new Map();
    const action = {
        dataset: {
            rixGraphicAction: "place",
            rixGraphicTarget: "graph:points",
            rixGraphicPositioned: "true",
            rixPosition: "100,50",
        },
        addEventListener(name, listener) { listeners.set(name, listener); },
        getAttribute(name) { return name === "aria-label" ? "Place point" : null; },
    };
    const svg = {
        viewBox: { baseVal: { x: 0, y: 0, width: 200, height: 100 } },
        getBoundingClientRect() { return { left: 10, top: 20, width: 400, height: 200 }; },
    };
    const status = { textContent: "" };
    const graphic = {
        dataset: {},
        matches(selector) { return selector === ".rix-output-graphic"; },
        querySelector(selector) {
            if (selector === "svg.rix-output-svg") return svg;
            if (selector === ".rix-output-graphic-status") return status;
            return null;
        },
        querySelectorAll(selector) { return selector === "[data-rix-graphic-action]" ? [action] : []; },
        dispatchEvent() {},
    };
    const received = [];
    enhanceGraphicViews(graphic, { onAction(detail) { received.push(detail); return { type: "result" }; } });
    listeners.get("click")({ clientX: 310, clientY: 70, preventDefault() {}, stopPropagation() {} });
    listeners.get("keydown")({ key: "ArrowLeft", shiftKey: false, preventDefault() {}, stopPropagation() {} });
    listeners.get("keydown")({ key: "Enter", preventDefault() {}, stopPropagation() {} });
    expect(received).toEqual([
        { type: "graphic:action", actionId: "place", targetId: "graph:points", source: "pointer", position: [150, 25] },
        { type: "graphic:action", actionId: "place", targetId: "graph:points", source: "keyboard", position: [149, 25] },
    ]);
});
