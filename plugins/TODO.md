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
implemented. Calculus Phase 1 is now implemented; Analysis Phase 1 remains a
planned dependency-aware slice. Unchecked work below is Phase 2 or later unless
a section explicitly says otherwise.

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
   `.continuedFraction`, and `.algebraicReal` Phase 1.
6. **Broaden analysis and visualization:** `.stats`, `.scene3d`, `.nd`, and
   `.complexViz` Phase 1.
7. **Complete publication pipelines:** `.quarto`, `.pdf`, and `.gif` Phase 1.
8. **Establish abstract mathematical functions:** `.calculus` Phase 1 provides
   portable function/expression contracts before exact transformation rules.
9. **Begin Analysis over explicit evidence:** `.analysis` Phase 1 follows the
   Calculus expression contract and the effective-sequence protocols.
10. **Begin Phase 2 in dependency order:** shared Numerics and renderer
   contracts first; mathematical/scene producers second; document
   orchestrators last.
11. **Treat Phase 3 as advanced work:** certification, adaptive algorithms,
   interactivity, layout, and equivalence/proof integration.
12. **Treat Phase 4 as research or ecosystem work:** native acceleration,
    formal proof exchange, distributed computation, high-dimensional
    exploration, and production publishing toolchains.

The first concrete vertical slice should be:

```text
oracle P1 -> numerics P1 -> plot P1 refinement adapter
          -> core Graphic -> svg P1 + canvas P1
          -> RiX Web and RiX Notebook tutorials
```

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
   - [ ] Add a cloneable lazy digit stream once plugin-defined lazy values have a stable protocol.
   - [ ] Add formatting policies for digit alphabets above base 36 and grouped radices.
   - [ ] Share generic work-budget diagnostics with `.numerics`.
3. **Phase 3 — Extensible numeral-system definitions**
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
4. **Phase 4 — RiX Web numeral-system playground**
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
   - [ ] Add polylines, arrows, arcs, ellipses, dimension marks, grids, and
     reusable style maps.
   - [ ] Add data-coordinate to viewport-coordinate transforms.
   - [ ] Provide bounding boxes and anchors for composed labels.
   - [ ] Extend the tutorial with a labeled construction.
3. **Phase 3 — Constraint-aware authoring**
   - [ ] Accept geometry objects through a protocol without importing
     `.geometry`.
   - [ ] Support path trimming, marker placement, collision-aware labels, and
     reusable symbols.
   - [ ] Preserve unresolved or uncertain geometry as visible scene metadata.
4. **Phase 4 — Advanced drafting ecosystem**
   - [ ] Add extensible symbol libraries and declarative diagram themes.
   - [ ] Explore interactive handles that emit ordinary retained scenes.
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
   - [ ] Add `.plot.Function`, `.plot.Parametric`, scatter, line, bar, and
     step plots.
   - [ ] Route evaluation and enclosure through `.numerics`.
   - [ ] Detect likely discontinuities and expose unresolved samples.
   - [ ] Add scales, legends, ticks, labels, and explicit/fitted view policies.
3. **Phase 3 — Fields and adaptive plots**
   - [ ] Add implicit curves, contours, heat maps, vector fields, error bands,
     and interval-valued plots.
   - [ ] Use adaptive subdivision and certified sign/range requests.
   - [ ] Share color-scale values with `.complexViz` and `.stats`.
   - [ ] Add interactive Canvas hit testing without changing the plot value.
4. **Phase 4 — Statistical and large-data plotting**
   - [ ] Add streaming/downsampled plots and GPU-oriented scene lowering.
   - [ ] Support linked views and declarative interaction descriptions.
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
   - [ ] Add configurable binary32/binary64 behavior and directed-next-value
     helpers.
   - [ ] Report overflow, underflow, signed zero, infinities, and NaN through
     structured diagnostics.
3. **Phase 3 — Reproducible approximate algorithms**
   - [ ] Add reproducible summation/dot-product policies.
   - [ ] Provide error-estimate objects for selected algorithms.
   - [ ] Add complex Float operations without contaminating exact complex
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
   - [ ] Implement refinement funnels and the paper's funnel-to-oracle adapter.
   - [ ] Implement the rational Newton nth-root funnel and Cauchy adapter.
   - [x] Register the shared `EnclosableReal` provider used by `.numerics`.
   - [x] Add the certified-singleton provider adapter used as the common
     arithmetic target for balls, Cauchy, continued fractions, algebraic reals,
     and Numerics algorithm reals.
   - [ ] Implement coarse oracles and distinguish `eta` resolution from host
     resource exhaustion.
