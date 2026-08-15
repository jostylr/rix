/** Historical JavaScript reference for the pure-RiX geometry plugin. */

import { Integer, Rational } from "@ratmath/core";
import { createCircle, createGraphic, createPath, createTextMark } from "../../src/runtime/output.js";

export const GEOMETRY_SCHEMA = "rix.geometry@1";
export const INTERSECTION_SCHEMA = "rix.geometry.intersection@1";

const int = (value) => new Integer(BigInt(value));
const str = (value) => ({ type: "string", value: String(value) });
const seq = (values) => ({ type: "sequence", values });
const rixMap = (entries) => ({ type: "map", entries: new Map(entries) });

function sequence(value, label) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.values)) return value.values;
    if (Array.isArray(value?.elements)) return value.elements;
    throw new Error(`${label} must be a sequence`);
}

function entriesFor(args, positional, name) {
    if (args.length === 1 && args[0]?.type === "map" && args[0].entries instanceof Map) return args[0].entries;
    if (args.length > positional.length) throw new Error(`${name} received too many arguments`);
    const entries = new Map(positional.slice(0, args.length).map((key, index) => [key, args[index]]));
    const options = entries.get("options");
    if (options?.type === "map" && options.entries instanceof Map) {
        for (const [key, value] of options.entries) if (!entries.has(key)) entries.set(key, value);
    }
    return entries;
}

function field(entries, name, fallback = null) {
    if (!(entries instanceof Map)) return fallback;
    if (entries.has(name)) return entries.get(name);
    const canonical = String(name).toLowerCase();
    for (const [key, value] of entries) if (String(key).toLowerCase() === canonical) return value;
    return fallback;
}

function rational(value, label) {
    if (value instanceof Rational) return value;
    if (value instanceof Integer) return new Rational(value.value, 1n);
    throw new Error(`${label} must be an exact integer or rational`);
}

function number(value, label) {
    const exact = rational(value, label);
    const result = Number(exact.numerator) / Number(exact.denominator);
    if (!Number.isFinite(result)) throw new Error(`${label} is outside the snapshot renderer's finite numeric range`);
    if (exact.numerator !== 0n && result === 0) throw new Error(`${label} is below the snapshot renderer's finite numeric resolution`);
    return result;
}

function geometryValue(kind, fields) {
    return Object.freeze({
        type: "geometry",
        kind,
        schema: GEOMETRY_SCHEMA,
        ...fields,
        _ext: new Map([
            ["_type", str("geometry")],
            ["kind", str(kind)],
            ["immutable", int(1)],
        ]),
    });
}

function provenance(operation, inputs, details = null) {
    return Object.freeze({ operation, inputs: Object.freeze([...inputs]), details });
}

function requireGeometry(value, kind, label) {
    if (value?.type !== "geometry" || value.schema !== GEOMETRY_SCHEMA || (kind && value.kind !== kind)) {
        throw new Error(`${label} must be a geometry ${kind || "value"}`);
    }
    return value;
}

function sameExact(left, right) {
    return left.equals(right);
}

function samePoint(left, right) {
    return sameExact(left.x, right.x) && sameExact(left.y, right.y);
}

function negate(value) {
    return value.negate();
}

function pointValue(x, y, operation, inputs, metadata = null) {
    return geometryValue("point", {
        x,
        y,
        coordinates: Object.freeze([x, y]),
        metadata,
        provenance: Object.freeze([provenance(operation, inputs)]),
    });
}

export function createPoint(args) {
    let x;
    let y;
    let metadata = null;
    if (args.length === 1 && (Array.isArray(args[0]) || Array.isArray(args[0]?.values) || Array.isArray(args[0]?.elements))) {
        const coordinates = sequence(args[0], "geometry.Point coordinates");
        if (coordinates.length !== 2) throw new Error("geometry.Point coordinates must contain x and y");
        [x, y] = coordinates;
    } else {
        const entries = entriesFor(args, ["x", "y", "options"], "geometry.Point");
        x = field(entries, "x");
        y = field(entries, "y");
        metadata = field(entries, "metadata");
    }
    return pointValue(rational(x, "geometry.Point x"), rational(y, "geometry.Point y"), "Point", [x, y], metadata);
}

