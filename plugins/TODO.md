# RiX Plugin Implementation TODO

> **Status:** working roadmap. Checkboxes describe repository state, not merely
> design agreement. Every implemented plugin remains opt-in and loads through
> its lowercase plugin ID.

This roadmap turns the broader [Plugin System Design Specification](design-spec.md)
into staged, testable work. Phase 1 always means the same thing:

- one small but genuinely useful end-to-end use case;
- a loadable plugin with a stable lowercase ID and a narrow public API;
- a reference `README.md`;
- a runnable `tutorial.md` suitable for RiX Web and RiX Notebook;
- focused tests in Node and every supported host; and
- explicit diagnostics for unsupported inputs instead of silent fallback.

Later phases deliberately become broader, harder, and easier to postpone.
Except where a dependency is called out below, finish most Phase 1 milestones
before beginning broad Phase 2 work.

All Phase 1 milestones catalogued before the Calculus/Analysis work are
implemented. Calculus Phase 1 and its listed Phase 2 milestones are implemented;
Analysis is implemented through Phase 2. Unchecked work below is Phase 2 or
later unless a section explicitly says otherwise.

## Roadmap plugin index

This is the ordered, at-a-glance queue for every plugin section in this
roadmap. **Ready** means the next bounded implementation can begin now;
**decision** names a contract that should be settled first; **waiting** names a
real implementation dependency; and **Phase 4** marks work deliberately kept
off the current numerical/educational critical path. A Phase 4 row still names
its first useful future increment rather than treating it as abandoned.

| # | Plugin | Next development increment | State / waiting for |
|---:|---|---|---|
| 1 | `.radix` | Versioned numeral-system constructors plus common parse/format operations | **Phase 4:** specialized numeral systems do not gate the current path |
| 2 | `.draw` | Declarative themes, constraints, and interactive handles | **Decision:** shared portable interaction/event descriptor |
| 3 | `.plot` | Linked views and adapters for ODE trajectories, Solve boxes, and retained uncertainty | **Ready:** ODE and bounded-result records now exist |
| 4 | `.float` | Typed-array tensors followed by optional SIMD/Wasm acceleration | **Phase 4:** scale/performance layer |
| 5 | `.oracle` | Exchange exact sign and root evidence with algebraic solvers | **Waiting:** stable multivariate algebra evidence records |
| 6 | `.numerics` | Validated interval-linear solves and bounded box subdivision | **Ready:** Krawczyk and interval-Newton foundations are present |
| 7 | `.ode` | General higher-order Taylor/affine flow, then backward integration and boundary-value records | **Ready:** adaptive certified subdivision, second-order recentering, and interval-Newton events exist |
| 8 | `.algebra` | Multivariate Polynomial plus Groebner/elimination MVP | **Decision:** start with `Q` coefficients and explicit lex/graded orders |
| 9 | `.linalg` | Characteristic/minimal polynomials, eigenspaces, and exact canonical forms | **Waiting:** algebraic extension/coefficient-domain contract |
| 10 | `.optimize` | Bounded branch-and-bound integer and mixed-integer linear optimization | **Ready:** preserve partial bounds and unexplored nodes |
| 11 | `.solve` | Multivariate elimination plus certified subdivision consumers | **Waiting:** `.algebra` Groebner MVP and `.numerics` box subdivision |
| 12 | `.fraction` | Portable classroom-derivation and fraction-path evidence | **Phase 4:** current exact representations are complete |
| 13 | `.fracfun` | Multivariate forms and declared coefficient domains | **Waiting:** multivariate Polynomial/coefficient-domain support |
| 14 | `.cas` | Trigonometric power/product reductions, selected radicals, and definite-integral symmetries | **Ready:** absolute-value, affine trig, and quadratic partial fractions are implemented |
| 15 | `.symbolic` | Shared assumptions and restricted-domain wrappers | **Decision:** one portable assumption/branch-obligation contract |
| 16 | `.logic` | Semantic tableaux with replayable open/closed branch evidence, then bounded finite models | **Ready:** scoped natural deduction and portable syntax/proof trees exist |
| 17 | `.calculus` | Absolute-value/domain graphs and portable differential, boundary, and integral equation specifications | **Ready:** coordinate with `.cas`; solver execution stays elsewhere |
| 18 | `.analysis` | Metric, normed, Banach, Hilbert, and selected `L^p` records | **Phase 4:** abstract function-space program |
| 19 | `.ball` | Polynomial evaluation, interval Newton, and validated linear algebra over balls | **Waiting:** shared validated linear-algebra API from `.numerics` |
| 20 | `.cauchy` | Constructive-completeness and portable proof/evidence exchange | **Phase 4:** proof-connected foundations |
| 21 | `.continuedFraction` | Deeper symbolic interoperability and correlation experiments | **Phase 4:** specialized exploration |
| 22 | `.algebraicReal` | Exact conic coordinates and multivariate algebraic isolation | **Waiting:** `.algebra` elimination plus Geometry conic records |
| 23 | `.complex` | Explicit branch and continuation-path semantics | **Decision:** portable path/branch contract |
| 24 | `.cayley` | Power-series analysis for one-generated associative subalgebras | **Phase 4:** specialist hypercomplex analysis |
| 25 | `.quaternion` | Certified rotations/interpolation and Geometry/Scene3D adapters | **Waiting:** common transform adapter; broader analysis is Phase 4 |
| 26 | `.octonion` | Derivative/function notions and `G2` exploration | **Phase 4:** specialist research program |
| 27 | `.geometry` | Certified implicit-curve tracing with excluded, unique, and unresolved boxes | **Ready:** consume `.numerics` Krawczyk and `.ode` enclosures |
| 28 | `.data` | Single-document tagged-JSON relation interchange | **Ready:** reuse the certified-real value envelope |
| 29 | `.stats` | Generalized models, resampling, and Bayesian records | **Phase 4:** broad statistical program |
| 30 | `.probability` | Convolutions, mixtures, and stochastic-process foundations | **Phase 4:** broad probabilistic program |
| 31 | `.document` | Themes, floats, multicolumn layout, and index records | **Decision:** portable page/deck layout policy |
| 32 | `.scene3d` | Certified implicit surfaces and ODE trajectory scenes | **Ready:** preserve subdivision and uncertainty metadata |
| 33 | `.nd` | Implicit regions, slicing, dimensional reduction, and linked views | **Waiting:** Scene3D plus shared linked-interaction contract |
| 34 | `.complexViz` | Projection and slice views for complex-valued data | **Waiting:** `.nd` projection/slice records |
| 35 | `.svg` | Metadata, hit targets, and portable animation descriptors | **Waiting:** shared interaction descriptor; static work can proceed |
| 36 | `.canvas` | Offscreen/worker rendering, path caches, and large heatmaps | **Phase 4:** scale/performance layer |
| 37 | `.png` | Tiled output and 16-bit/linear-color pipelines | **Phase 4:** large-output production layer |
| 38 | `.terminalAscii` | Keyboard interaction, live repaint, and accessibility metadata | **Decision:** host-neutral input/repaint protocol |
| 39 | `.tikz` | Scene3D snapshots, animation frames, and exact-coordinate export | **Waiting:** normalized Scene3D snapshot records |
| 40 | `.latex` | Beamer, multicolumn/index/long-table, and accessibility support | **Waiting:** `.document` page/deck layout contract |
| 41 | `.markdown` and `.html` | Progressive enhancement for portable interactions | **Waiting:** shared interaction descriptor |
| 42 | `.quarto` | RevealJS, books/sites, and cross-document production | **Phase 4:** external publication toolchain |
| 43 | `.pdf` | Asset negotiation, tagged accessibility, and color profiles | **Phase 4:** production publishing/toolchain integration |
| 44 | `.gif` | Caption and accessibility sidecars | **Ready:** bounded metadata-only increment |
| 45 | `.csv` | Tagged-value round trips aligned with single-document JSON relations | **Waiting:** `.data` relation interchange contract |

## Basic order of implementation

The order is organized as waves rather than one rigid serial queue. Items
inside a wave may proceed together when they do not share unfinished
contracts.

1. **Close the already-started Phase 1 packages:** `.float`, `.draw`, and
   `.plot`; extract `.svg` from host-specific rendering.
2. **Prove exact refinement:** `.oracle` Phase 1, followed by `.numerics`
   Phase 1 dispatching to both `.oracle` and `.float`.
3. **Make outputs immediately useful:** `.canvas`, `.csv`, `.geometry`,
   `.data`, and `.document` Phase 1.
4. **Add portable fallbacks:** `.terminalAscii`, `.png`, `.tikz`, and `.latex`
   Phase 1.
5. **Broaden mathematical backends:** `.algebra`, `.ball`, `.cauchy`,
   `.continuedFraction`, `.algebraicReal`, and `.complex` Phase 1; then build
   scalar-generic `.cayley`, `.quaternion`, and `.octonion` layers.
6. **Broaden analysis and visualization:** `.stats`, `.scene3d`, `.nd`, and
   `.complexViz` Phase 1.
7. **Complete publication pipelines:** `.quarto`, `.pdf`, and `.gif` Phase 1.
8. **Establish abstract mathematical functions:** `.calculus` provides
   portable function/expression contracts, semantic rules, exact
   higher/multivariate differentiation, and linked evaluation provenance.
9. **Begin Analysis over explicit evidence:** `.analysis` Phase 1 follows the
   Calculus expression contract and the effective-sequence protocols.
10. **Begin Phase 2 in dependency order:** shared Numerics and renderer
   contracts first; mathematical/scene producers second; document
   orchestrators last.
11. **Treat Phase 3 as the deep-mathematics exploration release:** durable
    certified/refinable-real interchange; bounded Numerics, nonlinear Solve,
    Geometry, Plot, ODE, and optimization services; browser-first interaction
    and publication; then the exact algebra/Groebner services those vertical
    slices need.
12. **Treat Phase 4 as research, scale, or external-ecosystem work:**
    Arrow/Parquet and massive-data execution, native/GPU acceleration,
    external CAS or proof-assistant reliance, specialized quaternion/octonion
    analysis, distributed computation, and production publishing toolchains.

The first concrete vertical slice should be:

```text
oracle P1 -> numerics P1 -> plot P1 refinement adapter
          -> core Graphic -> svg P1 + canvas P1
          -> RiX Web and RiX Notebook tutorials
```

## Phase 3 focus revision (2026-08-29)

Phase 3 now optimizes for RiX as an isolated, browser-capable environment for
educational exploration deep into mathematics. It should still support
reasonable scientific workloads, but it is not attempting to become a
warehouse-scale dataframe engine or a shell around mandatory external systems.

The dependency order for remaining Phase 3 work is:

1. Specify and implement tagged-JSON snapshots for certified and refinable
   reals. A file must remain useful as an inert certified interval even when
   its optional refinement recipe cannot be revived.
2. Complete scalar interval Newton and multidimensional Krawczyk/interval
   methods with bounded partial results and explicit assumptions.
3. Feed those results through nonlinear Solve, implicit Geometry, Plot, and
   Scene3D without hiding excluded or unresolved boxes.
4. Add ODE problem/solution records, then approximate and validated solvers
   whose local-error, truncation, wrapping, and work assumptions are visible.
5. Broaden optimization and interaction/publication on the same retained,
   deterministic result contracts.
6. Add multivariate Polynomial/Groebner/elimination services after the
   numerical vertical slice, then use them to strengthen Solve and Geometry.

The following work moved from Phase 3 to Phase 4 because it does not directly
support that sequence:

- Arrow/Parquet, large columnar execution, network data sources, and query
  planning. Phase 3 keeps exact tagged JSON, streaming JSONL, CSV/TSV, and
  bounded in-memory relations.
