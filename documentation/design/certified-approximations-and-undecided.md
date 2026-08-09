# Certified approximations, undecided values, and decision conditionals

::: {.callout-note title="Implemented language design"}
This document is the normative design for certified finite approximations,
three-valued decisions, and decision conditionals. RatMath Core and RiX now
implement the first finite-enclosure version described here. The former
`condition ?? truthExpression ?: falseExpression` grammar has been removed;
`??` is only an undecided branch marker after `?:`.
:::

## Decision summary

The design makes the following coordinated changes.

1. RatMath Core gains a finite `CertifiedApproximation` numeric type. Its
   candidate is rational, and its authoritative uncertainty is an exact
   `RationalInterval`.
2. A `?` embedded in a positional or continued-fraction representation marks
   the boundary between certified and provisional representation data.
3. A standalone `?` is a first-class RiX `Undecided` value. It is distinct
   from both `null` and a hole.
4. Comparisons involving certified approximations return true, false, or
   undecided. Merely failing to decide is not an error.
5. RiX logic and control flow understand undecided as a third decision state;
   an ordinary object must never accidentally make it truthy.
6. The final conditional syntax is:

   ```rix
   condition ?: truthExpression
             ?_ nullExpression
             ?? undecidedExpression
   ```

   The `?_` and `??` branches are independently optional and may occur in
   either order. A missing null branch produces `null`; a missing undecided
   branch produces `?`.
7. The former `condition ?? truthExpression ?: falseExpression` grammar was
   used only during migration and is no longer accepted.
8. The previously considered `?! undecidedExpression` extension to the legacy
   ternary is not part of the final language. The symmetric syntax gives `??`
   that role and avoids adding a temporary operator.

These changes belong together. A certified approximation can make a comparison
undecidable at the current precision; the language therefore needs an honest
decision value and control syntax that can handle it without confusing it with
false or missing data.

## Goals

- Preserve exact guarantees. Every approximation carries rational enclosure
  bounds; no decimal floating-point error is introduced.
- Distinguish a certified finite prefix from an exact completed value.
- Make truncated representations parseable mathematical values rather than
  display strings ending in an ellipsis.
- Propagate actual enclosures through arithmetic rather than propagating a
  context-free "inexact" boolean.
- Let comparison report "not decided" without throwing and without claiming
  false.
- Give undecided decisions compositional logic and explicit conditional-flow
  behavior.
- Keep infinite refinement, algorithms, and work budgets outside the finite
  core value. Oracle and numerics providers may refine a certified
  approximation, but Core does not choose one real-number implementation.

## Non-goals for the first implementation

- Solving dependency loss in general interval arithmetic. An initial
  implementation may conservatively widen `x - x`; source identity and an
  expression DAG are later refinements.
- Defining probability distributions over provisional digits. An enclosure is
  epistemic/set-valued information, not a claim of uniform probability.
- Automatically refining every comparison. A provider may later refine before
  returning undecided, but finite comparison must work without a provider.
- Defining partial repeating-period syntax such as `0.#14285?`. The first
  implementation covers ordinary radix prefixes and simple continued-fraction
  prefixes. A partial repeating block has different completion semantics and
  should not be guessed.
- Giving arbitrary arithmetic meaning to standalone `?`. It is a decision
  value, not an untyped top value for every domain.

## Three distinct concepts

The implementation must not conflate these values:

| Concept | RiX display | Meaning |
|---|---|---|
| False/null | `_` in source, `null` internally | A regular falsy RiX value |
| Hole | `undefined` when formatted | Missing data; standard operations reject it |
| Undecided | `?` | A decision exists but current evidence does not determine it |

An error means an invalid operation or a violated contract. Undecided means the
operation was valid and returned the strongest conclusion currently justified.

Using `null` for undecided would make `!(x < y)` true when `x < y` was merely
unknown. Using a hole would misclassify valid uncertainty as missing data and
would trigger the evaluator's hole errors. Using an ordinary map or symbol
would make undecided truthy under RiX's current truth rules. A dedicated value
is therefore required.

## Ownership boundary

RatMath Core owns finite numeric certification. RiX owns decisions and language
control. The boundary is normative:

| RatMath Core | RiX |
|---|---|
| `CertifiedApproximation` | `UNDECIDED` |
| Numeric `?` parsing in number-only input | Standalone `?` parsing |
| Decimal, radix, and CF cylinder construction | Source-token ambiguity resolution |
| Candidate/enclosure arithmetic | `1`/`null`/`?` comparison results |
| Possible-relation results | Decision logic and conditional control |
| Approximation serialization and conversion | Cells, traits, methods, snapshots, and provider policy |

