# General certified-range development checklist

This checklist implements the architecture in
[range-certification.md](range-certification.md). A checked item means code and
focused tests exist; design-only work remains unchecked.

## 0. Contracts and architecture

- [x] Define certification as a checkable evidence chain, not a provider label.
- [x] Define Checked, Trusted provider, and Heuristic evidence levels.
- [x] State that heuristic evidence can guide work but cannot certify a result.
- [x] Assign Core, runtime, Numerics, Calculus, Symbolic, and function-plugin
  ownership.
- [x] Specify the domain-sensitive, proof-producing range pipeline.
- [x] Specify scoped and capability-gated surfaces for user function knowledge.
- [x] Record the accepted theorem vocabulary in a versioned checker spec and
  schema, with focused fail-closed checker tests for the implemented kernel.

## 1. Core exact range-set values

- [x] Add immutable `RationalIntervalSet` as a normalized finite union.
- [x] Support open and closed finite rational endpoints.
- [x] Support structural open `-Infinity` and `+Infinity` endpoints.
- [x] Normalize ordering, overlap, covered touching points, and empty components.
- [x] Preserve a gap when both components exclude a shared endpoint.
- [x] Add exact union, intersection, containment, equality, and hull operations.
- [x] Add conversion to `RationalInterval` only for one closed bounded component.
- [x] Add tagged JSON serialization/revival and a public type guard.
- [x] Keep range sets outside scalar `CoreNumber` promotion.
- [x] Add focused normalization, topology, infinity, set-operation, and revival
  tests.
- [x] Decide and implement proof-safe component-wise arithmetic primitives,
  including exact domain records, disconnected reciprocal/division, integer
  powers, checker recomputation, sampled containment tests, and RiX operator
  integration.
- [x] Add package API documentation and release notes.

## 2. RiX value adapter

- [x] Register `RationalIntervalSet` as a semantic runtime type.
- [x] Add `Components`, `Split`, `Union`, `Intersection`, `Contains`, `Hull`,
  `ToRationalInterval`, and `ToString` methods.