- External CAS, SMT, solver, or proof-assistant adapters and certificate
  exchange. Phase 3 may build small native checkers and replayable evidence,
  but the isolated install must remain complete without external services.
- SIMD/WebAssembly/native/GPU acceleration, worker-scale rendering, and
  production-scale media/toolchain integration. These are performance or
  ecosystem layers over Phase 3 semantics.
- Slice/Fueter quaternion analysis, octonionic/G2 analysis, later
  Cayley-Dickson analysis, and other specialist research programs. Existing
  exact/certified algebra and elementary-function basics remain available;
  unit-quaternion geometry may advance earlier when it serves Geometry or
  Scene3D.
- Broad statistical/Bayesian, stochastic-process, abstract function-space,
  and specialized numeral-system programs. They remain worthwhile, but do not
  gate the selected numerical/geometry/interaction path.

Every Phase 3 implementation must include a runnable tutorial, focused tests,
reference documentation, versioned portable records where values cross plugin
boundaries, bounded-work failure examples, and a green full test suite.

Phase 3's native CAS/proof boundary is deliberately small but useful. RiX may
normalize exact expressions, differentiate public expression graphs, perform
polynomial division/factor/resultant/Sturm/Groebner calculations, and check
reconstruction, reduction, root-count, linear-program, and interval-containment
certificates. These are ordinary isolated algorithms and replayable evidence
checkers. General theorem proving, unrestricted simplification, external CAS
bridges, proof-term exchange, and solver-specific certificate formats remain
Phase 4. CAS proposes or computes mathematical objects; proof/evidence checks
claims about them. They are complementary when kept behind that boundary.

The native symbolic target is course coverage, not maximal CAS coverage.
Phase 3 should handle the integration and simplification families repeatedly
encountered in secondary-school and undergraduate calculus/algebra: polynomial
and rational normalization, domain-aware cancellation, common exact
factor/collect/expand forms, elementary antiderivative tables, linear
substitution, selected integration by parts and partial fractions, and standard
definite-integral symmetries. Unsupported or conditionally valid forms remain
inert with visible obligations. Rare special-function reductions, general
Risch-style elementary integration, unrestricted identity search, and enormous
heuristic simplification portfolios do not gate Phase 3.

## Tutorial grouping and metadata

Each plugin tutorial starts with:

```yaml
---
title: Short task-oriented title
description: One sentence describing the result.
theme: Numbers and numerics
status: implemented
---
```

Supported initial themes are:

1. Numbers and numerics
2. Algebra and analysis
3. Graphics and geometry
4. Data and documents
5. Renderers and exporters
6. Higher-dimensional visualization

`status: proposed` publishes a design/acceptance tutorial but disables its Run
buttons. Change it to `implemented` only when its Phase 1 code and tests work.

Every statement in a tutorial's RiX code fences must end with a semicolon,
including assignments, calls, final expressions, and multiline constructor
calls. Tutorials are shared by the CLI, RiX Web, and RiX Notebook, so they must
use valid script syntax rather than relying on a particular host's interactive
newline normalization.

---

## Authoring and mathematical plugins

### `.radix`

1. **Phase 1 — Bounded exact positional representations**
   - [x] Add collision-safe plugin methods on existing exact numeric types.
   - [x] Return structured terminating, repeating, and budget-exhausted expansions.
   - [x] Provide finite digit generation and bounded period analysis.
   - [x] Add reference documentation, a tutorial, and focused tests.
2. **Phase 2 — Streaming and richer representation**
   - [x] Add a cloneable lazy digit stream once plugin-defined lazy values have a stable protocol.
   - [x] Add formatting policies for digit alphabets above base 36 and grouped radices.
   - [x] Share generic work-budget diagnostics with `.numerics`.
4. **Phase 4 — Extensible numeral systems and playground**
   - [ ] Define versioned numeral-system constructors and a common parse/format
     protocol rather than assuming every system is a positive positional base
     whose digits are the single characters numbered `0` through `base - 1`.
   - [ ] Let a constructed system register a stable named backtick parser label.
     The parser must accept the full exact-number string grammar under that
     system—signed values, separators, radix points, fractions, mixed fractions
     such as `1..3/4`, repeating expansions, continued fractions, interval and
     uncertainty forms, and radix shifts where meaningful—and formatting must
     emit the same labeled backtick language for an exact round trip. For
     example, a registered `balancedTernary` label could parse and print
     `` `.balancedTernary:...` `` rather than returning an unlabelled string.
   - [ ] Support multi-token digit alphabets with an explicit tokenizer policy.
     Multi-token systems use digit tokens rather than one Unicode code point per
     digit, so registration must reject ambiguous token sets or define a visible
     longest-match rule.
   - [ ] Support balanced positional systems, whose digit values extend on both
     sides of zero (for example `-1, 0, 1`) and therefore encode sign through
     digits and carry rules rather than only a leading minus.
   - [ ] Support negative bases, whose place weights alternate sign and can
     represent positive and negative values without a separate sign digit.
     Parsing, normalization, repeating expansions, and canonical output need
     rules specific to the system instead of reusing positive-base division.
   - [ ] Explore locale and symbol profiles as reversible lexical adapters over
     a numeral system. Profiles may replace digit glyphs, signs, grouping,
     radix, repeat, fraction, mixed-number, and continued-fraction symbols, but
     must diagnose collisions and distinguish display-only substitutions from
     lossless parsing. Decide which alphabet/value rules belong in
     `@ratmath/core` and which syntax/registration rules belong in RiX.
   - [ ] Implement an interactive RiX Web playground for constructing and
     comparing ordinary, multi-token, balanced, and negative-base systems.
   - [ ] Show exact parsing, canonical labeled-backtick output, digit/place
     values, carries, terminating versus repeating behavior, and locale/symbol
     substitutions without passing exact values through JavaScript `number`.
   - [ ] Cross-link the playground from the `.radix` tutorial and keep its
     serializable examples reusable outside the browser host.

### `.draw`

1. **Phase 1 — Portable 2D construction**
   - [x] Implement lines, polygons, labels, boxes, and circles that return core
     `Graphics` nodes.
   - [x] Support positional and options-map call forms.
   - [x] Document that Draw is an authoring convenience rather than a second
     scene model.
   - [x] Provide a portable drawing tutorial.
   - [x] Add focused plugin-loading and malformed-style tests.
2. **Phase 2 — Common drafting conveniences**
   - [x] Add polylines, arrows, arcs, ellipses, dimension marks, grids, and
     reusable style maps.
   - [x] Add data-coordinate to viewport-coordinate transforms.
   - [x] Provide bounding boxes and anchors for composed labels.
   - [x] Extend the tutorial with a labeled construction.
3. **Phase 3 — Constraint-aware authoring**
   - [x] Accept geometry objects through a protocol without importing
     `.geometry`.
   - [x] Support path trimming, marker placement, collision-aware labels, and
     reusable symbols.
   - [x] Preserve unresolved or uncertain geometry as visible scene metadata.
   - [ ] Add declarative diagram themes and interactive handles that emit
     ordinary retained scenes through the shared interaction protocol.
4. **Phase 4 — Advanced drafting ecosystem**
   - [ ] Add externally sourced extensible symbol libraries with explicit
     licensing, provenance, and publication-toolchain policies.
   - [ ] Support round trips with selected vector authoring formats.

### `.plot`

1. **Phase 1 — Polynomial plot with fitted view**
   - [x] Migrate sampling, exact fitting, and core Graphics lowering from the
     historical host implementation to a discoverable pure-RiX plugin.
   - [x] Plot exact polynomial coefficients over an explicit horizontal range.
   - [x] Compute a useful fitted vertical range and return core `Graphics`.
   - [x] Provide README documentation and a polynomial tutorial.
   - [x] Add direct plugin tests for fitting, constant polynomials, and invalid
     ranges.
   - [x] Make the tutorial pass in both RiX Web and RiX Notebook.
2. **Phase 2 — General 2D functions and data**
   - [x] Add `.plot.Function`, `.plot.Parametric`, scatter, line, bar, and
     step plots.
   - [x] Route evaluation and enclosure through `.numerics`.
   - [x] Detect likely discontinuities and expose unresolved samples.
   - [x] Add scales, legends, ticks, labels, and explicit/fitted view policies.
3. **Phase 3 — Fields and adaptive plots**
   - [x] Add implicit curves, contours, heat maps, vector fields, error bands,
     and interval-valued plots.
   - [x] Use adaptive subdivision and certified sign/range requests.
   - [x] Share color-scale values with `.complexViz` and `.stats`.
   - [x] Add interactive Canvas hit testing without changing the plot value.
   - [ ] Support linked views and declarative interaction descriptions over
     renderer-neutral viewport and selection records.
4. **Phase 4 — Statistical and large-data plotting**
   - [ ] Add streaming/downsampled plots and GPU-oriented scene lowering.
   - [ ] Add extensible grammar-of-graphics-style composition only if the
     simpler APIs prove insufficient.

### `.float`

1. **Phase 1 — Explicit IEEE-754 math**
   - [x] Implement the semantic Float type, conversion, arithmetic dispatch,
     exact stored-value interval, rounding, and elementary functions.
   - [x] Provide Node and browser installers.
   - [x] Provide reference documentation and tutorial.
   - [x] Consolidate plugin-specific tests across Node, RiX Web, and RiX
     Notebook catalogs.
   - [x] Mark certification metadata as approximate rather than enclosed.
   - [x] Separate `Sample`/`Enclose` from structured unsupported `Refine`, and
     keep Float Halo comparisons diagnostic rather than certified.
2. **Phase 2 — Numerical protocol provider**
   - [x] Implement the shared `EnclosableReal`/sampling capability with an
     explicitly non-certified result level.
   - [x] Add configurable binary32/binary64 behavior and directed-next-value
     helpers.
   - [x] Report overflow, underflow, signed zero, infinities, and NaN through
     structured diagnostics.
3. **Phase 3 — Reproducible approximate algorithms**
   - [x] Add reproducible summation/dot-product policies.
   - [x] Provide error-estimate objects for selected algorithms.
   - [x] Add complex Float operations without contaminating exact complex
     values.
4. **Phase 4 — Accelerated arrays**
   - [ ] Explore typed-array tensors and SIMD/WebAssembly backends.
   - [ ] Preserve the same semantic contract across CPU and accelerated paths.

### `.oracle`

1. **Phase 1 — Rational betweenness demonstration**
   - [x] Write the paper-based [implementation specification](oracle/specification.md).
   - [x] Write the proposed acceptance tutorial.
   - [x] Implement exact Query, Answer, Prophecy, WorkPolicy, and evidence
     values.
   - [x] Implement singular, reflexive, halo, seeded random-halo, and
     bisection procedures for a rational number.
   - [x] Implement bounded `Ask`, `CheckRange`, and `Refine` with a visible
     bisection trace.
   - [x] Make the tutorial runnable in CLI, RiX Web, and RiX Notebook; then set
     `status: implemented`.
   - [x] Adapt Oracle answers to RiX decisions and connect language Halo
     comparison/membership through the shared certified-refinement contract.
2. **Phase 2 — Funnels and generic refinement**
   - [x] Implement refinement funnels and the paper's funnel-to-oracle adapter.
   - [x] Implement the rational Newton nth-root funnel and Cauchy adapter.
   - [x] Register the shared `EnclosableReal` provider used by `.numerics`.
   - [x] Add the certified-singleton provider adapter used as the common
     arithmetic target for balls, Cauchy, continued fractions, algebraic reals,
     and Numerics algorithm reals.
   - [x] Implement coarse oracles and distinguish `eta` resolution from host
     resource exhaustion.
