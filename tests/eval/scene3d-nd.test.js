import { describe, expect, test } from "bun:test";
import { Rational } from "@ratmath/core";
import { parseAndEvaluate } from "../../src/eval/evaluator.js";

const field = (value, name) => value.entries.get(name);
const sequence = (value) => value.values;
const text = (value) => value.value;
const integer = (value) => Number(value.value);

describe("Scene3D and n-dimensional geometry plugins", () => {
    test("retains exact mesh data and snapshots deterministically to Graphics", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("scene3d");
            mesh := .scene3d.Mesh(
                [[0,0,0], [1/3,0,0], [0,1,0]],
                [[1,2,3]],
                {= color="#123456", width=2 }
            );
            scene := .scene3d.Scene([mesh], {=
                camera=.scene3d.OrthographicCamera([3,3,2], [0,0,0])
            });
            snapshot := .scene3d.Snapshot(scene, {= size=[320,240] });
            [mesh, snapshot["value"], snapshot["work"]["segments"], snapshot["source"]["mode"]];
        `);
        const vertices = sequence(field(result.values[0], "vertices"));
        expect(sequence(vertices[1])[0]).toBeInstanceOf(Rational);
        expect(String(sequence(vertices[1])[0])).toBe("1/3");
        expect(result.values[1]).toMatchObject({ type: "output", kind: "graphic" });
        expect(result.values[1].size.map(String)).toEqual(["320", "240"]);
        expect(result.values[1].children).toHaveLength(3);
        expect(result.values[2].value).toBe(3n);
        expect(result.values[3].value).toBe("wireframe");
    });

    test("retains lights and produces a deterministic lit mesh snapshot", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("scene3d");
            mesh := .scene3d.Mesh(
                [[-1,-1,0], [1,-1,0], [0,1,0]],
                [[1,2,3]],
                {= color="#4080c0" }
            );
            ambient := .scene3d.AmbientLight("#ffffff", 1/4);
            sun := .scene3d.DirectionalLight([1,1,-2], {= intensity=3/4 });
            scene := .scene3d.Scene([mesh], {=
                camera=.scene3d.PerspectiveCamera([3,3,2], [0,0,0]),
                lights=[ambient, sun]
            });
            snapshot := .scene3d.Snapshot(scene, {= size=[240,180], mode="lit" });
            [ambient, sun, scene, snapshot];
        `);
        expect(text(field(result.values[0], "kind"))).toBe("ambient_light");
        expect(text(field(result.values[0], "color"))).toBe("#ffffff");
        expect(text(field(result.values[1], "kind"))).toBe("directional_light");
        expect(sequence(field(result.values[2], "lights"))).toHaveLength(2);
        const snapshot = result.values[3].entries;
        expect(snapshot.get("source").entries.get("mode").value).toBe("lit");
        expect(snapshot.get("work").entries.get("faces").value).toBe(1n);
        expect(snapshot.get("value").children[0]).toMatchObject({ kind: "path" });
    });

    test("lit snapshots normalize integer and rational shading intermediates across many faces", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("scene3d");
            mesh := .scene3d.Mesh(
                [
                    [-1,-1,0], [1,-1,0], [1,1,0], [-1,1,0],
                    [-1,-1,2], [1,-1,2], [1,1,2], [-1,1,2]
                ],
                [
                    [1,3,2], [1,4,3], [5,6,7], [5,7,8],
                    [1,2,6], [1,6,5], [2,3,7], [2,7,6],
                    [3,4,8], [3,8,7], [4,1,5], [4,5,8]
                ],
                {= color="#2563eb" }
            );
            scene := .scene3d.Scene([mesh], {=
                camera=.scene3d.PerspectiveCamera([5,4,7/2], [0,0,1]),
                lights=[
                    .scene3d.AmbientLight("#ffffff", 1/4),
                    .scene3d.DirectionalLight([2,-3,-4], {= intensity=3/4 })
                ]
            });
            .scene3d.Snapshot(scene, {= size=[320,240], mode="lit" });
        `);
        const snapshot = result.entries;
        expect(snapshot.get("work").entries.get("faces").value).toBe(12n);
        expect(snapshot.get("value").children).toHaveLength(12);
        expect(snapshot.get("value").children.every(({ style }) => /^#[0-9a-f]{6}$/.test(style.get("fill").value))).toBe(true);
    });

    test("realizes exact transforms before the camera projection boundary", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("scene3d");
            line := .scene3d.Polyline([[0,0,0], [1/3,0,0]]);
            scene := .scene3d.Scene([
                .scene3d.Transform([line], {= translate=[1/5,2/7,3/11] })
            ]);
            realized := .scene3d.Realize(scene);
            projected := .scene3d.Project(scene, {= camera=.scene3d.OrthographicCamera([3,3,2],[0,0,0]) });
            [realized["primitives"][1]["points"][2], realized["schema"], projected["schema"], projected["approximation"]["viewnormalization"]];
        `);
        expect(sequence(result.values[0]).map(String)).toEqual(["8/15", "2/7", "3/11"]);
        expect(text(result.values[1])).toBe("rix.scene3d.realized@1");
        expect(text(result.values[2])).toBe("rix.scene3d.projected@1");
        expect(text(result.values[3])).toBe("numerics-certified-sqrt");
    });

    test("Phase 2 curves, axes, annotations, orbit cameras, and picking stay portable", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("scene3d");
            curve := .scene3d.ParametricCurve(
                t -> [t, t^2, 0],
                0:1,
                {= samples=5, color="#7c3aed", id="curve", label="parabola" }
            );
            axes := .scene3d.Axes({= length=2, id="basis" });
            note := .scene3d.Annotation([1,1,1], "P", {= id="point.p", label="point P" });
            camera := .scene3d.OrbitCamera([1,2,3], {=
                radius=5, height=2, turn=1/3, projection="orthographic", scale=6
            });
            scene := .scene3d.Scene([curve, axes, note], {= camera=camera });
            realized := .scene3d.Realize(scene);
            snapshot := .scene3d.Snapshot(scene, {= size=[360,240] });
            [
                curve, camera, realized["picking"], snapshot["picking"],
                snapshot["work"]["annotations"], snapshot["value"]
            ];
        `);
        const [curve, camera, realizedPicking, projectedPicking, annotations, graphic] = result.values;
        expect(text(field(curve, "kind"))).toBe("polyline");
        expect(sequence(field(curve, "points")).map((point) => sequence(point).map(String))).toEqual([
            ["0", "0", "0"],
            ["1/4", "1/16", "0"],
            ["1/2", "1/4", "0"],
            ["3/4", "9/16", "0"],
            ["1", "1", "0"],
        ]);
        expect(text(field(field(curve, "metadata"), "producer"))).toBe("parametric_curve");
        expect(sequence(field(camera, "position")).map(String)).toEqual(["5", "5", "5"]);
        expect(text(field(field(camera, "orbit"), "schema"))).toBe("rix.scene3d.orbit@1");
        expect(field(realizedPicking, "curve")).not.toBeNull();
        expect(sequence(field(field(projectedPicking, "curve"), "indices"))).toHaveLength(4);
        expect(annotations.value).toBe(4n);
        expect(graphic.children.filter(({ kind }) => kind === "text_mark")).toHaveLength(4);
    });

    test("picking IDs are unique and Cayley infinity gives the orbit half-turn", () => {
        const orbit = parseAndEvaluate(`
            .Plugin.Load("scene3d");
            camera := .scene3d.OrbitCamera([0,0,0], {= radius=4, height=1, turn=.Complex[:infinity] });
            [camera["position"], camera["orbit"]["projectiveinfinity"]];
        `);
        expect(sequence(orbit.values[0]).map(String)).toEqual(["-4", "0", "1"]);
        expect(orbit.values[1].value).toBe(1n);

        expect(() => parseAndEvaluate(`
            .Plugin.Load("scene3d");
            first := .scene3d.Polyline([[0,0,0],[1,0,0]], {= id="duplicate" });
            second := .scene3d.PointCloud([[0,0,0]], {= id="duplicate" });
            .scene3d.Scene([first,second]);
        `)).toThrow("Duplicate Scene3D picking id 'duplicate'");
    });

    test("projects a tesseract exactly and records the projection chain", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("scene3d"); .Plugin.Load("nd");
            cube := .nd.Hypercube(4, 2);
            rotate := .nd.CayleyRotation(4, 1, 4, 1/3);
            xyz := .nd.CoordinateProjection(4, [1,2,3]);
            projected := .nd.Project(cube, .nd.Compose(xyz, rotate));
            scene := .nd.ToScene3D(projected);
            [cube, rotate, projected, scene];
        `);
        const [cube, rotate, projected, scene] = result.values;
        expect(text(field(cube, "kind"))).toBe("polytope");
        expect(integer(field(cube, "dimension"))).toBe(4);
        expect(sequence(field(cube, "vertices"))).toHaveLength(16);
        expect(sequence(field(cube, "edges"))).toHaveLength(32);
        const matrix = sequence(field(rotate, "matrix")).map(sequence);
        expect(matrix[0].map(String)).toEqual(["4/5", "0", "0", "-3/5"]);
        expect(integer(field(projected, "dimension"))).toBe(3);
        expect(sequence(field(projected, "provenance"))).toHaveLength(1);
        expect(sequence(field(projected, "vertices")).every((vertex) => sequence(vertex).every((coordinate) => coordinate instanceof Rational))).toBe(true);
        expect(text(field(scene, "type"))).toBe("output");
        expect(text(field(scene, "kind"))).toBe("scene3d");
        expect(text(field(scene, "schema"))).toBe("rix.scene3d@1");
        expect(text(field(field(scene, "realized"), "schema"))).toBe("rix.scene3d.realized@1");
    });

    test("represents Cayley projective infinity directly in RiX", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("scene3d"); .Plugin.Load("nd");
            rotation := .nd.CayleyRotation(3, 1, 2, .Complex[:infinity]);
            [rotation["matrix"][1], rotation["provenance"][1]["projectiveinfinity"]];
        `);
        expect(sequence(result.values[0]).map(String)).toEqual(["-1", "0", "0"]);
        expect(result.values[1].value).toBe(1n);
    });

    test("rejects implicit dimensional loss", () => {
        expect(() => parseAndEvaluate(`
            .Plugin.Load("scene3d"); .Plugin.Load("nd");
            .nd.ToScene3D(.nd.Hypercube(4));
        `)).toThrow("explicitly project dimension 4 first");
    });

    test("exports valid embedded glTF with an explicit Z-up to Y-up convention", () => {
        const rendered = parseAndEvaluate(`
            .Plugin.Load("scene3d"); .Plugin.Load("gltf");
            mesh := .scene3d.Mesh(
                [[0,0,0], [1,0,0], [0,1,0]],
                [[1,2,3]],
                {= id="triangle", label="Exact triangle" }
            );
            note := .scene3d.Annotation([0,0,0], "origin", {= id="origin" });
            .gltf.Render(.scene3d.Scene([mesh, note]));
        `);
        const gltf = JSON.parse(rendered.entries.get("content").value);
        expect(gltf.asset.version).toBe("2.0");
        expect(gltf.meshes[0].primitives[0].mode).toBe(4);
        expect(gltf.buffers[0].uri).toStartWith("data:application/octet-stream;base64,");
        expect(gltf.extras.rix).toEqual({
            schema: "rix.scene3d@1",
            sourceCoordinates: "right-handed Z-up",
            exportedCoordinates: "right-handed Y-up",
        });
        expect(gltf.nodes[0]).toMatchObject({
            name: "Exact triangle",
            extras: { rix: { pickid: "triangle" } },
        });
        expect(gltf.nodes).toHaveLength(1);
        const diagnostics = sequence(rendered.entries.get("diagnostics"));
        expect(diagnostics.map((entry) => text(field(entry, "code")))).toContain("gltf-annotations-not-exported");
    });
});
