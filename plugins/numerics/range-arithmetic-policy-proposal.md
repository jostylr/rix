# Proof-safe range arithmetic and domain policy — proposal

Status: accepted pre-1.0 design draft. No scalar-looking
`RationalIntervalSet` operators should be added until this policy is
implemented and tested. Details remain changeable until RiX 1.0.

## Recommended decisions

1. A range operation returns the image of all mathematically defined input
   tuples. Undefined tuples contribute no outputs.
2. Domain policy changes error and diagnostic behavior, never the mathematical
   result set.
3. The default is `report`: return the defined image, preserve a checked domain
   annotation, and report partial or empty-domain use without throwing.
4. There is no separate `set` mode. An inheritable scoped mathematical-error
   policy selects which diagnostic classes throw. `strict` is shorthand for
   making every proved domain exclusion throw.
5. Real arithmetic is the default. Complex arithmetic dispatches to a separate
   codomain provider and result type; it is never squeezed into a real
   `RationalIntervalSet`.
6. Core exposes explicitly named proof primitives first. RiX operators become
   multifunction wrappers only after the primitives and domain result are
   stable.

## Mathematical meaning

For a partial unary real function `f`, define

```text
Image(f, A) = { f(x) | x in A intersect Domain(f) }.
```

For a partial binary real operation `g`, define

```text
Image(g, A, B) = { g(x,y) |
                   x in A, y in B, (x,y) in Domain(g) }.
```

This is independent Cartesian, or Minkowski, range arithmetic. For example,
`A-A` generally is not `{0}` because the left and right values are independently
chosen from `A`. When the two occurrences originate from the same program
variable, a graph-aware range strategy may exploit that dependency and return
a tighter result. Ordinary interval evaluation remains a sound enclosure.

The result is empty exactly when there are no defined input tuples. Empty is a
valid exact set, not a fabricated numeric value.

An empty requested input is a useful edge case: every requested tuple is
defined vacuously, so its coverage is `allDefined` and its image is empty.
`noDefinedInputs` means that the request itself was nonempty but none of it lay
in the domain.

### The essential safety distinction

There are two very different reasons an implementation might lack an output:

1. The mathematical function is undefined there. The tuple is excluded and
   the exclusion is recorded.
2. The function is defined, but a provider ran out of work, failed to enclose
   it, or encountered an implementation error. The tuple may not be excluded;
   the result is unresolved or erroneous.

Only the first case can produce a certified partial image.

## Domain coverage and result record

Every public arithmetic form returns or binds the range-set value with the
same structured record in standard value/cell metadata. The record has this
conceptual shape:

```text
{
  schema: "rix.numerics.range-operation-result@1",
  operation: "rix.core.range.reciprocal@1",
  operands: [A],
  range: (-Infinity,-1] U [1,+Infinity),
  domain: {
    coverage: partiallyDefined,
    exclusions: [
      { reason: divisionByZero, operand: 1, excludedSet: {0} }
    ]
  },
  certified: true,
  evidence: ...
}
```

The coverage values are `allDefined`, `partiallyDefined`,
`noDefinedInputs`, and `unresolved`, as proposed in
[checker-vocabulary-v1-proposal.md](checker-vocabulary-v1-proposal.md).

The `range` is always the defined image or an outward enclosure of it. A
certified exact primitive also proves its domain record. `certified=true` is
therefore permitted for partial and empty images.

For unary functions, exclusions can usually be represented as a
`RationalIntervalSet`. A binary exclusion such as `y=0` describes part of
`A x B`, not merely a one-dimensional set. Until rational boxes land, the
record should give the operand number, excluded projection, predicate, and
coverage status. It must not pretend that this is a complete general-purpose
box representation.

### Where metadata lives

`RationalIntervalSet` remains an immutable mathematical set. Core should not
make diagnostics, error modes, trust, or provenance part of set equality.

- Core computes exact sets and exact primitive domain facts. An internal helper
  may return a host-language pair while crossing this ownership boundary.
- Numerics constructs one full `range-operation-result` record.
- Both named primitives and RiX operator variants return the range-set value
  with that same record under the reserved `rangeEvidence` cell/value
  extension key.
- A common `RangeEvidence(value)`-style accessor should retrieve it regardless
  of whether the value came from `rangeDivide(A,B)` or `A/B`. Final public
  spelling can follow the metadata API that lands in RiX.

