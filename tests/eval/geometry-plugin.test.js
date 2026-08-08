import { describe, expect, test } from "bun:test";
import { Rational } from "@ratmath/core";
import { parseAndEvaluate } from "../../src/eval/evaluator.js";

describe("geometry Phase 1 plugin", () => {
    test("constructs an exact perpendicular bisector and circumcircle with provenance", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("geometry");
            a := .geometry.Point(0, 0);
            b := .geometry.Point(6, 0);
            c := .geometry.Point(2, 4);
            bisector := .geometry.PerpendicularBisector(a, b);
            circle := .geometry.Circumcircle(a, b, c);
            [a, bisector, circle, .geometry.Draw([bisector, circle, a, b, c], {= view=[-1,-2,7,6], size=[560,560] })];
        `);
        const [point, bisector, circle, graphic] = result.values;
        expect(point).toMatchObject({ type: "geometry", kind: "point", schema: "rix.geometry@1" });
        expect(point.x).toBeInstanceOf(Rational);
        expect(bisector).toMatchObject({ type: "geometry", kind: "line", schema: "rix.geometry@1" });
        expect(String(bisector.a)).toBe("6");
        expect(String(bisector.b)).toBe("0");
        expect(String(bisector.c)).toBe("-18");
        expect(String(circle.center.x)).toBe("3");
        expect(String(circle.center.y)).toBe("1");
        expect(String(circle.radiusSquared)).toBe("10");
        expect(circle.provenance[0].operation).toBe("Circumcircle");
        expect(circle.provenance[0].inputs).toHaveLength(6);
        expect(graphic).toMatchObject({ type: "output", kind: "graphic", size: [560, 560] });
        expect(graphic.children.map(({ kind }) => kind)).toEqual(["path", "circle", "circle", "circle", "circle"]);
    });

    test("returns exact line intersections and visible unresolved results", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("geometry");
            crossing := .geometry.Intersect(
                .geometry.Line(.geometry.Point(0,0), .geometry.Point(2,2)),
                .geometry.Line(.geometry.Point(0,2), .geometry.Point(2,0))
            );
            parallel := .geometry.Intersect(
                .geometry.Line(.geometry.Point(0,0), .geometry.Point(2,0)),
                .geometry.Line(.geometry.Point(0,1), .geometry.Point(2,1))
            );
            [.geometry.Points(crossing), .geometry.Status(parallel), parallel,
             .geometry.Draw([parallel], {= view=[0,0,2,2], size=[200,200] })];
        `);
        const [points, status, parallel, graphic] = result.values;
        expect(points.values).toHaveLength(1);
        expect(String(points.values[0].x)).toBe("1");
        expect(String(points.values[0].y)).toBe("1");
        expect(status.value).toBe("parallel");
        expect(parallel).toMatchObject({
            type: "geometry_intersection",
            schema: "rix.geometry.intersection@1",
            status: "parallel",
            points: [],
            exact: true,
        });
        expect(parallel.diagnostic).toContain("do not intersect");
        expect(graphic.children[0]).toMatchObject({ kind: "text_mark" });
    });

    test("renders the same Graphic through SVG and Canvas and rejects malformed constructions", () => {
        const rendered = parseAndEvaluate(`
            .Plugin.Load("geometry"); .Plugin.Load("svg"); .Plugin.Load("canvas");
            p := .geometry.Point(0,0);
            q := .geometry.Point(2,0);
            graphic := .geometry.Draw([p, q, .geometry.Circle(p, q)], {= view=[-1,-1,3,3], size=[240,240] });
            [.svg.Render(graphic).Get("content"), .canvas.Render(graphic).Get("content")];
        `);
        expect(rendered.values[0].value).toContain("<svg");
        expect(rendered.values[0].value).toContain("<circle");
        const plan = JSON.parse(rendered.values[1].value);
        expect(plan.schema).toBe("rix.canvas-plan@1");
        expect(plan.commands.filter(([op]) => op === "circle")).toHaveLength(3);

        expect(() => parseAndEvaluate(`
            .Plugin.Load("geometry");
            p := .geometry.Point(1,1);
            .geometry.Line(p,p);
        `)).toThrow("two distinct points");
        expect(() => parseAndEvaluate(`
            .Plugin.Load("geometry");
            .geometry.Circumcircle(.geometry.Point(0,0), .geometry.Point(1,0), .geometry.Point(2,0));
        `)).toThrow("three non-collinear points");
        const unsupported = parseAndEvaluate(`
            .Plugin.Load("geometry");
            center := .geometry.Point(0,0);
            .geometry.Intersect(.geometry.Circle(center, 1), .geometry.Circle(center, 2));
        `);
        expect(unsupported).toMatchObject({ status: "unsupported", exact: false, points: [] });
        expect(unsupported.diagnostic).toContain("line-line intersections");
    });
});
