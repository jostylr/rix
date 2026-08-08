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