function lineFromCoefficients(a, b, c, through, operation, inputs, metadata = null, style = null) {
    if (a.numerator === 0n && b.numerator === 0n) throw new Error(`${operation} cannot produce a degenerate line`);
    return geometryValue("line", {
        a,
        b,
        c,
        through: Object.freeze(through),
        metadata,
        style,
        provenance: Object.freeze([provenance(operation, inputs)]),
    });
}

export function createLine(args) {
    const entries = entriesFor(args, ["first", "second", "options"], "geometry.Line");
    const first = requireGeometry(field(entries, "first"), "point", "geometry.Line first point");
    const second = requireGeometry(field(entries, "second"), "point", "geometry.Line second point");
    if (samePoint(first, second)) throw new Error("geometry.Line requires two distinct points");
    const a = first.y.subtract(second.y);
    const b = second.x.subtract(first.x);
    const c = first.x.multiply(second.y).subtract(second.x.multiply(first.y));
    return lineFromCoefficients(a, b, c, [first, second], "Line", [first, second], field(entries, "metadata"), field(entries, "style"));
}

function squaredDistance(first, second) {
    const dx = second.x.subtract(first.x);
    const dy = second.y.subtract(first.y);
    return dx.multiply(dx).add(dy.multiply(dy));
}

function circleValue(center, radiusSquared, through, operation, inputs, metadata = null, style = null) {
    if (radiusSquared.numerator <= 0n) throw new Error(`${operation} requires a positive radius`);
    return geometryValue("circle", {
        center,
        radiusSquared,
        through,
        metadata,
        style,
        provenance: Object.freeze([provenance(operation, inputs)]),
    });
}

export function createGeometryCircle(args) {
    const entries = entriesFor(args, ["center", "through", "options"], "geometry.Circle");
    const center = requireGeometry(field(entries, "center"), "point", "geometry.Circle center");
    const candidate = field(entries, "through");
    const explicitRadius = field(entries, "radius");
    const explicitSquared = field(entries, "radiusSquared");
    const specificationCount = [candidate, explicitRadius, explicitSquared].filter((value) => value !== null).length;
    if (specificationCount !== 1) {
        throw new Error("geometry.Circle requires exactly one through point, radius, or radiusSquared");
    }
    let through = null;
    let radiusSquared;
    if (candidate?.type === "geometry") {
        through = requireGeometry(candidate, "point", "geometry.Circle through point");
        radiusSquared = squaredDistance(center, through);
    } else if (explicitSquared !== null) {
        radiusSquared = rational(explicitSquared, "geometry.Circle radiusSquared");
    } else {
        const radius = rational(explicitRadius ?? candidate, "geometry.Circle radius");
        radiusSquared = radius.multiply(radius);
    }
    return circleValue(center, radiusSquared, through, "Circle", through ? [center, through] : [center, radiusSquared], field(entries, "metadata"), field(entries, "style"));
}

export function midpoint(args) {
    const entries = entriesFor(args, ["first", "second"], "geometry.Midpoint");
    const first = requireGeometry(field(entries, "first"), "point", "geometry.Midpoint first point");
    const second = requireGeometry(field(entries, "second"), "point", "geometry.Midpoint second point");
    const two = new Rational(2n, 1n);
    return pointValue(first.x.add(second.x).divide(two), first.y.add(second.y).divide(two), "Midpoint", [first, second]);
}

export function perpendicularBisector(args) {
    const entries = entriesFor(args, ["first", "second", "options"], "geometry.PerpendicularBisector");
    const first = requireGeometry(field(entries, "first"), "point", "geometry.PerpendicularBisector first point");
    const second = requireGeometry(field(entries, "second"), "point", "geometry.PerpendicularBisector second point");
    if (samePoint(first, second)) throw new Error("geometry.PerpendicularBisector requires two distinct points");
    const middle = midpoint([first, second]);
    const a = second.x.subtract(first.x);
    const b = second.y.subtract(first.y);
    const c = negate(a.multiply(middle.x).add(b.multiply(middle.y)));
    return lineFromCoefficients(a, b, c, [middle], "PerpendicularBisector", [first, second], field(entries, "metadata"), field(entries, "style"));
}

