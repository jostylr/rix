# `numerics`

`numerics` is a pure RiX orchestration plugin for bounded numerical work. It
creates portable refinement requests, dispatches them through methods on the
supplied value, and provides certified algorithm reals for weighted n-th roots,
rational powers, exponential/logarithmic functions, trigonometric functions,
the constant pi, and
Kantorovich/interval-Newton refinement. It depends on the generic Oracle
arithmetic target but does not inspect concrete Float, ball, Cauchy,
continued-fraction, or algebraic-real implementations.

## Load and use

```rix
.Plugin.Load("numerics")
.Plugin.Load("oracle")

real := .oracle.Rational(3 / 7, {= procedure = :bisection })
result := .numerics.Refine(real, {=
  absoluteWidth = 1 / 1000,
  maxWork = 20
})
```

`.numerics.Enclose` and `.numerics.Refine` return
`rix.numerics.enclosure@1` records. A result distinguishes:

- `certified`: whether the interval is proven to contain the represented real;
- `goalMet`: whether the requested width was reached;
- `status`: `:enclosed`, `:approximate`, `:goalNotMet`,
  `:budgetExhausted`, `:resolutionFloor`, `:unsupported`, or `:unknown`;
- `evidenceLevel`: the provider's honest evidence claim;
- `work` and `diagnostics`: bounded resource use and unresolved limitations.
- `approximation`: for certified providers, a scalar `CertifiedApproximation`
  carrying the candidate, exact enclosure, and precision provenance.

When a certified enclosure record is displayed, RiX presents its current exact
interval rather than dumping the orchestration record. The record itself is
unchanged: assign it and use keys such as `result[:status]`,
`result[:evidence]`, or `result[:work]` to inspect the full computation.
Uncertified and unresolved results retain their structured display so their
limitations are not hidden.

Exhaustion is a normal result. Certified providers preserve it as a certified
approximation rather than a guessed answer or an exception; uncertified
providers must not populate that field as though they had an error bound.

## Provider protocol

A provider value supplies receiver methods:

```rix
value.Enclose(request)
value.Refine(request)
value.Sample(request)
value.NumericsCapabilities()
```

The request schema is `rix.numerics.refinement-request@1`; the result schema is
`rix.numerics.enclosure@1`. That small value protocol is the extension point
used by the implemented `.ball`, `.cauchy`, `.continuedFraction`, and
`.algebraicReal` providers. Providers may use pure RiX or an approved host implementation
without changing Numerics algorithms.

Core owns request normalization, limit intersection, capability negotiation,
and result validation. This lets language Halo comparisons use exactly the
same contract without requiring the Numerics plugin to be loaded. Numerics is
the user-facing orchestration surface: `.Enclose`, `.Refine`, and `.Sample`
force their corresponding operation even when handed an existing request.

Phase 1 includes certified Oracle, Ball, Cauchy, continued-fraction, and
algebraic-real adapters plus an approximate Float adapter. For Float, the
returned point interval exactly describes the stored IEEE-754 value, but
`certified` and `goalMet` are null because there is no error bound from that
stored value to the intended real computation.

## Universal algorithms and arithmetic

`.numerics.Sqrt(value)` and `.numerics.NthRoot(value, degree)` apply the
weighted averaging step using exact rational endpoint arithmetic. The current
guess and its partner `q/x^(n-1)` form the enclosing interval. The radicand may
be any certified refinable singleton real.

`.numerics.Pow(value, exponent)` accepts an exact Rational exponent. It reduces
`value^(p/q)` to the universal q-th root followed by an integer power, retaining
the real-domain behavior of odd and even roots.

`.numerics.Exp(value)` and `.numerics.Log(value)` are certified natural
exponential and logarithm algorithm reals. Exact rational Taylor/atanh bounds
and rational range reduction produce their enclosures. A second argument
changes the base: `.numerics.Exp(3, 4)` is `4^3`, while
`.numerics.Log(3, 4)` is `log_4(3)`. `.numerics.Ln` aliases natural `Log`;
`.Log2` and `.Log10` select bases two and ten.

`.numerics.Pi()` is a certified algorithm real using Machin's identity with
alternating rational arctangent bounds. Angles are measured in radians.
`.Sin` and `.Cos` use rational Taylor enclosures lifted across a refined input
interval with their global Lipschitz bound. `.Tan`, `.Sec`, `.Csc`, and `.Cot`
are universal arithmetic compositions of those certified reals.

`.Asin`, `.Acos`, and `.Atan` use monotone endpoint enclosures. Arctangent uses
rational range reduction and the same certified pi value; inverse sine and
cosine combine it with the universal square-root algorithm. The synonymous
spellings `.Arcsin`, `.Arccos`, and `.Arctan` are also exported. Inverse sine
and cosine return structured `:unknown` evidence when the input cannot be
certified inside `-1:1`; reciprocal functions retain their ordinary poles.

These functions accept any certified refinable singleton real. They do not
convert Float values into claimed certificates.

`.numerics.Kantorovich(function, derivative, options)` checks a supplied
initial interval, derivative lower bound, second-derivative upper bound, and
the Kantorovich condition before creating a real. Subsequent requests use
interval Newton and retain nested certified enclosures.

The universal algorithms actualize each iteration into exact rational data. With
`trace=1`, every step reports `actualized=1`, so refinement never builds an
unbounded linked arithmetic-expression trail.

Certified real families implement `+`, `-`, `*`, `/`, integer powers, unary
negation, and absolute value. Same-family operations preserve that family;
Rationals become exact leaves of the family. Operations between different
families produce Oracle recipes. Float never participates in this implicit
promotion and must be constructed explicitly on every operand.

Select the functions a script wants to call without a namespace prefix:

```rix
.Plugin.Load("numerics");
.numerics[:Pow, :E=:Exp, :Log, :Log2, :Sin, :Cos, :Atan];

E(3, 4);  ## 64
Log2(8);
```

The selected names are ordinary bindings in the immediate lexical scope. A
selector of the form `:local=:export` aliases an export; an unaliased name is
shorthand for importing it under the same spelling. A
top-level selection lasts for the script or REPL session; a selection inside a
block disappears when that block exits. The `.numerics` mount remains available
in either case. Remounting with `.Plugin.Load("numerics", {= as="n" })` is still
available when a shorter namespace is preferable.

See [tutorial.md](tutorial.md) for worked examples and
[unary-functions.md](unary-functions.md) for the maintained calculator-function
inventory and implementation priorities.