3. **Phase 3 — Ordering, arithmetic, and evidence**
   - [ ] Implement epsilon-trichotomy, compatibility, and bounded comparison.
   - [ ] Implement funnel negation, addition, multiplication, reciprocal, and
     division.
   - [x] Implement bounded immutable Oracle enclosure recipes for negation,
     absolute value, addition, subtraction, multiplication, division, and
     integer powers, with actualized trace steps.
   - [ ] Add testing/nth-root oracles under explicit uniqueness evidence.
   - [ ] Represent equivalence, Yes/No, root, and property evidence without
     promoting finite sampling to proof.
4. **Phase 4 — Completed relations and proof integration**
   - [ ] Add rational betweenness relation and maximal-fonsi proof adapters.
   - [ ] Exchange exact sign/root evidence with `.algebra`.
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
   - [ ] Add generic `Enclose`, `Refine`, `Compare`, `Sign`, root isolation,
     adaptive sampling, integration, and optimization.
   - [ ] Define absolute/relative error budgets and propagation rules.
   - [ ] Define refinement-cache semantics in the shared contract. A backend
     may reuse prior work, but every certified result in one refinement history
     must be compatible with and nested inside the applicable earlier
     enclosure; cache hits must retain evidence, provenance, requested
     precision, achieved precision, and work accounting.
   - [ ] Define backend-neutral certified-constant requests for at least `pi`.
     Natural `Exp(1)` now provides certified `e` bounds; named constants must
     provide exact rational bounds, evidence/provenance,
     and a finite verification path independent of trusting a displayed decimal
     or an unbounded computation.
   - [ ] Add capability negotiation and explain why an algorithm/backend pair
     was selected.
3. **Phase 3 — Differential and multidimensional methods**
   - [ ] Add ODE solvers, multidimensional optimization, interval Newton, and
     implicit-function refinement.
   - [ ] Support certified unresolved regions and partial results.
   - [ ] Feed adaptive geometry, Plot, and Scene3D services.
4. **Phase 4 — Advanced numerical orchestration**
   - [ ] Add sparse methods, PDE helpers, continuation, and precision
     escalation across multiple backends.
   - [ ] Explore parallel/distributed work policies with reproducible results.
   - [ ] Add optional JavaScript, WebAssembly, and native acceleration providers
     behind the same RiX request/result protocol; accelerated paths must not
     change evidence semantics.

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
   - [ ] Port `.fracfun` after RiX has a versioned public symbolic-expression
     builder for cloning/combining expression trees, preserving evaluation
     closures, and recording source-domain restrictions. Do not expose private
     evaluator IR directly as the plugin ABI merely to remove this host edge.
   - [ ] Expose public polynomial gcd/lcm (the exact Euclidean gcd currently
     used internally for RationalFunction cancellation is not yet an API),
     square-free decomposition, rational roots, factor evidence, and
     resultants.
   - [ ] Add explicit centered-expansion and factorization presentation values;
     keep canonical Polynomial equality on expanded coefficients and verify
     every presentation when converting back.
   - [ ] Add RationalFunction partial fractions, factored/together presentation
     views, pole/zero multiplicity evidence, and coefficient-domain support
     beyond exact univariate Q[x].
   - [x] Add `.fracfun` as the separate form/domain-preserving value for
     inherited exclusions and removable holes. Canonical RationalFunction
     domain continues to use only the reduced denominator intentionally.
   - [ ] Expose exact sign/root-count protocols to Numerics and Geometry.
   - [ ] Keep transformations explicit and provenance-preserving.
3. **Phase 3 — Algebraic systems**
   - [ ] Add Gröbner/elimination services, multivariate polynomial structures,
     and algebraic extension fields.
   - [ ] Produce exact intersection/root evidence for Geometry.