Core's `parseNumber("?")` must reject it: bare undecided is not a number. Core
comparison never returns RiX's `UNDECIDED`; it returns possible-relation
information that RiX maps to a decision. Conversely, RiX must not reimplement
radix-cell or continued-fraction-cylinder mathematics.

Core can parse standard base spellings and construct a radix approximation
from an explicit `BaseSystem`. RiX remains responsible for resolving
runtime-defined base names, then passes the resolved base and digit stream to
Core. This is language name resolution, not duplicate numeric semantics.

## RatMath Core: `CertifiedApproximation`

### Value model

The recommended public shape is conceptually:

```text
CertifiedApproximation
  candidate       Integer or Rational
  enclosure       RationalInterval
  representation  optional immutable presentation record
  sourceId        optional stable dependency/refinement identity
```

The class represents one unknown scalar known to lie in `enclosure`. It is not
an interval collection and should not subclass `RationalInterval`. Subclassing
would cause RiX's existing `instanceof RationalInterval` paths to treat an
uncertain scalar as a set, slice, or iterable interval. It would also cause
ordinary interval arithmetic and RiX copying to erase the candidate and
representation record.

The candidate is the finite value being displayed or used as the current best
representative. It is not authoritative. The enclosure is authoritative.

An initial representation record can use this shape:

```text
ApproximationRepresentation
  kind              :radix | :continuedFraction | :derived
  base              integer/base specification when applicable
  certifiedPrefix   exact source spelling or coefficient sequence
  provisionalSuffix optional source spelling or coefficient sequence
  original          complete literal spelling when available
  reason            :literal | :truncated | :rounded | :derived | :budgetExhausted
  requested         optional requested digits, terms, width, or rounding record
  achieved          optional achieved digits, terms, width, or rounding record
  roundingMode      optional exact rounding policy
```

Arithmetic results normally use `kind=:derived`; they retain a candidate and
enclosure but need not pretend that the result still has the operand's digit
prefix.

`reason`, `requested`, and `achieved` are provenance. They never override the
enclosure. They distinguish uncertainty written by the user from precision
deliberately discarded by a conversion, formatter work exhaustion, rounding,
and widening introduced by derived arithmetic.

### Construction invariants

- `candidate` must lie in `enclosure`.
- The enclosure endpoints are exact `Rational` values.
- The representation record, if present, must describe an enclosure containing
  the candidate and must pass representation-specific validation.
- A point enclosure should normally normalize to the corresponding exact
  `Integer` or `Rational`; callers may request a wrapper only when provenance
  itself must be retained.
- Instances and their representation records are immutable in normal use.

### Source identity and copying

Two separately constructed approximation literals denote independent unknown
scalars even when their text is identical. Reusing or copying one value does
not create a fresh unknown:

- comparison of the same approximation value/source with itself is certified
  equal;
- RiX alias, shallow-copy, and deep-copy operations preserve `sourceId`;
- serialized stable source IDs are preserved, while runtime-only provider
  identities are explicitly omitted or reconstructed by their provider;
- derived-expression correlation remains later work, so `x - x` may still
  widen in the first implementation.

This minimum identity law does not require an expression DAG.

### Arithmetic

For a supported operation, compute both:

```text
result candidate = exact scalar operation on operand candidates
result enclosure = exact interval operation on operand enclosures
```

Exact operands are lifted to point enclosures. If any operand is a
`CertifiedApproximation` and the result enclosure is non-point, return another
`CertifiedApproximation`. If the result enclosure is a point, normalize to the
exact scalar.

`CertifiedApproximation` does not occupy one more level in the existing linear
`Integer -> Rational -> RationalInterval` promotion hierarchy. Mixed-operation
semantics are:

```text
exact scalar op certified scalar       -> CertifiedApproximation
certified scalar op certified scalar   -> CertifiedApproximation
explicit interval collection op either -> RationalInterval
```

The last rule preserves the set-valued meaning of an explicitly supplied
`RationalInterval`; it does not invent a candidate for an interval collection.

This is deliberately stronger than propagating an `inexact` bit:

```rix
0 * 23.456?   ## exact 0, not 0?
```

The first implementation should cover the interval-safe operations already
provided by Core: addition, subtraction, multiplication, division where the
divisor enclosure excludes zero, negation, reciprocal where defined, integer
powers, and radix shifts. Discrete operations must not silently apply to the
candidate:

