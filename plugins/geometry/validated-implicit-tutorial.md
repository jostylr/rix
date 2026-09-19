---
title: Checked implicit charts and parameter constraints
description: Trace exact box enclosures, expose singular uncertainty, and retain certified geometry across failed parameter proposals.
theme: Graphics and geometry
status: implemented
plugin: geometry
---

## A local graph with exact enclosures

The parabola has a dependent derivative equal to one. Opposite signs on its
lower and upper faces prove one root per x coordinate. The graphic shows
original cells and contracted root boxes; it does not interpolate a contour.

```{.rix exec=true}
.Plugin.Load("calculus");
.Plugin.Load("geometry");
.Plugin.Load("plot");
x := .calculus.Variable(:x);
y := .calculus.Variable(:y);
f := y-x^2;
trace := .geometry.TraceImplicit(f,.calculus.GradientResult(f,[:x,:y]),
    {= x=(-1):1,y=(-2):2 },{= maxWidth=1/4,maxBoxes=31 });
trace.Check()[:accepted] ##@ == 1
trace[:status] ##@ == :complete
[trace.Check()[:accepted],trace[:status],.plot.CertifiedRegions(trace)];
```

## Boundary and singular cases remain distinct

A straight chart may lie on a closed boundary. The singular zero of x²+y²
has no certified local graph here. Its yellow cells preserve the undecided
region; coverage certification does not establish their topology.

```{.rix exec=true}
.Plugin.Load("calculus");.Plugin.Load("geometry");.Plugin.Load("plot");
x := .calculus.Variable(:x);y := .calculus.Variable(:y);
boundary := .geometry.TraceImplicit(y,.calculus.GradientResult(y,[:x,:y]),{= x=0:1,y=0:1 });
f := x^2+y^2;
singular := .geometry.TraceImplicit(f,.calculus.GradientResult(f,[:x,:y]),
    {= x=(-1):1,y=(-1):1 },{= maxBoxes=15,maxDepth=3 });
[boundary[:arcs][1][:rootBox],singular[:status],.plot.CertifiedRegions(singular)];
```

## Stop and refine without losing the remaining domain

The zero-work trace has one pending box covering the entire input. Refinement
replays its evidence and replaces the work options.

```{.rix exec=true}
.Plugin.Load("calculus");.Plugin.Load("geometry");
x := .calculus.Variable(:x);y := .calculus.Variable(:y);f := y-x^2;
waiting := .geometry.TraceImplicit(f,.calculus.GradientResult(f,[:x,:y]),
    {= x=(-1):1,y=(-2):2 },{= maxBoxes=0 });
finished := waiting.Refine({= maxBoxes=31,maxWidth=1/2 });
finished[:arcs].Len() ##@ == 4
[waiting[:pending].Len(),finished[:arcs].Len(),finished.Check()[:accepted]];
```

## Checked intersections and equality feasibility

The numerical system x²=2, y=0 has a unique root in this search box. Solve
keeps equality feasibility separate from root enclosure and optimization.

```{.rix exec=true}
.Plugin.Load("calculus");.Plugin.Load("geometry");.Plugin.Load("solve");
x := .calculus.Variable(:x);y := .calculus.Variable(:y);
f := [x^2-2,y];j := .calculus.JacobianResult(f,[:x,:y]);box := {= x=1:2,y=(-1):1 };
intersection := .geometry.IntersectionBoxes(f,j,box);
roots := .solve.FromBoxes(intersection);
feasibility := .solve.BoxFeasibility(f,j,box);
feasibility[:status] ##@ == :feasible
[roots[:rootExistence],roots.Check(),feasibility[:status]];
```

## Preserve the last construction through a failed drag

The builder searches the positive square root of the first parameter. Moving
it negative cannot satisfy the constraint. The last checked result and handle
position survive, with repair diagnostics. Moving back to a positive value
permits recovery. A retained handle uses the same proposal path.

```{.rix exec=true}
.Plugin.Load("calculus");.Plugin.Load("geometry");
x := .calculus.Variable(:x);y := .calculus.Variable(:y);
Build=(p)->{;
    f=[x^2-p[1],y];
    .numerics.IntervalNewtonBox(f,.calculus.JacobianResult(f,[:x,:y]),{= x=(1/2):2,y=(-1):1 });
};
initial := .geometry.ParameterConstruction(Build,[1,0]);
failed := .geometry.ParameterDrag(initial,[-1,0]);
$$state := failed;
handle := .Graphics.Graphic([400,400],[.geometry.ParameterHandle($$state)]);
failed[:status] ##@ == :retainedLastCertified
[failed[:status],failed[:parameter],failed[:repair],handle];
```