4. **Phase 4 — Proof and computer-algebra ecosystem**
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
   - [ ] Add fraction-free elimination, LU/LDU, exact QR where supported,
     row/column spaces, nullspaces, determinant certificates, and reusable
     factorization objects.
   - [ ] Add linear maps between distinct vector spaces, composition, inverses,
     dual spaces, tensor products, contractions, and explicit pushforward and
     pullback operations.
   - [ ] Add a versioned linear-realization protocol so domain objects retain
     their own identity and operations while exposing linked Vector views;
     use degree-at-most-`n` polynomial spaces as the first finite adapter.
   - [ ] Make coordinate lineage serializable with stable identity records;
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
   - [ ] Add Phase I feasibility, equality and greater-than constraints,
     arbitrary variable bounds, free variables, presolve, and degeneracy/cycle
     policies.
   - [ ] Return exact primal/dual solutions and checkable certificates for
     optimality, infeasibility, and unboundedness; expose sensitivity ranges.
   - [ ] Add revised/simplex factorization reuse and a stable model interchange
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
   - [ ] Dispatch linear inequalities/objectives to `.optimize`, univariate
     polynomial equations to `.poly`/`.algebraicReal`, and supported scalar
     numerical equations to `.numerics`.
   - [ ] Define finite, parametric, empty, unbounded, and branch-valued Solution
     objects with substitution, residual checking, assumptions, and provenance.
   - [ ] Support role overrides, parameter declarations, and mixed
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
   - [ ] Surface core `FractionInterval` with mediant subdivision and explicit
     conversion to canonical RationalInterval.
   - [ ] Add portable Farey/Stern-Brocot tree, path, and classroom Grid views.
   - [ ] Decide explicit infinity construction and renderer policies; never
     admit `0/0`.
3. **Phase 3 — Representation-aware algorithms**
   - [ ] Add continued-fraction/Farey interoperability and bounded searches
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
   - [ ] Add verified `Factor`, square-free, and partial-fraction presentations
     without changing the authoritative source domain.
   - [ ] Add pole/zero multiplicity and removable-hole evidence.
   - [ ] Add presentation-aware rendering and side-by-side transformation
     Grids for teaching.
3. **Phase 3 — Broader coefficient domains**
   - [ ] Support multivariate forms and declared coefficient domains while
     keeping canonical projections optional and inspectable.
4. **Phase 4 — Transformation evidence**
   - [ ] Export replayable transformation histories and optional CAS/proof
     certificates.

### `.symbolic`

1. **Phase 1 — Formal-workspace meta-plugin**
   - [x] Load `.fraction` and `.fracfun` through one `.symbolic` capability;
     transitively expose their canonical `.poly` and `.ratfun` projections.
   - [x] Keep focused plugin ownership and schemas intact.
2. **Phase 2 — Discoverable transformation registry**
   - [ ] List available formal/canonical transformations and their owning
     plugins without centralizing their implementations.
3. **Phase 3 — Assumptions and domains**
   - [ ] Coordinate explicit assumptions and restricted-domain wrappers across
     formal symbolic plugins.
4. **Phase 4 — External symbolic providers**
   - [ ] Negotiate optional CAS and proof backends through capability services.

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
   - [x] Export the same expression import/build helpers through `rix/eval` for
     JavaScript plugins; migrate a small existing consumer to prove that pure
     RiX and host plugins share one contract. `.poly` now performs symbolic
     degree analysis through this public expression representation.
   - [ ] Add a semantic-function registry keyed by stable IDs rather than
     binding spellings or object identity. Keep exact rules, implementations,
     domains, branches, and evidence as separate registry entries.
   - [ ] Implement exact linearity, product, quotient, power, and chain rules
     over expression graphs, including named rules such as `D Exp = Exp`.
   - [ ] Preserve domain and branch obligations for `Log`, roots, inverse
     functions, and complex continuations instead of applying unconditional
     rewrites.
   - [ ] Add higher derivatives, partial derivatives, gradients, Jacobians,
     and Hessians with explicit variable selection.
3. **Phase 3 — Integration and equation specifications**
   - [ ] Distinguish a selected primitive, an antiderivative family with its
     integration constant, and a definite integral with endpoints.
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
   - [ ] Depend on `rix.abstract-function@1` and a cloneable/effective sequence
     protocol rather than inventing a second function representation.
   - [ ] Add first-class function-sequence values with an index domain,
     function domain/codomain, term constructor, and optional effective tail
     evidence.
   - [ ] Distinguish pointwise, uniform, almost-everywhere, in-measure, and
     norm convergence in versioned claim/result records.
   - [ ] Implement one end-to-end geometric function-series example with an
     exact or certified uniform tail bound; return `unknown` for an unsupported
     convergence claim rather than sampling it into a theorem.
   - [ ] Add README documentation, a runnable tutorial, and focused tests that
     prevent exchanging limits with evaluation solely from finite samples.
2. **Phase 2 — Limits, series, and justified exchanges**
   - [ ] Add scalar/function limits, limsup/liminf, infinite series, Cauchy
     criteria, and effective moduli where available.
   - [ ] Encode hypotheses for exchanging limits with continuity, integration,
     differentiation, summation, and expectation; unresolved hypotheses remain
     visible obligations.
   - [ ] Interoperate with `.cauchy`, `.numerics`, and Calculus definite
     integrals without making any one real-number representation mandatory.