- factorial, integer indexing, bit operations, gcd/lcm, and modulo require an
  exact admissible value;
- integer division and rounding need an explicit enclosure policy or must
  require that every enclosed value produces the same result;
- conversion to `Rational` succeeds only for a point enclosure;
- conversion to `RationalInterval` returns the authoritative enclosure.

### Core integration

Core implementation must update:

- the public exports and default namespace;
- `index.d.ts`, including `CoreNumber` and operation return unions;
- `isCoreNumber`, a new `isCertifiedApproximation`, and JSON revival;
- JSON serialization for the new class;
- type promotion and mixed-operation dispatch in `Integer`, `Rational`, and
  `RationalInterval`;
- number-only parsing helpers;
- tests, documentation, and package release notes.

Do not rely only on the existing `low`/`high` duck typing in scalar arithmetic.
That path constructs `other.constructor(low, high)`, which is not a suitable
constructor contract for a candidate-plus-enclosure type and would lose
metadata.

## Numeric `?`: certified representation prefixes

### General meaning

Inside a recognized number representation, `?` means:

> The representation to the left is certified. Data to the right is
> provisional. The representation is not asserted complete.

The marker is semantic and parseable. It is not an ellipsis.

```rix
23.456        ## exact rational
23.456?       ## certified decimal prefix; unknown rightward expansion
23.456?789    ## 23.456 certified; 789 provisional

3.~7~15      ## exact finite continued fraction
3.~7~15?     ## certified CF prefix; tail unknown
3.~7~15?1~292 ## 1,292 are provisional coefficients
```

A marker at the end is valuable: it says that every displayed digit or
coefficient is certified while still denying exact completion.

### Truncation versus certified conversion

Ellipsis and question mark have deliberately different contracts:

- `...` is display-only truncation of an underlying value. It is informative,
  nonparseable, and does not change that value's precision or exactness.
- `?` is the parseable rendering of an actual `CertifiedApproximation`. Parsing
  it reconstructs the certified candidate/enclosure information expressible by
  the text.

Existing string formatters may therefore retain output such as
`3.~7~15~...`. A new explicit bounded conversion, or an explicit
`onLimit=:certify` structured API, returns a `CertifiedApproximation`; formatting
that value produces `3.~7~15?`. A formatter must not unpredictably change from
returning a string to returning a numeric object.

When repeating-decimal work stops before establishing a complete period, the
safe certified rendering is an ordinary radix prefix such as `0.14285?`, not a
partial-period claim such as `0.#14285?`. Structured provenance may retain the
known repeat start and work limit even when the portable numeric spelling does
not.

### Decimal and arbitrary-radix cylinders

For a positive base-10 prefix with `n` fractional digits:

```text
23.456?  -> closed enclosure [23.456, 23.457]
```

The exact set of canonical digit-stream completions is half-open, but Core uses
its closed rational hull. Closed enclosures compose safely with interval
arithmetic. For a negative prefix, the order reverses before sorting:

```text
-23.456? -> closed enclosure [-23.457, -23.456]
```

In base `b`, a prefix with `n` fractional digits has a cell width of `b^-n`.
The implementation should construct the two rational grid endpoints directly.
Endpoint storage is preferable to assuming a center whose denominator is a
power of `b`; for odd bases, the midpoint of two grid endpoints need not lie on
the same power-of-base grid.

With provisional digits, the enclosure is still determined by the certified
prefix unless an explicit bound is supplied:

```text
23.456?789
  candidate: 23.456789
  enclosure: [23.456, 23.457]
```

Existing bracket uncertainty syntax may provide a tighter actual enclosure:

```rix
23.456?789[+-12]
```

The intended interpretation is candidate `23.456789` with the existing
last-visible-place bracket semantics, giving
`[23.456777, 23.456801]`. The question-marker position is an assertion about
certified common digits and must be validated against the explicit enclosure.
The bracket enclosure remains authoritative.

The validation rule is containment: the explicit enclosure must lie inside the
closed cylinder certified by the prefix and must contain the candidate. A
marker may conservatively certify fewer digits than the enclosure could prove;
it need not be the longest possible common prefix.

Custom base alphabets may contain `?` as data. Reserve bare `?` as syntax in
unquoted numeric literals; a digit alphabet that uses `?` must use the quoted
digit-stream form so the boundary is explicit.

### Continued-fraction cylinders

