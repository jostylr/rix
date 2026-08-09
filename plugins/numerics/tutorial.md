---
title: Neutral numerical refinement
description: Use one bounded protocol with certified Oracle and approximate Float providers.
theme: Numbers and numerics
status: implemented
---

Load Numerics and a certified real backend. Numerics only calls methods on the
value; it does not know which plugin constructed it:

```rix
.Plugin.Load("numerics");
.Plugin.Load("oracle");

real := .oracle.Rational(3 / 7, {= procedure = :bisection });
certified := .numerics.Refine(real, {=
  absoluteWidth = 1 / 1000,
  maxWork = 20,
  trace = 1
});

.Table({=
  columns = ["status", "certified", "goal met", "value", "interval", "width", "calls"],
  rows = [[
    certified[:status], certified[:certified], certified[:goalMet],
    certified[:approximation], certified[:interval],
    certified[:achievedWidth], certified[:work][:calls]
  ]]
});
```

The provider always returns its structured work record. When its enclosure is
certified, `approximation` is also a first-class `CertifiedApproximation`.
Reaching `maxWork` therefore does not throw away completed work or invent
digits: the status becomes `:budgetExhausted`, while the value retains the
candidate, the exact enclosure reached so far, and requested/achieved
precision metadata. `.numerics.Approximation(result)` extracts that value.

When displayed after derived work it may use an interval spelling; bounded
radix conversion such as `(1/7).ToDecimalApproximation(5)` instead produces the
parseable prefix `0.14285?`. By contrast, `...` remains display-only
truncation and never claims a certified enclosure.

The same request shape works with the Float provider:

```rix
.Plugin.Load("numerics");
.Plugin.Load("float");

sample := .numerics.Sample(
  .float.Sin(.float(1 / 3)),
  {= absoluteWidth = 1 / 1000, maxWork = 20 }
);

.Table({=
  columns = ["status", "certified", "interval", "evidence", "diagnostics"],
  rows = [[
    sample[:status], sample[:certified], sample[:interval],
    sample[:evidenceLevel], sample[:diagnostics]
  ]]
});
```

The Float interval is the exact dyadic value stored by IEEE-754. It is not a
certified enclosure of the ideal sine, so the result remains `:approximate`
and carries `:noErrorBoundForIntendedReal` instead of claiming convergence.

Provider capabilities are data and can be inspected without backend-specific
branches:

```rix
.Plugin.Load("numerics");
.Plugin.Load("oracle");

real := .oracle.Rational(5 / 8);
.numerics.Capabilities(real);
```
