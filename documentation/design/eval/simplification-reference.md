---
title: "Symbolic simplification reference"
description: "Complete reference for .Simplify directions, exact rewrites, polynomial expansion, and centered Taylor form."
---

## Scope

`.Simplify` performs explicit, exact rewrites of a symbolic spec or a function
with an attached spec. It returns a new value and never changes the source.
Symbolic arithmetic itself continues to preserve the form that was constructed.

```rix
P := {#x# x * 1 + 0 }
{: P, .Simplify(P) }
# P is still {#x# x * 1 + 0 }
```

This is a deliberately bounded rewrite engine, not a general computer algebra
system. Each implemented transformation and each important non-transformation
is listed below.

## Call forms

```rix
.Simplify(Value)
.Simplify(Value, Direction)
.Simplify(Value, {: Direction1, Direction2 })
.Simplify(Value, :taylor, Center)
```

`Value` may be a single-output symbolic spec or a spec-backed callable.
A spec produces a new spec. A callable produces a new callable with the
transformed spec attached.

Directions may be colon-strings or quoted strings. These are equivalent:

```rix
:expand
"expand"
:Expand
"EXPAND"
```

Direction matching is case-insensitive. Leading and trailing whitespace, plus
hyphens, underscores, and embedded whitespace, are ignored. Singular
`:identity`, `:constant`, and `:power` are aliases of their plural names.
An unknown direction is an error rather than a silently ignored request.

The safe default set—`:identities`, `:constants`, and `:powers`—always runs.
An explicit direction currently adds behavior to that set; it does not turn
the defaults off.

## Default simplification

Calling `.Simplify(Value)` applies all rules in this section recursively.

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
.Simplify({#x# (x * 1 + 0) / 1 })
# {#x# x }
```

These are formal expression identities. In particular, reducing `0 / A` does
not preserve information about a possible zero denominator.

### Exact constants

Exact integer and rational operands are folded for `+`, `-`, `*`, and `/`.
Negation of an exact constant is also folded. Results remain exact.

```rix
.Simplify({#x# (2 + 3) * x + 6 / 8 })
# {#x# 5 * x + 3 / 4 }
```

Constant exponentiation is not currently evaluated by this pass. For example,
`2 ^ 3` remains `2 ^ 3`.

### Power identities

| Input form | Output form |
|---|---|
| `A ^ 0` | `1` |
| `A ^ 1` | `A` |

Effective use: clean the boundary powers produced by differentiation,
integration, or generated polynomial code.

```rix
.Simplify({#x# x ^ 1 + x ^ 0 })
# {#x# x + 1 }
```

As with other formal identities, `A ^ 0` becomes `1` without a special case
for `0 ^ 0`.

## `:expand`: distributive expansion

`:expand` recursively distributes multiplication over addition and
subtraction on either side:

```rix
.Simplify({#x# x * (x + 1) }, :expand)
# {#x# x * x + x }

.Simplify({#x# (x + 1) * (x + 2) }, :expand)
# {#x# x * x + x * 2 + x + 2 }
```

Use `:expand` when a downstream structural operation needs sums exposed. It
does not collect like terms, reorder factors, convert `x * x` to `x ^ 2`, or
produce a canonical polynomial. Use `:taylor` for that stronger polynomial
normalization.

## `:taylor`: exact polynomial form

`:taylor` expands a single-input polynomial, collects equal powers, combines
exact coefficients, and writes terms in descending powers of the input.

```rix
P := {#x# (x - 1) * (x + 2) }
.Simplify(P, :taylor)
# {#x# x ^ 2 + x - 2 }

.Simplify({#x# 2 * x + 3 * x }, :Taylor)
# {#x# 5 * x }
```

Despite the name, this operation does not approximate or truncate. For a
polynomial it produces the complete, exactly equal polynomial. Without a third
argument, the basis is ordinary powers of `x`, equivalent to a Taylor form
centered at zero.

### Centered form

The optional third argument is an exact integer or rational center. The result
is written in powers of `x - Center`:

```rix
P := {#x# (x - 1) * (x + 2) }
.Simplify(P, :taylor, 3)
# {#x# (x - 3) ^ 2 + 7 * (x - 3) + 10 }

.Simplify(P, "TAYLOR", -2)
# {#x# (x + 2) ^ 2 - 3 * (x + 2) }
```

This is useful when evaluating near a point, exposing multiplicity at a point,
or comparing coefficients in a local polynomial basis. The center is not an
expansion order; no terms are discarded.

### Accepted polynomial structure

The current exact polynomial reader accepts:

- the one declared input variable;
- expressions independent of that input as coefficients;
- unary negation, addition, subtraction, and multiplication;
- division by an expression independent of the input;
- nonnegative exact integer powers of polynomial expressions.

Captured values remain symbolic coefficients linked through the source spec's
closure. Equal powers are collected even when a coefficient cannot itself be
reduced further.

The direction requires exactly one symbolic input. Negative powers, division
by an expression containing the input, and other non-polynomial terms fail
clearly. A center passed to any direction other than `:taylor` is also an error.

## Direction combinations

A tuple requests several named directions:

```rix
.Simplify(P, {: :expand, :powers })
```

Today, `:identities`, `:constants`, and `:powers` name the three parts of the
always-on default profile. `:expand` adds distributive expansion. `:taylor`
performs the stronger canonical polynomial pass, so adding `:expand` to it
does not provide a different polynomial result.

The tuple form is retained so future transformations can compose without
expanding the positional argument list.

## What `.Simplify` does not do

No current direction performs any of the following:

- factorization;
- cancellation such as `x / x -> 1`;
- rational-expression common denominators;
- assumption-driven rewrites involving signs, nonzero values, or domains;
- commutative sorting of general expressions;
- transcendental identities;
- numerical approximation;
- mutation of the original spec;
- storage of alternate equivalent forms on one spec.

For ordinary symbolic construction, this restraint is intentional: operations
retain the expression the user supplied until a named rewrite is requested.

## Choosing a direction

| Goal | Call |
|---|---|
| Remove exact arithmetic scaffolding | `.Simplify(P)` |
| Expose sums hidden inside products | `.Simplify(P, :expand)` |
| Expand and collect a polynomial in powers of `x` | `.Simplify(P, :taylor)` |
| Express a polynomial around `x = A` | `.Simplify(P, :taylor, A)` |
| Preserve the constructed expression exactly | Do not call `.Simplify` |

