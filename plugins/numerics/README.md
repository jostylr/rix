# `numerics`

`numerics` is a pure RiX orchestration plugin for bounded numerical work. It
creates portable refinement requests, dispatches them through methods on the
supplied value, and provides certified algorithm reals for weighted n-th roots,
rational powers, exponential/logarithmic functions, and
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

For a shorter interactive prefix, remount when loading:

```rix
.Plugin.Load("numerics", {= as="n" });
.n.Log2(8);
```

RiX does not yet have a lexical `use`/open-import form that would make selected
plugin members available without a mount prefix.

See [tutorial.md](tutorial.md).
