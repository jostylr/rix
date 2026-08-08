# Certified approximations, undecided values, and decision conditionals

::: {.callout-note title="Implementation design, not current behavior"}
This document records the intended design for certified finite approximations,
three-valued decisions, and the replacement conditional syntax. It is written
as an implementation handoff. The existing
`condition ?? truthExpression ?: falseExpression` syntax remains in the
repository at the time of writing, but RiX is not yet released and the final
migration step is to remove that legacy grammar.
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
7. The existing `condition ?? truthExpression ?: falseExpression` grammar is
   accepted only during migration. Repository source and documentation are
   migrated before its parser support is removed.
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
```

Arithmetic results normally use `kind=:derived`; they retain a candidate and
enclosure but need not pretend that the result still has the operand's digit
prefix.

### Construction invariants

- `candidate` must lie in `enclosure`.
- The enclosure endpoints are exact `Rational` values.
- The representation record, if present, must describe an enclosure containing
  the candidate and must pass representation-specific validation.
- A point enclosure should normally normalize to the corresponding exact
  `Integer` or `Rational`; callers may request a wrapper only when provenance
  itself must be retained.
- Instances and their representation records are immutable in normal use.

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
  null/undefined -> :null
  UNDECIDED       -> :undecided
  otherwise       -> :truth
```

Holes are checked separately and retain missing-data behavior. They are not
classified as undecided.

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

Decision-aware control consumers must be audited. At minimum:

- the new decision conditional selects its explicit undecided branch;
- an undecided case-arm condition propagates `?` rather than skipping the arm;
- an undecided loop condition stops without executing another body/update and
  returns `?`;
- filters, assertions, retries, tests, and other predicate consumers must not
  treat `?` as truthy. Each should either propagate `?` or return a structured
  unresolved result appropriate to its API.

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

RiX is not released, so the final language does not need permanent support for
the old grammar. Removal should nevertheless be last so implementation can
proceed with a working test suite.

During migration the two forms are contextually distinguishable:

```rix
# Legacy start
c ?? t ?: f

# New start
c ?: t ?_ f ?? u
```

When `??` follows a condition in the legacy parser, it starts the old form.
When `??` appears after a new `?:` conditional has begun, it marks the
undecided branch. This permits a staged migration without an intermediate
repository state in which existing scripts stop parsing.

At the time this design was written, executable RiX source, plugins, examples,
and tests contained roughly 85 same-line uses of `?? ... ?:` across 19 files,
before documentation and generated output. Nested forms must be migrated with
parser/AST assistance or careful manual review; a blind regular-expression
swap is unsafe.

Migration order:

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

### A. RatMath Core value

- [ ] Add `CertifiedApproximation` with immutable candidate, enclosure,
      representation, and optional source identity.
- [ ] Validate candidate containment and representation invariants.
- [ ] Add decimal/base-prefix constructors using closed rational cell hulls.
- [ ] Add continued-fraction-prefix construction using convergent-cylinder
      endpoints.
- [ ] Add optional explicit-bracket enclosure composition and marker
      validation.
- [ ] Implement arithmetic propagation and exact point normalization.
- [ ] Define exact-only behavior for discrete operations and conversions.
- [ ] Add `isCertifiedApproximation` and include it in `isCoreNumber`.
- [ ] Update mixed arithmetic in `Integer`, `Rational`, `RationalInterval`, and
      `TypePromotion` without relying on interval duck typing.
- [ ] Add JSON output/revival, exports, default namespace entries, and
      TypeScript declarations.
- [ ] Add unit tests for positive/negative prefixes, arbitrary bases, guard
      digits, explicit bounds, CF parity, canonical CF tails, arithmetic, and
      point collapse.
- [ ] Document that this is a finite certified enclosure, not a refinement
      oracle.

### B. Core comparison

- [ ] Define public relation constants/result type for LESS, EQUAL, GREATER,
      and combinations.
- [ ] Implement `possibleRelationsTo` for exact scalars, point enclosures, and
      independent rational enclosures.
- [ ] Preserve existing exact `compareTo` contracts.
- [ ] Add tests for separated, touching, overlapping, equal-point, and
      orientation-reversed enclosures.
- [ ] Remove or guard any accidental JavaScript object/string comparison path.
- [ ] Leave hooks for future source-identity refinement without requiring an
      expression DAG now.

### C. RiX tokenization and parsing of numeric approximations

