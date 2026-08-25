import { describe, expect, test } from "bun:test";
import { webGLPlanMatrix } from "../../plugins/render-webgl/webgl-plan.js";
import {
    createScene3DViewState,
    describeScene3DSelection,
    dollyScene3DCamera,
    layoutScene3DAnnotations,
    orbitScene3DCamera,
    pickScene3DPlan,
    projectScene3DPoint,
    renderScene3DSvgFallback,
    resetScene3DCamera,
    resolveScene3DAnnotationOcclusion,
    scene3DSelectionCatalog,
    toggleScene3DProjection,
    truckScene3DCamera,
    updateScene3DGesture,
} from "../../src/tools/scene3d-view.js";

function trianglePlan() {
    return {
        schema: "rix.webgl-plan@1",
        viewport: { width: 200, height: 120 },
        background: [1, 1, 1],
        camera: {
            projection: "perspective",
            position: [0, 0, 4],
            target: [0, 0, 0],
            up: [0, 1, 0],
            fov: 50,
            near: 0.01,
            far: 100,
            scale: null,
            orbit: null,
        },
        drawCalls: [{
            primitive: 0,
            mode: "triangles",
            positions: [[-1, -1, 0], [1, -1, 0], [0, 1, 0]],
            indices: [0, 1, 2],
            color: [0.1, 0.4, 0.8, 1],
            lineWidth: 1,
            pointSize: 1,
            pickId: "face",
            label: "Exact face",
            interaction: { events: ["select"] },
        }],
        annotations: [],
        picking: { face: { kind: "drawCall", index: 0, label: "Exact face" } },
        diagnostics: [],
    };
}

describe("Scene3D camera navigation", () => {
    test("orbits, trucks, dollies, switches projection, and resets within bounds", () => {
        const plan = trianglePlan();
        const state = createScene3DViewState(plan);
        const initial = [...state.camera.position];
        orbitScene3DCamera(state, Math.PI / 4, 0.2);
        expect(state.camera.position).not.toEqual(initial);
        const offsetBeforeTruck = state.camera.position.map((value, index) => value - state.camera.target[index]);
        truckScene3DCamera(state, 1, -0.5);
        state.camera.position.forEach((value, index) => {
            expect(value - state.camera.target[index]).toBeCloseTo(offsetBeforeTruck[index], 12);
        });
        dollyScene3DCamera(state, 1e-12);
        expect(Math.hypot(...state.camera.position.map((value, index) => value - state.camera.target[index])))
            .toBeGreaterThanOrEqual(state.policy.minDistance);
        toggleScene3DProjection(state);
        expect(state.camera.projection).toBe("orthographic");
        expect(state.viewport).toMatchObject({ schema: "rix.viewport3d@1", projection: "orthographic" });
        resetScene3DCamera(state);
        expect(state.camera.position).toEqual(initial);
        expect(state.camera.projection).toBe("perspective");
        expect(state.selection).toEqual({ schema: "rix.selection@1", ids: [], focus: null });
        expect(state.navigation).toEqual({ schema: "rix.scene3d-navigation@1", scope: "all", query: "", pickTolerance: 8 });
    });

    test("one- and two-pointer gestures orbit, truck, and pinch-dolly through shared camera policy", () => {
        const orbitState = createScene3DViewState(trianglePlan());
        const initial = [...orbitState.camera.position];
        expect(updateScene3DGesture(
            orbitState,
            [{ id: 1, x: 40, y: 40 }],
            [{ id: 1, x: 60, y: 50 }],
            { width: 200, height: 120 },
        )).toEqual({ type: "orbit", changed: true });
        expect(orbitState.camera.position).not.toEqual(initial);

        const truckState = createScene3DViewState(trianglePlan());
        expect(updateScene3DGesture(
            truckState,
            [{ id: 1, x: 40, y: 40, truck: true }],
            [{ id: 1, x: 60, y: 50, truck: true }],
            { width: 200, height: 120 },
        )).toEqual({ type: "truck", changed: true });
        expect(truckState.camera.target).not.toEqual([0, 0, 0]);

        const pinchState = createScene3DViewState(trianglePlan());
        expect(updateScene3DGesture(
            pinchState,
            [{ id: 1, x: 50, y: 50 }, { id: 2, x: 150, y: 50 }],
            [{ id: 1, x: 20, y: 60 }, { id: 2, x: 220, y: 60 }],
            { width: 240, height: 120 },
        )).toEqual({ type: "pinch", changed: true });
        expect(Math.hypot(...pinchState.camera.position.map((value, index) => value - pinchState.camera.target[index])))
            .toBeCloseTo(2);
        expect(pinchState.camera.target).not.toEqual([0, 0, 0]);
    });

    test("gestures reject empty layout bounds and unrelated pointer updates", () => {
        const state = createScene3DViewState(trianglePlan());
        expect(updateScene3DGesture(
            state,
            [{ id: 1, x: 0, y: 0 }],
            [{ id: 2, x: 10, y: 10 }],
            { width: 200, height: 120 },
        )).toEqual({ type: "none", changed: false });
        expect(() => updateScene3DGesture(state, [], [], { width: 0, height: 120 })).toThrow("non-empty bounds");
    });
});