For a simple continued-fraction prefix
`[a0; a1, ..., an]`, let `pn/qn` be its convergent and
`p(n-1)/q(n-1)` the preceding convergent. The closed hull of all legal
continuations has endpoints:

```text
pn/qn
(pn + p(n-1)) / (qn + q(n-1))
```

Sort the endpoints because orientation alternates with prefix length.

For example:

```text
3.~7~15?
  candidate: [3;7,15] = 333/106
  other hull endpoint: [3;7,16] = 355/113
  enclosure: [333/106, 355/113]
```

Canonical finite-CF rules, especially the alternative final coefficient `1`,
must be tested. The closed hull may contain an endpoint that is not itself an
infinite continuation; that is acceptable because the enclosure remains
certified.

### Formatting derived approximations

For `kind=:derived`, formatting must be driven by the enclosure, not merely by
the candidate. In a requested radix, a formatter may emit the longest certified
common prefix followed by `?` and optional provisional candidate digits. If the
enclosure crosses a boundary for which no useful prefix exists, use the
parseable derived form `candidate?[=low:high]`. The bracket gives authoritative
exact rational endpoints; the digits before `?` are then a contained display
candidate, not a newly invented prefix guarantee. Do not invent a continued-
fraction prefix from an arbitrary enclosure.

RiX tokenizes a leading sign as unary arithmetic. Negation of a radix or
continued-fraction approximation should transform and preserve a valid
representation record where possible; it should not discard the literal's
presentation merely because the sign was applied by the parser.

### Lexical interaction with existing RiX `?`

The main tokenizer currently reads `23.456?789` as a number, infix `?`, and a
number. The new number scanner must use longest-match recognition for valid
no-space approximation literals.

```rix
23.456?789    ## approximation literal
23.456 ? 789  ## existing infix membership/condition operation
```

This is consistent with RiX's existing adjacency-sensitive distinction between
`3/4` and `3 / 4`.

Preserve these rules:

- `value?(request)` remains postfix `Ask`; a trailing numeric marker must not
  steal `?(` from that form;
- `?-`, `?!-`, `?=`, `?|`, and other compound operators retain maximal-munch
  priority where their grammar applies;
- `{?` remains the case-container sigil;
- a standalone `?` in prefix position is the undecided value described below;
- secondary number scanning and the Lezer/editor tokenizer must recognize the
  same numeric spellings as the semantic tokenizer.

## Standalone `?`: the `Undecided` decision value

### Runtime representation

Add one frozen singleton, provisionally named `UNDECIDED`:

```js
export const UNDECIDED = Object.freeze({ __rix_undecided__: true });
export const isUndecided = value => value === UNDECIDED;
```

The concrete representation may instead use the type system, but identity must
be stable and detection must not depend on formatted text. It should:

- format as `?`;
- copy and deep-copy by identity;
- serialize and revive explicitly;
- have a stable key representation;
- report a runtime/semantic type such as `Undecided` and a `decision` trait;
- remain distinct from `null`, holes, strings, and colon strings.

### Syntax

Bare `?` currently has no valid prefix parse, so these forms can be added
without taking a valid expression:

```rix
decision := ?
values := [?, 1, _]
Handle(?)
{? condition ? result; ? }
```

The Pratt parser distinguishes prefix/value position from existing infix and
postfix uses:

```rix
x ? y       ## infix membership/condition
x?(query)   ## postfix Ask
x := ?      ## undecided value
```

Add an `UndecidedLiteral` AST node and lower it to a dedicated `UNDECIDED` IR
operation or immutable IR literal. Do not lower it to `HOLE` or `NULL`.

### Domain behavior

Standalone undecided is initially a decision value. Decision-aware operations
accept and propagate it. Numeric, collection, and other domain-specific
operations should reject it as the wrong type unless that operation explicitly
defines undecided propagation. This preserves useful type errors and avoids
turning `?` into an untyped value that masks programming mistakes.

The comparison itself does not error when it cannot decide; it returns `?`.
An error from `? + 3`, for example, is a separate and appropriate domain error.

`UNDECIDED` has a stable singleton key. A `CertifiedApproximation`, however,
must not silently become a map or set key through its candidate or formatted
text: numeric identity may be undecided. The first implementation rejects it as
an ordinary structural key unless the caller explicitly requests a stable
source/representation key. Approximate set membership is likewise deferred
until it has an explicit decision-valued contract.

## Core comparison: preserve possible relations

### Existing behavior to retain for exact scalars