- [ ] Extend the semantic number scanner with no-space `?` approximation
      patterns, longest first.
- [ ] Preserve `value?(request)` Ask syntax and compound `?` operators.
- [ ] Route recognized approximation spellings through Core parsing.
- [ ] Extend structural-literal recognition so symbolic/embedded arithmetic
      preserves the notation and value.
- [ ] Update `scanNumberLiteral` consumers.
- [ ] Update the Lezer external tokenizer and regenerate its parser if needed.
- [ ] Add ambiguity tests for `23.456?789` versus `23.456 ? 789`, trailing
      markers, CF markers, Ask syntax, and custom-base quoting.

### D. RiX undecided value

- [ ] Add and export the frozen `UNDECIDED` singleton and `isUndecided`.
- [ ] Parse standalone `?` in prefix position as `UndecidedLiteral`.
- [ ] Add lowering and evaluator support distinct from NULL and HOLE.
- [ ] Format it as `?`.
- [ ] Add runtime type/trait metadata and builtin method/proto handling.
- [ ] Preserve identity through shallow/deep copying and cell operations.
- [ ] Add portable serialization, snapshots, interchange, and revival.
- [ ] Give it a stable key/diagnostic representation.
- [ ] Add tests for assignment, arrays/maps, arguments, return values, copying,
      formatting, serialization, and non-decision type errors.

### E. Decision logic and control

- [ ] Centralize `decisionState`; replace relevant duplicated `isTruthy`
      helpers.
- [ ] Implement three-valued NOT, AND, and OR with correct continued
      evaluation after undecided.
- [ ] Ensure holes retain their existing missing-data behavior.
- [ ] Make CASE propagate an undecided earlier condition rather than skip it.
- [ ] Define LOOP termination on undecided conditions and test side-effect
      boundaries.
- [ ] Audit filters, assertions, tests, retries, generators, and predicate
      callbacks so `?` is never accepted as ordinary truth.
- [ ] Mirror all decision behavior in the async evaluator.

### F. New conditional grammar

- [ ] Add `?_` as a tokenizer symbol; retain longer compound tokens first.
- [ ] Parse `condition ?: truthExpression` as the new conditional starter.
- [ ] Parse optional `?_` and `??` branches in either order.
- [ ] Reject duplicate branch markers and missing branch expressions.
- [ ] Insert null and undecided defaults for omitted branches.
- [ ] Define and test right-associative nesting and parenthesized cases.
- [ ] Extend the AST and lazy IR to carry the undecided branch.
- [ ] Update synchronous and asynchronous conditional evaluation.
- [ ] Update `.IF` or its replacement to share the same semantics.
- [ ] Do not add durable `?!` syntax.

### G. RiX numeric integration

- [ ] Register `CertifiedApproximation` as an enclosed approximate scalar, not
      an interval collection.
- [ ] Add `number`, `approximate`, `enclosed`, and applicable ordered/decision
      traits.
- [ ] Integrate arithmetic dispatch, methods, formatting, copy/deep-copy,
      tensors, structural arithmetic, output snapshots, and interchange.
- [ ] Ensure strict Rational conversion fails for non-point enclosures.
- [ ] Ensure RationalInterval conversion exposes the enclosure explicitly.
- [ ] Implement three-state relational operators and explicit
      Certainly/Possibly inquiries.
- [ ] Make Min/Max/Sort surface undecided ordering instead of choosing a host
      object order.
- [ ] Add oracle/numerics adapter tests showing optional bounded refinement
      followed by an undecided result on budget exhaustion.

### H. Migration and documentation

- [ ] Keep legacy parsing temporarily while adding the new grammar.
- [ ] Migrate executable `.rix` sources and first-party plugins.
- [ ] Migrate JavaScript-embedded RiX source strings and fixtures.
- [ ] Migrate parser, lowering, evaluator, runtime, and documentation tests.
- [ ] Replace documentation examples and syntax tables.
- [ ] Update number-format, tokenizer, parser, introduction, type, interval,
      oracle, numerics, and rationale documentation.
- [ ] Replace truncated-CF `~...` output with a parseable certified form via a
      deliberate formatter/API change; keep exact serialization visibly
      distinct.
- [ ] Regenerate Lezer output, static references, demos, and documentation.
- [ ] Search for remaining legacy `?? ... ?:` forms.
- [ ] Remove legacy grammar as the final source change.
- [ ] Run Core tests, RiX parser tests, RiX evaluator/runtime tests, and the full
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
