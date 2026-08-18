# `.fractals` design sketch

## Purpose and boundary

The plugin is a mathematical dynamics layer, not a renderer. It should retain
the recurrence, seed, parameter domain, exact samples, finite work budget,
classification policy, and unresolved evidence in ordinary RiX values. Visual
lowering produces portable core Graphics, Tables, Timelines, or Scene3D values;
target plugins remain responsible for SVG/Canvas/WebGL/TikZ/raster/document
encoding.

This split is especially important for chaos: a pretty pixel is not evidence
that a point belongs to a set, an apparent cycle is not automatically a proved
periodic orbit, and a finite non-escape result is not a membership certificate.

## Layered roadmap

### Phase 1: deterministic discrete dynamics

Implemented by the initial plugin:

- finite orbits and final iteration;
- exact repeated-tail period detection;
- derivative products and stability classification;
- logistic, tent, and quadratic map families;
- generic and logistic bifurcation samples;
- cobweb data and graphics;
- generic escape-time problems plus Mandelbrot and Julia grids;
- renderer-neutral Graphics lowering.

All sampling locations are exact rationals. User callables may introduce other
numeric representations, but the plugin does not silently convert them to
host floats.

### Phase 2: richer deterministic systems

- explicit-address IFS/chaos-game orbits and point clouds;
- substitution systems, L-systems, and turtle-path mathematical records;
- Newton/Halley basin classification with root and unresolved records;
- orbit diagrams, return maps, recurrence plots, and Poincare sections;
- two-dimensional maps such as Henon and baker maps;
- parameter-plane and dynamical-plane continuation;
- portable Timeline construction for orbit and parameter animations.

Randomized explorations must accept an explicit finite address/noise stream or
a seedable random-source value. Snapshot-capable APIs cannot depend on hidden
host randomness.

### Phase 3: certified and adaptive analysis

- cycle finding separated into heuristic candidates and exact/certified proof;
- interval escape/boundedness arguments over boxes;
- adaptive quadtree boundary refinement with visible unresolved cells;
- derivative cocycles and finite-time Lyapunov data;
- Lyapunov exponents through an explicit `.numerics` logarithm/refinement
  contract, retaining error and work metadata;
- kneading sequences, symbolic dynamics, entropy estimates, and Feigenbaum
  scaling experiments;
- continuation and bifurcation classification with explicit solver evidence.

## Core record contracts

The implemented schemas are:

| Schema | Meaning |
| --- | --- |
| `rix.fractals.orbit@1` | Seed, step count, final value, and optional retained orbit. |
| `rix.fractals.period@1` | Exact repeated-tail observation with a bounded search. |
| `rix.fractals.bifurcation@1` | Parameter domain, burn-in/retention policy, and parameter-state points. |
| `rix.fractals.cobweb@1` | Orbit plus function and staircase polylines in mathematical coordinates. |
| `rix.fractals.escape@1` | Certified escape or finite non-escape under a stated budget. |
| `rix.fractals.escape-grid@1` | Exact cell-center samples and per-cell escape records. |

Future records should follow the same rule: mathematical coordinates and
classification evidence stay in the source record; pixel coordinates, colors,
stroke widths, and target encodings belong to an explicit view/lowering step.

## API direction

Generic kernels come before named fractals. For example, `EscapeGrid` accepts a
family mapping each sampled point to `{= seed=..., step=... }`; Mandelbrot and
Julia are small conveniences over that kernel. Likewise, `Bifurcation` accepts
a family from parameter to recurrence, while `LogisticBifurcation` supplies one
well-known family.

This gives later packages room to add domain-specific named systems without
duplicating iteration and visualization machinery.