3. **Phase 3 — Ordering, arithmetic, and evidence**
   - [x] Implement epsilon-trichotomy, compatibility, and bounded comparison.
   - [x] Implement funnel negation, addition, multiplication, reciprocal, and
     division.
   - [x] Implement bounded immutable Oracle enclosure recipes for negation,
     absolute value, addition, subtraction, multiplication, division, and
     integer powers, with actualized trace steps.
   - [x] Add testing/nth-root oracles under explicit uniqueness evidence.
   - [x] Represent equivalence, Yes/No, root, and property evidence without
     promoting finite sampling to proof.
   - [ ] Exchange exact sign/root evidence with `.algebra` through native,
     replayable RiX records used by Numerics and Solve.
4. **Phase 4 — Completed relations and proof integration**
   - [ ] Add rational betweenness relation and maximal-fonsi proof adapters.
   - [ ] Explore formalized proofs of selected constructors and field laws.
   - [ ] Reconcile the final API with revisions to `paper/oracles_short.tex`.

### `.numerics`

1. **Phase 1 — Backend-neutral enclosure and root refinement**
   - [x] Define `RefinementRequest`, `Enclosure`, evidence level, and bounded
     work-policy records.
   - [x] Dispatch one bisection/root-refinement use case to `.oracle` and one
     approximate sampling use case to `.float`.
   - [x] Return structured convergence or exhaustion results.
   - [x] Add README, API reference, and a tutorial comparing certified and
     approximate results.
   - [x] Test that Numerics imports protocols, not concrete backend packages.
   - [x] Move request normalization, capability negotiation, limit
     intersection, and result validation into the shared Core contract.
2. **Phase 2 — Core algorithms**
   - [x] Add universal weighted n-th-root algorithm reals whose guesses and
     partners form exact certified intervals.
   - [x] Add rational powers plus universal certified natural/base-selected
     exponential and logarithm algorithm reals, including `Ln`, `Log2`, and
     `Log10` conveniences.
   - [x] Add a checked Kantorovich constructor and nested interval-Newton
     refinement with actualized steps and bounded work.
   - [x] Add the universal scientific-calculator baseline: roots and rational
     powers; exponential/logarithmic functions; circular, inverse,
     hyperbolic, and inverse-hyperbolic functions; angle conversion and
     normalized sinc.
   - [x] Add certified `Gamma`, `LogGamma`, `Erf`, `Erfc`, `LambertW`, and
     defining-branch `Zeta`, with structured unresolved-domain results.
   - [x] Add the `.bessel.J0`/`J1`/`Y0`/`Y1` façade over universal Numerics
     implementations without installing cryptic bare names.
   - [x] Add certified `Atan2(y,x)` with explicit branch convention and
     undefined-origin handling, plus universal `Hypot(x,y)`.
   - [x] Add positive-real `Beta`, `LogBeta`, `Digamma`, and `Trigamma`, using
     exact/common identities where available and bounded algorithms otherwise.
   - [x] Add normal PDF/CDF/quantile functions under the statistics/probability
     surface with direct request-sized forward bounds and certified root
     isolation.
   - [x] Add arbitrary integer-order Bessel `J(n,x)` and `Y(n,x)` under
     `.bessel`, retaining the explicit letter-family namespace.
   - [x] Add a reference-corpus benchmark and a warm-runtime precision sweep
     reporting work, median time, and exact-Rational endpoint growth.
   - [x] Eliminate the first major composition hot spots with direct normal
     PDF/CDF refiners, shared quantile constants, Gamma integer/half-integer
     identities, and Euler–Maclaurin Bessel-Y constants.
   - [x] Add modified Bessel `I`/`K` families under `.bessel`.
   - [x] Add reusable certified quadrature before incomplete gamma/beta, Airy,
     and elliptic-integral families.
   - [x] Extend Gamma and Zeta across their remaining real domains with
     explicit pole, sign, and continuation policies.
   - [x] Add generic `Enclose`, `Refine`, `Compare`, `Sign`, root isolation,
     adaptive sampling, integration, and optimization.
   - [x] Define absolute/relative error budgets and propagation rules.
   - [x] Define refinement-cache semantics in the shared contract. A backend
     may reuse prior work, but every certified result in one refinement history
     must be compatible with and nested inside the applicable earlier
     enclosure; cache hits must retain evidence, provenance, requested
     precision, achieved precision, and work accounting.
   - [x] Define backend-neutral certified-constant requests for at least `pi`.
     Natural `Exp(1)` now provides certified `e` bounds; named constants must
     provide exact rational bounds, evidence/provenance,
     and a finite verification path independent of trusting a displayed decimal
     or an unbounded computation.
   - [x] Add capability negotiation and explain why an algorithm/backend pair
     was selected.
3. **Phase 3 — Certified nonlinear, differential, and ODE methods**
   - [x] Publish scalar `IntervalNewton` as a bounded box-classification and
     contraction service independent of the Kantorovich constructor. Distinguish
     excluded, unique, contracted, derivative-zero, stalled, and exhausted
     outcomes; retain every interval step and all differentiability/derivative
     identity assumptions.
   - [x] Add multidimensional Krawczyk classification and contraction using
     rational boxes, checked Calculus Jacobians, exact midpoint
     preconditioners, bounded iteration, and independently replayed
     excluded/unique/unresolved results.
   - [ ] Add interval-Newton linear solves and bounded box subdivision on the
     same contracts, retaining every unresolved box when work ends.
   - [x] Define `rix.ode.problem@1`, `rix.ode.solution@1`, and dense-output/tube
     segment records for forward IVPs. Preserve the independent variable,
     ordered state, parameters, units, inert events, and regularity assumptions;
     accept vector records while keeping the first executable solver scalar.
   - [ ] Extend those records with higher-order reductions, checked event
     specifications, backward intervals, and a distinct boundary-value problem
     kind.
   - [x] Start the educational solver ladder with deterministic exact-rational
     fixed-step Euler/RK4 demonstrations and a separately labeled validated
     Picard self-map/Lipschitz tube. Preserve partial certified segments when a
     tube search exhausts its budget.
   - [ ] Add exact recognized solutions, adaptive embedded Runge-Kutta with
     disclosed local-error estimates, then validated Taylor-model or interval
     Runge-Kutta segments with sharper truncation evidence.
   - [ ] Generalize wrapping and dependency control beyond the implemented
     order-two, segmentwise-recentered Taylor remainder to adaptive
     subdivision, polynomial/affine models, and explicit resolution floors.
     Preserve partial trajectories and unresolved event-time intervals when
     the budget ends.
   - [ ] Add multidimensional optimization and implicit-function refinement on
     the same box/work/result vocabulary.
   - [ ] Feed nonlinear and ODE results to Solve, adaptive Geometry, Plot, and
     Scene3D without requiring those consumers to import a concrete backend.
   - [x] Add tutorial contrasts between Kantorovich entry certification and
     direct interval Newton as alternatives and as complementary stages.
   - [x] Extend the tutorial comparison from scalar Newton to checked
     multidimensional Krawczyk boxes.
   - [x] Extend it with approximate ODE trajectories, Picard tubes,
     second-order Taylor recentering, and certified interval-Newton event
     isolation.
4. **Phase 4 — Advanced numerical orchestration**
   - [ ] Add sparse methods, PDE helpers, continuation, and precision
     escalation across multiple backends.
   - [ ] Explore parallel/distributed work policies with reproducible results.
   - [ ] Add optional JavaScript, WebAssembly, and native acceleration providers
     behind the same RiX request/result protocol; accelerated paths must not
     change evidence semantics.

### `.ode`

1. **Phase 1 — Portable IVPs and educational trajectories**
   - [x] Add a pure-RiX browser-safe plugin over public Calculus expressions
     and Numerics evidence, with portable problem, solution, and segment
     records.
   - [x] Add deterministic fixed-step scalar Euler and classical RK4 while
     labeling their missing discretization-error bounds explicitly.
   - [x] Reject interval initial states in approximate solvers rather than
     silently taking midpoints; preserve them in validated calculations.
2. **Phase 2 — First validated scalar flow**
   - [x] Add bounded rational Picard self-map tubes, checked symbolic state
     derivatives, Lipschitz uniqueness, endpoint enclosures, and partial-work
     results.
   - [x] Add a runnable tutorial contrasting exact arithmetic, approximation,
     validation, and bounded failure.
3. **Phase 3 — Systems, adaptation, and events**
   - [x] Add vector Euler/RK4 execution and componentwise validated Picard boxes
     using a checked full Jacobian and an explicit contraction bound.
   - [x] Add second-order Taylor-remainder wrapping control with segmentwise
     recentering to the validated scalar and vector flow; retain that general
     polynomial Taylor models and affine arithmetic are not yet implemented.
   - [x] Add adaptive RK4 step-doubling demonstrations with exact local-error
     estimates, bounded rejection, and no false global certificate.
   - [x] Add adaptive validated subdivision with bounded attempts, minimum
     step limits, optional certified local remainder tolerance, and retained
     rejection evidence and certified partial trajectories.
   - [ ] Generalize the separately certified Taylor/Picard method beyond its
     implemented order-two remainder to higher-order polynomial/affine models.
   - [x] Add portable event records, observed sign-change bisection for
     approximate dense output, and certified no-event exclusions over tubes.
   - [x] Prove event existence/uniqueness on second-order Taylor segments with
     a checked endpoint bracket, total event derivative, and interval Newton.
   - [ ] Add higher-order dense certified output, backward integration, and
     Plot/Scene3D adapters.
   - [ ] Add shooting/collocation-oriented boundary-value problem records and
     solvers after vector IVPs and nonlinear box services stabilize.
4. **Phase 4 — Advanced differential equations**
   - [ ] Add stiff methods, differential-algebraic equations, delay equations,
     continuation, symplectic methods, and selected PDE method-of-lines tools.

### `.algebra`

1. **Phase 1 — Exact polynomial object and transformation**
   - [x] Move one coherent capability beyond core helpers: polynomial values,
     evaluation, quotient/remainder, and factor/equality metadata.
   - [x] Reproduce synthetic division through portable `Grid` output.
   - [x] Move callable Polynomial identity into the focused `.poly` dependency,
     with `.polynomial` and `.p` manifest aliases and concise backtick/postfix
     construction.
   - [x] Preserve Polynomial identity through arithmetic, composition, reactive
     dependency chains, receiver methods, and quotient/remainder operators.
   - [x] Move the canonical Polynomial implementation and exact algorithms to
     pure RiX; retain the old JavaScript implementation only as a reference and
     route remaining host consumers through a single-identity adapter.
   - [x] Add `.Host.RegisterMethod` so pure-RiX plugins can add guarded,
     mount-owned receiver methods to existing semantic/runtime types.
   - [x] Make `.algebra` a pure-RiX presentation façade over `.poly`, including
     verified division metadata and portable synthetic-division Grids.
   - [x] Provide README documentation and a tutorial connecting exact
     polynomial work to the existing synthetic-division layout.
   - [x] Add exact round-trip and plugin-loading tests.
   - [x] Add focused `.ratfun` RationalFunction values with `.rf` and
     `.rationalFunction` aliases, `.R()` symbolic/structural conversion,
     canonical gcd cancellation, Polynomial `/` promotion, ordinary field
     operators, composition, reactive rebuilds, records, docs, and a tutorial.
