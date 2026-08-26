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
a1 := .geometry.Point(0, 0);
b1 := .geometry.Point(6, 0);
c1 := .geometry.Point(2, 4);
abBisector1 := .geometry.PerpendicularBisector(a1, b1);
circumcircle1 := .geometry.Circumcircle(a1, b1, c1);
construction1 := .geometry.Draw(
    [abBisector1, circumcircle1, a1, b1, c1],
    {= view=[-1,-2,7,6], size=[560,560] }
);
construction1;
```

## Explore a retained construction interactively

The workbench uses the same construction graph for dependency inspection and
rendering. A `DragPoint` captures the reactive identity directly and declares
the mathematical view used to map pointer positions back to exact rational
coordinates.

```rix
.Plugin.Load("geometry");
view2 := [-2,-2,6,4]; size2 := [640,480];
$$a2 := {: 0,0};
$$graph2 := .geometry.ConstructionGraph([
  {= id=:a,free=1,value=.geometry.Point($a2[1],$a2[2]) },
  {= id=:b,dependsOn=[:a],construct=(values)->
      .geometry.Point(values[:a][:x]+3,values[:a][:y]+1) },
  {= id=:ab,dependsOn=[:a,:b],construct=(values)->
      .geometry.Line(values[:a],values[:b]) }
]);
handle2 := .Graphics.DragPoint({=
  target=$$a2,label="Move a",coordinateSystem={= view=view2,size=size2 },
  style={= fill="#7c3aed",stroke="#ffffff",width=2,hitId="a:handle" }
});
$$workbench2 := .geometry.Workbench($graph2,{=
  view=view2,size=size2,handles=[{= id=:a,graphic=handle2 }]
});
$workbench2;
```

RiX Web supplies the object tree, property inspector, keyboard traversal,
session movement history, and export button. The same value still renders as
ordinary Graphics in static hosts.

## Add exact free points from the canvas

Positioned `Graphics.Action` nodes translate a pointer or keyboard cursor
through the declared mathematical coordinate system before invoking their RiX
callback. The point tool below appends a retained free node; its companion
actions replay the same exact create history.

```rix
.Plugin.Load("geometry");
view3 := [-4,-3,4,3]; size3 := [640,480];
$$graph3 := .geometry.ConstructionGraph([]);
actions3 := [
  .Graphics.Action({=
    id="geometry-author-point",target=$$graph3,
    action=(current,position)->.geometry.AddPoint(
      current,.geometry.Point(position[1],position[2]),{= snap=1/4,maxNodes=32 }
    ),
    label="Add an exact free point",coordinateSystem={= view=view3,size=size3 },
    children=[.Graphics.Rectangle([0,0],size3,{= fill="transparent",stroke="none" })]
  }),
  .Graphics.Action({= id="geometry-author-line",target=$$graph3,
    action=(current,ids)->.geometry.AddLine(current,ids[1],ids[2]),children=[] }),
  .Graphics.Action({= id="geometry-author-circle",target=$$graph3,
    action=(current,ids)->.geometry.AddCircle(current,ids[1],ids[2]),children=[] }),
  .Graphics.Action({= id="geometry-author-undo",target=$$graph3,
    action=current->.geometry.Undo(current),children=[] }),
  .Graphics.Action({= id="geometry-author-redo",target=$$graph3,
    action=current->.geometry.Redo(current),children=[] })
];
$$workbench3 := .geometry.AuthoringWorkbench($graph3,actions3,{=
  view=view3,size=size3,snap=1/4,maxNodes=32
});
$workbench3;
```

Click empty canvas space to place `p1`, `p2`, and so on. Select **Point tool**
to focus its surface; arrows move the cursor, Shift-arrows move ten pixels, and
Enter or Space places the point. Select **Line tool** or **Circle tool**, then
choose two distinct points in the construction tree. For a circle, choose its
center first and its through-point second. `snap` is applied in mathematical
coordinates, and `maxNodes` is a strict construction bound.

## Keep unresolved intersections visible

Parallel lines return an intersection result whose status is `parallel`.
Including that result in a drawing produces a visible diagnostic rather than a
fabricated point.

```rix
.Plugin.Load("geometry");
first4 := .geometry.Line(.geometry.Point(0, 0), .geometry.Point(4, 0));
second4 := .geometry.Line(.geometry.Point(0, 2), .geometry.Point(4, 2));
unresolved4 := .geometry.Intersect(first4, second4);
status4 := .geometry.Status(unresolved4);
.geometry.Draw([first4, second4, unresolved4], {= view=[-1,-1,5,3], size=[600,400] });
```

## Transform a polygon and check a constraint

Transforms preserve exact coordinates. Constraints retain their exact
residual instead of turning a drawing into a Boolean-only result.

```rix
.Plugin.Load("geometry");
a5 := .geometry.Point(0,0);
b5 := .geometry.Point(4,0);
c5 := .geometry.Point(1,3);
triangle5 := .geometry.Polygon([a5,b5,c5]);
shiftAndScale5 := .geometry.Affine([[3/2,0,1],[0,3/2,2]]);
moved5 := .geometry.Transform(triangle5,shiftAndScale5);
base5 := .geometry.Line(a5,b5);
onBase5 := .geometry.Constraint(:onLine,[.geometry.Point(2,0),base5]);
.geometry.Draw([triangle5,moved5],{= view=[-1,-1,8,8],size=[560,560] });
```

## Measure and rotate without binary floats

Named measurements preserve the geometry kernel's exact/certified split.
Arbitrary rotations accept radians, degrees, or fractions of a turn.

```rix
.Plugin.Load("geometry");
origin6 := .geometry.Point(0,0);
p6 := .geometry.Point(4,0);
segment6 := .geometry.Segment(origin6,p6);
length6 := .numerics.Refine(.geometry.Length(segment6),{=
  absoluteWidth=1/1000,maxWork=32
});
rotation6 := .geometry.Rotate(origin6,1/6,:turns);
image6 := .geometry.Transform(p6,rotation6);
.Fragment([
  .Table(["quantity","value"],[["squared length",.geometry.SquaredDistance(origin6,p6)],["length candidate",length6[:approximation].Candidate()]]),
  .geometry.Draw([p6,image6],{= view=[-1,-1,5,5],size=[360,360] })
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
circle7 := .geometry.Circle(.geometry.Point(0,0),2);
diagonal7 := .geometry.Line(.geometry.Point(-2,-2),.geometry.Point(2,2));
meeting7 := .geometry.Intersect(diagonal7,circle7);
eighthTurn7 := .geometry.CircularAngle(1/8,:turns);
{=
  intersectionStatus=meeting7[:status],
  coordinateDomain=meeting7[:points][1][:coordinateDomain],
  angleTurns=eighthTurn7[:turns],
  angleDomain=eighthTurn7[:coordinateDomain]
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
circle8 := .geometry.Circle(.geometry.Point(0,0),1);
line8 := .geometry.Line(.geometry.Point(-2,2),.geometry.Point(2,2));
intersection8 := .geometry.Intersect(line8,circle8);
{=
  status=intersection8[:status],
  discriminantSign=intersection8[:evidence][:discriminantSign],
  rootCount=intersection8[:evidence][:rootCount]
};
```

## Refine an implicit conic with bounded work

The implicit value stays mathematical and serializable. `Refine` creates one
portable snapshot for the requested viewport while retaining work and
uncertainty records.

```rix
.Plugin.Load("geometry");
ellipse9 := .geometry.Implicit({=
  coefficients=[1,0,4,0,0,-4],
  domain=[-3,-2,3,2],
  style={= stroke="#0f766e",width=2 }
});
result9 := .geometry.Refine(ellipse9,{=
  viewport={= x=[-3,3],y=[-2,2] },
  size=[600,400],
  tolerance=1/8,
  maxWork=1200
});
.Fragment([
  .Figure(result9[:graphic],"Bounded implicit ellipse"),
  .Table({= columns=["resolved","uncertain cells","work"],rows=[[
    result9[:resolved],result9[:uncertainty].Len(),result9[:work][:cells]
  ]] })
]);
```
