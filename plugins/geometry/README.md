# `.geometry`

Creates immutable exact 2D geometry without coupling mathematical objects to a
renderer. Phase 1 provides rational points, lines, circles, midpoint and
perpendicular-bisector constructions, circumcircles, and exact line-line
intersection results.

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

`Intersect` returns `rix.geometry.intersection@1` with status `one`, `parallel`,
`coincident`, or `unsupported`. `Points(result)` returns its exact points and
`Status(result)` returns the status string. Parallel or coincident lines are
ordinary visible results, not guessed points or unbounded searches. Phase 1
explicitly reports circle intersections as unsupported.

Every derived object records its construction operation and inputs in
`provenance`. `Circumcircle` retains both perpendicular bisectors and their
intersection in that provenance.

## Drawing

`Draw(objects, options?)` lowers geometry to an ordinary core `Graphic` using a
uniform fit. Options are `view=[xmin,ymin,xmax,ymax]` and `size=[width,height]`.
The exact geometry remains unchanged; only this explicit snapshot adapter
converts exact coordinates and square roots to finite JavaScript numbers.
Unresolved intersection results appear as red diagnostic text in the graphic.
The resulting Graphic works unchanged with the SVG and Canvas renderer plugins.

See [tutorial.md](tutorial.md) for a complete construction.