3. **Phase 3 — Function spaces and operator analysis**
   - [ ] Add explicit metric, normed, Banach, Hilbert, and selected `L^p`
     function-space records with domains and measures.
   - [ ] Represent continuity, compactness, bounded operators, weak/strong
     convergence, and approximation error under stated topologies.
   - [ ] Add Fourier/power-series and orthogonal-expansion examples with
     convergence regions and truncation evidence.
4. **Phase 4 — Advanced and proof-connected analysis**
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
   - [ ] Add further native roots, exp/log, trigonometry, and complex balls.
   - [ ] Negotiate internal working precision through Numerics requests beyond
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
   - [ ] Add arithmetic with computed moduli.
   - [x] Add same-family arithmetic recipes, exact Rational embedding, and the
     certified-singleton Oracle adapter.
   - [ ] Implement the paper-compatible funnel adapter.
   - [ ] Preserve lazy terms and bounded work.
3. **Phase 3 — Limits of generated sequences**
   - [ ] Add convergence transformations and proof-carrying limit constructors.
   - [ ] Diagnose sequences without effective tail information.
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
   - [ ] Add periodic quadratic forms, best-approximation queries, and selected
     arithmetic transformations.
   - [x] Add same-family arithmetic recipes, exact Rational embedding, and
     conversion to Oracle through certified enclosure evidence.
3. **Phase 3 — Generalized continued fractions**
   - [ ] Add generalized forms, homographic algorithms, and adaptive term
     generation.
4. **Phase 4 — Research algorithms**
   - [ ] Explore exact real arithmetic via continued-fraction transducers and
     interoperability with symbolic algebra.

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
   - [ ] Add comparison and arithmetic using resultants/root isolation.
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
   - [ ] Add segments, rays, polygons, affine/projective transforms, conics,
     loci, and simple constraints.
   - [ ] Consume Algebra and Numerics protocols for exact/certified
     intersections.
   - [ ] Add implicit-equation values with adaptive rendering requests.
3. **Phase 3 — Certified implicit geometry**
   - [ ] Add interval subdivision, topology-aware curve tracing, tangency and
     multiplicity evidence, and boundary-refinement callbacks.
   - [ ] Render uncertainty and unresolved cells explicitly.
4. **Phase 4 — Dynamic and proof-oriented geometry**
   - [ ] Add draggable parameterized constructions, theorem evidence, and
     automated locus exploration.

### `.data`

1. **Phase 1 — Typed relation feeding a table**
   - [x] Implement schema, rows, projection, filter, sort, and a `TableView`
     adapter.
   - [x] Demonstrate transforming a small exact dataset and exporting CSV.
   - [x] Add README, tutorial, schema diagnostics, and deterministic tests.
2. **Phase 2 — Relational operations**
   - [ ] Add joins, groups, aggregates, calculated columns, missing-value
     policy, and streaming row sources.
   - [ ] Preserve exact RiX cell values until exporter formatting.
3. **Phase 3 — Columnar and external data**
   - [ ] Add JSON/JSONL, Arrow/Parquet adapters, chunking, and typed tensors.
   - [ ] Add permission-aware filesystem/network sources.
4. **Phase 4 — Query planning**
   - [ ] Explore lazy plans, predicate pushdown, large-data execution, and
     reproducible provenance.

### `.stats`

1. **Phase 1 — Exact descriptive statistics**
   - [x] Compute count, exact mean, median/quantiles policy, variance, and a
     plot-ready summary for a small dataset.
   - [x] Demonstrate a summary table plus histogram/box representation.
   - [x] Add README, tutorial, and exact/edge-case tests.
2. **Phase 2 — Distributions and regression**
   - [ ] Add distributions, sampling with explicit RNG state, confidence
     objects, linear regression, and residual outputs.
   - [ ] Use Numerics for approximate/certified computations.
3. **Phase 3 — Models and inference**
   - [ ] Add generalized models, resampling, Bayesian result protocols, and
     uncertainty visualization.
4. **Phase 4 — Large/advanced statistics**
   - [ ] Add streaming algorithms, robust/high-dimensional methods, and
     external statistical engine adapters.

### `.document`

1. **Phase 1 — Numbered report fragment**
   - [x] Assemble core Fragment/Figure/Table values with labels, references,
     captions, and a small theme.
   - [x] Demonstrate a report containing prose, a table, and a plotted figure.
   - [x] Add README, template-language tutorial, and cross-reference tests.
2. **Phase 2 — Citations, assets, and templates**
   - [ ] Add bibliography/citation values, asset manifests, numbering policies,
     headers/footers, and reusable document templates.
   - [ ] Keep raw target markup behind explicit target-specific nodes.