2. **Phase 2 — Polynomial and rational-function algorithms**
   - [x] Port `.ratfun` to pure RiX over the single pure-RiX Polynomial
     identity; retain its JavaScript implementation only as a comparison and
     temporary `.fracfun` compatibility source.
   - [x] Preserve `.fracfun` as the documented host boundary for paired
     display/evaluation closures rather than exposing private evaluator IR as a
     plugin ABI. Its conditional pure-RiX migration is tracked as Phase 4 work,
     not as a blocker for the exact Algebra Phase 2 surface.
   - [x] Expose public polynomial gcd/lcm (and route RationalFunction
     cancellation through that shared API),
     square-free decomposition, rational roots, factor evidence, and
     resultants.
   - [x] Add explicit centered-expansion and factorization presentation values;
     keep canonical Polynomial equality on expanded coefficients and verify
     every presentation when converting back.
   - [x] Add exact-Q[x] RationalFunction partial fractions, factored/together
     presentation views, pole/zero multiplicity evidence, a public coefficient
     domain descriptor, and exact checked reconstruction from portable records.
   - [x] Add `.fracfun` as the separate form/domain-preserving value for
     inherited exclusions and removable holes. Canonical RationalFunction
     domain continues to use only the reduced denominator intentionally.
   - [x] Expose versioned exact sign/root-count protocols to Numerics and
     Geometry, including certified enclosure fallback, explicit endpoint
     policy, square-free distinct-root counting, and retained Sturm evidence.
   - [x] Keep transformations explicit and provenance-preserving through
     versioned transformation events retained by values and presentation
     records.
3. **Phase 3 — Algebraic systems**
   - [ ] Add Gröbner/elimination services, multivariate polynomial structures,
     and algebraic extension fields.
   - [ ] Generalize Polynomial and RationalFunction coefficient domains beyond
     exact univariate Q[x] once those extension-field identities exist.
   - [ ] Produce exact intersection/root evidence for Geometry.
4. **Phase 4 — Proof and computer-algebra ecosystem**
   - [ ] Port `.fracfun` to pure RiX after the public symbolic contract can
     construct and rewrite paired display/evaluation closures while retaining
     source-domain restrictions; do not expose private evaluator IR to do so.
   - [ ] Add certificate import/export and optional external CAS adapters.
   - [ ] Explore verified algorithms and proof-assistant exchange.

### `.linalg`

The cross-cutting `Shaped`/`Matrix`/`Vector`/mathematical-`Tensor` migration is
in progress. Its design contract and detailed implementation checklist are
tracked in
[Shaped values, matrices, vectors, and mathematical tensors](../documentation/design/eval/shaped-array-matrix-tensor-plan.md).

1. **Phase 1 — Exact dense systems and coordinate-aware tensors**
   - [x] Canonicalize rectangular `[a,b; c,d]` and higher-rank repeated-semicolon
     literals into the Shaped runtime used by `{:2x2: ...}`.
   - [x] Add exact `Rref`, `Rank`, `Determinant`, `Inverse`, and `Solve` over
     Integer/Rational rank-2 tensors, with unique, underdetermined, and
     inconsistent result states.
   - [x] Add basis-free `VectorSpace`, ordered `Frame`, `Vector`, `Covector`,
     and coordinate-aware tensors with explicit dual/primal slots.
   - [x] Transform every tensor axis between bases. Non-bang `Transform`
     returns a new representation sharing tensor identity and linking to the
     previous object through `equivalentTo`; `Transform!` retains a snapshot
     link while updating the receiver.
   - [x] Register the `LinearAlgebra` and `Exact` groups, versioned services and
     schemas, reference documentation, tutorial, and focused tests.
   - [x] Port the dense algorithms, typed coordinate values, transformations,
     tensor operators, and bounded lineage to pure RiX; retain the former host
     implementation only as a non-discoverable comparison source.
2. **Phase 2 — Exact decompositions and coordinate maps**
   - [x] Add replayable Bareiss fraction-free elimination, row-pivoted exact
     LU/LDU, row/column/null spaces, determinant certificates, and reusable
     factorization objects with exact `Solve`, `Inverse`, and `Verify` methods.
   - [x] Add reduced exact QR over tall/square Rational matrices whose
     orthogonalized column norms have exact Rational square roots; report
     unsupported coefficient extensions, dependent columns, and wide shapes
     with structured diagnostics.
   - [x] Add linear maps between distinct vector spaces, composition, inverses,
     dual spaces, tensor products, contractions, and explicit pushforward and
     pullback operations.
   - [x] Add a versioned linear-realization protocol so domain objects retain
     their own identity and operations while exposing linked Vector views;
     use degree-at-most-`n` polynomial spaces as the first finite adapter.
   - [x] Make coordinate lineage serializable with stable identity records;
     in-memory lineage is already bounded and retains its origin.
   - [x] Define Shaped arithmetic as exact-shape elementwise operations or
     scalar application only, with no implicit broadcasting; keep Matrix
     multiplication separate and provide explicit `Hadamard`.
3. **Phase 3 — Spectral, geometric, and validated linear algebra**
   - [ ] Add characteristic/minimal polynomials, eigenspaces, rational/Jordan
     canonical forms where exact, and approximate Eigen/SVD/QR providers with
     residual and conditioning reports.
   - [ ] Add metric tensors, musical isomorphisms, raising/lowering indices,
     orthogonal/orthonormal coordinates, and change-of-basis checks that retain
     variance semantics.
   - [ ] Add coordinate charts and Jacobian-driven transformations for
     coordinate-dependent tensor fields, clearly separated from linear basis
     changes.
   - [ ] Integrate Ball/interval providers for validated linear solves,
     enclosures, and singular/ill-conditioned diagnostics.
4. **Phase 4 — Sparse, accelerated, and certified backends**
   - [ ] Add sparse matrix/tensor formats and iterative solvers with explicit
     convergence and reproducibility policies.
   - [ ] Add countably infinite frames with exact finite-support sparse vectors;
     use the space of all finite polynomials as the first implementation, then
     design separate lazy/oracular and topological contracts for genuinely
     infinite coordinate expansions.
   - [ ] Add typed-array, SIMD/WebAssembly, GPU, and optional native providers
     behind `rix.linear-algebra@1` without changing exact/evidence semantics.
   - [ ] Add replayable elimination/decomposition certificates and optional
     proof-assistant verification.

### `.optimize`

1. **Phase 1 — Exact standard-form linear programming**
   - [x] Add exact `LinearProgram` values for `A*x <= b`, `x >= 0`, and
     maximize/minimize objectives, with explicit Phase 1 validation.
   - [x] Implement deterministic primal simplex from a nonnegative right-hand
     side, exact Rational tableaux, and optimal/unbounded/iteration-limit
     results.
   - [x] Return the exact solution, objective, slacks, basis, work count,
     tableau, and diagnostics through versioned portable result schemas.
   - [x] Register `Optimization`/`Exact` groups, depend on the linear-algebra
     service, and add documentation, tutorial, and focused tests.
   - [x] Port the Phase 1 model, evaluator, and deterministic exact simplex
     implementation to pure RiX; retain the JavaScript algorithm only as a
     non-discoverable reference source.
2. **Phase 2 — General LP forms and certificates**
   - [x] Add Phase I feasibility, equality and greater-than constraints,
     arbitrary variable bounds, free variables, presolve, and degeneracy/cycle
     policies.
   - [x] Return exact primal/dual solutions and checkable certificates for
     optimality, infeasibility, and unboundedness; expose sensitivity ranges.
   - [x] Add revised/simplex factorization reuse and a stable model interchange
     schema.
3. **Phase 3 — Broader mathematical optimization**
   - [ ] Add branch-and-bound integer/mixed-integer LP with bounded work and
     incumbent/gap results.
   - [ ] Add exact convex quadratic cases plus nonlinear constrained
     optimization dispatch through Numerics, including gradients, Hessians,
     KKT residuals, and certified unresolved regions where available.
   - [ ] Consume symbolic `{#}` constraints and objectives through `.solve`
     without silently weakening exact constraints.
4. **Phase 4 — Provider ecosystem and large-scale optimization**
   - [ ] Negotiate sparse, parallel, WebAssembly/native, and external solver
     providers with reproducible model snapshots and honest evidence levels.
   - [ ] Add decomposition/column-generation hooks and proof/certificate import
     and export without making a vendor model format the RiX value model.

### `.solve`

1. **Phase 1 — Exact affine equality systems**
   - [x] Consume `{#}` specs through public symbolic-role helpers and preserve
     the spec as inert source/provenance.
   - [x] Classify and linearize exact affine definitions/equalities with caller
     supplied exact input values, rejecting inequalities and nonlinear terms
     explicitly.
   - [x] Delegate the resulting matrix problem to `rix.linear-algebra@1` and
     return named exact solutions plus the underlying rank/RREF evidence.
   - [x] Add direct matrix `Linear`, symbolic `System`, and `Classify` entry
     points, the `Solve`/`Symbolic`/`Exact` groups, docs, tutorial, and tests.
   - [x] Port the symbolic consumer to pure RiX over `.InspectSpec`,
     `.SpecRoles`, and the pure `rix.linear-algebra@1` service; retain the host
     implementation only as a non-discoverable comparison source.
2. **Phase 2 — Domain dispatch and solution sets**
   - [x] Dispatch linear inequalities/objectives to `.optimize`, univariate
     polynomial equations to `.poly`/`.algebraicReal`, and supported scalar
     numerical equations to `.numerics`.
   - [x] Define finite, parametric, empty, unbounded, and branch-valued Solution
     objects with substitution, residual checking, assumptions, and provenance.
   - [x] Support role overrides, parameter declarations, and mixed
     definition/constraint normalization without inferring direction from
     statement order.
3. **Phase 3 — Polynomial and nonlinear systems**
   - [ ] Consume multivariate polynomial/Groebner/elimination services from
     `.algebra`, returning exact components and isolating boxes when possible.
   - [ ] Add multidimensional interval Newton, continuation, implicit-function
     refinement, branch policy, singular-Jacobian diagnostics, and partial
     certified results through `.numerics`.
   - [ ] Dispatch constrained nonlinear systems jointly with `.optimize` while
     keeping feasibility, root finding, and objective optimization distinct.
   - [ ] Stabilize a bounded box-result schema with exact variable order,
     excluded/unique/unresolved boxes, branch provenance, singular-Jacobian
     diagnostics, incumbent approximations, and resumable work-policy inputs.
   - [ ] Add tutorials that compare exact polynomial components, direct scalar
     interval Newton, multidimensional Krawczyk subdivision, and an explicitly
     unresolved singular system.
4. **Phase 4 — Constraint and proof ecosystem**
   - [ ] Add pluggable SMT/CAS/constraint-programming providers, units/domain
     reasoning, and mixed discrete/continuous systems behind versioned service
     capabilities.
   - [ ] Import/export replayable certificates and proof obligations, retaining
     exact assumptions and never promoting heuristic output to proof.

### `.fraction`

1. **Phase 1 — Representation-sensitive exact fractions**
   - [x] Surface core unreduced `Fraction` values through `.fraction`, `.frac`,
     and `.f`, while retaining structural-backtick construction.
   - [x] Add unreduced arithmetic, pair equality, value equivalence/order,
     mediants, reduction/canonical conversion, records, and receiver methods.
   - [x] Add `AddLikeDenominator` and `AddLCMDenominator` classroom policies.
   - [x] Document and tutorialize the Rational-versus-Fraction boundary.
2. **Phase 2 — Fraction intervals and Farey exploration**
   - [x] Surface core `FractionInterval` with ordered representation-sensitive
     endpoints, bounded mediant subdivision, and explicit conversion to the
     canonical RationalInterval.
   - [x] Add complete bounded Farey sequences with adjacency evidence plus
     portable Stern-Brocot tree, exact path, and classroom Grid views through
     the pure-RiX `.sternBrocot` companion.
   - [x] Provide explicit normalized `.fraction.Infinity(sign)` boundaries,
     render them as `-1/0` or `1/0`, reject their conversion to RationalInterval,
     and continue rejecting `0/0` at the trusted construction bridge.
3. **Phase 3 — Representation-aware algorithms**
   - [x] Add continued-fraction/Farey interoperability and bounded searches
     that retain component provenance.