This is the full record, not a shortened operator-only summary. Metadata must
survive binding, cell copying, and operations that claim to preserve evidence,
but it must not affect set normalization, equality, containment, or bare-set
serialization. If an operation combines annotated values, its output gets a
new record that cites their evidence rather than copying one operand's record
as if it still proved the new value.

## Scoped mathematical-error policy

`report` is the normal behavior. Mathematical undefinedness produces a
diagnostic and a domain annotation, but not a thrown runtime error. This
includes a wholly empty defined image.

An inheritable scoped configuration then maps selected mathematical diagnostic
classes to `report` or `throw`, conceptually:

```text
mathErrorPolicy = {
  default: report,
  divisionByZero: throw,
  zeroPowerZero: report,
  outsideRealDomain: throw,
  noDefinedInputs: report
}
```

The exact public categories should be shared by arithmetic and general
functions. At minimum they include `divisionByZero`, `zeroPowerZero`,
`outsideRealDomain`, `branchBoundary`, `partiallyDefined`, and
`noDefinedInputs`. A more specific operation diagnostic may match both its
specific category and a general coverage category.

The configuration is lexical/dynamic scope inherited by subscopes and range
provider calls, not process-global mutable state. An inner scope may explicitly
override an inherited category. `strict` expands to `default=throw` for proved
mathematical domain exclusions; it does not turn work exhaustion or an
implementation failure into mathematical undefinedness.

In this sense the scoped policy states what the surrounding calculation
expects: a reported category is anticipated and retained in the result,
whereas a throwing category means its appearance violates that scope's
assumptions.

When a configured category throws, evaluation does not yield a normal operator
value. The checker-level mathematical image is still well defined, but the
language policy declines to return it in that scope. Under default `report`,
`log([-2,-1])` returns certified empty with `noDefinedInputs` and a diagnostic.

## Initial exact primitives

Core should expose named functions rather than methods that imply scalar
promotion. Names are illustrative; final API spelling can follow Core style.

| Primitive | Domain | Result notes |
| --- | --- | --- |
| `rangeNegate(A)` | All reals | Reverse and negate component endpoints exactly. |
| `rangeAbsoluteValue(A)` | All reals | Split/reflect at zero and normalize. |
| `rangeAdd(A,B)` | All real pairs | Union the exact component-pair sum images. |
| `rangeSubtract(A,B)` | All real pairs | Equivalent to addition with exact negation. |
| `rangeMultiply(A,B)` | All real pairs | Union exact component-pair product images with topology-aware extrema. |
| `rangeReciprocal(A)` | `x != 0` | Remove zero, split components at zero, reverse endpoints, and normalize. |
| `rangeDivide(A,B)` | `y != 0` | Exact multiplication by the reciprocal image of `B`, with a denominator-domain witness. |
| `rangeIntegerPower(A,n)` | See below | Exact image for integer `n`, including zero and sign changes. |

The implementation should operate component-pair by component-pair, collect
the image components, then let `RationalIntervalSet` normalize the union. An
optional work budget belongs in the wrapper/strategy layer; the Core result
must never silently drop component pairs because a limit was reached.

### Endpoint topology

Finite endpoint closure means the endpoint value is actually present. Infinite
endpoints are always open. Arithmetic must determine whether an extremum is
attained, not merely copy a convenient input flag.

For addition, a finite extremum is closed exactly when both contributing
extrema are attained. Multiplication needs full sign and zero case analysis:
`0 * Infinity` is an indeterminate endpoint calculation, even though infinity
is not an input value. The implementation must reason from finite values and
limits rather than perform naïve IEEE or extended-real endpoint arithmetic.

### Reciprocal and division examples

Under real defined-image semantics:

```text
reciprocal([-1,1])
  = (-Infinity,-1] U [1,+Infinity)
  coverage = partiallyDefined
  exclusion = {0}

reciprocal([0,1])
  = [1,+Infinity)
  coverage = partiallyDefined

reciprocal({0})
  = empty
  coverage = noDefinedInputs

{0} / [-1,1]
  = {0}
  coverage = partiallyDefined

{0} / {0}
  = empty
  coverage = noDefinedInputs
```

The unbounded endpoints are open structurally. Removing the single undefined
point zero does not invalidate the rest of the exact image.

### Integer powers

For integer exponent `n`:

- `n > 0`: total on the reals. Even powers split at zero and may attain zero
  in the interior; odd powers are increasing.
- `n = 0`: the default domain is `x != 0`, with result `{1}` for every defined
  input. Thus `{0}^0` has empty real image. A scoped `zeroPowerZero=one`
  convention makes the operation total and gives `{0}^0 = {1}`.