3. **Phase 3 — Layout and publication profiles**
   - [ ] Add page/deck themes, floats, multi-column layout, indexes, and
     renderer capability negotiation.
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
   - [ ] Add adaptive parametric surfaces and richer annotation/interaction
     policies over the retained contracts.
   - [ ] Provide Canvas/WebGL and raster snapshot lowering.
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
   - [ ] Migrate the exact ND value/projection kernel to RiX, then keep
     `ToScene3D` as a pure schema adapter over the RiX Scene3D model.
2. **Phase 2 — Fields, slices, and fibers**
   - [ ] Add N-dimensional fields, affine slices, sections, fibers, and
     parameterized projection families.
   - [ ] Lower results to Plot or Scene3D values.
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
   - [ ] Add magnitude/phase surfaces, Cayley color mapping, Riemann sphere,
     and branch-cut metadata.
   - [ ] Consume Numerics enclosures and Scene3D values.
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
   - [ ] Add reusable definitions, markers, gradients, patterns, masks, style
     inheritance, font policy, and stable IDs.
   - [ ] Define an exact-coordinate lowering result that retains the original
     exact value and records when SVG text rounds or approximates it. Make the
     precision/rounding policy selectable and expose approximation diagnostics
     or metadata instead of silently applying a fixed decimal cutoff.
   - [ ] Add conformance fixtures for huge numerators, sub-pixel and extremely
     narrow intervals, reversed interval presentation, overlapping labels, and
     coordinates that collide only after decimal lowering.
   - [ ] Report unsupported scene features.
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
   - [ ] Add device-pixel scaling, hit-test IDs, pointer-coordinate inversion,
     dirty-region repaint, and image asset loading.
   - [ ] Implement the shared viewport/selection protocol for pan and zoom,
     preserve semantic object IDs through hit testing, and provide a DOM/text
     accessibility companion so Canvas interaction is not pointer-only or
     screen-reader silent.
3. **Phase 3 — Large scenes and workers**
   - [ ] Add OffscreenCanvas/worker rendering, path caches, large heat maps, and
     animation timing.
4. **Phase 4 — Accelerated browser rendering**
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
   - [ ] Add DPI, background, color profile, antialiasing, metadata, and
     document-region rendering.
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
   - [ ] Add wrapping, alignment, pagination, captions, slides, and configurable
     terminal dimensions.
3. **Phase 3 — Rich terminal negotiation**
   - [ ] Add a separate Unicode/color capability mode while retaining strict
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
   - [ ] Add axes/plot lowering, reusable styles, markers, gradients, and
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
   - [ ] Add package negotiation, bibliography, numbering, figure/table
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
   - [ ] Add external/inline asset negotiation, document themes, semantic CSS
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
   - [ ] Add multi-document projects, navigation, bibliographies, themes, code
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
   - [ ] Add standalone vector/raster figures, slide decks, page sizing,
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
   - [ ] Add supported transitions, per-slide duration, dithering, palette
     policy, and Scene3D rotation snapshots.
3. **Phase 3 — Rich animation exports**
   - [ ] Add APNG and WebM/MP4 adapters for better color, timing, and size.
   - [ ] Preserve captions and accessible descriptions as sidecar metadata.
4. **Phase 4 — Interactive-to-static capture**
   - [ ] Add deterministic scripted interaction capture with strict permission
     and reproducibility policies.

### `.csv`

1. **Phase 1 — Table/relation export**
   - [x] Export Table and `.data` relation values with headers, RFC-style
     quoting, configurable newline, and exact scalar formatting.
   - [x] Demonstrate commas, quotes, newlines, rationals, and missing cells.
   - [x] Add README, tutorial, byte-level tests, and CSV/TSV dialect fixtures.
2. **Phase 2 — Schema-aware tabular interchange**
   - [ ] Add typed import, explicit locale/decimal policy, streaming rows,
     comments/metadata sidecars, and flattening diagnostics.
3. **Phase 3 — Data format family**
   - [ ] Add JSON/JSONL and coordinate Arrow/Parquet export with `.data`.
4. **Phase 4 — Large and external data**
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
   - [ ] Shared schema versions and capability negotiation are tested across at
     least two independent providers.
   - [ ] All renderers return structured diagnostics and deterministic metadata.
3. **Phase 3 gate**
   - [ ] Certified, approximate, assumed, and unresolved results have visibly
     distinct host presentation.
   - [ ] Adaptive algorithms terminate under explicit work policies.
4. **Phase 4 gate**
   - [ ] External/native services have explicit permissions, versioned
     protocols, reproducible fixtures, and graceful absence behavior.
