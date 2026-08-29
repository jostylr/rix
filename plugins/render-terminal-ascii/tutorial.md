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

## Wrap and paginate a narrow report

Truncation remains the deterministic default. Opt into word wrapping and a
page height when the terminal should retain all text:

```rix
.Plugin.Load("terminal-ascii");
report := .Table(
  [
    {= id="step", label="Step" },
    {= id="explanation", label="Explanation" }
  ],
  [
    [1, "Keep the exact input and state the transformation."],
    [2, "Show the verified result without replacing it by a Float."]
  ],
  {= caption="Exact workflow" }
);
rendered := .terminalAscii.Render(report, {=
  width=32,
  wrap=:word,
  pageHeight=10
});
{: rendered.Get("content"), rendered.Get("metadata") };
```

Every page includes its own `--- page i/n ---` marker and stays within ten
lines. The exact table cells are formatted only at this final renderer boundary.

## Render a portable slide deck

```rix
.Plugin.Load("terminal-ascii");
deck := .Slides([
  .Slide(.Paragraph("The source value remains exact."), "Source"),
  .Slide(.Paragraph("The ASCII view is deterministic."), "View")
], "Exact arithmetic");
.terminalAscii.Render(deck, {= width=40, wrap=:word }).Get("content");
```

Slides use printable ASCII headings in the default profile.

## Opt into Unicode or color

Capability selection is part of the render request. Unicode mode preserves
mathematical text and uses box-drawing characters while remaining free of
terminal control sequences:

```rix
.Plugin.Load("terminal-ascii");
comparison := .Table(
  ["measure", "value"],
  [["café total", "2 × 3"], ["bound", "x ≤ 7"]],
  {= caption="Métrique" }
);
unicode := .terminalAscii.Render(comparison, {= mode=:unicode });
{: unicode.Get("content"), unicode.Get("metadata") };
```

When the destination explicitly accepts ANSI 16-color escapes, select the
color profile. Its metadata makes the presence of control sequences visible:

```rix
colored := .terminalAscii.Render(comparison, {= mode=:unicodeColor });
{: colored.Get("content"), colored.Get("metadata") };
```

Omitting `mode` always returns strict ASCII, regardless of the host terminal.