4. **Phase 4 — Evidence and interchange**
   - [ ] Add portable representations and verification records for fraction
     paths, parentage, and classroom derivations.

### `.fracfun`

1. **Phase 1 — Form-preserving callable algebra**
   - [x] Add `.fracfun`, `.fractionFunction`, and `.ff` entry for polynomial
     and quotient forms without implicit expansion, combination, or reduction.
   - [x] Preserve operation trees and source-domain evaluation while making
     `Simplify`, `Expand`, `Together`, `Recenter`, and `Cancel` explicit.
   - [x] Cache explicit canonical Polynomial/RationalFunction projections and
     distinguish form equality, value equivalence, and same-domain function
     equality.
   - [x] Support composition, exact Fraction evaluation, reactive rebuilds,
     records, documentation, and a tutorial.
2. **Phase 2 — Factored and decomposed presentations**
   - [x] Add verified `Factor`, square-free, and partial-fraction presentations
     without changing the authoritative source domain.
   - [x] Add pole/zero multiplicity and removable-hole evidence.
   - [x] Add presentation-aware rendering and side-by-side transformation
     Grids for teaching.
3. **Phase 3 — Broader coefficient domains**
   - [ ] Support multivariate forms and declared coefficient domains while
     keeping canonical projections optional and inspectable.
4. **Phase 4 — Transformation evidence**
   - [ ] Export replayable transformation histories and optional CAS/proof
     certificates.

### `.cas`

1. **Phase 1 — Browser-safe course algebra**
   - [x] Compose public Calculus, Polynomial, and RationalFunction services
     behind a focused `.cas` namespace without external executables.
   - [x] Add replay-checked graph simplification and exact polynomial
     normalize, expand, collect, and factor views.
   - [x] Add structured unsupported outcomes instead of heuristic fallback.
2. **Phase 2 — Common calculus integration ladder**
   - [x] Integrate sums, constant factors, integer and affine powers, affine
     reciprocals and exponentials, affine logarithms by parts, and
     polynomial-times-exponential products.
   - [x] Consume exact RationalFunction partial fractions and integrate
     polynomial and repeated rational-linear terms with visible real-log
     branch obligations.
   - [x] Add replay checking, schemas, reference documentation, a runnable
     tutorial, and focused tests.
3. **Phase 3 — Remaining high-frequency course cases**
   - [x] Add an explicit absolute-value Calculus graph so reciprocal
     antiderivatives can represent `log(abs(x))` without restricting to the
     positive real branch.
   - [x] Add affine sine/cosine antiderivative rules and irreducible quadratic
     partial fractions with exact completed-square evidence and `Atan` graphs.
   - [ ] Add bounded trigonometric power/product reductions, selected radical
     substitutions, and exact definite-integral symmetry rules.
   - [ ] Broaden safe simplification with assumption-aware sign, power,
     radical, and rational-expression rules while keeping rule replay bounded.
4. **Phase 4 — General and external CAS**
   - [ ] Explore Risch-style integration, large heuristic identity portfolios,
     special-function reduction, and optional external CAS adapters without
     making them part of the isolated browser base.

### `.symbolic`

1. **Phase 1 — Formal-workspace meta-plugin**
   - [x] Load `.fraction` and `.fracfun` through one `.symbolic` capability;
     transitively expose their canonical `.poly` and `.ratfun` projections.
   - [x] Keep focused plugin ownership and schemas intact.
2. **Phase 2 — Discoverable transformation registry**
   - [x] List available formal/canonical transformations and their owning
     plugins without centralizing their implementations.
3. **Phase 3 — Assumptions and domains**
   - [ ] Coordinate explicit assumptions and restricted-domain wrappers across
     formal symbolic plugins.
4. **Phase 4 — External symbolic providers**
   - [ ] Negotiate optional CAS and proof backends through capability services.

### `.logic`

1. **Phase 1 — Propositional exploration**
   - [x] Add inert proposition/formula records, valuations, truth tables,
     satisfiability/validity checks, and counterexample witnesses.
   - [x] Implement checked transformations to negation, conjunctive, and
     disjunctive normal forms without treating display rewrites as proofs.
2. **Phase 2 — Undergraduate proof systems**
   - [x] Add replayable line-by-line checks for premises/assumptions,
     conjunction introduction/elimination, disjunction introduction, and
     modus ponens; retain every local result and failed goal.
   - [x] Add scoped subproof discharge, implication introduction, disjunction
     elimination, negation rules, and a natural-deduction tree presentation for
     the small intuitionistic-compatible propositional core.
   - [ ] Add a separate sequent-calculus rule set and tree presentation rather
     than relabeling natural-deduction evidence as sequents.
   - [ ] Provide finite-model exploration for a bounded first-order subset,
     clearly separating a found model/countermodel from an unbounded theorem.
3. **Phase 3 — Educational integration**
   - [x] Add portable truth-table, normal-form, and checked-derivation records
     plus a runnable introductory tutorial.
   - [x] Add portable syntax-tree and scoped natural-deduction proof-tree views
     suitable for an eventual `rix-ed` undergraduate logic course.
   - [ ] Add semantic tableaux with replayable open/closed branch evidence and
     explicit countervaluations from open propositional branches.
   - [ ] Connect algebraic/interval certificates to logic only through explicit
     proposition and evidence adapters; do not build a general research prover.
4. **Phase 4 — Automated and external proving**
   - [ ] Explore SAT/SMT providers, proof-term interchange, richer first-order
     automation, and proof-assistant bridges as optional capabilities.

### `.calculus`

1. **Phase 1 — Portable abstract functions and expression graphs**
   - [x] Add a pure-RiX `.calculus` plugin with the stable
     `rix.calculus.function@1` and `rix.calculus.expression@1` schemas.
   - [x] Separate semantic function identity, domain/codomain declarations,
     and mathematical facts from optional executable implementations.
   - [x] Add immutable builders for exact constants, variables, semantic
     applications, and arithmetic operation graphs without exposing private
     evaluator IR.
   - [x] Provide `Exp` as the first named abstract function, characterized by
     `y' = y` together with `y(0) = 1`, and allow an explicitly supplied
     Numerics callable to realize concrete evaluations.
   - [x] Bundle the plugin and add reference documentation, a design record, a
     runnable tutorial, and focused contract/Numerics-link tests.
2. **Phase 2 — Exact differential calculus and the public spec bridge**
   - [x] Add a versioned bidirectional bridge between Calculus expression
     records and core `{#}` specifications. It must use public constructors,
     preserve free variables and semantic application IDs, reject unsupported
     nodes, and never require plugins to mutate evaluator IR. Assumption and
     branch records remain part of the registry/domain work below.
   - [x] Export the same expression import/build helpers through `@ratmath/rix/eval` for
     JavaScript plugins; migrate a small existing consumer to prove that pure
     RiX and host plugins share one contract. `.poly` now performs symbolic
     degree analysis through this public expression representation.
   - [x] Add a semantic-function registry keyed by stable IDs rather than
     binding spellings or object identity. Keep exact rules, implementations,
     domains, branches, and evidence as separate registry entries.
   - [x] Implement exact linearity, product, quotient, Integer-power, and unary
     semantic chain rules over expression graphs, including `D Exp = Exp`.
     Non-Integer powers remain blocked on the domain/branch work below.
   - [x] Preserve domain and branch obligations instead of applying
     unconditional rewrites. `rix.calculus.transformation@1` keeps the exact
     derivative, obligations, and rule evidence together;
     `rix.calculus.obligation@1` covers quotient/negative-power singularities,
     real-principal `Log`, `Sqrt`, and `Asin`, and principal `ComplexLog`.
     `.fracfun` exports its paired forms and denominator restrictions through
     the same public expression contract, and `.symbolic` provides the
     cross-plugin façade.
   - [x] Evaluate exact expression or transformation graphs by resolving
     concrete implementations through stable semantic IDs. Evaluation results
     record every implementation link and retain unresolved transformation
     obligations; no numerical implementation becomes an exact derivative
     rule or proof that its domain conditions hold.
   - [x] Add higher derivatives, partial derivatives, gradients, Jacobians,
     and Hessians with explicit variable selection. Repeated and mixed
     derivatives accumulate prior obligations/evidence, while
     `rix.calculus.derivative-collection@1` keeps multivariate results and
     their component transformations together.
   - [x] Give expression graphs deterministic structural keys, use registered
     differential identities for conservative power-rule reuse (`f' = c f`),
     and share repeated semantic applications during linked evaluation with
     visible reuse provenance and an explicit opt-out.
3. **Phase 3 — Integration and equation specifications**
   - [x] Distinguish a selected primitive, an antiderivative family with its
     integration constant, and a definite integral with endpoints.
   - [ ] Complete the shared Calculus-facing course integration ladder. `.cas`
     now covers polynomial powers/sums, `1/x` on an explicit positive branch,
     affine power/exponential/logarithmic forms, selected integration by parts,
     rational linear partial fractions, `Log(Abs(...))`, affine sine/cosine,
     and irreducible-quadratic cases. Trigonometric reductions, selected
     radicals, and definite-integral symmetry rules remain.
   - [ ] Complete the checked simplifier. `.cas` now provides bounded replay
     for ordinary constant folding and polynomial collect/expand/factor views;
     sign-aware powers/roots, hole-preserving rational cancellation, and a
     small named library of standard trigonometric identities remain. Keep
     every domain condition visible and make transformation direction
     explicit.
   - [ ] Apply exact integration identities when justified, then negotiate
     certified Numerics quadrature or explicitly approximate fallback while
     retaining assumptions, work, and evidence.
   - [ ] Represent differential, boundary-value, and integral equations as
     inert portable problem specifications, including initial/boundary data
     and uniqueness assumptions.
   - [ ] Let `.solve` and `.numerics` consume those problems through protocols;
     keep symbolic formulation separate from solver ownership.
   - [ ] Allow opaque numerical functions to advertise derivative
     implementations or certified derivative bounds without treating finite
     differences as exact identities.
4. **Phase 4 — Theorem evidence and external calculus providers**
   - [ ] Record replayable rule applications, assumptions, and proof/evidence
     provenance for calculus transformations.
   - [ ] Negotiate optional CAS, automatic-differentiation, interval, and proof
     backends by semantic function ID and declared capability.
   - [ ] Explore verified special-function identities, analytic continuation,
     distributions, and generalized derivatives without weakening the base
     exactness contract.

### `.analysis`

1. **Phase 1 — Function sequences and explicit convergence claims**
   - [x] Depend on `rix.abstract-function@1` and a cloneable/effective sequence
     protocol rather than inventing a second function representation.
   - [x] Add first-class function-sequence values with an index domain,
     function domain/codomain, term constructor, and optional effective tail
     evidence.
   - [x] Distinguish pointwise, uniform, almost-everywhere, in-measure, and
     norm convergence in versioned claim/result records.
   - [x] Implement one end-to-end geometric function-series example with an
     exact or certified uniform tail bound; return `unknown` for an unsupported
     convergence claim rather than sampling it into a theorem.
   - [x] Add README documentation, a runnable tutorial, and focused tests that
     prevent exchanging limits with evaluation solely from finite samples.
2. **Phase 2 — Limits, series, and justified exchanges**
   - [x] Add scalar/function limits, limsup/liminf, infinite series, Cauchy
     criteria, and effective moduli where available.
   - [x] Encode hypotheses for exchanging limits with continuity, integration,
     differentiation, summation, and expectation; unresolved hypotheses remain
     visible obligations.
   - [x] Interoperate with `.cauchy`, `.numerics`, and Calculus definite
     integrals without making any one real-number representation mandatory.