describe("Scene3D plan picking and fallbacks", () => {
    test("projects and picks the stable semantic identity", () => {
        const plan = trianglePlan();
        const matrix = webGLPlanMatrix(plan);
        const center = projectScene3DPoint(matrix, [0, 0, 0], plan.viewport);
        expect(center.visible).toBe(true);
        expect(center.screen[0]).toBeCloseTo(100);
        expect(center.screen[1]).toBeCloseTo(60);
        expect(pickScene3DPlan(plan, matrix, center.screen)).toMatchObject({
            pickId: "face",
            primitive: 0,
        });
        expect(pickScene3DPlan(plan, matrix, [0, 0])).toBeNull();
    });

    test("describes exact retained world points and builds a portable SVG", () => {
        const scene = {
            realized: {
                primitives: [{
                    kind: { type: "symbol", value: "mesh" },
                    pickid: { type: "string", value: "face" },
                    label: { type: "string", value: "Exact face" },
                    points: [["-1/3", "-1/5", "0"], ["1/3", "-1/5", "0"], ["0", "2/5", "0"]],
                }],
            },
        };
        expect(describeScene3DSelection(scene, "face", String))
            .toBe("Exact face · mesh · 3 exact world points · (-1/3, -1/5, 0); (1/3, -1/5, 0); (0, 2/5, 0)");
        const svg = renderScene3DSvgFallback(trianglePlan());
        expect(svg).toContain('class="rix-output-scene3d-fallback"');
        expect(svg).toContain('data-rix-semantic-id="face"');
        expect(svg).toContain("<polygon");
    });

    test("catalogs exact objects and deterministically separates colliding annotations", () => {
        const scene = {
            realized: {
                primitives: [{
                    kind: { type: "symbol", value: "mesh" },
                    pickid: { type: "string", value: "face" },
                    label: { type: "string", value: "Exact face" },
                    points: [["-1/3", "-1/5", "0"], ["1/3", "-1/5", "0"], ["0", "2/5", "0"]],
                }],
            },
        };
        const catalog = scene3DSelectionCatalog(scene, trianglePlan());
        expect(catalog).toHaveLength(1);
        expect(catalog[0]).toMatchObject({ id: "face", role: "mesh" });
        expect(catalog[0].label).toContain("3 exact world points");

        const annotations = [
            { pickId: "a", text: "first", visible: true, screen: [100, 60], depth: 0 },
            { pickId: "b", text: "second", visible: true, screen: [100, 60], depth: 0.1 },
        ];
        const first = layoutScene3DAnnotations(annotations, { width: 200, height: 120 });
        const second = layoutScene3DAnnotations(annotations, { width: 200, height: 120 });
        expect(first).toEqual(second);
        expect(first[0].displaced).toBe(false);
        expect(first[1].displaced).toBe(true);
        expect(first[1].screen).not.toEqual(first[0].screen);
    });

    test("applies retained hide, fade, and show policies to depth-occluded annotations", () => {
        const plan = trianglePlan();
        const matrix = webGLPlanMatrix(plan);
        const behind = projectScene3DPoint(matrix, [0, 0, -1], plan.viewport);
        const annotations = [
            { primitive: 1, visible: true, screen: behind.screen, depth: behind.depth, policy: { occlusion: "hide" } },
            { primitive: 2, visible: true, screen: behind.screen, depth: behind.depth, policy: { occlusion: "fade" } },
            { primitive: 3, visible: true, screen: behind.screen, depth: behind.depth, policy: { occlusion: "show" } },
        ];
        const resolved = resolveScene3DAnnotationOcclusion(plan, matrix, annotations);
        expect(resolved[0]).toMatchObject({ occluded: true, visible: false });
        expect(resolved[1]).toMatchObject({ occluded: true, visible: true });
        expect(resolved[2]).toMatchObject({ occluded: false, visible: true });
    });
});