- `n < 0`: exclude zero and apply reciprocal to the positive power.

The active convention is inherited by subscopes and recorded in
`rangeEvidence`; portable checking never depends on unrecorded ambient state.
Under the default convention, if the base range contains zero and also any
nonzero value, exponent zero still produces `{1}`. The output record is
`partiallyDefined`, notes the excluded `0^0` tuple, and report behavior moves
on without throwing. Strict treatment of `zeroPowerZero` throws instead.

### Rational and general powers

Non-integer rational powers should not be part of the first exact Core
primitive set. Even with rational input endpoints, roots commonly have
irrational boundaries and require a requested outward tolerance.

For a reduced exponent `p/q` in real mode, a future checked provider should
use at least these domain rules:

- odd `q`: negative bases have a real root;
- even `q`: negative bases are outside the real domain;
- negative `p`: zero is outside the domain;
- zero `p`: use the explicit `0^0` policy above.

It should return rational outer enclosures through Numerics. It must not use a
binary64 `pow` result as a certified boundary.

## General functions

Every partial real function can use the same wrapper policy:

```text
restrict input to checked real domain
-> range the defined pieces
-> union their images
-> attach domain coverage/exclusions
-> apply the inherited mathematical-error policy
```

For example, `log((-2):3)` ranges only `(0,3]`; `log((-2):0)` has an empty real
image. If the domain provider cannot prove which input points are positive,
the result is `unresolved`, not an empty or partial certified result.

This wrapper is appropriate for direct providers and general expression
graphs. It should be reusable rather than reimplemented independently by
`Log`, reciprocal, roots, and inverse trigonometric functions.

## Complex codomain and branches

Complex results need a different enclosure value, such as a union of complex
rectangles, discs, or another certified region type. A `RationalIntervalSet`
cannot represent them.

The proposed dispatch inputs are separate:

```text
codomain = real       # default
codomain = complex
branch = principal | explicitly named branch
```

In complex mode, negative bases with rational exponents may be defined, but
the selected logarithm/power branch is part of the function identity and
evidence. Branch cuts are domain/continuity boundaries for that selected
branch, not a reason to insert complex results into the real range type.

Complex support should be designed as a later provider family. Real-mode
semantics must remain stable when it arrives.

## Operator rollout

1. Implement and test the named Core exact primitives.
2. Implement `range-operation-result@1` and checker rules for those primitives.
3. Add inheritable scoped mathematical-error categories, default report
   behavior, and the `strict` shorthand in Numerics/runtime.
4. Register guarded multifunction variants for `+`, `-`, unary `-`, `*`, `/`,
   and integer `^` when operands are range sets.
5. Attach the same `rangeEvidence` metadata record for named and operator
   forms, with one common introspection path.
6. Keep ordinary scalar variants unchanged.
7. Add rational/general power only through a tolerance-aware Numerics provider.

The convenient operators should document their independent Cartesian-image
semantics and point callers to graph-aware `Range` when dependency matters.

## Required tests before operator syntax

- Empty, point, open, closed, disconnected, and unbounded operands.
- Every sign combination, including components touching or containing zero.
- Attained versus unattained finite extrema.
- Reciprocal and division with zero absent, at an endpoint, in the interior,
  and as the entire set.
- Positive, zero, and negative integer powers over odd/even exponents.
- Exact normalization after component-pair unions.
- Property tests using exact rational samples: every defined sampled output is
  contained in the result.
- Domain property tests: every excluded sampled tuple violates the declared
  primitive domain, and no in-domain failure is reported as an exclusion.
- Identical mathematical output under report behavior and every non-throwing
  scoped policy; throwing changes control flow, not the checker semantics.
- Inheritance and explicit override of mathematical-error categories through
  nested scopes and provider calls.
- Identical `rangeEvidence` shape and accessor behavior for named primitives
  and multifunction operator syntax.
- Evidence-checker recomputation independent of the implementation that made
  the candidate record.

## Accepted review decisions

- Default report behavior returns certified partial or empty images with
  diagnostics and without throwing.
- Do not add a separate `set` public mode. Use inheritable per-category
  mathematical-error configuration, with `strict` as a broad shorthand.
- Store the same full evidence record in the same value/cell metadata location
  for named primitives and operator variants.
- Treat real `0^0` as undefined by default. Permit an explicit scoped
  `zeroPowerZero=one` convention and record it in the evidence.
- Keep all of these v1 details changeable until the RiX 1.0 release.