4. **Phase 4 — Function spaces, operators, and proof-connected analysis**
   - [ ] Add explicit metric, normed, Banach, Hilbert, and selected `L^p`
     function-space records with domains and measures.
   - [ ] Represent continuity, compactness, bounded operators, weak/strong
     convergence, and approximation error under stated topologies.
   - [ ] Add Fourier/power-series and orthogonal-expansion examples with
     convergence regions and truncation evidence.
   - [ ] Exchange theorem obligations and certificates with external proof
     systems while retaining a portable RiX claim format.
   - [ ] Explore distributions, Sobolev spaces, spectral methods, semigroups,
     and PDE convergence only after the topology/evidence contracts stabilize.

### `.ball`

1. **Phase 1 — Certified real ball arithmetic**
   - [x] Implement midpoint-radius rational or dyadic balls with outward
     rounding.
   - [x] Demonstrate a certified square root or exponential enclosure.
   - [x] Register `EnclosableReal`.
   - [x] Add documentation, tutorial, and containment tests.
2. **Phase 2 — Elementary functions and precision escalation**
   - [x] Lift main field arithmetic and Rational embedding to nested-real
     recipes, using Oracle as the cross-family target.
   - [x] Add further native roots, exp/log, trigonometry, and complex balls.
   - [x] Negotiate internal working precision through Numerics requests beyond
     the Phase 1 exact-bisection recipe.
3. **Phase 3 — Validated algorithms**
   - [ ] Add polynomial evaluation, interval Newton, validated linear algebra,
     and derivative bounds.
4. **Phase 4 — High-performance backend**
   - [ ] Explore Arb/MPFR/WebAssembly or native integration behind explicit
     permissions and reproducible serialization.

### `.cauchy`

1. **Phase 1 — Rational sequence with a modulus**
   - [x] Represent a rational Cauchy sequence plus certified tail modulus.
   - [x] Demonstrate a geometric-series real and produce a requested enclosure.
   - [x] Add README, runnable tutorial, and exact tail-bound tests.
   - [x] Register `Refinable`/`EnclosableReal`.
2. **Phase 2 — Constructions and oracle adapter**
   - [x] Add arithmetic with computed moduli.
   - [x] Add same-family arithmetic recipes, exact Rational embedding, and the
     certified-singleton Oracle adapter.
   - [x] Implement the paper-compatible funnel adapter.
   - [x] Preserve lazy terms and bounded work.
3. **Phase 3 — Limits of generated sequences**
   - [x] Add convergence transformations and proof-carrying limit constructors.
   - [x] Diagnose sequences without effective tail information.
4. **Phase 4 — Advanced sequence analysis**
   - [ ] Explore constructive completeness and exchanges with theorem/proof
     systems.

### `.continuedFraction`

1. **Phase 1 — Exact convergents**
   - [x] Represent finite and lazy simple continued fractions.
   - [x] Demonstrate convergents for a quadratic irrational with exact rational
     error intervals.
   - [x] Add README, tutorial, parser interoperability, and convergent tests.
   - [x] Register bounded enclosure/refinement.
2. **Phase 2 — Arithmetic and recognition**
   - [x] Add periodic quadratic forms, best-approximation queries, and selected
     arithmetic transformations.
   - [x] Add same-family arithmetic recipes, exact Rational embedding, and
     conversion to Oracle through certified enclosure evidence.
   - [x] Make exact Gosper homographic and bihomographic transducers the native
     same-family default for `+`, `-`, `*`, and `/`, with bounded diagnostics.
3. **Phase 3 — Generalized continued fractions**
   - [x] Add nonregular generalized forms and their representation-specific
     normalization and zero-separation rules.
4. **Phase 4 — Research algorithms**
   - [x] Explore exact real arithmetic via continued-fraction transducers.
   - [ ] Add deeper symbolic-algebra interoperability and correlation proofs.

### `.algebraicReal`

1. **Phase 1 — Isolating-interval algebraic real**
   - [x] Represent a square-free integer polynomial plus a rational isolating
     interval and root index/evidence.
   - [x] Demonstrate exact `sqrt(2)` comparison and refinement.
   - [x] Add README, tutorial, serialization, and root-isolation tests.
   - [x] Register exact sign and enclosure capabilities.
   - [x] Reuse the canonical `.poly` Polynomial value and algorithm service for
     primitive normalization, derivatives, Sturm chains, root counts, and root
     bounds; remove the private duplicate polynomial implementation.
2. **Phase 2 — Field operations**
   - [x] Add comparison and arithmetic using resultants/root isolation.
   - [x] Add the general arithmetic surface through immutable enclosure
     recipes, preserving the semantic family for algebraic/Rational operands
     and using Oracle across real families.
   - [x] Exchange canonical Polynomial values and evidence with `.poly` and
     `.algebra` through `rix.polynomial@1`.
3. **Phase 3 — Certified functions and geometry**
   - [ ] Support exact coordinates from conic intersections and selected
     algebraic transformations.
4. **Phase 4 — Efficient number fields**
   - [ ] Add primitive-element management, canonicalization, and external CAS
     certificate adapters.

### `.complex`

The representation and future Cayley–Dickson boundaries are described in
[`complex/architecture.md`](complex/architecture.md). Lowercase `.complex` is
the certified numerical singleton layer; it does not replace the core exact
`.Complex` collection or the finite rectangular `.ball.Complex` set value.

1. **Phase 1 — Certified complex singletons over real backends**
   - [x] Add `ComplexReal(re,im)`/`.complex.FromParts` over exact Rationals or
     any certified arbitrarily refinable singleton real, including mixed real
     families that meet through Oracle.
   - [x] Add Rational embedding, native `+`, `-`, `*`, `/`, unary negation,
     conjugation, norm squared, and exact-zero rejection.
   - [x] Add `rix.enclosable-complex@1` with certified axis-aligned rectangular
     `Enclose`/`Refine` results, bounded work sharing, component evidence, and
     no false use of the ordered `EnclosableReal` result type.
   - [x] Add explicit `ZeroStatus` origin-separation evidence; retain deferred
     zero separation in division recipes instead of guessing from overlap.
   - [x] Add representation-generic `Exp`, `Sin`, and `Cos` using certified
     real Numerics identities.
   - [x] Add principal `Log`/`Sqrt` and detailed `LogResult`/`SqrtResult`
     records distinguishing resolved inputs, boundary values, zero, and an
     unresolved branch-cut enclosure.
   - [x] Reject finite Balls and Floats as singleton components, and add a
     reference README, runnable tutorial, architecture note, and focused tests.
2. **Phase 2 — Complex regions and tighter analytic kernels**
   - [x] Add first-class `ComplexRegion` values with rectangle, disc, and
     finite-union geometries; keep set images separate from singleton recipes.
   - [x] Add direct validated complex-ball series and argument reduction for
     elementary functions, selecting them ahead of Cartesian fallback when
     they produce tighter bounds.
   - [x] Preserve shared-expression correlation and add adaptive subdivision
     near poles, zeros, and branch boundaries.
   - [x] Let `.complexViz` consume the complex enclosure/branch schemas rather
     than independently interpreting sample pairs.
3. **Phase 3 — Branch sets and complex special functions**
   - [ ] Add named branches, finite branch sets, analytic-continuation paths,
     and monodromy metadata for logarithms, roots, powers, and inverse
     trigonometric functions.
   - [ ] Add certified Gamma/log-Gamma, error functions, Bessel families, and
     selected elliptic/hypergeometric functions through direct complex
     algorithms with explicit poles and cuts.
   - [ ] Add complex algebraic roots represented by a polynomial plus an
     isolating rectangle or disc rather than reducing every exact value to two
     unrelated real algebraic coordinates.
4. **Phase 4 — Validated complex analysis ecosystem**
   - [ ] Add contour integration, argument-principle root counts, analytic
     continuation caches, Taylor models, and proof-producing zero/pole
     isolation.
   - [ ] Explore Arb/Acb or equivalent acceleration behind the same portable
     enclosure and branch evidence contracts.

### `.cayley`

1. **Phase 1 — Scalar-generic Cayley–Dickson algebra**
   - [x] Generalize the recursive component kernel from `exact-algebras`
     without weakening that plugin's exact-rational schema.
   - [x] Accept a declared central real-scalar provider, retain component
     backend identities, and expose basis, dimension, conjugation, norm
     squared, and parenthesized multiplication records.
   - [x] Add certified component-box enclosure and origin/norm separation
     protocols shared with `.complex`.
   - [x] Advertise inverse/division only when the selected algebra level and
     scalar provider justify them.
2. **Phase 2 — Typed adapters and efficient multiplication**
   - [x] Add adapters for core exact Complex values, `.complex` singletons, and
     rational `exact-algebras` Quaternion/Octonion values.
   - [x] Add sparse basis multiplication and specialized dimensions 2, 4, and
     8 while retaining the recursive law as a checker.
4. **Phase 4 — Validated and later Cayley-Dickson analysis**
   - [ ] Provide power-series evaluation for one-generated associative
     subalgebras with componentwise remainder evidence.
   - [ ] Record left/right multiplication maps and order-sensitive derivative
     conventions.
   - [ ] Represent zero divisors and partial invertibility for sedenions and
     later Cayley–Dickson levels; never infer a division algebra from shape.

### `.quaternion`

1. **Phase 1 — Certified quaternion façade**
   - [x] Build a four-component typed façade over `.cayley`, with Rational and
     certified-real construction, conjugation, multiplicative norm, inverse,
     and explicit left/right division.
   - [x] Add component-box refinement and certified nonzero evidence.
   - [x] Add README, tutorial, multiplication-order fixtures, and mixed-real
     backend tests.
2. **Phase 2 — Intrinsic elementary functions**
   - [x] Implement `Exp`, principal/result `Log`, roots, powers, and
     trigonometric/hyperbolic functions through the associative slice generated
     by `1` and the vector direction.
   - [x] Make the zero-vector and negative-real-axis branch families explicit.
3. **Phase 3 — Quaternion geometry**
   - [ ] Add certified rotations/interpolation and adapters to `.scene3d`/`.nd`
     without confusing unit quaternions with arbitrary quaternion values.
4. **Phase 4 — Specialized quaternion analysis**
   - [ ] Add slice-regular versus Fueter-regular function identities, explicit
     derivative conventions, and validated one-variable series. This remains
     an optional research program rather than a prerequisite for ordinary
     quaternion arithmetic, elementary functions, or spatial rotations.

### `.octonion`

1. **Phase 1 — Certified octonion façade**
   - [x] Build an eight-component typed façade over `.cayley`, preserving
     written parentheses and exposing conjugation, composition norm, inverse,
     and explicit division conventions.
   - [x] Add alternativity, Moufang-identity, and nonassociativity fixtures
     over exact Rationals before enabling generic real components.
   - [x] Add component-box refinement, documentation, and a runnable tutorial.
2. **Phase 2 — Intrinsic one-variable functions**
   - [x] Add real-coefficient power series and slice formulas whose powers stay
     in the associative subalgebra generated by one octonion.
   - [x] Preserve branch direction sets and reject identities that reorder or
     reassociate independent octonions.
4. **Phase 4 — Octonionic analysis and geometry**
   - [ ] Add explicitly chosen derivative/function notions, `G2`-related
     transformations, and validated rotation/projection adapters.
   - [ ] Explore exceptional algebra/Jordan constructions and proof exchange
     only after nonassociative expression and evidence contracts stabilize.

### `.geometry`

1. **Phase 1 — Exact ruler-and-compass construction**
   - [x] Migrate geometry values, constructions, intersections, provenance,
     and core Graphics lowering to a discoverable pure-RiX plugin.
   - [x] Implement semantic Point, Line, Circle, and intersection result values.
   - [x] Demonstrate a perpendicular bisector/circumcircle construction that
     lowers to core `Graphics`.
   - [x] Add README, runnable tutorial, exact tests, and SVG/Canvas snapshots.
   - [x] Preserve construction provenance and unresolved intersections.
