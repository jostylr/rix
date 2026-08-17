# `plot`

`plot` is a pure-RiX optional package for creating portable 2D plots. It keeps
exact samples exact, asks `.numerics` to refine algorithm-real results, and
lowers its work to a core `.Graphics` scene rather than an opaque chart widget.

## Load and use

```rix
.Plugin.Load("plot")

.plot.Polynomial([1, 0, -4, 1], [-3, 3], {= size = [640, 360] })
```

The result can be embedded in a `.Figure` or a document template and rendered
to SVG by a web or notebook host.

## Commands

| Command | Result |
| --- | --- |
| `.plot.Polynomial(coefficients, xDomain, options?)` | A `.Graphics` scene containing axes and the sampled curve. |
| `.plot.Function(fn, xDomain, options?)` | Sample a one-variable function through the Numerics contract. |
| `.plot.Parametric(fn, parameterDomain, options?)` | Plot a function returning `[x,y]`. |
| `.plot.Scatter(data, options?)` | Point marks for `[x,y]` rows. |
| `.plot.Line(data, options?)` | Connected data rows. |
| `.plot.Bar(data, options?)` | Bars with a zero baseline. |
| `.plot.Step(data, options?)` | Horizontal-then-vertical step path. |

Coefficients are in descending-power order. The options map controls output
size, sample count, margin, fixed or fitted vertical domain, additional series,
ticks, marks, labels, and styling; the second positional argument is the
visible x domain. Sampling and fitted coordinates stay exact until a renderer
chooses its target representation. General plots accept fitted or explicit
`xDomain`/`yDomain`, linear or `:log10` scales, `tickCount`, title and axis
labels, legend labels, styles, and a discontinuity threshold. Function and
parametric plots expose split paths and an `unresolved` metadata count when a
sample cannot be resolved or a likely jump is detected.

## Dependencies

It depends on the portable `rix.numerics@1` service and requests no external
permissions. It is deliberately separate from the SVG renderer: plotting
describes a scene; a renderer chooses how to paint it.

See [tutorial.md](tutorial.md).
