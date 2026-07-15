---
title: "Symbolic specs and exact calculus"
description: "Runtime model, composition rules, attached function specs, and the intentionally bounded exact calculus engine."
---

## Purpose and boundary

The Symbolic capability group performs definite structural transformations. It
does not depend on a representation of real numbers and never silently falls
back to numerical differentiation or quadrature. Unsupported transformations
fail with an error.

The current implementation is a single-output exact-arithmetic core. Named
multi-output specs can be represented and inspected, but arithmetic, `.Poly`,
calculus, and substitution currently require one solved expression.

## Runtime values

`{# ... }` evaluates to a dedicated `symbolic_spec` value. Its ordinary display
is source-like, while `.InspectSpec` exposes the structural map used for tools.

```rix
{#x}                         # identity-symbol form
{#t# t^2 - 4 }               # anonymous single output
{#x:p# p = 2*x }             # explicitly solved output
.InspectSpec({#x# x^2 + 1 }) # structural view
```

The implementation stores lowered expression IR, input and output headers,
closure scopes, origin information, and transform provenance. A spec body is
not executed when the spec is created.

## Application is substitution

A symbolic spec is callable. Arguments replace input slots positionally, but
the result is always another spec:

```rix
G := {#t# t^2 - 4 }
G({#x})          # {#x# x^2 - 4 }
G({#x# x + 1 })  # composition
G(3)             # zero-input constant spec
```

Unfilled source inputs remain inputs. Inputs contributed by argument specs are
collected in argument order and deduplicated by name. `.Poly` is the explicit
boundary from a single-output spec to an executable exact callable.

## Arithmetic propagation

`+`, `-`, `*`, `/`, `^`, and unary `-` propagate specs. Input names are united
by name, preserving first encounter order. Names are not positionally renamed:

```rix
{#x# 2*x } * {#t# t^2 - 4 }
# {#x,t# 2*x*(t^2 - 4) }
```

Using `x` in both operands denotes one shared input. Use substitution such as
`G({#x})` when a rename or composition is intended.

Arithmetic construction does not simplify. Exact scalars can be lifted when a
spec is present. Two spec-backed callables can also be combined, producing a
new callable with the combined spec. Callable-scalar arithmetic is deliberately
not intercepted because lowercase `f(x)` is RiX implicit multiplication; use
`.Spec(F) * scalar` followed by `.Poly` when that distinction matters.

## Function speccability and closure cells

New lambdas and functions are checked against the safe exact-arithmetic profile
by default. A function is auto-speccable when it has ordinary positional
parameters, no prep/effects, and a body composed of exact literals,
identifiers, negation, `+`, `-`, `*`, `/`, and `^`.

Free identifiers are coefficients, not snapshots. The attached spec and every
derived `.Poly` callable retain the source closure scopes, so captured cells
remain live:

```rix
a := 2
F := x -> a*x^2
D := .Deriv(F, {#x})
a ~= 3
D(2) # 12
```

`.Speccability(F)` returns a report. `.Spec(F)` returns an existing spec or
performs the explicit analysis and attachment. Hosts can disable automatic
analysis by setting the context environment value `symbolicAutoSpec` to
`"off"`, `"none"`, or `false`.

## Calculus

`.Deriv(value, variable)` accepts a spec or spec-backed callable. It implements
linearity, product and quotient rules, and exact integer powers. `.Integrate`
implements structural polynomial antiderivatives: sums, differences,
nonnegative monomials, constant factors, and division by expressions independent
of the integration variable. It returns the zero-constant antiderivative; RiX
does not invent or attach an integration constant.

Use `{#x}` as the canonical variable selector. A string such as `"x"` remains
accepted for compatibility. With a single input, the selector may be omitted.

```rix
S := {#x:p# p = x^3 }
.Deriv(S, {#x})          # {#x:p# p = 3*x^2 }
.Integrate({#x# 2*x})    # {#x# x^2 }
```

For specs, calculus returns a spec and preserves a named-output header. For
functions, it returns an executable spec-backed function. Postfix derivative
and prefix integral notation use the same engine:

```rix
F := x -> x^3
G := x -> 2*x
F'(4) # 48
'G(3) # 9
```

Repeated quotes apply repeated transforms. Bracket variable selection supports
the exact single-variable subset. Calculus operation sequences and general
transcendental rules remain outside this implementation.

## Intentional simplification

Symbolic arithmetic preserves construction form. Calculus performs only local
cleanup needed to avoid artifacts such as `0*x`, `x^1`, or constant-only
arithmetic. `.Simplify` is the explicit general cleanup boundary and returns a
new spec or callable without changing its source.

```rix
.Simplify({#x# x*1 + 0 })
.Simplify({#x# x*(x + 1) }, "expand")
```

Default directions are exact constant folding, arithmetic identities, and
power identities. `"expand"` additionally distributes multiplication over
addition and subtraction. A tuple of direction names is accepted for future
extension; supplied directions currently add to the safe defaults.

`:taylor` performs exact polynomial expansion and collection. With no center it
uses powers of the single input; an exact third argument writes the same
polynomial in powers of `(input - center)`. It is a complete exact polynomial
rewrite, not a truncated approximation:

```rix
.Simplify({#x# (x - 1) * (x + 2) }, :taylor)
.Simplify({#x# (x - 1) * (x + 2) }, :taylor, 3)
```

Direction names accept equivalent colon-string and quoted-string forms and are
case-insensitive, so `:expand`, `"expand"`, `:Expand`, and `"EXPAND"` mean the
same thing. See the [complete symbolic simplification
reference](simplification-reference.md) for every rewrite, effective-use
examples, polynomial limits, and deliberate non-transformations.

## Public Symbolic capabilities

| Capability | Result |
|---|---|
| `.Poly(S)` | executable exact callable with `S` attached |
| `.Deriv(S, {#x})` | exact symbolic derivative |
| `.Integrate(S, {#x})` | supported zero-constant antiderivative |
| `.Simplify(S, directions, center)` | new deliberately simplified value; `center` is for `:taylor` |
| `.Spec(F)` | attached or newly analyzed function spec |
| `.Speccability(F)` | analysis report map |
| `.InspectSpec(S)` | structural inspection map |

All language-provided names remain behind the dot system object. There are no
bare `Poly`, `Deriv`, or other symbolic globals.
