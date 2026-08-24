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

    test("provides exact measurements, centers, line constructors, and validated polygon area", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("geometry");
            a := .geometry.Point(0,0); b := .geometry.Point(4,0); c := .geometry.Point(0,3);
            triangle := .geometry.Polygon([a,b,c]); segment := .geometry.Segment(b,c);
            center := .geometry.Centroid(a,b,c); orthocenter := .geometry.Orthocenter(a,b,c);
            perpendicular := .geometry.Perpendicular(.geometry.Line(a,b),c);
            parallel := .geometry.ParallelThrough(.geometry.Line(a,b),c);
            length := .numerics.Refine(.geometry.Length(segment), {= absoluteWidth=1/1000000,maxWork=64 });
            [.geometry.SquaredDistance(b,c), .geometry.Area(triangle), center, orthocenter,
             perpendicular, parallel, length[:approximation].Candidate(), a[:x] == 0];
        `);
        expect(result.values.slice(0, 2).map(String)).toEqual(["25", "6"]);
        expect(String(field(result.values[2], "x"))).toBe("4/3");
        expect(String(field(result.values[2], "y"))).toBe("1");
        expect(String(field(result.values[3], "x"))).toBe("0");
        expect(String(field(result.values[3], "y"))).toBe("0");
        expect(String(field(result.values[4], "b"))).toBe("0");
        expect(String(field(result.values[5], "a"))).toBe("0");
        expect(result.values[6].toNumber()).toBeCloseTo(5, 10);
        expect(result.values[7].value).toBe(1n);

        expect(() => parseAndEvaluate(`
            .Plugin.Load("geometry");
            .geometry.Area(.geometry.Polygon([
              .geometry.Point(0,0),.geometry.Point(2,2),.geometry.Point(0,2),.geometry.Point(2,0)
            ]));
        `)).toThrow(/simple polygon/i);
        expect(() => parseAndEvaluate(`
            .Plugin.Load("geometry");
            .geometry.Orthocenter(.geometry.Point(0,0),.geometry.Point(1,1),.geometry.Point(2,2));
        `)).toThrow(/non-collinear/i);
    });

    test("constructs exact and certified rotations from degrees, radians, and turns", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("geometry");
            origin := .geometry.Point(0,0); point := .geometry.Point(4,0);
            degreePoint := .geometry.Transform(point,.geometry.Rotate(origin,90,:degrees));
            exactRadianPoint := .geometry.Transform(point,.geometry.Rotate(origin,.Exact[:pi]/2,:radians));
            turnPoint := .geometry.Transform(point,.geometry.Rotate(origin,1/6,:turns));
            radianPoint := .geometry.Transform(point,.geometry.Rotate(origin,1,:radians));
            turnX := .numerics.Refine(turnPoint[:x], {= absoluteWidth=1/1000,maxWork=24 })[:approximation].Candidate();
            turnY := .numerics.Refine(turnPoint[:y], {= absoluteWidth=1/1000,maxWork=24 })[:approximation].Candidate();
            [degreePoint, exactRadianPoint, turnPoint[:coordinateDomain], turnX, turnY, radianPoint[:coordinateDomain],
             .geometry.Draw([turnPoint], {= view=[-5,-5,5,5],size=[200,200] })];
        `);
        const degreePoint = result.values[0];
        expect(String(field(degreePoint, "x"))).toBe("0");
        expect(String(field(degreePoint, "y"))).toBe("4");
        expect(String(field(result.values[1], "x"))).toBe("0");
        expect(String(field(result.values[1], "y"))).toBe("4");
        expect(text(result.values[2])).toBe("algebraicReal");
        expect(result.values[3].toNumber()).toBeCloseTo(2, 2);
        expect(result.values[4].toNumber()).toBeCloseTo(2 * Math.sqrt(3), 2);
        expect(text(result.values[5])).toBe("certifiedReal");
        expect(result.values[6]).toMatchObject({ type: "output", kind: "graphic" });
    }, 30000);

    test("draws both points from a two-intersection result", () => {
        const graphic = parseAndEvaluate(`
            .Plugin.Load("geometry");
            circle := .geometry.Circle({= center=.geometry.Point(0,0),radiusSquared=4 });
            crossing := .geometry.Intersect(.geometry.Line(.geometry.Point(-3,0),.geometry.Point(3,0)),circle);
            .geometry.Draw([crossing], {= view=[-3,-3,3,3],size=[240,240] });
        `);
        expect(graphic.children.filter(({ kind }) => kind === "circle")).toHaveLength(2);
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
            miss := .geometry.Intersect(
                .geometry.Line(.geometry.Point(-2,2),.geometry.Point(2,2)),
                circle
            );
            [ellipse,crossing,oblique,miss];
        `);
        const [ellipse, crossing, oblique, miss] = result.values;
        expect(text(field(ellipse, "kind"))).toBe("conic");
        expect(text(field(ellipse, "conicKind"))).toBe("ellipse");
        expect(field(ellipse, "coefficients").values.map(String)).toEqual(["1", "0", "4", "0", "0", "-4"]);
        expect(text(field(crossing, "status"))).toBe("two");
        expect(field(crossing, "points").values.map((point) => String(field(point, "x")))).toEqual(["-1", "1"]);
        expect(field(crossing, "exact").value).toBe(1n);
        expect(text(field(oblique, "status"))).toBe("two");
        expect(field(oblique, "evidence")).not.toBeNull();
        const crossingEvidence = field(crossing, "evidence");
        expect(text(field(field(crossingEvidence, "rootCount"), "schema"))).toBe("rix.exact.root-count@1");
        expect(String(field(field(crossingEvidence, "rootCount"), "count"))).toBe("2");
        expect(text(field(field(crossingEvidence, "discriminantSign"), "sign"))).toBe("positive");
        expect(text(field(miss, "status"))).toBe("none");
        expect(String(field(field(field(miss, "evidence"), "rootCount"), "count"))).toBe("0");
        expect(text(field(field(field(miss, "evidence"), "discriminantSign"), "sign"))).toBe("negative");
    }, 30000);

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

    test("uses exact algebraic coordinates for circular angles, centers, bisectors, and intersections", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("geometry");
            o=.geometry.Point(0,0); a=.geometry.Point(4,0); b=.geometry.Point(0,3);
            angle=.geometry.CircularAngle(1/8,:turns);
            measured=.geometry.Angle(a,o,b);
            incenter=.geometry.Incenter(o,a,b);
            bisector=.geometry.AngleBisector(a,o,b);
            circle=.geometry.Circle(o,1);
            diagonal=.geometry.Line(.geometry.Point(-2,-2),.geometry.Point(2,2));
            crossing=.geometry.Intersect(diagonal,circle);
            {:
              angle[:coordinateDomain],.ar.Compare(angle[:cosine],angle[:sine]),
              measured[:orientation],.ar.CompareRational(measured[:cosine],0),
              .ar.CompareRational(incenter[:x],1),.ar.CompareRational(incenter[:y],1),
              .ar.Sign(bisector[:a]+bisector[:b]),crossing[:status],crossing[:exact],
              crossing[:points][1][:coordinateDomain]
            }
        `);
        expect(result.values.slice(0, 4).map(text)).toEqual([
            "algebraicReal", "equal", "unoriented", "equal",
        ]);
        expect(result.values.slice(4, 7).map(text)).toEqual(["equal", "equal", "zero"]);
        expect(text(result.values[7])).toBe("two");
        expect(result.values[8].value).toBe(1n);
        expect(text(result.values[9])).toBe("algebraicReal");
    }, 60000);

    test("returns decided or explicitly undecided results for general certified intersections", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("geometry");
            o=.geometry.Point(0,0);
            base=.geometry.Line(.geometry.Point(-2,0),.geometry.Point(2,0));
            rotated=.geometry.Transform(base,.geometry.Rotate(o,1,:radians));
            vertical=.geometry.Line(.geometry.Point(0,-2),.geometry.Point(0,2));
            crossing=.geometry.Intersect(rotated,vertical);
            {: crossing[:status],crossing[:exact],crossing[:points].Len(),crossing[:evidence][:determinantSign][:sign] };
        `);
        expect(text(result.values[0])).toBe("one");
        expect(result.values[1].value).toBe(0n);
        expect(result.values[2].value).toBe(1n);
        expect(["positive", "negative"]).toContain(text(result.values[3]));
    }, 30000);

    test("preserves uncertain-point dependencies and deterministic drag history", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("geometry");
            uncertain=.geometry.UncertainPoint({=
              center=.geometry.Point(0,0),
              generators=[{= id=:t,dx=1,dy=1,interval=(-1):1 }]
            });
            shifted=.geometry.TransformUncertain(uncertain,.geometry.Translate(3,0));
            disjoint=.geometry.UncertainPoint(.geometry.Point(10,0),[]);
            relation=.geometry.Intersect(shifted,disjoint);
            graph=.geometry.ConstructionGraph([
              {= id=:a,free=1,value=.geometry.Point(0,0) },
              {= id=:b,dependsOn=[:a],construct=(values)->.geometry.Point(values[:a][:x]+1,values[:a][:y]) }
            ]);
            moved=.geometry.Drag(graph,:a,.geometry.Point(3/5,1/5),{= snap=1/2 });
            bounds=.geometry.UncertainBounds(shifted);
            {: bounds[:x],bounds[:y],relation[:status],moved[:values][:a][:coordinates],moved[:values][:b][:coordinates],moved[:history].Len() };
        `);
        expect(result.values[0].toString()).toBe("2:4");
        expect(result.values[1].toString()).toBe("-1:1");
        expect(text(result.values[2])).toBe("none");
        expect(result.values[3].values.map(String)).toEqual(["1/2", "0"]);
        expect(result.values[4].values.map(String)).toEqual(["3/2", "0"]);
        expect(result.values[5].value).toBe(1n);
    });

    test("provides a retained workbench record with reversible construction edits", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("geometry");
            $$a := {: 0,0};
            graph=.geometry.ConstructionGraph([
              {= id=:a,free=1,value=.geometry.Point($a[1],$a[2]) },
              {= id=:b,dependsOn=[:a],construct=(values)->.geometry.Point(values[:a][:x]+1,values[:a][:y]+1) }
            ]);
            moved=.geometry.Drag(graph,:a,.geometry.Point(1/2,1/3));
            undone=.geometry.Undo(moved); redone=.geometry.Redo(undone);
            record=.geometry.ConstructionRecord(redone);
            imported=.geometry.ImportConstruction(record,{=
              b=(values)->.geometry.Point(values[:a][:x]+1,values[:a][:y]+1)
            });
            handle=.Graphics.DragPoint({=
              target=$$a,label="Move a",coordinateSystem={= view=[-2,-2,2,2],size=[400,400] },
              style={= hitId="a:handle" }
            });
            workbench=.geometry.Workbench(graph,{=
              handles=[{= id=:a,graphic=handle }],view=[-2,-2,2,2],size=[400,400]
            });
            {: moved,undone,redone,record,imported,workbench };
        `);
        const [moved, undone, redone, record, imported, workbench] = result.values;
        expect(field(moved, "history").values).toHaveLength(1);
        expect(field(undone, "history").values).toHaveLength(0);
        expect(field(undone, "future").values).toHaveLength(1);
        expect(field(field(redone, "values"), "b").entries.get("coordinates").values.map(String))
            .toEqual(["3/2", "4/3"]);
        expect(text(field(record, "schema"))).toBe("rix.geometry.construction-record@1");
        expect(field(record, "replayrequires").values.map(text)).toEqual(["b"]);
        expect(field(field(imported, "values"), "b").entries.get("coordinates").values.map(String))
            .toEqual(["3/2", "4/3"]);
        expect(workbench.kind).toBe("graphic");
        expect(workbench.children.map((child) => child.kind)).toEqual(["group", "group", "drag_point"]);
        expect(workbench.children[2].center).toEqual([200, 200]);
        const metadata = workbench.metadata.get("workbench");
        expect(text(field(metadata, "schema"))).toBe("rix.geometry.workbench@1");
        expect(field(metadata, "nodes").values).toHaveLength(2);
    });
});