`Integer.compareTo` and `Rational.compareTo` return JavaScript `-1`, `0`, or
`1`; their predicate methods return JavaScript booleans. Keep these exact,
total-order contracts.

`RationalInterval` currently has bound equality and set relations but no valid
ordering comparison. RiX's current relational fallback on intervals can reach
JavaScript object/string coercion and produce accidental answers. Remove or
guard that fallback as part of this work.

### Relation mask

For enclosures, Core should report all currently possible order relations
rather than forcing one result:

```text
LESS    = 0b001
EQUAL   = 0b010
GREATER = 0b100
```

The public form may be a frozen result object rather than a raw bit mask, but
it must preserve combinations:

| Left | Right | Possible relations |
|---|---|---|
| `[1,2]` | `[3,4]` | `LESS` |
| `[1,2]` | `[2,3]` | `LESS | EQUAL` |
| `[1,3]` | `[2,4]` | `LESS | EQUAL | GREATER` |
| `[2,2]` | `[2,2]` | `EQUAL` |

Use a new method such as `possibleRelationsTo(other)`. Do not overload
`compareTo` with a result outside `-1/0/1`, because callers of `compareTo`
currently rely on a total order.

For independent closed enclosures `A=[al,ah]` and `B=[bl,bh]`, each relation is
possible when there is a pair of enclosed values satisfying it. A shared
`sourceId` may later eliminate impossible relations, notably making `x == x`
certified true even when the current enclosure is non-point.

## RiX comparison results

RiX exact comparisons retain their current surface values:

```text
true  -> Integer(1)
false -> null
```

Comparisons involving a certified approximation add:

```text
undecided -> UNDECIDED, formatted as ?
```

For `<` over independent enclosures:

```text
certified true  when ah < bl
certified false when al >= bh
undecided       otherwise
```

For `<=`:

```text
certified true  when ah <= bl
certified false when al > bh
undecided       otherwise
```

Reverse the bounds for `>` and `>=`.

For equality:

```text
certified true  when both are the same exact point, or dependency identity proves sameness
certified false when the enclosures are disjoint
undecided       otherwise
```

Inequality negates true/false and preserves undecided.

Expose proof-oriented convenience inquiries as methods or system variants:

```rix
x.CertainlyLessThan(y)  ## always 1 or null
x.PossiblyLessThan(y)   ## always 1 or null
x.PossibleRelations(y)  ## structured relation result
```

The ordinary relational operators return the three-state decision. If an
enclosable provider is available, it may refine within an explicit work policy
before returning `?`; exhausting that policy still returns `?`, not an error.

Internal consumers that require a total order must not choose arbitrarily.
Initially, `Min`, `Max`, and sorting should return `?` when a required ordering
is undecided, or expose a structured unresolved result if they can preserve
useful partial work. They must not reuse JavaScript object ordering.

## Decision logic

Centralize decision classification instead of continuing to duplicate local
`isTruthy` helpers:

```text
decisionState(value)
  HOLE/raw missing -> reject as missing data
  null            -> :null
  UNDECIDED       -> :undecided
  otherwise       -> :truth
```

RiX's frozen `HOLE` sentinel and an accidentally escaped raw `undefined` retain
missing-data behavior. They are neither null nor undecided.

Use strong three-valued logic while preserving RiX's operand-return behavior
where the result is decided:

### NOT

| Input | Result |
|---|---|
| truth | `null` |
| null | `Integer(1)` |
| undecided | `?` |

### AND

| Left | Right | Result |
|---|---|---|
| null | anything | null |
| truth | truth | right truthy operand |
| truth | null | null |
| truth | undecided | `?` |
| undecided | null | null |
| undecided | truth | `?` |
| undecided | undecided | `?` |

An `AND` implementation encountering undecided must continue far enough to
discover a later null, since null determines the result.

### OR

| Left | Right | Result |
|---|---|---|
| truth | anything | left truthy operand |
| null | truth | right truthy operand |
| null | null | null |
| null | undecided | `?` |
| undecided | truth | right truthy operand |
| undecided | null | `?` |
| undecided | undecided | `?` |

An `OR` implementation encountering undecided must continue far enough to
discover a later truthy value.

This continued evaluation is observable. Effects occur in source order, and a
hole or error reached while searching for a decisive later operand still
propagates. Tests must cover effects and errors after an undecided operand.

Decision-aware control consumers must be audited. At minimum:

- the new decision conditional selects its explicit undecided branch;
- an undecided case-arm condition propagates `?` rather than skipping the arm;
- an undecided loop condition stops without executing another body/update and
  returns `?`;
