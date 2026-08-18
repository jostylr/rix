# `.fractals`

`.fractals` is a pure-RiX laboratory for discrete dynamical systems. It owns
iteration, exact finite orbit evidence, bifurcation samples, cobweb paths, and
escape-time classification. It does not encode SVG, paint Canvas pixels, call a
GPU, or choose an output file format.

The public boundary has two layers:

- mathematical functions return versioned RiX records containing exact sample
  coordinates, iteration budgets, classifications, and provenance;
- `BifurcationGraphic`, `CobwebGraphic`, and `EscapeGraphic` lower those records
  to portable core `.Graphics` values understood by the normal renderer
  plugins.

```rix
.Plugin.Load("fractals");
orbit := .fractals.Orbit(.fractals.Logistic(4), 1/2, 5);
diagram := .fractals.LogisticBifurcation([5/2, 4], {=
    parameterSamples=121,
    discard=80,
    keep=40
});
.fractals.BifurcationGraphic(diagram, {= size=[720,420] });
```

## Initial surface

| Function | Mathematical result |
| --- | --- |
| `Orbit(fn, seed, steps, options?)` | Retained finite orbit `x_0, ..., x_n`. |
| `Iterate(fn, seed, steps)` | Final iterate without retaining the trajectory. |
| `DetectPeriod(orbit, maxPeriod?)` | Exact repeated-tail detection; absence is `notDetected`, never a proof of aperiodicity. |
| `Multiplier(derivative, orbit, skip?)` | Product of derivatives and exact attracting/neutral/repelling classification when ordered comparison is available. |
| `Logistic(r)`, `Tent(slope?)`, `Quadratic(c)` | Reusable families of iteration maps. |
| `Bifurcation(family, parameterDomain, options?)` | Generic parameter/state sample record. |
| `LogisticBifurcation(...)` | Logistic-family convenience sampler. |
| `Cobweb(fn, domain, seed, steps, options?)` | Function samples, orbit, and mathematical cobweb polyline. |
| `Escape(step, seed, options?)` | One bounded-work escape test. |
| `EscapeGrid(family, spec?)` | Generic complex parameter/initial-value grid. |
| `Mandelbrot(spec?)`, `Julia(c, spec?)` | Exact rational cell-center escape grids for quadratic dynamics. |

An `escaped` result is certified by an exact comparison with the escape radius.
`boundedByBudget` means only that the sample did not escape during the requested
iterations; it is deliberately not labeled “inside.”

## Rendering

The graphic lowerings use only `.Graphics.Graphic`, `Path`, `Circle`, and
`Rectangle`. A host can therefore pass the same result to `.svg`, `.canvas`,
`.tikz`, `.png`, `.gif`, HTML/Quarto documents, or future visual pipelines.
Changing renderers never reruns or changes the dynamics.

See [design.md](design.md) for the broader chaos-exploration plan and
[tutorial.md](tutorial.md) for runnable examples.
