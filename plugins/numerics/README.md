# `numerics`

`numerics` is a pure RiX orchestration plugin for bounded numerical work. Its
Phase 1 surface creates portable refinement requests and dispatches them
through methods on the supplied value. It does not import or inspect concrete
Oracle, Float, ball, Cauchy, continued-fraction, or algebraic-real packages.

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
  `:budgetExhausted`, or `:unsupported`;
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
value.NumericsCapabilities()
```

The request schema is `rix.numerics.refinement-request@1`; the result schema is
`rix.numerics.enclosure@1`. That small value protocol is the extension point
for future `.ball`, `.cauchy`, `.continuedFraction`, and `.algebraicReal`
implementations. Providers may use pure RiX or an approved host implementation
without changing Numerics algorithms.

Phase 1 includes a certified Oracle adapter and an approximate Float adapter.
For Float, the returned point interval exactly describes the stored IEEE-754
value, but `certified` and `goalMet` are null because there is no error bound
from that stored value to the intended real computation.

See [tutorial.md](tutorial.md).
