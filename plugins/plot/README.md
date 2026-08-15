# `plot`

`plot` is a pure-RiX optional package for creating portable function plots. It
samples exact polynomial coefficients at exact rational positions and lowers
its work to a core `.Graphics` scene rather than an opaque chart widget.

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

Coefficients are in descending-power order. The options map controls output
size, sample count, margin, fixed or fitted vertical domain, additional series,
ticks, marks, labels, and styling; the second positional argument is the
visible x domain. Sampling and fitted coordinates stay exact until a renderer
chooses its target representation.

## Dependencies

It depends only on core output/graphics facilities and requests no external
permissions. It is deliberately separate from the SVG renderer: plotting
describes a scene; a renderer chooses how to paint it.

See [tutorial.md](tutorial.md).
