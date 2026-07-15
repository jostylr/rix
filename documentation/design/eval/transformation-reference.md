---
title: "Symbolic transformation reference"
description: "Complete reference for .Transform cleanup, centering, decomposition, g-adic form, and targeted distribution."
---

## Scope

`.Transform` performs explicit, exact rewrites of a symbolic spec or a function
with an attached spec. It returns a new value and never changes the source.
Symbolic arithmetic itself continues to preserve the form that was constructed.

```rix
P := {#x# x * 1 + 0 }
{: P, .Transform(P) }
# P is still {#x# x * 1 + 0 }
```

The name is intentionally `Transform`, rather than `Simplify`: whether one
form is simpler is subjective, while each operation here has a definite
structural meaning. `.Simplify` remains a compatibility alias for existing
programs, but new code should use `.Transform`.

This is a deliberately bounded rewrite engine, not a general computer algebra
system. Each implemented transformation and each important
non-transformation is listed below.

## Call forms and ordered plans

```rix
.Transform(Value)
.Transform(Value, Direction, Arguments...)
.Transform(Value, {: Direction1, Direction2 })
.Transform(Value, {: Direction1, [Direction2, Arguments...] })
```

`Value` may be a single-output symbolic spec or a spec-backed callable. A spec
produces a new spec. A callable produces a new callable with the transformed
spec attached.

A single operation receives its arguments as the remaining function
arguments:

```rix
.Transform(P, :center, 3)
.Transform(P, :decompose, 4, Q)
```

A tuple is an ordered transformation plan. A direction that needs no arguments
may appear bare. A parameterized direction is an array whose first entry is the
direction and whose remaining entries are its arguments:

```rix
.Transform(P, {: :expand, [:center, 3] })
.Transform(P, {: :identities, [:decompose, 4, Q] })
```

Operations run from left to right. A parameterized operation array is also
accepted directly, such as `.Transform(P, [:center, 3])`.

## Direction names

Directions may be colon-strings or quoted strings. These are equivalent:

```rix
:expand
"expand"
:Expand
"EXPAND"
```

Direction matching is case-insensitive. Leading and trailing whitespace, plus
hyphens, underscores, and embedded whitespace, are ignored. Singular
`:identity`, `:constant`, and `:power` are aliases of their plural names. An
unknown direction is an error rather than a silently ignored request.

The exact-cleanup default—`:identities`, `:constants`, and `:powers`—runs for
the no-direction call and accompanies `:expand`. The three names currently
select that same safe cleanup profile when used explicitly.

## Default exact cleanup

Calling `.Transform(Value)` applies all rules in this section recursively.

### Arithmetic identities

| Input form | Output form |
|---|---|
| `0 + A` | `A` |
| `A + 0` | `A` |
| `A - 0` | `A` |
| `0 - A` | `-A` |
| `0 * A` or `A * 0` | `0` |
| `1 * A` or `A * 1` | `A` |
| `0 / A` | `0` |
| `A / 1` | `A` |

Effective use: remove scaffolding created by programmatic construction or by
a calculus rule.

```rix
.Transform({#x# (x * 1 + 0) / 1 })
# {#x# x }
```

These are formal expression identities. In particular, reducing `0 / A` does
not preserve information about a possible zero denominator.

### Exact constants

Exact integer and rational operands are folded for `+`, `-`, `*`, and `/`.
Negation of an exact constant is also folded. Results remain exact.

```rix
.Transform({#x# (2 + 3) * x + 6 / 8 })
# {#x# 5 * x + 3 / 4 }
```

Constant exponentiation is not currently evaluated by this pass. For example,
`2 ^ 3` remains `2 ^ 3`.

### Power identities

| Input form | Output form |
|---|---|
| `A ^ 0` | `1` |
| `A ^ 1` | `A` |

```rix
.Transform({#x# x ^ 1 + x ^ 0 })
# {#x# x + 1 }
```

As with other formal identities, `A ^ 0` becomes `1` without a special case
for `0 ^ 0`.

## `:expand`: distributive expansion

`:expand` recursively distributes multiplication over addition and
subtraction on either side:

```rix
.Transform({#x# x * (x + 1) }, :expand)
# {#x# x * x + x }

.Transform({#x# (x + 1) * (x + 2) }, :expand)
# {#x# x * x + x * 2 + x + 2 }
```

Use `:expand` when a downstream structural operation needs sums exposed. It
does not collect like terms, reorder factors, convert `x * x` to `x ^ 2`, or
produce a canonical polynomial. Use `:center` for canonical polynomial powers.

## `:center`: exact polynomial powers

`:center` expands a single-input polynomial, collects equal powers, combines
exact coefficients, and writes terms in descending powers of a chosen basis.

With no center argument, the basis is the input itself:

```rix
P := {#x# (x - 1) * (x + 2) }
.Transform(P, :center)
# {#x# x ^ 2 + x - 2 }

.Transform({#x# 2 * x + 3 * x }, :Center)
# {#x# 5 * x }
```

The optional argument is an exact integer or rational center. The result is
written in powers of `x - Center`:

```rix
.Transform(P, :center, 3)
# {#x# (x - 3) ^ 2 + 7 * (x - 3) + 10 }

.Transform(P, "CENTER", -2)
# {#x# (x + 2) ^ 2 - 3 * (x + 2) }
```

This is a complete exact polynomial rewrite. It neither approximates nor
truncates. It is useful for evaluation near a point, exposing multiplicity at
a point, or comparing coefficients in a shifted polynomial basis.

### Accepted polynomial structure

The exact polynomial reader used by `:center`, `:decompose`, and `:gadic`
accepts:

- the one declared input variable;
- expressions independent of that input as coefficients;
- unary negation, addition, subtraction, and multiplication;
- division by an expression independent of the input;
- nonnegative exact integer powers of polynomial expressions.

Captured values remain symbolic coefficients linked through the source spec's
closure. Equal powers are collected even when a coefficient cannot itself be
reduced further.

These transformations require exactly one symbolic input. Negative powers,
division by an expression containing the input, and other non-polynomial terms
fail clearly.

## `:decompose`: ordered quotient/remainder form

`:decompose` does not search for roots or irreducible factors. It rewrites a
polynomial in terms of the factors supplied by the caller, in their given
order, using exact polynomial division.

For factors `F1` and `F2`, it computes:

```text
P  = F1 * C1 + R1
C1 = F2 * C2 + R2
```

and returns the nested identity:

```text
P = F1 * (F2 * C2 + R2) + R1
```

An exact scalar `A` denotes the linear factor `(x - A)`. A symbolic spec or
spec-backed function denotes its polynomial after its sole input is
positionally renamed to the input of `P`. The rename is rejected if that factor
already uses the target input name as a coefficient, because silently capturing
that coefficient would change its meaning.

```rix
P := {#x# x ^ 4 }
Q := {#t# t ^ 2 + 1 }
.Transform(P, :decompose, 4, Q)
# {#x# (x - 4) * ((x ^ 2 + 1) * (x + 4) + 15 * x + 60) + 256 }
```

The visible terms record both divisions:

- `x^4 = (x - 4) * (x^3 + 4*x^2 + 16*x + 64) + 256`;
- that first quotient is `(x^2 + 1) * (x + 4) + 15*x + 60`.

### Repeated roots and centered Horner form

Repeating a scalar repeatedly divides by the same linear factor. Supplying a
root at least as many times as the degree expresses the polynomial as a nested
Horner-style form in `(x - root)`:

```rix
.Transform({#x# x ^ 4 }, :decompose, 5, 5, 5, 5)
# {#x# (x - 5) * ((x - 5) * ((x - 5) * (x - 5 + 20) + 150) + 500) + 625 }
```

This is equivalent to centering at `5`, but preserves the successive division
structure. By contrast, `:center` returns a collected sum of powers of
`(x - 5)`.

If a supplied factor has degree greater than the current quotient, polynomial
division returns quotient zero and the current polynomial as its remainder.
The reconstructed expression therefore reduces to that remainder: the step is
effectively a no-op, as are any later steps operating on the zero quotient.

Decomposition operand specs may contribute captured coefficients. Their closure
cells are attached to the result and remain live, subject to the same
conflicting-cell checks as other symbolic combinations.

## `:gadic`: flattened powers of one polynomial