- filters, assertions, retries, tests, and other predicate consumers must not
  treat `?` as truthy. Each should either propagate `?` or return a structured
  unresolved result appropriate to its API.

The first implementation uses these policies:

| Consumer | Undecided policy |
|---|---|
| conditional | select `??`, or return `?` when absent |
| ordered case | return `?` at the first undecided arm that precedes any selected arm |
| loop condition | stop before body/update/after and return `?` |
| assertion | return/record unresolved, never pass or fail |
| filter, split, chunk, generator predicate | return `?` rather than a silently partial collection |
| `Any`/`Every` | continue only to seek a decisive truth/null; otherwise return `?` |
| function guards, prep, prepared trials, multifunction selection | treat as unresolved, never as a passing guard |
| test/retry APIs | record a structured unresolved outcome |
| `Min`/`Max`/sort | return `?` unless the API explicitly returns structured partial order work |

Later APIs may preserve partial collection work in a structured result, but
must opt into that contract explicitly.

## Replacement conditional syntax

### Final grammar

The canonical conditional begins with the truth marker `?:`:

```text
conditional
  := condition "?:" truthExpression branch*

branch
  := "?_" nullExpression
   | "??" undecidedExpression
```

Constraints:

- `?: truthExpression` is required;
- `?_ nullExpression` is optional and may occur at most once;
- `?? undecidedExpression` is optional and may occur at most once;
- `?_` and `??` may occur in either order;
- duplicate branch markers are parse errors;
- branch markers bind to the nearest conditional at the same nesting level;
- conditional nesting is right-associative; parentheses should be used when a
  branch-boundary reading would otherwise be unclear.

All valid shapes are:

```rix
c ?: t
c ?: t ?_ f
c ?: t ?? u
c ?: t ?_ f ?? u
c ?: t ?? u ?_ f
```

Semantics:

| Condition state | Explicit branch | Missing branch default |
|---|---|---|
| truth | `?:` | not applicable; truth branch is required |
| null | `?_` | `null` |
| undecided | `??` | `?` |

Examples:

```rix
label := comparison
    ?: "confirmed"
    ?_ "rejected"
    ?? "not decided"

onlySuccess := comparison ?: ComputeResult()

explainUnknown := comparison
    ?: ComputeResult()
    ?? "needs more precision"

explainFailure := comparison
    ?: ComputeResult()
    ?_ "comparison was false"
```

Only the selected branch is evaluated. Missing branches return their default
values without evaluating anything else.

The marker choices expose the decision state directly:

- `?:` reads as the truthy/value branch;
- `?_` visually names RiX's null spelling `_`;
- `??` visually repeats the undecided marker `?`.

### AST and IR

The existing internal name `TernaryOperation` may be retained initially to
limit churn, but its shape becomes:

```text
ConditionalOperation
  condition
  truthExpression
  nullExpression?       # absent means literal null
  undecidedExpression?  # absent means literal undecided
```

Lower to the existing lazy `TERNARY` IR with four positions, inserting
`DEFER(NULL)` and `DEFER(UNDECIDED)` defaults, or introduce a clearer `DECIDE`
IR name in the final cleanup. Both synchronous and asynchronous evaluators
must use `decisionState` and evaluate exactly one deferred branch.

The lazy `.IF` capability should accept an optional undecided branch or defer
to the same decision operation. With three arguments it returns `?` for an
undecided condition rather than taking the null branch.

### Why `?!` is not retained

The transitional syntax considered earlier was:

```rix
c ?? t ?: f ?! u
```

It is implementable, but it would add a token used only by the grammar being
removed. The final symmetric syntax already gives undecided the natural `??`
marker. Do not add `?!` unless a short-lived migration tool absolutely needs
it; no durable source should emit it.

## Legacy migration and removal

RiX is not released, so the final language has no permanent support for the old
grammar. Migration was staged so implementation could proceed with a working
test suite.

During migration the two forms were contextually distinguishable:

```rix
# Legacy start
c ?? t ?: f

# New start
c ?: t ?_ f ?? u
```

The transitional parser used context to distinguish the forms. That path has
now been deleted. A `??` encountered outside a conditional already begun by
`?:` is a parse error.

At the time this design was written, executable RiX source, plugins, examples,
and tests contained roughly 85 same-line uses of `?? ... ?:` across 19 files,
before documentation and generated output. Nested forms must be migrated with
parser/AST assistance or careful manual review; a blind regular-expression
swap is unsafe.

Completed migration order:

1. Add the undecided value and decision runtime semantics.
2. Add the new `?:`, `?_`, `??` conditional while continuing to parse legacy
   conditionals.
3. Add parser tests that cover both grammars during the transition.
4. Migrate all RiX source, plugins, examples, fixtures, tests, and startup
   scripts to the new grammar.
5. Migrate documentation examples and generated references.
6. Search the repository for remaining legacy conditional AST/source forms.
7. Remove the legacy `??`-starter and `?:`-false parser path.
8. Remove legacy-only tests and regenerate parser/editor bundles and docs.

After removal, `??` is only an undecided-branch marker within a conditional
already started by `?:`; it is no longer a conditional starter.

## Implementation checklist

Implementation status: complete. The checked items below describe the Core,
RiX, provider, editor, tutorial, and documentation work verified together in
August 2026. The temporary legacy-grammar steps in section H were transitional;
the final parser intentionally accepts only the new decision grammar.

### A. RatMath Core value

- [x] Add `CertifiedApproximation` with immutable candidate, enclosure,
      representation, and optional source identity.
- [x] Validate candidate containment and representation invariants.
- [x] Define source identity creation, copy preservation, and serialization.
- [x] Add decimal/base-prefix constructors using closed rational cell hulls.
- [x] Add continued-fraction-prefix construction using convergent-cylinder
      endpoints.
- [x] Add optional explicit-bracket enclosure composition and marker
      validation.
- [x] Implement arithmetic propagation and exact point normalization.
- [x] Define exact-only behavior for discrete operations and conversions.
- [x] Define mixed explicit-interval/approximation results; do not extend the
      linear promotion hierarchy blindly.
- [x] Add `isCertifiedApproximation` and include it in `isCoreNumber`.
- [x] Update mixed arithmetic in `Integer`, `Rational`, `RationalInterval`, and
      `TypePromotion` without relying on interval duck typing.
- [x] Add JSON output/revival, exports, default namespace entries, and
      TypeScript declarations.
- [x] Add unit tests for positive/negative prefixes, arbitrary bases, guard
      digits, explicit bounds, CF parity, canonical CF tails, arithmetic, and
      point collapse.
- [x] Document that this is a finite certified enclosure, not a refinement
      oracle.

### B. Core comparison

- [x] Define public relation constants/result type for LESS, EQUAL, GREATER,
      and combinations.
- [x] Implement `possibleRelationsTo` for exact scalars, point enclosures, and
      independent rational enclosures.
- [x] Preserve existing exact `compareTo` contracts.
- [x] Add tests for separated, touching, overlapping, equal-point, and
      orientation-reversed enclosures.
- [x] Remove or guard any accidental JavaScript object/string comparison path.
- [x] Leave hooks for future source-identity refinement without requiring an
      expression DAG now.

### C. RiX tokenization and parsing of numeric approximations

- [x] Extend the semantic number scanner with no-space `?` approximation
      patterns, longest first.
- [x] Preserve `value?(request)` Ask syntax and compound `?` operators.
- [x] Route recognized approximation spellings through Core parsing.
- [x] Extend structural-literal recognition so symbolic/embedded arithmetic
      preserves the notation and value.
- [x] Update `scanNumberLiteral` consumers.
- [x] Update the Lezer external tokenizer and regenerate its parser if needed.
- [x] Add ambiguity tests for `23.456?789` versus `23.456 ? 789`, trailing
      markers, CF markers, Ask syntax, `?_`, and custom-base quoting.

### D. RiX undecided value

- [x] Add and export the frozen `UNDECIDED` singleton and `isUndecided`.
- [x] Parse standalone `?` in prefix position as `UndecidedLiteral`.
- [x] Add lowering and evaluator support distinct from NULL and HOLE.
- [x] Format it as `?`.
- [x] Add runtime type/trait metadata and builtin method/proto handling.
- [x] Preserve identity through shallow/deep copying and cell operations.
- [x] Add portable serialization, snapshots, interchange, and revival.
- [x] Give it a stable key/diagnostic representation.
- [x] Add tests for assignment, arrays/maps, arguments, return values, copying,
      formatting, serialization, and non-decision type errors.

### E. Decision logic and control

- [x] Centralize `decisionState`; replace relevant duplicated `isTruthy`
      helpers.
- [x] Implement three-valued NOT, AND, and OR with correct continued
      evaluation after undecided.
- [x] Ensure holes retain their existing missing-data behavior.
- [x] Make CASE propagate an undecided earlier condition rather than skip it.
- [x] Define LOOP termination on undecided conditions and test side-effect
      boundaries.
