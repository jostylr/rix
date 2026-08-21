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

`Point`, `Line`, and `Circle` values use schema `rix.geometry@1`. Constructors
accept exact rational or algebraic-real coordinates and a circle stores
`radiusSquared`, avoiding an unnecessary binary floating-point square root.
Rational-turn rotations derive exact algebraic sine/cosine entries and carry
`coordinateDomain=:algebraicReal`; quarter turns stay rational. Arbitrary
radian rotations use `coordinateDomain=:certifiedReal` with refinable oracle
values rather than binary floats.

`SquaredDistance` returns an exact rational. `Distance` and `Length` always
return the same certified Numerics square-root value, including Pythagorean
cases; refine that value when a finite enclosure or display candidate is
needed. `Area` returns the nonnegative exact shoelace area after rejecting
self-intersecting or degenerate-edge polygons. `Centroid`, `Orthocenter`,
`Perpendicular`, and `ParallelThrough` provide named rational constructions.

`Intersect` returns `rix.geometry.intersection@1`. Line-line, line-circle,
line-conic, and circle-circle intersections report statuses such as `one`,
`two`, `none`, `parallel`, or `coincident`. The substituted quadratic is a
canonical `.poly` value. Perfect-square roots remain exact; irrational roots
carry a certified Numerics enclosure and work record with their rational
display candidate. Every line-conic result also retains the exact discriminant
sign witness and a Sturm certificate counting all distinct real parameter
roots; even a `none` result therefore carries positive proof rather than only a
status label. `Points(result)` and `Status(result)` expose the result.

Every derived object records its construction operation and inputs in
`provenance`. `Circumcircle` retains both perpendicular bisectors and their
intersection in that provenance.

## Drawing

`Draw(objects, options?)` lowers geometry to an ordinary core `Graphic` using a
uniform fit. Options are `view=[xmin,ymin,xmax,ymax]` and `size=[width,height]`.
The exact geometry remains unchanged. Projection arithmetic remains exact in
RiX; the explicit snapshot computes only a display-radius approximation through
the core square-root operation while retaining `radiusSquared` in the geometry.
One- and two-point intersection results expand to their visible points.
Unresolved intersection results appear as red diagnostic text in the graphic.
The resulting Graphic works unchanged with the SVG and Canvas renderer plugins.

## Transformations, conics, and constraints

`Affine(matrix)` accepts a 2-by-3 or affine 3-by-3 exact matrix;
`Projective(matrix)` accepts an invertible 3-by-3 matrix. `Transform` handles
points, lines, segments, rays, and polygons under either transform. Affine
circle/conic transforms return a general exact Conic.

`CircularAngle(value,unit)` accepts radians, degrees, or turns. Exact rational
degrees/turns retain a reduced rational-turn value with exact algebraic cosine
and sine; arbitrary radians retain a certified circular value. `Angle(a,v,b)`
returns a circular angle. `Incenter` and internal/external `AngleBisector`
construct exact algebraic results for rational/algebraic triangles.

`Translate(dx,dy)`, `RotateQuarterTurns(center,n)`, and
`ReflectAcross(line)` construct exact rational affine maps. `Rotate` accepts
`:radians`, `:degrees`, or `:turns`; for example,
`Rotate(origin,1/6,:turns)`. Rational-turn rotations use exact algebraic
sine/cosine values within an explicit denominator budget; arbitrary-radian
rotations remain certified. Exact algebraic intersections use decidable sign
predicates. General certified intersections return an evidence-bearing
`undecided` result if refinement cannot decide a zero determinant or
discriminant; they never infer topology from a display candidate.

`Conic([A,B,C,D,E,F])` represents
`A*x^2+B*x*y+C*y^2+D*x+E*y+F=0`. `Ellipse`, `Parabola`, and `Hyperbola` are
exact conveniences. `Constraint` currently evaluates `:onLine`,
`:equidistant`, `:parallel`, and `:perpendicular` residuals; `Constraints`
collects them without pretending that checking a supplied construction is a
general constraint solver.

## Uncertainty and dragging

`UncertainPoint` uses a separate `rix.geometry.uncertain-point@1` schema with
named affine generators. Reusing a generator id preserves correlation instead
of treating coordinate intervals as independent. `UncertainBounds` provides a
conservative box and `TransformUncertain` preserves generators through
rational affine transforms. Set-valued intersection currently decides
coincident/disjoint uncertain points and otherwise returns `undecided`.

`ConstructionGraph` evaluates named free and derived nodes in dependency
order. `Drag` commits a new value only to a free node, optionally snaps to an
exact rational grid, rebuilds descendants, and records deterministic history.
It is the exact controller foundation, not a general nonlinear constraint
solver or pointer UI.

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
