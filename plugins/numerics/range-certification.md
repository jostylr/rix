# Certified ranges for general functions

Status: design and implementation plan. The existing unary range functions are
implemented; the general provider, proof-checking, and expression-graph parts
described here are staged work.

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

A future general range result should contain at least:

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

## Knowledge forms and how they help

### Domain and singularities

A domain provider should prove whole-input inclusion, return excluded pieces,
or report unresolved obligations. It must distinguish `:domainViolation` or
`:poleInInput` from `:unknown` or `:poleNotExcluded`. Domain partitions feed
directly into `RationalIntervalSet`, so a valid image can remain disconnected.

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
2. `RegisterRangeProvider(functionIdentity, provider)` installs reusable
   knowledge. This is capability-gated and intended for plugins or explicitly
   trusted sessions.

Illustrative RiX, not yet public API:

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

Versioned portable schemas should live under `rix/schemas` for:

- `range-set`;
- `range-provider` and provider capabilities;
- `domain-witness`;
- `derivative-range-witness`;
- `monotonicity-witness`;
- `critical-points-witness`; and
- the aggregate general range result/evidence DAG.

Schema validation checks shape, not mathematical truth. A deliberately small
checker should validate a limited theorem vocabulary: exact set operations,
primitive interval arithmetic, derivative-sign monotonicity, monotone
composition, exhaustive polynomial root counts, partition coverage, and hull
or union formation. Unsupported theorem tags remain trusted-provider or
uncertified evidence; the checker must never guess.

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
5. Add checked derivative-sign and Lipschitz range strategies.
6. Add Symbolic proof-preserving transformation hooks.
7. Move built-in function facts behind the shared provider protocol.
8. Add multivariate boxes, then affine arithmetic and Taylor models where
   dependency makes ordinary subdivision inadequate.

See [general-range-development-checklist.md](general-range-development-checklist.md)
for implementation status and [interval-ranges-tutorial.md](interval-ranges-tutorial.md)
for currently runnable measurement examples.
