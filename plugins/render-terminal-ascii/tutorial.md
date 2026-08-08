---
title: Render exact work in strict ASCII
description: Display synthetic division and a polynomial plot in a deterministic plain-text terminal format.
theme: Renderers and exporters
status: implemented
plugin: terminal-ascii
---

## Format synthetic division

The Algebra helper returns a portable ruled Grid. The terminal renderer keeps
the rule and exact values without requiring Unicode box-drawing characters.

```rix
.Plugin.Load("terminal-ascii");
division := .Algebra.SyntheticDivision(1, [2, -6, 2, -1]);
.terminalAscii.Render(division, {= width=64 }).Get("content");
```

## Snapshot a small plot

The plot remains an ordinary core Graphic. SVG and Canvas can render the same
value; this target rasterizes its paths onto a fixed ASCII character grid.

```rix
.Plugin.Load("plot");
.Plugin.Load("terminal-ascii");
plot := .plot.Polynomial([1, 0, -1], [-2, 2], {= size=[320,180], samples=81 });
.terminalAscii.Render(plot, {= width=60, height=16 }).Get("content");
```
