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
`Undo` and `Redo` replay that exact event history. `ConstructionRecord` removes
derived callbacks from the retained graph, and `ImportConstruction` restores a
record only when the caller explicitly supplies the constructors needed by its
derived nodes. The record therefore stays portable without serializing code or
silently freezing dependencies.

`Workbench(graph, options)` lowers every drawable node with a stable object id
and embeds the portable construction record in `rix.geometry.workbench@1`
metadata. RiX Web recognizes that metadata and adds an object/dependency tree,
exact property inspector, keyboard navigation, movement undo/redo, and JSON
export. Reactive point handles are created directly with `Graphics.DragPoint`
so the native constructor can retain `$$` identity, then passed as
`handles=[{= id=:a,graphic=handle }]`. Its `coordinateSystem` maps the exact
mathematical view into the uniform-fit drawing frame:

```rix
.Plugin.Load("geometry");
view := [-2,-2,6,4]; size := [640,480];
$$a := {: 0,0};
$$graph := .geometry.ConstructionGraph([
  {= id=:a,free=1,value=.geometry.Point($a[1],$a[2]) },
  {= id=:b,dependsOn=[:a],construct=(values)->
      .geometry.Point(values[:a][:x]+3,values[:a][:y]+1) }
]);
handle := .Graphics.DragPoint({=
  target=$$a,label="Move a",coordinateSystem={= view=view,size=size },
  style={= fill="#7c3aed",stroke="#ffffff",width=2,hitId="a:handle" }
});
$$workbench := .geometry.Workbench($graph,{=
  view=view,size=size,handles=[{= id=:a,graphic=handle }]
});
$workbench;
```

### Author exact free points from the canvas

`AddPoint(graph, point, options)` appends a real free construction node rather
than a browser-only mark. It allocates stable `p1`, `p2`, ... ids, supports an
exact rational `snap`, enforces `maxNodes`, clears the redo branch, and records
a reversible `:create` event. `Undo`, `Redo`, `ConstructionRecord`, and export
therefore see the same edit.

`Graphics.Action` accepts an optional `coordinateSystem`. A positioned action
receives `(current, point)`, where `point` is the exact rational tuple obtained
from the pointer or keyboard cursor. Because reactive `$$` identities may only
be captured by a direct host constructor, create the point, undo, and redo
actions directly, then pass them to `AuthoringWorkbench` in that order. Their
ids use the workbench `actionPrefix` plus `-point`, `-undo`, and `-redo`.

```rix
.Plugin.Load("geometry");
view := [-4,-3,4,3]; size := [640,480];
$$graph := .geometry.ConstructionGraph([]);
actions := [
  .Graphics.Action({=
    id="geometry-author-point",target=$$graph,
    action=(current,position)->.geometry.AddPoint(
      current,.geometry.Point(position[1],position[2]),{= snap=1/4,maxNodes=32 }
    ),
    label="Add an exact free point",coordinateSystem={= view=view,size=size },
    children=[.Graphics.Rectangle([0,0],size,{= fill="transparent",stroke="none" })]
  }),
  .Graphics.Action({= id="geometry-author-undo",target=$$graph,
    action=current->.geometry.Undo(current),children=[] }),
  .Graphics.Action({= id="geometry-author-redo",target=$$graph,
    action=current->.geometry.Redo(current),children=[] })
];
$$workbench := .geometry.AuthoringWorkbench($graph,actions,{=
  view=view,size=size,snap=1/4,maxNodes=32
});
$workbench;
```

RiX Web exposes the Point tool, keeps focus on the authoring surface across
reactive redraws, supports arrow-key cursor movement plus Enter/Space placement,
and routes its Undo/Redo buttons through the retained construction history.

The kernel also provides dependency-bearing authoring operations:

- `AddLine`, `AddCircle`, `AddIntersection`, `AddTransform`, and
  `AddMeasurement` allocate stable tool-specific ids and reversible create
  events.
- `ConstrainedDrag(...,{= constraint=:lineId,mode=:project })` uses exact
  orthogonal projection onto a retained line; `mode=:reject` refuses an
  off-constraint target.
- `DragMany` applies an array of `{= id=...,target=... }` moves atomically and
  stores one undo/redo event.
- `RepairSuggestions` returns deterministic, non-mutating advice for parallel,
  coincident, undecided, or unsupported intersection nodes.

Derived construction records remain deliberately explicit: importing one still
requires a constructor map for every id in `replayRequires`. This avoids
pretending executable construction callbacks are portable JSON. The current
browser authoring toolbar exposes point placement; hosts can bind the additional
kernel tools to their own selection UI through the same retained graph.

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
