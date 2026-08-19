# Certified ranges for general functions

Status: active staged implementation. Unary range functions, exact range sets,
proof-safe exact arithmetic, scoped domain policy, capability-gated trusted
direct providers, versioned evidence schemas, the exact set/arithmetic
checker kernel, exact-primitive Calculus graph evaluation, authority-bound
derivative-sign checking, closed monotone endpoint formation, and exact
rational-polynomial Sturm/root-isolation rules are implemented.
Primitive derivative-graph checking, generic derivative-sign reasoning,
structurally checked monotone composition, and obligation-free polynomial
critical-point binding are implemented too. Exact one-sided root counting and
closed monotonicity partitions at certified rational critical points are now
checked. Bounded Lipschitz-midpoint and signed second-derivative Taylor
strategies are implemented with independently recomputed primitive derivative
identities and public result checking. Semantic-application links and semantic
derivative rules remain staged work.

The following accepted pre-1.0 contracts describe the implemented foundation
and the remaining v1 checker vocabulary:

- [range evidence checker vocabulary v1](checker-vocabulary-v1-proposal.md);
- [proof-safe range arithmetic and domain
  policy](range-arithmetic-policy-proposal.md); and
- [range-set interchange versioning](range-interchange-versioning-proposal.md).

The existing graph boundary and its remaining adapter work are detailed in
[Calculus graphs as certified-range subjects](calculus-range-bridge.md).

Their version-1 spellings remain changeable until RiX 1.0 freezes them. The
provider protocol now uses their four-way distinction between partial, empty,
all-defined, and unresolved domain knowledge.

## Need and intended use

A measurement such as `1 ± 1/100` denotes every real value in the exact
rational interval `99/100:101/100`. A range request for a function `F` must
therefore establish the set-valued statement

```text
output contains { F(x) | x is in input and F(x) is defined }
```

If the result says `domainStatus=:allDefined`, it must additionally establish
that `F` is defined at every point in the input. Numerical endpoint tolerance
controls how closely the computed outer boundary approaches the true range; it
does not erase the physical uncertainty in the input.

This facility is useful for sensor uncertainty, tolerance stacks, calibrated
quantities, robust parameter studies, and proving that a downstream threshold
is or is not crossed. It must also behave honestly around singularities. For
example, the image of a set split around a reciprocal pole is disconnected and
unbounded; representing it by one finite closed interval would be false.

## What “certified” means

“Certified” means there is a checkable chain from the input set and function
identity to the returned enclosure. It does not mean that a provider sampled
many points, agreed with binary64, or attached a label such as `monotone=1`.

RiX may accept one of these evidence sources:

1. **Checked evidence.** A small independent checker validates a witness using
   exact arithmetic and already-checked facts.
2. **Trusted provider evidence.** A capability-approved implementation has a
   documented invariant that its result encloses the mathematical value.
3. **Heuristic evidence.** Sampling, plots, numerical differentiation, or
   unsupported assertions may guide subdivision and diagnostics, but can never
   produce `certified=1`.

The first two levels may be combined in one proof chain. Every edge must record
which provider or checker established it. An unknown or heuristic edge makes
the final result uncertified, even if the interval looks plausible.

Examples of acceptable proof steps include:

- structural derivation from exact interval primitives;
- a checked derivative-range witness whose sign proves monotonicity;
- a checked Sturm witness that isolates every root of a polynomial derivative;
- a trusted transcendental provider with an outward-enclosure invariant; and
- a checked domain partition proving that all singular points were accounted
  for.

A conceptual derivative proof of monotonicity looks like:

```text
{
  theorem: monotoneByDerivative,
  input: I,
  derivativeRange: D,
  direction: increasing,
  derivativeEvidence: E
}
```

The checker verifies that `D` encloses `F'(I)`, that `D.low >= 0`, that the
function and derivative identities match, and that all required domain
obligations are discharged. Merely receiving this record from an untrusted
callback is not sufficient.

## Values and result contract

The foundational output value is `RationalIntervalSet`: a normalized finite
union of components with exact rational endpoints, open or closed finite
boundaries, and open `-Infinity`/`+Infinity` ends. It can represent

```text
[0,1]
(-Infinity,0) U (0,+Infinity)
[-1,-1/2] U [1/2,1]
empty
```

Core stores infinity structurally rather than as an IEEE-754 value. A closed
bounded component can be converted losslessly to the existing
`RationalInterval`; other sets cannot.

A general range result contains, or is being extended to contain:

- the normalized `RationalIntervalSet` enclosure;
- `certified`, `goalMet`, `status`, and `domainStatus`;
- the exact input set and stable function/graph identity;
- achieved endpoint tolerance and bounded-work accounting;
- a proof/evidence DAG or references to checked evidence records;
- the method selected and any fallback methods used; and
- diagnostics that distinguish a proved violation from an unresolved domain
  obligation.

Returning a hull remains useful as an explicit presentation or compatibility
operation, but it must not silently replace a disconnected result.

The language now reflects that distinction directly. For exact interval-like
operands, `A \/ B` is a genuine normalized union, `A /\ B` is a genuine
intersection, and `A |\/| B` is the explicit hull. `x ? S` means point
membership for a scalar and whole-set containment for a range. `A ?/\ B`
(also `A ?& B`) tests nonempty intersection, `A !/\ B` tests disjointness,
and `S.Split()` returns connected components.

## Ownership

The implementation is split by mathematical ownership. Numerics coordinates
the work; it does not absorb the type system, calculus, symbolic algebra, and
every special function.

| Concern | Owner | Boundary |
| --- | --- | --- |
| Exact interval unions, infinities, normalization, set operations | `packages/core` | `RationalIntervalSet`; no transcendental facts or work budgets |
| RiX type registration, methods, formatting, serialization | `rix/src/runtime`, `rix/src/eval/format.js` | Language adapter for the Core value |
| Range requests/results, provider validation, method selection, subdivision | `rix/plugins/numerics` | Orchestration and honest evidence aggregation |
| Mathematical expression DAG, identity, exact derivatives, domain obligations | `rix/plugins/calculus` | Structure consumed by Numerics |
| Proof-preserving rewrites and resulting obligations | `rix/plugins/symbolic` | Transformations never silently inherit proof |
| Domain, codomain, period, symmetry, special landmarks and direct algorithms | Plugin implementing the function | Facts stay beside their mathematical implementation |
| Trust levels and permission to register providers | Runtime/plugin registry | Capability and provenance enforcement |
| Protocols, examples, and user guidance | Numerics documentation | One discoverable public story |

Normative rule:

> Core owns exact range values; Calculus owns mathematical structure; Symbolic
> owns transformations; function plugins own function facts; Numerics owns
> orchestration and validation.

This boundary also keeps `RationalIntervalSet` out of ordinary scalar numeric
promotion. Set-valued arithmetic should be performed by checked range
primitives or providers that understand undefined points, rather than by
methods that might accidentally turn a domain hole into a value.

## The range pipeline

For a general function, Numerics should use the following proof-producing
pipeline. A provider may short-circuit it with a valid direct result, but it
must return equivalent domain and evidence information.

1. Capture a stable callable, provider, or immutable expression-graph identity.
2. Normalize the rational input set and bounded-work request.
3. Prove or conservatively propagate the real domain.
4. Consult global codomain, symmetry, and period facts.
5. Build or request an exact symbolic derivative where supported.
6. Enclose the derivative over each domain piece.
7. Prove monotonicity or isolate every critical point and singularity.
8. Partition the input at checked boundaries.
9. Enclose endpoints or apply Taylor/remainder bounds on every piece.
10. Form a normalized union, optionally compute an explicit hull, and validate
    containment/evidence invariants.

An immutable expression DAG is central to steps 1 and 5–9. It preserves that
two occurrences of `x` denote the same input, permits exact differentiation,
supports monotone composition, and gives proof records a stable object to
name. It also makes domain-sensitive rewriting visible: simplifying `x/x` to
`1` requires an obligation `x != 0`.

## Function knowledge protocol

Function plugins may publish any subset of a common range provider interface:

```text
domain(input, request)             -> domain witness and partition
directRange(input, request)        -> range result with evidence
derivativeRange(input, request)    -> derivative-range witness
criticalPoints(input, request)     -> complete isolated-point witness
monotonicity(input, request)       -> monotonicity witness
globalRange(request)               -> exact set enclosure
period(request)                    -> period witness
symmetry(request)                  -> symmetry witness
```

These operations are multifunction methods conceptually: different providers
may handle exact rationals, rational interval sets, semantic graphs, or a
special domain. Dispatch makes knowledge extensible; validation determines
whether its result is certifying.

The built-in circular providers publish all six static fact families through
`.numerics.FunctionFacts(callable)`. The host first resolves the exact sealed
provider/callable pair. Pi periods and pole locations are represented as exact
symbolic constant multiples rather than mislabeled rational approximations;
input-specific use must still produce a checked rational landmark reduction.

The provider contract must specify:

- a stable schema and version;
- the function/graph identity and input set covered;
- evidence level and provider provenance;
- exact premises and unresolved obligations;
- limits consumed and whether the requested goal was met; and
- whether every input is defined, only the defined image is enclosed, or the
  domain question is unresolved.