`:gadic` repeatedly divides by one positive-degree polynomial `Q`. If the
source is `P`, the result has the exact form

```text
P = r0 + r1*Q + r2*Q^2 + ... + rn*Q^n
```

where every coefficient polynomial `ri` has degree strictly less than
`degree(Q)`. Unlike `:decompose`, which retains a nested Horner-like record of
successive divisions, `:gadic` returns the flattened sum of powers directly.

```rix
P := {#x# x ^ 4 }
Q := {#t# t ^ 2 + 1 }
.Transform(P, :gadic, Q)
# {#x# 1 - 2 * (x ^ 2 + 1) + (x ^ 2 + 1) ^ 2 }
```

The base may be a symbolic spec, spec-backed function, or scalar root (which
denotes `x - root`), but it must have positive degree. Its one input is renamed
positionally under the same capture-safety rules as `:decompose`.

## `:distribute`: targeted partial expansion

`:expand` recursively distributes every multiplication it can see.
`:distribute` is narrower: it distributes only multiplication by a caller-
selected factor. A scalar `A` selects `(x - A)`; a spec or spec-backed function
selects its polynomial after positional input renaming.

By default, every structurally matching occurrence is distributed. The factor
itself remains atomic, so selecting `(x - 5)` does not expand it into `x - 5`
inside each product.

```rix
H := .Transform({#x# x^4 }, :decompose, 5, 5, 5, 5)
.Transform(H, :distribute, 5)
# sum of products of (x - 5), no remaining Horner nesting
```

For the heterogeneous decomposition example, selecting `4` distributes only
the `(x - 4)` layer and leaves the unrelated `Q * (x + 4)` product intact:

```rix
M := .Transform(P, :decompose, 4, Q)
.Transform(M, :distribute, 4)
# (x - 4)*Q*(x + 4) + (x - 4)*15*x + (x - 4)*60 + 256
```

An optional nonnegative integer limits the number of matching distributions,
visited outermost first:

```rix
.Transform(H, :distribute, 5, 1)
```

Matching is structural rather than algebraic. If the selected factor is not
present in that form, the expression is returned unchanged. To turn a repeated
linear Horner form directly into collected powers, use
`.Transform(H, :center, 5)`; `:center` already performs that canonical
polynomial conversion.

## Combining transformations

Plans run in tuple order. Each bare direction or operation array receives the
output of the preceding step:

```rix
.Transform(P, {: :expand, [:center, 3] })
.Transform(P, {: [:decompose, 4, Q], [:distribute, 4] })
.Transform(P, {: [:gadic, Q], :identities })
```

`:center` already performs polynomial expansion and collection, so an earlier
`:expand` normally does not change its final result. `:distribute` can flatten
only selected layers of a `:decompose` result, while `:gadic` produces its
flattened polynomial-base expansion directly.

## What `.Transform` does not do

No current direction performs any of the following:

- automatic root finding or automatic factor selection;
- cancellation such as `x / x -> 1`;
- rational-expression common denominators;
- assumption-driven rewrites involving signs, nonzero values, or domains;
- commutative sorting of general expressions;
- transcendental identities;
- numerical approximation;
- mutation of the original spec;
- storage of alternate equivalent forms on one spec.

For ordinary symbolic construction, this restraint is intentional: operations
retain the expression the user supplied until a named transformation is
requested.

## Choosing a direction

| Goal | Call |
|---|---|
| Remove exact arithmetic scaffolding | `.Transform(P)` |
| Expose sums hidden inside products | `.Transform(P, :expand)` |
| Expand and collect a polynomial in powers of `x` | `.Transform(P, :center)` |
| Express a polynomial in powers of `(x - A)` | `.Transform(P, :center, A)` |
| Record ordered divisions by caller-supplied factors | `.Transform(P, :decompose, Factors...)` |
| Expand in flattened powers of one polynomial `Q` | `.Transform(P, :gadic, Q)` |
| Distribute only a selected factor | `.Transform(P, :distribute, Factor, Count?)` |
| Apply several transformations in order | `.Transform(P, {: Direction, [Direction, Args...] })` |
| Preserve the constructed expression exactly | Do not call `.Transform` |
