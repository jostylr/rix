---
title: Construct an exact circumcircle
description: Build a perpendicular bisector and circumcircle, then render the exact construction through portable Graphics.
theme: Graphics and geometry
status: implemented
plugin: geometry
---

## Build a ruler-and-compass construction

The mathematical points, lines, and circle retain rational coordinates and
construction provenance. `Draw` is an explicit snapshot step that lowers those
values to the same core Graphic understood by SVG and Canvas.

```rix
.Plugin.Load("geometry");
a := .geometry.Point(0, 0);
b := .geometry.Point(6, 0);
c := .geometry.Point(2, 4);
abBisector := .geometry.PerpendicularBisector(a, b);
circumcircle := .geometry.Circumcircle(a, b, c);
construction := .geometry.Draw(
    [abBisector, circumcircle, a, b, c],
    {= view=[-1,-2,7,6], size=[560,560] }
);
construction;
```

## Explore a retained construction interactively

The workbench uses the same construction graph for dependency inspection and
rendering. A `DragPoint` captures the reactive identity directly and declares
the mathematical view used to map pointer positions back to exact rational
coordinates.

```rix
.Plugin.Load("geometry");
view := [-2,-2,6,4]; size := [640,480];
$$a := {: 0,0};
$$graph := .geometry.ConstructionGraph([
  {= id=:a,free=1,value=.geometry.Point($a[1],$a[2]) },
  {= id=:b,dependsOn=[:a],construct=(values)->
      .geometry.Point(values[:a][:x]+3,values[:a][:y]+1) },
  {= id=:ab,dependsOn=[:a,:b],construct=(values)->
      .geometry.Line(values[:a],values[:b]) }
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

RiX Web supplies the object tree, property inspector, keyboard traversal,
session movement history, and export button. The same value still renders as
ordinary Graphics in static hosts.

## Keep unresolved intersections visible

Parallel lines return an intersection result whose status is `parallel`.
Including that result in a drawing produces a visible diagnostic rather than a
fabricated point.

```rix
.Plugin.Load("geometry");
first := .geometry.Line(.geometry.Point(0, 0), .geometry.Point(4, 0));
second := .geometry.Line(.geometry.Point(0, 2), .geometry.Point(4, 2));
unresolved := .geometry.Intersect(first, second);
status := .geometry.Status(unresolved);
.geometry.Draw([first, second, unresolved], {= view=[-1,-1,5,3], size=[600,400] });
```

## Transform a polygon and check a constraint

Transforms preserve exact coordinates. Constraints retain their exact
residual instead of turning a drawing into a Boolean-only result.

```rix
.Plugin.Load("geometry");
a := .geometry.Point(0,0);
b := .geometry.Point(4,0);
c := .geometry.Point(1,3);
triangle := .geometry.Polygon([a,b,c]);
shiftAndScale := .geometry.Affine([[3/2,0,1],[0,3/2,2]]);
moved := .geometry.Transform(triangle,shiftAndScale);
base := .geometry.Line(a,b);
onBase := .geometry.Constraint(:onLine,[.geometry.Point(2,0),base]);
.geometry.Draw([triangle,moved],{= view=[-1,-1,8,8],size=[560,560] });
```

## Measure and rotate without binary floats

Named measurements preserve the geometry kernel's exact/certified split.
Arbitrary rotations accept radians, degrees, or fractions of a turn.

```rix
.Plugin.Load("geometry");
origin := .geometry.Point(0,0);
p := .geometry.Point(4,0);
segment := .geometry.Segment(origin,p);
length := .numerics.Refine(.geometry.Length(segment),{=
  absoluteWidth=1/1000,maxWork=32
});
rotation := .geometry.Rotate(origin,1/6,:turns);
image := .geometry.Transform(p,rotation);
.Fragment([
  .Table(["quantity","value"],[["squared length",.geometry.SquaredDistance(origin,p)],["length candidate",length[:approximation].Candidate()]]),
  .geometry.Draw([p,image],{= view=[-1,-1,5,5],size=[360,360] })
]);
```

Quarter turns are rational affine maps. Rational fractions of a turn carry
exact algebraic coordinates; arbitrary radians carry certified-real
coordinates and can be refined or drawn.

## Explore the algebraic lane

A compass construction may leave rational coordinates without leaving exact
mathematics. The diagonal through a rational circle meets it at coordinates
involving `sqrt(2)`. Exact polynomial certificates decide the intersection
topology and retain exact algebraic points.

```rix
.Plugin.Load("geometry");
circle := .geometry.Circle(.geometry.Point(0,0),2);
diagonal := .geometry.Line(.geometry.Point(-2,-2),.geometry.Point(2,2));
meeting := .geometry.Intersect(diagonal,circle);
eighthTurn := .geometry.CircularAngle(1/8,:turns);
{=
  intersectionStatus=meeting[:status],
  coordinateDomain=meeting[:points][1][:coordinateDomain],
  angleTurns=eighthTurn[:turns],
  angleDomain=eighthTurn[:coordinateDomain]
};
```

A rational turn is exact circular data. Its sine and cosine are algebraic
because they are coordinates of a root of unity. The nonzero radian magnitude
`2*pi*p/q` is transcendental, so the plugin does not mislabel it as an
algebraic real. A rational number supplied directly in radians is generally
not a rational turn and stays on the general certified lane.

Algebraic coefficients make intersection equality, sign, and multiplicity
decidable. With arbitrary certified-real coefficients, interval refinement can
prove separation from zero but cannot always prove exact zero. Those
intersections explicitly return `undecided` with evidence when their budget is
exhausted.

## Inspect certified intersection decisions

Line-conic intersections retain both the exact discriminant sign and the Sturm
root-count certificate used to classify the result.

```rix
.Plugin.Load("geometry");
circle := .geometry.Circle(.geometry.Point(0,0),1);
line := .geometry.Line(.geometry.Point(-2,2),.geometry.Point(2,2));
intersection := .geometry.Intersect(line,circle);
{=
  status=intersection[:status],
  discriminantSign=intersection[:evidence][:discriminantSign],
  rootCount=intersection[:evidence][:rootCount]
};
```

## Refine an implicit conic with bounded work

The implicit value stays mathematical and serializable. `Refine` creates one
portable snapshot for the requested viewport while retaining work and
uncertainty records.

```rix
.Plugin.Load("geometry");
ellipse := .geometry.Implicit({=
  coefficients=[1,0,4,0,0,-4],
  domain=[-3,-2,3,2],
  style={= stroke="#0f766e",width=2 }
});
result := .geometry.Refine(ellipse,{=
  viewport={= x=[-3,3],y=[-2,2] },
  size=[600,400],
  tolerance=1/8,
  maxWork=1200
});
.Fragment([
  .Figure(result[:graphic],"Bounded implicit ellipse"),
  .Table({= columns=["resolved","uncertain cells","work"],rows=[[
    result[:resolved],result[:uncertainty].Len(),result[:work][:cells]
  ]] })
]);
```
