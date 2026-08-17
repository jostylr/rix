import { describe, expect, test } from "bun:test";
import { Rational } from "@ratmath/core";
import { parseAndEvaluate } from "../../src/eval/evaluator.js";

const field = (value, name) => value.entries.get(String(name).toLowerCase());
const text = (value) => value?.value;

describe("geometry plugin", () => {
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
        expect([text(field(point, "type")), text(field(point, "kind")), text(field(point, "schema"))])
            .toEqual(["geometry", "point", "rix.geometry@1"]);
        expect(field(point, "x")).toBeInstanceOf(Rational);
        expect([text(field(bisector, "type")), text(field(bisector, "kind")), text(field(bisector, "schema"))])
            .toEqual(["geometry", "line", "rix.geometry@1"]);
        expect(String(field(bisector, "a"))).toBe("6");
        expect(String(field(bisector, "b"))).toBe("0");
        expect(String(field(bisector, "c"))).toBe("-18");
        const center = field(circle, "center");
        expect(String(field(center, "x"))).toBe("3");
        expect(String(field(center, "y"))).toBe("1");
        expect(String(field(circle, "radiusSquared"))).toBe("10");
        const provenance = field(circle, "provenance").values[0];
        expect(text(field(provenance, "operation"))).toBe("Circumcircle");
        expect(field(provenance, "inputs").values).toHaveLength(6);
        expect(graphic).toMatchObject({ type: "output", kind: "graphic" });
        expect(graphic.size.map((value) => value.toNumber())).toEqual([560, 560]);
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
        expect(String(field(points.values[0], "x"))).toBe("1");
        expect(String(field(points.values[0], "y"))).toBe("1");
        expect(status.value).toBe("parallel");
        expect(text(field(parallel, "type"))).toBe("geometry_intersection");
        expect(text(field(parallel, "schema"))).toBe("rix.geometry.intersection@1");
        expect(text(field(parallel, "status"))).toBe("parallel");
        expect(field(parallel, "points").values).toEqual([]);
        expect(field(parallel, "exact").value).toBe(1n);
        expect(text(field(parallel, "diagnostic"))).toContain("do not intersect");
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
        const concentric = parseAndEvaluate(`
            .Plugin.Load("geometry");
            center := .geometry.Point(0,0);
            .geometry.Intersect(.geometry.Circle(center, 1), .geometry.Circle(center, 2));
        `);
        expect(text(field(concentric, "status"))).toBe("none");
        expect(field(concentric, "exact").value).toBe(1n);
        expect(field(concentric, "points").values).toEqual([]);
        expect(text(field(concentric, "diagnostic"))).toContain("Concentric circles");
    });

    test("Phase 2 adds segments, rays, polygons, exact transforms, and constraints", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("geometry");
            a := .geometry.Point(0,0);
            b := .geometry.Point(2,0);
            c := .geometry.Point(1,2);
            line := .geometry.Line(a,b);
            transform := .geometry.Affine([[2,0,3],[0,2,4]]);
            {:
                .geometry.Segment(a,b),
                .geometry.Ray(a,c),
                .geometry.Polygon([a,b,c]),
                .geometry.Transform(c,transform),
                .geometry.Constraint(:onLine,[.geometry.Point(1,0),line]),
                .geometry.Constraints([
                    .geometry.Constraint(:parallel,[line,.geometry.Line(.geometry.Point(0,1),.geometry.Point(2,1))])
                ])
            };
        `);
        const [segment, ray, polygon, point, constraint, constraints] = result.values;
        expect(text(field(segment, "kind"))).toBe("segment");
        expect(text(field(ray, "kind"))).toBe("ray");
        expect(field(polygon, "points").values).toHaveLength(3);
        expect([String(field(point, "x")), String(field(point, "y"))]).toEqual(["5", "8"]);
        expect(field(constraint, "satisfied").value).toBe(1n);
        expect(field(constraints, "satisfied").value).toBe(1n);
    });

    test("Phase 2 constructs conics and returns exact or certified intersections", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("geometry");
            center := .geometry.Point(0,0);
            axis := .geometry.Line(.geometry.Point(-2,0),.geometry.Point(2,0));
            circle := .geometry.Circle(center,1);
            ellipse := .geometry.Ellipse(center,[2,1]);
            crossing := .geometry.Intersect(axis,circle);
            oblique := .geometry.Intersect(
                .geometry.Line(.geometry.Point(-2,-2),.geometry.Point(2,2)),
                circle
            );
            [ellipse,crossing,oblique];
        `);
        const [ellipse, crossing, oblique] = result.values;
        expect(text(field(ellipse, "kind"))).toBe("conic");
        expect(text(field(ellipse, "conicKind"))).toBe("ellipse");
        expect(field(ellipse, "coefficients").values.map(String)).toEqual(["1", "0", "4", "0", "0", "-4"]);
        expect(text(field(crossing, "status"))).toBe("two");
        expect(field(crossing, "points").values.map((point) => String(field(point, "x")))).toEqual(["-1", "1"]);
        expect(field(crossing, "exact").value).toBe(1n);
        expect(text(field(oblique, "status"))).toBe("two");
        expect(field(oblique, "evidence")).not.toBeNull();
    });

    test("Phase 2 bounded implicit and locus refinement returns portable Graphics plus uncertainty", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("geometry");
            implicit := .geometry.Implicit({=
                coefficients=[1,0,1,0,0,-1],
                domain=[-2,-2,2,2]
            });
            locus := .geometry.Locus(t -> [t,t^2],[-2,2],{= samples=9 });
            [
                .geometry.Refine(implicit,{= size=[200,200],tolerance=1/2,maxWork=100 }),
                .geometry.Refine(locus,{= view=[-2,-1,2,5],size=[200,200] })
            ];
        `);
        const [implicit, locus] = result.values;
        expect(text(field(implicit, "schema"))).toBe("rix.geometry.refinement@1");
        expect(field(implicit, "graphic")).toMatchObject({ kind: "graphic" });
        expect(field(implicit, "graphic").children.length).toBeGreaterThan(0);
        expect(field(implicit, "uncertainty").values.length).toBeGreaterThan(0);
        expect(field(locus, "graphic")).toMatchObject({ kind: "graphic" });
        expect(field(locus, "graphic").children).toHaveLength(1);
    });
});