- [x] Audit filters, assertions, tests, retries, generators, and predicate
      callbacks so `?` is never accepted as ordinary truth.
- [x] Mirror all decision behavior in the async evaluator.

### F. New conditional grammar

- [x] Add `?_` as a tokenizer symbol; retain longer compound tokens first.
- [x] Parse `condition ?: truthExpression` as the new conditional starter.
- [x] Parse optional `?_` and `??` branches in either order.
- [x] Reject duplicate branch markers and missing branch expressions.
- [x] Insert null and undecided defaults for omitted branches.
- [x] Define and test right-associative nesting and parenthesized cases.
- [x] Extend the AST and lazy IR to carry the undecided branch.
- [x] Update synchronous and asynchronous conditional evaluation.
- [x] Update `.IF` or its replacement to share the same semantics.
- [x] Do not add durable `?!` syntax.

### G. RiX numeric integration

- [x] Register `CertifiedApproximation` as an enclosed approximate scalar, not
      an interval collection.
- [x] Add `number`, `approximate`, `enclosed`, and an order-inquiry trait whose
      name does not promise a decidable total order. The numeric value itself
      does not receive the `decision` trait.
- [x] Integrate arithmetic dispatch, methods, formatting, copy/deep-copy,
      tensors, structural arithmetic, output snapshots, and interchange.
- [x] Ensure strict Rational conversion fails for non-point enclosures.
- [x] Ensure RationalInterval conversion exposes the enclosure explicitly.
- [x] Implement three-state relational operators and explicit
      Certainly/Possibly inquiries.
- [x] Make Min/Max/Sort surface undecided ordering instead of choosing a host
      object order.
- [x] Add oracle/numerics adapter tests showing optional bounded refinement
      followed by an undecided result on budget exhaustion.

### H. Migration and documentation

- [x] Keep legacy parsing temporarily while adding the new grammar.
- [x] Migrate executable `.rix` sources and first-party plugins.
- [x] Migrate JavaScript-embedded RiX source strings and fixtures.
- [x] Migrate parser, lowering, evaluator, runtime, and documentation tests.
- [x] Replace documentation examples and syntax tables.
- [x] Update number-format, tokenizer, parser, introduction, type, interval,
      oracle, numerics, and rationale documentation.
- [x] Retain `...` for display-only truncation and add explicit bounded
      conversions that return parseable `?` certified forms.
- [x] Regenerate Lezer output, static references, demos, and documentation.
- [x] Search for remaining legacy `?? ... ?:` forms.
- [x] Remove legacy grammar as the final source change.
- [x] Run Core tests, RiX parser tests, RiX evaluator/runtime tests, and the full
      monorepo test suite.

## Required test matrix

At minimum, cover these behavioral examples.

### Standalone decision

```rix
x := ?                       ## x formats as ?
!x                           ## ?
_ && x                       ## _
1 && x                       ## ?
1 || x                       ## 1
_ || x                       ## ?
```

### Conditional branches

```rix
1 ?: 10                      ## 10
_ ?: 10                      ## _
? ?: 10                      ## ?

_ ?: 10 ?_ 20               ## 20
? ?: 10 ?? 30               ## 30

? ?: 10 ?_ 20 ?? 30         ## 30
_ ?: 10 ?? 30 ?_ 20         ## 20
1 ?: 10 ?? 30 ?_ 20         ## 10
```

Verify that unselected expressions, including effects and errors, are not
evaluated.

### Numeric literals

```rix
23.456?                      ## enclosure 23.456:23.457
-23.456?                     ## enclosure -23.457:-23.456
23.456?789                   ## candidate 23.456789, same prefix enclosure
23.456?789[+-12]             ## explicit tighter enclosure
3.~7~15?                     ## enclosure 333/106:355/113, sorted
```

### Comparison

```rix
(1.0? < 2.0?)                ## decided according to actual prefix enclosures
x < y                        ## ? when possible relations include both outcomes
x == x                       ## 1 when source identity proves sameness
x.CertainlyLessThan(y)       ## 1 or _
x.PossiblyLessThan(y)        ## 1 or _
```

Use explicit constructed enclosures in tests so separated, touching, and
overlapping cases are unambiguous.

## Rationale in one sentence

RiX should distinguish exact truth, exact falsity, and insufficient current
evidence, while RatMath Core should carry the exact rational enclosure that
makes that distinction mathematically meaningful.
