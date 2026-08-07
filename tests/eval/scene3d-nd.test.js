import { describe, expect, test } from "bun:test";
import { Rational } from "@ratmath/core";
import { parseAndEvaluate } from "../../src/eval/evaluator.js";

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
        expect(result.values[0].vertices[1][0]).toBeInstanceOf(Rational);
        expect(String(result.values[0].vertices[1][0])).toBe("1/3");
        expect(result.values[1]).toMatchObject({ type: "output", kind: "graphic", size: [320, 240] });
        expect(result.values[1].children).toHaveLength(3);
        expect(result.values[2].value).toBe(3n);
        expect(result.values[3].value).toBe("wireframe");
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
        expect(cube).toMatchObject({ kind: "polytope", dimension: 4 });
        expect(cube.vertices).toHaveLength(16);
        expect(cube.edges).toHaveLength(32);
        expect(rotate.matrix[0].map(String)).toEqual(["4/5", "0", "0", "-3/5"]);
        expect(projected.dimension).toBe(3);
        expect(projected.provenance).toHaveLength(1);
        expect(projected.vertices.every((vertex) => vertex.every((coordinate) => coordinate instanceof Rational))).toBe(true);
        expect(scene).toMatchObject({ type: "output", kind: "scene3d", schema: "rix.scene3d@1" });
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
            mesh := .scene3d.Mesh([[0,0,0], [1,0,0], [0,1,0]], [[1,2,3]]);
            .gltf.Render(.scene3d.Scene([mesh]));
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
    });
});

