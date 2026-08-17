# `.geometry`

The implementation is pure RiX and creates immutable exact 2D geometry without
coupling mathematical objects to a renderer. Alongside rational points, lines,
circles, and ruler-and-compass constructions, Phase 2 adds segments, rays,
polygons, affine/projective transforms, conics, loci, constraints, and bounded
implicit refinement.

```rix
.Plugin.Load("geometry");
a := .geometry.Point(0, 0);
b := .geometry.Point(6, 0);
c := .geometry.Point(2, 4);
circle := .geometry.Circumcircle(a, b, c);
.geometry.Draw([a, b, c, circle], {= view=[-1,-1,7,5], size=[640,480] });
```

## Values and exactness

`Point`, `Line`, and `Circle` values use schema `rix.geometry@1`. Coordinates,
line coefficients, and a circle's squared radius remain exact integers or
rationals. A circle stores `radiusSquared`, avoiding an unnecessary binary
floating-point square root in the semantic value.

`Intersect` returns `rix.geometry.intersection@1`. Line-line, line-circle,
line-conic, and circle-circle intersections report statuses such as `one`,
`two`, `none`, `parallel`, or `coincident`. The substituted quadratic is a
canonical `.poly` value. Perfect-square roots remain exact; irrational roots
carry a certified Numerics enclosure and work record with their rational
display candidate. `Points(result)` and `Status(result)` expose the result.

Every derived object records its construction operation and inputs in
`provenance`. `Circumcircle` retains both perpendicular bisectors and their
intersection in that provenance.

## Drawing

`Draw(objects, options?)` lowers geometry to an ordinary core `Graphic` using a
uniform fit. Options are `view=[xmin,ymin,xmax,ymax]` and `size=[width,height]`.
The exact geometry remains unchanged. Projection arithmetic remains exact in
RiX; the explicit snapshot computes only a display-radius approximation through
the core square-root operation while retaining `radiusSquared` in the geometry.
Unresolved intersection results appear as red diagnostic text in the graphic.
The resulting Graphic works unchanged with the SVG and Canvas renderer plugins.

## Transformations, conics, and constraints

`Affine(matrix)` accepts a 2-by-3 or affine 3-by-3 exact matrix;
`Projective(matrix)` accepts an invertible 3-by-3 matrix. `Transform` handles
points, lines, segments, rays, and polygons under either transform. Affine
circle/conic transforms return a general exact Conic.

`Conic([A,B,C,D,E,F])` represents
`A*x^2+B*x*y+C*y^2+D*x+E*y+F=0`. `Ellipse`, `Parabola`, and `Hyperbola` are
exact conveniences. `Constraint` currently evaluates `:onLine`,
`:equidistant`, `:parallel`, and `:perpendicular` residuals; `Constraints`
collects them without pretending that checking a supplied construction is a
general constraint solver.

## Bounded refinement

`Implicit({= coefficients=..., domain=... })` retains a serializable conic
equation; `fn`/`function` may instead hold a callable, marked non-serializable.
`Locus(fn, domain)` retains a parametric curve. `Refine(value, request)` returns
`rix.geometry.refinement@1` with `graphic`, `resolved`, `uncertainty`, `work`,
`request`, and `source`. Requests accept `viewport` or `view`, `size`,
`tolerance`, and `maxWork`. The Phase 2 sampler is bounded and makes ambiguous
cells or reduced work resolution visible; topology certification remains Phase
3 work.

See [tutorial.md](tutorial.md) for a complete construction.
