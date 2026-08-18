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
- [ ] Record the accepted theorem vocabulary in a versioned checker spec.

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
- [ ] Decide and implement proof-safe component-wise arithmetic primitives; do
  not add scalar-looking operations until undefined results are specified.
- [x] Add package API documentation and release notes.

## 2. RiX value adapter

- [x] Register `RationalIntervalSet` as a semantic runtime type.
- [x] Add `Components`, `Union`, `Intersection`, `Contains`, `Hull`, and
  `ToString` methods.
- [x] Define a versioned portable RiX interchange map.
- [x] Format empty, disconnected, open/closed, and unbounded sets unambiguously.
- [x] Add runtime import/export, formatting, copy handling, and focused tests.
- [x] Add an exact range-set JSON schema.
- [ ] Document the version migration policy before an interchange version is
  superseded.

## 3. Direct RangeProvider protocol

- [ ] Define `rix.numerics.range-provider@1` capability schema.
- [ ] Define a general range request and set-valued result schema.
- [ ] Require stable function identity, covered input, domain status, bounded
  work, evidence level, and provenance.
- [ ] Implement a structural result validator in Numerics.
- [ ] Reject contradictory statuses and reject `certified=1` for heuristic-only
  chains.
- [ ] Accept trusted direct providers through multifunction dispatch.
- [ ] Add `WithRangeKnowledge` scoped wrappers.
- [ ] Add capability-gated `RegisterRangeProvider` for plugin/session use.
- [ ] Adapt existing unary Numerics implementations to publish the common
  protocol without regressing their current range API.

## 4. Domain and evidence schemas

- [ ] Add versioned `domain-witness` schema with all-defined, partitioned,
  violation, and unresolved outcomes.
- [ ] Add `derivative-range-witness` schema tied to graph identity and input.
- [ ] Add `monotonicity-witness` schema with direction and derivative evidence.
- [ ] Add complete `critical-points-witness` schema with isolation intervals.
- [ ] Add evidence-DAG schema with premise and provider references.
- [ ] Preserve `:poleInInput` versus `:poleNotExcluded` in set-valued results.
- [ ] Test malformed, mismatched-identity, incomplete-partition, and stale
  evidence rejection.

## 5. Calculus graph bridge

- [ ] Document the existing graph identity and purity requirements used by
  range certification.
- [ ] Export immutable graph nodes through a stable plugin boundary.
- [ ] Carry domain obligations with graph nodes and exact derivatives.
- [ ] Preserve repeated-input identity across evaluation and subdivision.
- [ ] Implement interval evaluation for supported exact primitive graph nodes.
- [ ] Add polynomial/rational recognition hooks for specialized strategies.
- [ ] Test composition, shared subexpressions, and domain-sensitive identities.

## 6. Small checker and generic strategies

- [ ] Implement an independent checker for exact set and partition steps.
- [ ] Check primitive interval arithmetic derivations.
- [ ] Check monotonicity from a certified derivative range excluding the wrong
  sign.
- [ ] Check monotone composition and endpoint range formation.
- [ ] Check exhaustive polynomial critical points through Sturm/root-count
  witnesses.
- [ ] Add generic derivative-sign range strategy.
- [ ] Add generic Lipschitz midpoint strategy with bounded subdivision.
- [ ] Add second-derivative convexity/Taylor remainder strategy.
- [ ] Ensure unsupported theorem tags cannot be promoted to Checked.

## 7. Symbolic proof preservation

- [ ] Define transformation evidence relating source and target graph identity.
- [ ] Require rewrites to report newly introduced domain obligations.
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
- [ ] Add a runnable custom direct-provider tutorial.
- [ ] Add a runnable derivative-witness tutorial.
- [x] Add a runnable disconnected closed-range-set tutorial for the RiX adapter.
- [ ] Extend that tutorial with open and unbounded construction when the public
  RiX constructor surface lands.
- [ ] Add adversarial examples showing why samples and bare monotonicity labels
  do not certify.
- [ ] Run Core and complete RiX suites at every integration milestone.

### Verification note — 2026-08-18

- Core: 537 tests passed, including the new interval-set tests.
- Focused RiX type/adapter tests: 18 passed.
- Full RiX run: 2,538 passed; one unrelated RationalFunction presentation test
  exceeded its 5-second default timeout at about 5.2 seconds. The same test
  completed successfully with a 10-second limit. Keep the full-suite gate open
  until it passes under the repository default timeout.