2. **Phase 2 — Transformations, conics, and constraints**
   - [x] Add segments, rays, polygons, affine/projective transforms, conics,
     loci, and simple constraints.
   - [x] Consume Algebra and Numerics protocols for exact/certified
     intersections.
   - [x] Add implicit-equation values with adaptive rendering requests.
3. **Phase 3 — Certified implicit geometry**
   - [ ] Add interval subdivision, topology-aware curve tracing, tangency and
     multiplicity evidence, and boundary-refinement callbacks.
   - [ ] Render uncertainty and unresolved cells explicitly.
   - [ ] Consume nonlinear Solve boxes and ODE dense-output/tube records for
     implicit intersections, trajectories, integral curves, and event points;
     retain exact/certified/assumed status in the Graphic metadata.
   - [ ] Add draggable parameterized constructions whose updates are ordinary
     retained events and whose failed constraints preserve the last certified
     construction plus visible repair diagnostics.
4. **Phase 4 — Proof-oriented geometry**
   - [ ] Add broad theorem evidence and automated locus exploration after the
     native algebra/nonlinear certificates stabilize.

### `.data`

1. **Phase 1 — Typed relation feeding a table**
   - [x] Implement schema, rows, projection, filter, sort, and a `TableView`
     adapter.
   - [x] Demonstrate transforming a small exact dataset and exporting CSV.
   - [x] Add README, tutorial, schema diagnostics, and deterministic tests.
2. **Phase 2 — Relational operations**
   - [x] Add joins, groups, aggregates, calculated columns, missing-value
     policy, and streaming row sources.
   - [x] Add rename, distinct, frequency, and contingency operations plus an
     explicit Interval column type with enclosing grouped aggregates.
   - [x] Preserve exact RiX cell values until exporter formatting.
3. **Phase 3 — Portable exact JSON and bounded streams**
   - [x] Add deterministic streaming JSONL parsing/rendering without lowering
     Integer, Rational, or Interval cells to binary floating point.
   - [x] Reuse bounded `RowSource` pulls for JSONL, include physical line
     numbers in diagnostics, and make blank-line, missing-value, final-newline,
     and maximum-row policies explicit.
   - [ ] Add single-document tagged-JSON relation interchange and implement the
     shared certified/refinable-real envelope specified in
     `numerics/refinable-real-json.md`; loading is inert, and unavailable
     refinement recipes degrade to independently useful snapshots.
4. **Phase 4 — Columnar, external, and large data**
   - [ ] Add Arrow/Parquet adapters, chunked column batches, and typed-tensor
     bridges only after a real interoperability or scale requirement justifies
     the dependency and exact-value extension-type policy.
   - [ ] Add permission-aware filesystem/network sources. Pure byte/text
     parsing remains permission-free; external I/O is a host capability.
   - [ ] Explore lazy plans, predicate pushdown, large-data execution, and
     reproducible provenance.

### `.stats`

1. **Phase 1 — Exact descriptive statistics**
   - [x] Compute count, exact mean, median/quantiles policy, variance, and a
     plot-ready summary for a small dataset.
   - [x] Demonstrate a summary table plus histogram/box representation.
   - [x] Add README, tutorial, and exact/edge-case tests.
2. **Phase 2 — Inference and regression**
   - [x] Add confidence objects, linear regression, diagnostics, and residual
     outputs, consuming distribution and simulation records from `.probability`.
   - [x] Use Numerics for approximate/certified computations.
   - [x] Add the common undergraduate hypothesis-test suite: one- and
     two-sample z tests, one- and two-proportion z tests, one-sample/paired/
     pooled/Welch t tests, one-way ANOVA, and Pearson chi-square goodness-of-fit
     and independence tests, with semantic result/decision records and explicit
     reference/assumption metadata.
   - [x] Add Student-t confidence intervals, Pearson correlation/slope tests,
     exact rational ordering, and certified measurement-box inference for
     known-scale z, one-sample/paired/pooled/Welch t, one-way ANOVA,
     correlation, and simple-regression slope tests using outward interval
     arithmetic with bounded subdivision.
4. **Phase 4 — Models and inference**
   - [ ] Add generalized models, resampling, Bayesian result protocols, and
     uncertainty visualization.
   - [ ] Add streaming algorithms, robust/high-dimensional methods, and
     external statistical engine adapters.

### `.probability`

Probability is deliberately separate from `.stats` (observed-data summaries
and inference) and `.data` (relations and external datasets). Its values model
laws, events, and repeatable experiments; statistics may consume its simulation
records without owning their probability semantics.

1. **Phase 1 — Exact finite laws and the normal distribution**
   - [x] Add exact `Choose`, `Permutations`, multinomial coefficients, bounded
     Cartesian products, and uniform finite-event enumeration.
   - [x] Add reusable finite, binomial, multinomial, dice-sum, and card-draw
     distribution values with exact PMFs/CDFs, moments, and sampling.
   - [x] Add certified normal PDF/CDF/quantile methods and explicitly label its
     finite-quantile-grid simulator as approximate.
   - [x] Use lexically scoped RNGs, exact rejection sampling for finite laws,
     optional seeds, replayable simulation records, and deck drawing with or
     without replacement.
   - [x] Add reference documentation, an undergrad-oriented tutorial, exact
     fixtures, and a Central Limit Theorem explanatory exploration.
2. **Phase 2 — Undergraduate distribution library**
   - [x] Add Bernoulli, categorical, geometric, negative-binomial,
     hypergeometric, and Poisson laws as named distribution constructors.
   - [x] Add continuous uniform, exponential, gamma, beta, chi-square,
     Student-t, F, lognormal, and Cauchy laws.
   - [x] Give each law a consistent PMF/PDF, CDF, quantile, moment/support, and
     seeded simulation interface, with certified enclosures where available.
   - [x] Extend the CLT exploration with live exponential, uniform, and Cauchy
     experiments, emphasizing that Cauchy means neither stabilize nor satisfy
     the finite-variance CLT hypotheses.
3. **Phase 3 — Finite random-variable structures (implemented)**
   - [x] Add finite transformations, joint laws, marginals, conditioning,
     independence, covariance, expectation of functions, and elementary Bayes
     updates.
4. **Phase 4 — Broader random variables and probability structures**
   - [ ] Add sums/convolutions and mixtures of arbitrary user laws.
   - [ ] Add law-of-large-numbers/CLT evidence records, concentration bounds,
     conditional simulation, simple Markov chains, and finite martingales.
   - [ ] Add measure/kernel protocols, stochastic processes, stopping times,
     Bayesian prior/likelihood adapters, and rare-event/variance-reduction tools.
   - [ ] Explore proof exchange and optional accelerated backends while keeping
     seeds, approximation policies, and provenance portable and explicit.

### `.document`

1. **Phase 1 — Numbered report fragment**
   - [x] Assemble core Fragment/Figure/Table values with labels, references,
     captions, and a small theme.
   - [x] Demonstrate a report containing prose, a table, and a plotted figure.
   - [x] Add README, template-language tutorial, and cross-reference tests.
2. **Phase 2 — Citations, assets, and templates**
   - [x] Add bibliography/citation values, asset manifests, numbering policies,
     headers/footers, and reusable document templates.
   - [x] Keep raw target markup behind explicit target-specific nodes.
3. **Phase 3 — Layout and publication profiles**
   - [ ] Add page/deck themes, floats, multi-column layout, indexes, and
     renderer capability negotiation.
   - [ ] Define one portable publication plan shared by HTML, Quarto, LaTeX,
     and PDF, with deterministic fallback whenever a target lacks interaction,
     animation, exact-coordinate, accessibility, or layout capabilities.
   - [ ] Preserve certified/assumed/approximate/unresolved distinctions in
     captions, tables, alternate text, and static snapshots.
4. **Phase 4 — Collaborative publishing**
   - [ ] Add deterministic batch builds over document/input sets and explicit
     target matrices, with shared templates, asset manifests, stable output
     names, bounded concurrency, and structured per-document diagnostics.
   - [ ] Add watch workflows over the document dependency graph with debounced
     invalidation, cancellation of superseded work, atomic output replacement,
     and clear recovery after a failed rebuild.
   - [ ] Explore incremental builds, accessible publication validation, and
     external CMS adapters. Filesystem watching and external publication remain
     host capabilities with explicit permissions rather than evaluator side
     effects.

---

## Scene and higher-dimensional plugins

### `.scene3d`

The RiX/host extraction sequence is specified in
[`scene3d/rix-split-plan.md`](scene3d/rix-split-plan.md).

1. **Phase 1 — Retained mesh scene**
   - [x] Define versioned Scene, perspective/orthographic Camera, Mesh,
     Polyline, PointCloud, Material, Group, and Transform values.
   - [x] Demonstrate deterministic camera-projected wireframe snapshots.
   - [x] Add reference documentation, RiX Web tutorial, schema/projection tests,
     and a CLI fixture.
   - [x] Add retained Light constructors and a lit snapshot mode.
2. **Phase 2 — Curves, surfaces, and interaction metadata**
   - [x] Add bounded exact parametric curves, axes, projected annotations,
     stable leaf picking IDs, and rational Cayley orbit-camera descriptions.
   - [x] Add adaptive parametric surfaces and richer annotation/interaction
     policies over the retained contracts.
   - [x] Provide Canvas/WebGL and raster snapshot lowering.
3. **Phase 3 — Volumes and certified surfaces**
   - [ ] Add implicit surfaces, volume data, adaptive meshes, slicing planes,
     uncertainty masks, and level-of-detail policies.
4. **Phase 4 — 3D ecosystem**
   - [x] Add browser-safe glTF 2.0 JSON export for realized geometry and basic materials.
   - [ ] Add GLB/import, cameras/lights/textures, animation, WebGPU acceleration,
     and optional AR/3D-print adapters.

### `.nd`

1. **Phase 1 — Explicit 4D projection**
   - [x] Represent N-dimensional points/polytopes and explicit exact affine projections.
   - [x] Demonstrate a Cayley-rotated 4D hypercube projected to 3D.
   - [x] Add reference documentation, tutorial, projection provenance, and deterministic tests.
   - [x] Migrate the exact ND value/projection kernel to RiX, then keep
     `ToScene3D` as a pure schema adapter over the RiX Scene3D model.
2. **Phase 2 — Fields, slices, and fibers**
   - [x] Add N-dimensional fields, affine slices, sections, fibers, and
     parameterized projection families.
   - [x] Lower results to Plot or Scene3D values.
3. **Phase 3 — Adaptive high-dimensional exploration**
   - [ ] Add implicit regions, sampling budgets, dimensional reduction, linked
     projections, and uncertainty-aware slicing.
4. **Phase 4 — Research visualization**
   - [ ] Explore topology summaries, manifold charts, and scalable
     high-dimensional interaction techniques.

### `.complexViz`

1. **Phase 1 — Domain coloring**
   - [x] Implement a documented phase/magnitude color convention.
   - [x] Demonstrate domain coloring of a rational complex function with zeros,
     poles, and unresolved samples marked.
   - [x] Add README, tutorial, color fixtures, and SVG/Canvas output tests.
2. **Phase 2 — Cayley and surface views**
   - [x] Add magnitude/phase surfaces, Cayley color mapping, Riemann sphere,
     and branch-cut metadata.
   - [x] Consume Numerics enclosures and Scene3D values.
3. **Phase 3 — Four-dimensional complex maps**
   - [ ] Add explicit projections/slices of
     `(Re z, Im z, Re f(z), Im f(z))`.
   - [ ] Support animations and linked input/output views.
4. **Phase 4 — Certified analytic visualization**
   - [ ] Add argument-principle/root-count overlays, certified pole/zero
     regions, and adaptive GPU sampling.

