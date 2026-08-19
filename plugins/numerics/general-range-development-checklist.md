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
  The accepted pre-1.0 design is in the [checker vocabulary v1
  proposal](checker-vocabulary-v1-proposal.md); implementation and focused
  tests remain.

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
  The accepted pre-1.0 design is in the [range arithmetic and domain policy
  proposal](range-arithmetic-policy-proposal.md); implementation and focused
  tests remain.
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
- [ ] Document the version migration policy before an interchange version is
  superseded.
  The accepted pre-1.0 design is in the [range-set interchange versioning
  proposal](range-interchange-versioning-proposal.md); implementation and
  focused tests remain.

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
- [x] Add a runnable scoped direct-provider tutorial with explicit heuristic
  trust behavior.
- [ ] Add a runnable derivative-witness tutorial.
- [x] Add a runnable disconnected closed-range-set tutorial for the RiX adapter.
- [ ] Extend that tutorial with open and unbounded construction when the public
  RiX constructor surface lands.
- [x] Add adversarial examples showing why self-certification and bare trust
  labels do not certify.
- [ ] Add further adversarial examples showing why samples and bare monotonicity labels
  do not certify.
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