- [x] Make `\/` and `/\` genuine interval-set operations and reserve
  `|\/|` for the explicit hull.
- [x] Extend `?` to whole-range containment and add `?/\`/`?&` overlap plus
  `!/\` disjointness predicates.
- [x] Define a versioned portable RiX interchange map.
- [x] Format empty, disconnected, open/closed, and unbounded sets unambiguously.
- [x] Add runtime import/export, formatting, copy handling, and focused tests.
- [x] Add an exact range-set JSON schema.
- [x] Document the version migration policy before an interchange version is
  superseded; add explicit v1 schemas, normalizing import, structured future
  version errors, and a pure migration-plan API with focused tests.

## 3. Direct RangeProvider protocol

- [x] Define `rix.numerics.range-provider@1` capability schema.
- [x] Define a general range request and set-valued result schema.
- [x] Require stable function identity, covered input, domain status, bounded
  work, evidence level, and provenance.
- [x] Implement a structural result validator in Numerics.
- [x] Reject contradictory statuses and reject `certified=1` for heuristic-only
  chains.
- [x] Accept trusted direct providers through multifunction dispatch.
- [x] Add `WithRangeKnowledge` scoped wrappers, forced to heuristic/untrusted
  until a checked or capability-bearing path is available.
- [x] Add capability-gated `RegisterRangeProvider` for plugin/session use.
- [x] Bind trusted descriptors to the exact callable with an unforgeable host
  seal; never accept a visible trust field as authority.
- [x] Reject duplicate stable identities, duplicate callable registrations, and
  reuse of a trusted descriptor with a different callable.
- [x] Adapt existing unary Numerics implementations to publish the common
  protocol without regressing their current range API.
- [x] Adopt independent range status and four-way domain coverage throughout
  the provider validator and unary adapter; certify partial and empty defined
  images when their exclusions are proved.

## 4. Domain and evidence schemas

- [x] Add versioned `domain-witness` schema with all-defined, partial,
  no-defined-input, and unresolved outcomes.
- [x] Add `derivative-range-witness` schema tied to graph identity and input.
- [x] Add `monotonicity-witness` schema with direction and derivative evidence.
- [x] Add complete `critical-points-witness` schema with isolation intervals.
- [x] Add `monotonicity-partition-witness` schema for exact critical roots,
  closed pieces, and their checked directions.
- [x] Add evidence-DAG schema with premise and provider references.
- [x] Preserve `:poleInInput` versus `:poleNotExcluded` in set-valued results.
- [x] Test malformed, mismatched-identity, incomplete-partition, and stale
  evidence rejection.

## 5. Calculus graph bridge

- [x] Document the existing graph identity and purity requirements used by
  range certification.
- [x] Export immutable graph nodes through a stable plugin boundary.
- [x] Carry domain obligations with graph nodes and exact derivatives.
- [x] Preserve repeated-input identity across evaluation and exact rational
  subdivision, including correlated subtraction and division identities.
- [x] Implement interval evaluation for supported exact primitive graph nodes,
  with independent recomputation and fail-closed semantic applications.
- [x] Add polynomial/rational recognition hooks for specialized strategies,
  preserving source denominator and zero-power restrictions without
  cancellation.
- [x] Test arithmetic composition, shared subexpressions, exact subdivision,
  scoped `0^0`, and domain-sensitive identities such as `x/x` and
  `1/(x-x)`.

## 6. Small checker and generic strategies

- [x] Implement an independent checker for exact set and partition steps.
- [x] Check primitive interval arithmetic derivations and domain coverage.
- [x] Independently recompute primitive Calculus derivative graphs and their
  quotient, negative-power, and default `0^0` domain obligations.
- [x] Check monotonicity from a certified derivative range excluding the wrong
  sign.
- [x] Check monotone composition across compatible graph identities and
  domains.
- [x] Check closed bounded monotone endpoint range formation with matching
  function and endpoint identities.
- [x] Recompute canonical rational-polynomial Sturm sequences, exact distinct
  root counts, and complete disjoint isolations with non-root rational
  endpoints.
- [x] Relate complete non-root-endpoint derivative isolation to its checked
  obligation-free polynomial source graph.
- [x] Add exact one-sided root counting and form closed monotonicity partitions
  whose adjacent pieces share only certified rational critical endpoints.
- [x] Add a generic primitive derivative-sign range strategy that checks graph
  identity, encloses the derivative, and discharges every carried obligation.
- [ ] Add generic Lipschitz midpoint strategy with bounded subdivision.
- [ ] Add second-derivative convexity/Taylor remainder strategy.
- [x] Ensure unsupported theorem tags cannot be promoted to Checked.

## 7. Symbolic proof preservation

- [x] Define checked primitive derivative-transformation evidence relating
  source and target graph identity.
- [x] Require checked derivative transformations to retain newly introduced
  domain obligations, including division, negative powers, and default `0^0`.
- [ ] Generalize transformation checking to semantic derivative rules and
  arbitrary Symbolic rewrites.
- [ ] Add proof-preserving simplification hooks consumed by Numerics.
- [ ] Test unsafe cancellation (`x/x`) and safe identity rewrites.

## 8. Function facts and coverage

- [ ] Publish shared domain/global-range/period/symmetry providers for circular
  functions.
- [ ] Publish monotonicity and singularity providers for elementary functions.
- [ ] Publish direct providers for special functions only with trusted
  invariants or checkable witnesses.
- [ ] Add large-period, many-critical-point, disconnected-domain, and
  pole-crossing examples.
- [ ] Extend coverage only when a proof path exists; leave unsupported cases
  explicitly uncertified.

## 9. Later dependency-aware representations

- [ ] Add rational boxes and multivariate provider requests.
- [ ] Add Jacobian-bound box subdivision.
- [ ] Evaluate affine arithmetic for linear correlation.
- [ ] Evaluate Taylor models for smooth narrow measurement boxes.
- [ ] Keep `RationalIntervalSet` as the exact public result boundary.

## 10. Documentation and release gates

- [x] Document the measurement use case and physical-vs-numerical uncertainty.
- [x] Document the ownership architecture and normative boundaries.
- [x] Document useful certified knowledge for arbitrary functions.
- [x] Document the proposed user-function knowledge surfaces.
- [x] Add a runnable scoped direct-provider tutorial with explicit heuristic
  trust behavior.
- [x] Add a runnable derivative-witness tutorial that demonstrates the
  portable record, sign reasoning, and the current fail-closed checker boundary.
- [x] Add a runnable disconnected closed-range-set tutorial for the RiX adapter.
- [x] Add a runnable exact range-arithmetic and scoped domain-policy tutorial
  with measurement, pole, empty-image, `0^0`, dependency, and evidence examples.
- [x] Extend that tutorial with open and unbounded construction through the
  public RiX tagged-import surface.
- [x] Add adversarial examples showing why self-certification and bare trust
  labels do not certify.
- [x] Add further adversarial examples showing why samples and bare
  monotonicity labels do not certify.
- [x] Run Core and complete RiX suites at this integration milestone.

### Verification note — 2026-08-18

- Core: 537 tests passed, including the new interval-set tests.
- RiX documentation examples: 74 examples passed; both Numerics tutorials
  passed.
- Trusted-provider milestone: permission-boundary, exact-callable seal,
  multifunction dispatch, disconnected certified result, duplicate
  registration, and descriptor-forgery tests passed.
- Complete RiX suite with a 10-second per-test ceiling: 2,545 tests passed
  across 127 files with zero failures. Existing slow RationalFunction cases
  completed successfully; all new range-provider tests also pass under their
  focused default-timeout runs.

### Verification note — 2026-08-19

- Core: 544 tests passed, including exact range arithmetic, disconnected
  division/reciprocal, domain records, `0^0` policy, and claim recomputation.
- RiX range integration: 18 focused arithmetic, evidence-checker, schema, and
  interchange tests passed; the Numerics provider plus plugin lint passed all
  24 focused tests.
- Complete RiX suite with a 10-second per-test ceiling: 2,565 tests passed
  across 131 files with zero failures.
- Documentation verification: 16 documentation/tooling tests passed and all
  74 runnable documentation blocks passed. Both supplemental range tutorials
  parse, and the shipped exact range-arithmetic example executes successfully.
- Calculus graph-range, checker, schema, interchange, type-system, Numerics,
  Calculus, and plugin-lint integration: 86 focused tests passed with zero
  failures.
- The checker now covers partition reassembly, derivative-sign monotonicity,
  closed monotone endpoints, canonical Sturm sequences, distinct-root counts,
  and complete non-root-endpoint isolations, including adversarial claims.
- Open/unbounded tagged construction and all supplemental tutorial cells pass
  the documentation harness.
- Primitive derivative transformation, generic derivative-sign, monotone
  composition, and polynomial critical-point binding integration: 46 focused
  tests passed with zero failures (247 assertions).
- One-sided root topology, repeated endpoint roots, exact critical-point
  partitions, and schema integration: 18 focused tests passed with zero
  failures (84 assertions).
- Complete RiX suite after this stage: 2,585 tests passed across 132 files with
  zero failures (8,653 assertions).
- The derivative-witness tutorial now has five runnable RiX blocks; all five
  execute successfully in the documentation checker.