A direct special-function provider is often preferable to forcing a function
through generic interval arithmetic. It may use recurrence relations,
published inequalities, monotonicity tables, or integral bounds internally,
provided its outward enclosure invariant is trusted or its witness is checked.

### Implemented first protocol slice

`.numerics.WithRangeKnowledge(Function, knowledge)` now creates a scoped
callable wrapper carrying `rix.numerics.range-provider@1`. The current
knowledge operation is `directRange(input, request)`. Its output must use
`rix.numerics.range-provider-result@1`; Numerics checks function identity,
covered input, exact range type, status/domain coherence, endpoint goal, and
work use. `.numerics.CheckRangeResult` exposes the same validation record.

This scoped surface has no authority to certify. Numerics overwrites its trust
class with `:scopedUntrusted` and its evidence level with `:heuristic`. A
callback that returns `certified=1` is rejected with
`:untrustedCertificationClaim`, even if its knowledge map asks to be called
trusted. This makes the surface useful for protocol development and candidate
ranges without confusing self-assertion with proof.

`.numerics.RegisterRangeProvider(Function, knowledge)` implements the trusted
direct-provider path for plugins and explicitly trusted sessions. It crosses
`.Host.RegisterRangeProvider`, which requires the `Plugins` permission inside
an imported script. The host normalizes and freezes the descriptor, binds it
to the exact callable object, and records a non-portable trust seal. Numerics
finds the provider automatically when that callable is ranged. A provider's
`directRange` may be a RiX multifunction, so guarded variants can handle
different exact input representations under one registered identity.

The seal is intentionally not JSON and cannot be reconstructed from fields.
Copying `trust=:trustedCapability`, reusing a sealed descriptor with a
different callable, or repeating its stable `functionId` does not confer
authority. Registration is rejected for duplicate callable or identity
bindings. This establishes trusted provenance, not mathematical truth: the
host or user granting `Plugins` authority is responsible for the provider's
documented enclosure invariant.

The existing certified unary interval-image implementations now publish this
same protocol. Both spellings remain valid:

```rix
legacy := .numerics.Range(.numerics.Sin(0:1), {= maxWork=120 });
direct := .numerics.Range(.numerics.Sin, 0:1, {= maxWork=120 });
```

The first spelling constructs an interval-image value and ranges it. The
second selects the trusted provider registered for the first-class `Sin`
method. Its adapter splits a `RationalIntervalSet` into closed bounded
components, runs the existing certified algorithm on each component under a
partitioned work budget, and unions the output components without taking a
hull. A saved method value such as `sine = .numerics.Sin` keeps the same
identity, as does a lexical `.numerics[:Sin]` selection. Inverse-function
`Arc...` aliases share their canonical provider.

This adapter currently reports `:unsupportedInputTopology` rather than
certifying open or unbounded components. Callers can split large finite sets;
the request work limit remains global and is divided across components.

The remaining certifying path is checker-accepted theorem evidence. The
portable descriptor and result shapes live in
`rix/schemas/range-provider.schema.json` and
`rix/schemas/range-provider-result.schema.json`.

## Knowledge forms and how they help

### Domain and singularities

A domain provider should prove whole-input inclusion, return excluded pieces,
or report unresolved obligations. It must distinguish the coverage values
`:allDefined`, `:partiallyDefined`, `:noDefinedInputs`, and `:unresolved`, and
preserve diagnostics such as `:poleInInput` versus `:poleNotExcluded`. Domain
partitions feed directly into `RationalIntervalSet`, so a certified valid image
can remain disconnected or be empty.

### Monotonicity and critical points

An increasing or decreasing function needs only certified endpoint images.
Piecewise monotonicity is nearly as effective if every critical point is
isolated. Derivative signs, Sturm witnesses, and checked transcendental
landmarks can all justify the partition; an unchecked direction flag cannot.

### Derivative and Lipschitz bounds

If `|F'(x)| <= L` throughout an interval centered at `m` with radius `r`, then

```text
F(input) is contained in F(m) + [-L*r, L*r].
```

This is a broadly useful contract for user functions. Subdivision improves it
linearly. A varying interval enclosure for `F'` is generally tighter than one
global constant. Evaluating the derivative only at the midpoint is not a proof
of the bound.

### Convexity and higher derivatives

A second-derivative sign can rule out an interior maximum or minimum. A bound
`|F''| <= M` also enables the Taylor enclosure

```text
F(m) + F'(m)(x-m) + remainder,  |remainder| <= M*r^2/2.
```

