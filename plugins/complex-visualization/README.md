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

Phase 2 also consumes the certified schemas emitted by `.complex`. `Color`
accepts `rix.complex.enclosure@1` and uses a hue only when every enclosure
corner certifies the same discrete phase/magnitude cell; otherwise it uses the
documented unresolved gray. Complex function-result branch metadata is retained
rather than re-inferred from an unrelated pair of samples.

`CayleyColor` publishes magnitude, stereographic Cayley direction, phase sector,
band, and color in one stable record. `Surface` samples an exact callable into a
retained Scene3D mesh with magnitude-squared or phase-sector height and records
branch-boundary/unresolved sample metadata. `RiemannSphere` maps exact complex
values through inverse stereographic projection into a Scene3D point cloud:

```rix
surface := .complexViz.Surface({=
  fn=(z)->z^2,height=:magnitudeSquared,
  domain={= re=[-1,1],im=[-1,1] },resolution=[9,9]
});
sphere := .complexViz.RiemannSphere([
  .Complex.FromParts(0,0),.Complex.FromParts(1,0),.Complex.FromParts(0,1)
]);
```

Scene3D renderers consume these scenes without learning any private complex
sampling convention.