function intersectionValue(status, points, left, right, diagnostic) {
    return Object.freeze({
        type: "geometry_intersection",
        kind: "intersection",
        schema: INTERSECTION_SCHEMA,
        status,
        points: Object.freeze(points),
        exact: status !== "unsupported",
        diagnostic,
        provenance: Object.freeze([provenance("Intersect", [left, right], diagnostic)]),
        _ext: new Map([
            ["_type", str("geometry_intersection")],
            ["kind", str("intersection")],
            ["status", str(status)],
            ["immutable", int(1)],
        ]),
    });
}

function intersectLines(left, right) {
    const determinant = left.a.multiply(right.b).subtract(right.a.multiply(left.b));
    if (determinant.numerator === 0n) {
        const ac = left.a.multiply(right.c).subtract(right.a.multiply(left.c));
        const bc = left.b.multiply(right.c).subtract(right.b.multiply(left.c));
        if (ac.numerator === 0n && bc.numerator === 0n) {
            return intersectionValue("coincident", [], left, right, "Coincident lines have infinitely many intersections");
        }
        return intersectionValue("parallel", [], left, right, "Parallel lines do not intersect");
    }
    const x = left.b.multiply(right.c).subtract(right.b.multiply(left.c)).divide(determinant);
    const y = left.c.multiply(right.a).subtract(right.c.multiply(left.a)).divide(determinant);
    const point = pointValue(x, y, "LineIntersection", [left, right]);
    return intersectionValue("one", [point], left, right, null);
}

export function intersect(args) {
    const entries = entriesFor(args, ["left", "right"], "geometry.Intersect");
    const left = requireGeometry(field(entries, "left"), null, "geometry.Intersect left value");
    const right = requireGeometry(field(entries, "right"), null, "geometry.Intersect right value");
    if (left.kind === "line" && right.kind === "line") return intersectLines(left, right);
    return intersectionValue(
        "unsupported",
        [],
        left,
        right,
        `Phase 1 geometry.Intersect supports line-line intersections, not ${left.kind}-${right.kind}`,
    );
}

export function intersectionPoints(args) {
    const entries = entriesFor(args, ["intersection"], "geometry.Points");
    const value = field(entries, "intersection");
    if (value?.type !== "geometry_intersection" || value.schema !== INTERSECTION_SCHEMA) {
        throw new Error("geometry.Points requires a geometry intersection result");
    }
    return seq([...value.points]);
}

export function intersectionStatus(args) {
    const entries = entriesFor(args, ["intersection"], "geometry.Status");
    const value = field(entries, "intersection");
    if (value?.type !== "geometry_intersection" || value.schema !== INTERSECTION_SCHEMA) {
        throw new Error("geometry.Status requires a geometry intersection result");
    }
    return str(value.status);
}

export function circumcircle(args) {
    const entries = entriesFor(args, ["first", "second", "third", "options"], "geometry.Circumcircle");
    const first = requireGeometry(field(entries, "first"), "point", "geometry.Circumcircle first point");
    const second = requireGeometry(field(entries, "second"), "point", "geometry.Circumcircle second point");
    const third = requireGeometry(field(entries, "third"), "point", "geometry.Circumcircle third point");
    const firstBisector = perpendicularBisector([first, second]);
    const secondBisector = perpendicularBisector([first, third]);
    const centerResult = intersect([firstBisector, secondBisector]);
    if (centerResult.status !== "one") {
        throw new Error(`geometry.Circumcircle requires three non-collinear points: ${centerResult.diagnostic}`);
    }
    return circleValue(
        centerResult.points[0],
        squaredDistance(centerResult.points[0], first),
        first,
        "Circumcircle",
        [first, second, third, firstBisector, secondBisector, centerResult],
        field(entries, "metadata"),
        field(entries, "style"),
    );
}

function numericSequence(value, length, label) {
    const values = sequence(value, label);
    if (values.length !== length) throw new Error(`${label} must contain ${length} values`);
    return values.map((item, index) => number(item, `${label} value ${index + 1}`));
}

function styleMap(value, defaults) {
    const supplied = value?.type === "map" && value.entries instanceof Map ? value.entries : new Map();
    return rixMap([...new Map([...defaults, ...supplied]).entries()]);
}

