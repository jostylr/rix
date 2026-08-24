import { describe, expect, test } from "bun:test";
import { webGLPlanMatrix } from "../../plugins/render-webgl/webgl-plan.js";
import {
    createScene3DViewState,
    describeScene3DSelection,
    dollyScene3DCamera,
    orbitScene3DCamera,
    pickScene3DPlan,
    projectScene3DPoint,
    renderScene3DSvgFallback,
    resetScene3DCamera,
    toggleScene3DProjection,
    truckScene3DCamera,
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
});