---

## Renderer and exporter plugins

### `.svg`

1. **Phase 1 — Portable core Graphic renderer**
   - [x] Expose current host SVG behavior through a registered renderer plugin.
   - [x] Render paths, groups, transforms, clips, text, rectangles, circles,
     figures, and accessibility metadata.
   - [x] Add README, tutorial, focused source fixtures, and CLI/runtime tests.
   - [x] Add explicit RiX Web/Notebook renderer-plugin integration tests.
2. **Phase 2 — Complete 2D scene fidelity**
   - [x] Add reusable definitions, markers, gradients, patterns, masks, style
     inheritance, font policy, and stable IDs.
   - [x] Define an exact-coordinate lowering result that retains the original
     exact value and records when SVG text rounds or approximates it. Make the
     precision/rounding policy selectable and expose approximation diagnostics
     or metadata instead of silently applying a fixed decimal cutoff.
   - [x] Add conformance fixtures for huge numerators, sub-pixel and extremely
     narrow intervals, reversed interval presentation, overlapping labels, and
     coordinates that collide only after decimal lowering.
   - [x] Report unsupported scene features.
3. **Phase 3 — Optimization and interactivity**
   - [ ] Add deterministic optimization, metadata/hit targets, animation
     lowering, and incremental scene updates.
   - [ ] Define renderer-neutral viewport and semantic-selection records for
     pan, zoom, focus, and selected mathematical objects. SVG hosts must expose
     keyboard navigation, stable accessible names/descriptions, and an
     equivalent screen-reader representation rather than pointer-only targets.
4. **Phase 4 — Production vector workflows**
   - [ ] Add font embedding/subsetting and rigorous cross-renderer conformance
     fixtures.

### `.canvas`

1. **Phase 1 — Interactive browser rendering**
   - [x] Traverse the same core Graphic tree as SVG into
     `CanvasRenderingContext2D`.
   - [x] Provide a versioned serializable plan and host `paintCanvasPlan` executor.
   - [x] Provide PNG snapshots through `.png` and visible static-interaction diagnostics.
   - [x] Add README, tutorial, and SVG/Canvas comparison
     fixtures.
   - [x] Add a browser performance/repaint tutorial and browser interaction tests.
2. **Phase 2 — Interaction services**
   - [x] Add device-pixel scaling, hit-test IDs, pointer-coordinate inversion,
     dirty-region repaint, and image asset loading.
   - [x] Implement the shared viewport/selection protocol for pan and zoom,
     preserve semantic object IDs through hit testing, and provide a DOM/text
     accessibility companion so Canvas interaction is not pointer-only or
     screen-reader silent.
4. **Phase 4 — Large and accelerated browser rendering**
   - [ ] Add OffscreenCanvas/worker rendering, path caches, large heat maps, and
     animation timing.
   - [ ] Share Scene3D/large-data lowering with WebGL or WebGPU without changing
     the semantic Graphic contract.

### `.png`

1. **Phase 1 — Deterministic raster snapshot**
   - [x] Rasterize one Graphic through SVG at explicit pixel size and
     scale.
   - [x] Keep process execution in a host adapter and report an unavailable rasterizer.
   - [x] Add README, tutorial, dimension tests, and deterministic fixture
     policy.
   - [x] Add a polynomial transparency visual fixture across rasterizer versions.
2. **Phase 2 — Color and asset policy**
   - [x] Add DPI-aware sizing and physical-resolution chunks, transparent or
     composited backgrounds, explicit sRGB/native/no-profile policy,
     antialiasing control, deterministic UTF-8 metadata, logical crops, and
     labeled Figure selection from document Fragments.
3. **Phase 3 — High-quality scientific rasterization**
   - [ ] Add tiled large images, 16-bit/linear workflows where available, and
     uncertainty-mask preservation.
4. **Phase 4 — Raster format family**
   - [ ] Add optional WebP/AVIF adapters under the same snapshot service.

### `.terminalAscii`

1. **Phase 1 — Portable table/grid/plot fallback**
   - [x] Render Table, Grid, Fragment, and one simple Graphic using strict
     ASCII.
   - [x] Demonstrate synthetic division and a small plot in the CLI.
   - [x] Add README, tutorial, fixed-width golden tests, and width diagnostics.
2. **Phase 2 — Layout and pagination**
   - [x] Add wrapping, alignment, pagination, captions, slides, and configurable
     terminal dimensions.
3. **Phase 3 — Rich terminal negotiation**
   - [x] Add a separate Unicode/color capability mode while retaining strict
     ASCII reproducibility.
4. **Phase 4 — Interactive terminal views**
   - [ ] Explore keyboard navigation, live repaint, and accessible text
     descriptions.

### `.tikz`

1. **Phase 1 — Geometry/Graphic to TikZ**
   - [x] Export paths, shapes, transforms, labels, and clipping for exact
     geometry diagram.
   - [x] Add README, tutorial, source fixtures, and a compilation smoke test when
     TeX is available.
2. **Phase 2 — PGFPlots and styles**
   - [x] Add axes/plot lowering, reusable styles, markers, gradients, and
     package declarations.
3. **Phase 3 — Advanced diagrams**
   - [ ] Add Scene3D snapshot support, animation-frame source, and exact
     coordinate simplification.
4. **Phase 4 — Toolchain conformance**
   - [ ] Test multiple TeX engines and optimize generated source for editable
     publication workflows.

### `.latex`

1. **Phase 1 — Structured report to TeX**
   - [x] Export headings, paragraphs, math, tables, grids, figures, labels, and
     references to a standalone `.tex` document.
   - [x] Lower embedded Graphics through the shared TikZ traversal.
   - [x] Add README, tutorial, source fixtures, and optional compilation test.
   - [x] Add a dedicated synthetic-division publication example.
2. **Phase 2 — Themes, citations, and assets**
   - [x] Add package negotiation, bibliography, numbering, figure/table
     placement, and delegated TikZ/SVG/PNG assets.
3. **Phase 3 — Slides and complex layout**
   - [ ] Add Beamer, multi-column pages, indexes, long tables, and accessibility
     metadata where supported.
4. **Phase 4 — Publication toolchains**
   - [ ] Add engine profiles, font management, reproducible builds, and journal
     template adapters.

### `.markdown` and `.html`

1. **Phase 1 — Portable document source and standalone web output**
   - [x] Render semantic inline/block document nodes, tables, figures, media,
     snapshots, and static interaction fallbacks.
   - [x] Delegate Markdown graphics to SVG and reuse the structured-output HTML
     traversal for standalone pages.
   - [x] Add README, tutorials, source fixtures, and extension-driven CLI export.
2. **Phase 2 — Asset and style policies**
   - [x] Add external/inline asset negotiation, document themes, semantic CSS
     bundles, cross-references, and configurable raw-markup policy.
3. **Phase 3 — Interactive publication**
   - [ ] Add progressive enhancement descriptors without changing the static
     document result.
4. **Phase 4 — Web publication profiles**
   - [ ] Add CSP/integrity profiles, offline bundles, and reproducible site
     packaging.

### `.quarto`

1. **Phase 1 — Document to QMD**
   - [x] Export structured reports to `.qmd` with front matter and inline SVG.
   - [x] Add external SVG/PNG asset policies.
   - [x] Preserve labels and ordinary Markdown where possible.
   - [x] Add README, tutorial, and golden source tests.
   - [x] Add an optional Quarto compilation smoke test.
2. **Phase 2 — Projects and citations**
   - [x] Add multi-document projects, navigation, bibliographies, themes, code
     source policy, and target-specific blocks.
3. **Phase 3 — Decks and books**
   - [ ] Add RevealJS slides, books/sites, cross-document references, and
     incremental asset builds.
4. **Phase 4 — Publishing integrations**
   - [ ] Add reproducible environment manifests and optional hosting/publishing
     adapters.

### `.pdf`

1. **Phase 1 — Orchestrated document PDF**
   - [x] Produce a PDF from portable output by delegating to the LaTeX/TikZ pipeline.
   - [x] Record the host toolchain and lowering diagnostics.
   - [x] Add README, tutorial, byte/toolchain tests, and CLI compilation smoke coverage.
   - [x] Add a page-render visual regression fixture.
2. **Phase 2 — Figures and slides**
   - [x] Add standalone vector/raster figures, slide decks, page sizing,
     metadata, bookmarks, and font diagnostics.
3. **Phase 3 — Robust multi-toolchain layout**
   - [ ] Negotiate SVG/TikZ/PNG assets, tagged accessibility, color profiles,
     and deterministic builds.
4. **Phase 4 — Archival/publication profiles**
   - [ ] Add PDF/A or print profiles, digital signatures where appropriate,
     and preflight validation.

### `.gif`

1. **Phase 1 — Slides to animated GIF**
   - [x] Expand a deterministic two-slide timeline into PNG frames and encode a
     looping GIF.
   - [x] Demonstrate a short mathematical derivation or rotating 2D plot.
   - [x] Add README, tutorial, frame/timing tests, and a visual fixture.
2. **Phase 2 — Transitions and scene animation**
   - [x] Add supported transitions, per-slide duration, dithering, palette
     policy, and Scene3D rotation snapshots.
3. **Phase 3 — Accessible animation records**
   - [ ] Preserve captions and accessible descriptions as sidecar metadata.
4. **Phase 4 — Rich external animation and capture**
   - [ ] Add APNG and WebM/MP4 adapters for better color, timing, and size;
     these may require optional codecs and must not become browser-core
     dependencies.
   - [ ] Add deterministic scripted interaction capture with strict permission
     and reproducibility policies.

### `.csv`

1. **Phase 1 — Table/relation export**
   - [x] Export Table and `.data` relation values with headers, RFC-style
     quoting, configurable newline, and exact scalar formatting.
   - [x] Demonstrate commas, quotes, newlines, rationals, and missing cells.
   - [x] Add README, tutorial, byte-level tests, and CSV/TSV dialect fixtures.
2. **Phase 2 — Schema-aware tabular interchange**
   - [x] Add typed import, explicit locale/decimal policy, streaming rows,
     comments/metadata sidecars, and flattening diagnostics.
3. **Phase 3 — Text data format family**
   - [x] Coordinate deterministic tagged JSONL import and export with `.data`,
     preserving exact cells and bounded streaming behavior.
   - [ ] Add the corresponding single-document tagged JSON format after the
     general RiX value envelope is implemented.
4. **Phase 4 — Columnar, large, and external data**
   - [ ] Coordinate Arrow/Parquet export with `.data` after its extension-type
     and optional-dependency policy is justified by a concrete use case.
   - [ ] Add chunked filesystem/network export behind explicit permissions and
     resumable/provenance-aware writes.

## Cross-plugin release gates

1. **Phase 1 gate**
   - [x] Every implemented tutorial is discovered automatically by RiX Web.
   - [x] Plugin tutorials appear after the core tutorial sections and are
     grouped by theme.
   - [x] RiX Notebook recognizes an opened first-party `plugins/<id>/tutorial.md`,
     enables the bundled plugin when available, and provides a rescan/rerun
     action for project-local RiX plugins.
   - [x] Proposed tutorials are readable but cannot misleadingly run.
2. **Phase 2 gate**
   - [x] Shared schema versions and capability negotiation are tested across at
     least two independent providers.
   - [x] All renderers return structured diagnostics and deterministic metadata.
3. **Phase 3 gate**
   - [ ] Certified, approximate, assumed, and unresolved results have visibly
     distinct host presentation.
   - [ ] Adaptive algorithms terminate under explicit work policies.
4. **Phase 4 gate**
   - [ ] External/native services have explicit permissions, versioned
     protocols, reproducible fixtures, and graceful absence behavior.