function lineEndpoints(line, view) {
    const [xmin, ymin, xmax, ymax] = view;
    const a = number(line.a, "geometry line coefficient a");
    const b = number(line.b, "geometry line coefficient b");
    const c = number(line.c, "geometry line coefficient c");
    const points = [];
    if (Math.abs(b) > Number.EPSILON) {
        for (const x of [xmin, xmax]) {
            const y = -(a * x + c) / b;
            if (y >= ymin - 1e-10 && y <= ymax + 1e-10) points.push([x, y]);
        }
    }
    if (Math.abs(a) > Number.EPSILON) {
        for (const y of [ymin, ymax]) {
            const x = -(b * y + c) / a;
            if (x >= xmin - 1e-10 && x <= xmax + 1e-10) points.push([x, y]);
        }
    }
    const unique = points.filter((point, index) => points.findIndex((candidate) =>
        Math.abs(candidate[0] - point[0]) < 1e-9 && Math.abs(candidate[1] - point[1]) < 1e-9) === index);
    return unique.slice(0, 2);
}

function drawableItems(value, label) {
    const values = Array.isArray(value) || Array.isArray(value?.values) || Array.isArray(value?.elements)
        ? sequence(value, label) : [value];
    return values.flatMap((item, index) => {
        if (item?.type === "geometry_intersection" && item.schema === INTERSECTION_SCHEMA) {
            return item.status === "one" ? item.points : [item];
        }
        if (item?.type !== "geometry" || item.schema !== GEOMETRY_SCHEMA) {
            throw new Error(`${label} ${index + 1} must be geometry or an intersection result`);
        }
        return [item];
    });
}

export function drawGeometry(args) {
    const entries = entriesFor(args, ["objects", "options"], "geometry.Draw");
    const items = drawableItems(field(entries, "objects"), "geometry.Draw object");
    const size = numericSequence(field(entries, "size", seq([int(640), int(480)])), 2, "geometry.Draw size");
    const view = numericSequence(field(entries, "view", seq([int(-10), int(-10), int(10), int(10)])), 4, "geometry.Draw view");
    const [xmin, ymin, xmax, ymax] = view;
    if (!(xmax > xmin) || !(ymax > ymin)) throw new Error("geometry.Draw view must satisfy xmin < xmax and ymin < ymax");
    if (!(size[0] > 0) || !(size[1] > 0)) throw new Error("geometry.Draw size must be positive");
    const scale = Math.min(size[0] / (xmax - xmin), size[1] / (ymax - ymin));
    const offsetX = (size[0] - (xmax - xmin) * scale) / 2;
    const offsetY = (size[1] - (ymax - ymin) * scale) / 2;
    const project = ([x, y]) => [offsetX + (x - xmin) * scale, size[1] - offsetY - (y - ymin) * scale];
    const children = [];
    let unresolved = 0;
    for (const item of items) {
        if (item.type === "geometry_intersection") {
            unresolved += 1;
            children.push(createTextMark([[12, 20 + unresolved * 18], item.diagnostic, styleMap(null, [["fill", "#b91c1c"], ["size", 13]])]));
        } else if (item.kind === "point") {
            children.push(createCircle([project([number(item.x, "geometry point x"), number(item.y, "geometry point y")]), 5,
                styleMap(item.style, [["fill", "#6d28d9"], ["stroke", "#ffffff"], ["width", 2]])]));
        } else if (item.kind === "line") {
            const endpoints = lineEndpoints(item, view);
            if (endpoints.length === 2) children.push(createPath([endpoints.map(project), styleMap(item.style, [["stroke", "#2563eb"], ["width", 2]])]));
        } else if (item.kind === "circle") {
            const center = project([number(item.center.x, "geometry circle center x"), number(item.center.y, "geometry circle center y")]);
            const radius = Math.sqrt(number(item.radiusSquared, "geometry circle radius squared")) * scale;
            children.push(createCircle([center, radius, styleMap(item.style, [["fill", "none"], ["stroke", "#d97706"], ["width", 2]])]));
        } else {
            throw new Error(`geometry.Draw does not support geometry kind '${item.kind}'`);
        }
    }
    return createGraphic([size, children, rixMap([
        ["source", str(GEOMETRY_SCHEMA)],
        ["projection", str("uniform-fit")],
        ["unresolved", int(unresolved)],
    ])]);
}