This retains more input dependency than ordinary interval evaluation for
smooth, narrow measurements.

### Algebraic and symbolic structure

Exact graph structure supports polynomial/rational recognition, exact
derivatives, root isolation, common-subexpression identity, and checked
composition. Symbolic rewrites must return transformation evidence plus any
new domain obligations; Numerics may only reuse facts after the graph-identity
relationship is checked.

### Period, symmetry, and global codomain

A checked period reduces very large inputs to bounded representatives. Odd or
even symmetry can halve work. A global enclosure such as `[-1,1]` is a safe
fallback and can prove that subdivision cannot improve beyond a known
extremum.

## User-defined functions

Two surfaces are useful and should eventually share the same validator:

1. `WithRangeKnowledge(function, knowledge)` returns a scoped callable wrapper.
   This is the safe default because knowledge travels with the value and does
   not mutate global dispatch.
2. `RegisterRangeProvider(function, provider)` installs reusable knowledge for
   that exact callable. This is capability-gated and intended for plugins or
   explicitly trusted sessions.

The scoped API can carry several future knowledge operations; currently its
implemented operation is `directRange`:

```rix
safeF := .numerics.WithRangeKnowledge(F, {=
  domain = FDomain,
  derivativeRange = FDerivativeRange,
  globalRange = (-2):3
});

answer := .numerics.Range(safeF, 99/100:101/100, {=
  endpointTolerance = 1/1000000,
  maxSubintervals = 16,
  maxWork = 500
});
```

The wrapper does not make assertions true. A heuristic derivative hint may
select a likely subdivision, but the result remains uncertified unless an
approved provider supplies a valid witness or a checker proves it.

## Schemas and the small checker

Versioned portable schemas now live under `rix/schemas` for:

- `range-set`;
- `range-provider` and provider capabilities;
- `domain-witness`;
- `derivative-range-witness`;
- `monotonicity-witness`;
- `critical-points-witness`;
- `monotonicity-partition-witness`;
- `calculus-graph-simplification`;
- `calculus-lipschitz-range` and `calculus-taylor-range`; and
- the aggregate general range result/evidence DAG.

Schema validation checks shape, not mathematical truth. The first deliberately
small checker module validates exact set operations, exact partitions,
proof-safe arithmetic images, derivative signs, closed monotone endpoint
formation, canonical Sturm sequences, exact root counts, complete isolations
with exact endpoint topology, and host-resolved trusted leaves. It rejects
cycles, dangling premises, unknown rules, mismatched claims, and configured
resource-limit overruns. Primitive derivative identities, monotone composition,
obligation-free polynomial critical-point binding, one-sided Sturm counts, and
exact-rational critical-point monotonicity partitions are now checked.
Semantic derivative identities remain reserved in the v1 schema and fail
closed until their checker modules land.

Coverage follows the same fail-closed rule. Built-in direct special-function
providers currently cover `Erf`, `Erfc`, normal PDF, and normal CDF through
host-sealed invariants and certified endpoint algorithms. Merely having a
point evaluator does not create range authority. The executable examples now
cover a far-period sine interval, a three-critical-point Sturm example,
disconnected range sets, and both proved and unresolved tangent-pole cases.

Keep the checker independent of the main strategy engine. Strategy may become
large and heuristic; the certifying kernel should remain auditable.

## Beyond unary intervals

Multivariate functions need rational boxes and must preserve variable identity.
Jacobian bounds with box subdivision are the first general extension. Affine
arithmetic can retain linear correlations, while Taylor models combine a
polynomial with a rigorous remainder for smoother tight enclosures. These are
later representations consumed by Numerics; they do not replace the exact
`RationalIntervalSet` result boundary.

## Development sequence

1. Add Core extended endpoints and `RationalIntervalSet`.
2. Add RiX registration, methods, serialization, and formatting for that value.
3. Define and validate the direct `RangeProvider` protocol in Numerics.
4. Bridge the existing Calculus expression graph and exact derivative support.
5. Add checked derivative-sign, Lipschitz-midpoint, and second-derivative
   Taylor range strategies (implemented for exact primitive graphs).
6. Add Symbolic proof-preserving transformation hooks.
7. Move built-in unary direct ranges behind the shared provider protocol
   (implemented); richer shared fact providers remain future work.
8. Add multivariate boxes, then affine arithmetic and Taylor models where
   dependency makes ordinary subdivision inadequate.

See [general-range-development-checklist.md](general-range-development-checklist.md)
for implementation status and [interval-ranges-tutorial.md](interval-ranges-tutorial.md)
for currently runnable measurement examples.
