# `.complexViz`

Samples complex functions using exact RiX arithmetic and returns a portable
core `Graphic`. Phase 1 domain coloring is entirely RiX code; SVG and Canvas
only see colored rectangles.

The documented color convention is deliberately exact and fixture-friendly:

- phase is one of eight Cartesian octants, chosen by signs and whether
  `|Re|` or `|Im|` dominates;
- magnitude uses exact `NormSquared` bands: zero, `<= 1/4`, `<= 4`, and large;
- octant selects hue and magnitude band selects lightness;
- zeros are `#111827`, exact poles are white, and unresolved samples are
  `#64748b`.

This discrete convention avoids inventing an approximate angle inside an
otherwise exact plugin. Future continuous/Cayley color maps can perform an
explicit numerical lowering.

```rix
.Plugin.Load("complex-viz");
f := .complexViz.RationalFunction((z) -> z^2 - 1, (z) -> z);
graphic := .complexViz.DomainColoring({=
    fn=f,
    domain={= re=[-5/2, 5/2], im=[-5/2, 5/2] },
    resolution=[25, 25],
    size=[400, 400]
});
```

`RationalFunction(numerator, denominator)` creates a safe sampling callable
that returns semantic pole records instead of dividing by zero. A general
callable may return a complex value, `.complexViz.Sample(value)`,
`.complexViz.Pole()`, or `.complexViz.Unresolved(reason)`. `PhaseSector`,
`MagnitudeBand`, and `Color` expose the convention for exact fixture tests.
