---
title: Universal certified arithmetic and root finding
description: Refine every certified real through one protocol, compose unlike representations through Oracle, and run actualized root algorithms.
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
  timeout = 2,
  memory = 64_000_000,
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
Time and memory are cooperative provider limits; provider capability ceilings
and requester limits combine by taking the smaller finite value. Depth remains
available, but providers are better placed to define what one depth unit means.

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

The three entry points make distinct requests. A provider may support only a
subset; unsupported work is returned as a structured result rather than being
silently treated as another operation:

```rix
.Plugin.Load("numerics");
.Plugin.Load("float");

sample := .numerics.Sample(.float(1 / 3));    ## operation :sample
refine := .numerics.Refine(.float(1 / 3));   ## status :unsupported
```

Language Halo neighborhoods use this same Core contract directly:

```rix
.Plugin.Load("oracle");

x := .oracle.Rational(3 / 7);
x < {~ 1 / 2, 1 / 1000 };              ## true, certified
x ? {~ (2 / 5):(1 / 2), 1 / 1000 };    ## true, certified membership
x < {~ 1 / 2, 1 / 1000, {= maxCalls=0 } }; ## undecided: budgetExhausted
```

Here epsilon requests enclosure width; it does not enlarge the target. An
uncertified provider, including Float when interpreted as an intended real,
produces a diagnostic undecided result rather than proving a relation.

## Arithmetic across real representations

Every refinable singleton-real provider advertises the same semantic contract:
it denotes one real, returns certified rational enclosures, and can refine those
enclosures arbitrarily. Finite balls are deliberately different: they denote a
set, not a hidden singleton.

Arithmetic within one family retains that family. Exact Rationals are embedded
as exact leaves, so adding one does not upgrade the result to another real type:

```rix
.Plugin.Load("numerics");
.Plugin.Load("ball");
.Plugin.Load("cauchy");
.Plugin.Load("continued-fraction");
.Plugin.Load("algebraic-real");

b := .ball.Sqrt(2) + 1/3;
c := .cauchy.Geometric(1, 1/2) * 3/2;
f := .cf.Sqrt2() - 1/7;
a := .ar.Sqrt2() / 2;

.Table({=
  columns=["expression", "retained type"],
  rows=[
    ["nested ball + Rational", b.__type],
    ["Cauchy * Rational", c.__type],
    ["continued fraction - Rational", f.__type],
    ["algebraic real / Rational", a.__type]
  ]
});
```

When two different certified families meet, their immutable refinement recipes
are adapted to Oracle and the operation result is an Oracle. No eager decimal
evaluation is needed; each adapter merely answers bounded enclosure requests
using the source's existing refinement protocol:

```rix
.Plugin.Load("numerics");
.Plugin.Load("cauchy");
.Plugin.Load("algebraic-real");

mixed := .cauchy.Geometric(1, 1/2) + .ar.Sqrt2();
answer := .numerics.Refine(mixed, {=
  absoluteWidth=1/1000, maxWork=160, trace=1
});

.Table({=
  columns=["result type", "status", "interval", "calls"],
  rows=[[
    mixed.__type, answer[:status], answer[:interval], answer[:work][:calls]
  ]]
});
```

Oracle conversion accepts only refinable singletons. `.oracle.From` therefore
rejects a finite `.ball(midpoint, radius)`. Use a nested ball recipe when the
value is meant to identify one real.

Float is also outside implicit promotion. A Float is a stored binary64 scalar,
not a refinable certificate for an intended real, so both operands must be
converted explicitly:

```rix
.Plugin.Load("float");

explicit := .float(1/2) + .float(1/3);
convertedAfterExactWork := .float(1/2 + 1/3);
{: explicit, convertedAfterExactWork };
```

Expressions such as `1/2 + .float(1/3)` and
`.ar.Sqrt2() + .float(1/3)` are dispatch errors rather than silent conversions.

## Weighted averaging for n-th roots

`.numerics.NthRoot(q, n)` creates a universal algorithm real. For a positive
upper guess `x`, the partner `q/x^(n-1)` lies on the other side of the root.
Their ordered pair is a certified enclosure, and the next upper guess is the
weighted arithmetic-geometric step

```text
((n - 1) x + q/x^(n-1)) / n.
```

Each iteration stores exact rational endpoints and discards its expression
chain before beginning the next one. Trace entries expose this with
`actualized=1`:

```rix
.Plugin.Load("numerics");

square := .numerics.Refine(.numerics.Sqrt(2), {=
  absoluteWidth=1/1000, maxWork=30, trace=1
});
cube := .numerics.Refine(.numerics.NthRoot(27, 3), {=
  absoluteWidth=1/1000, maxWork=30
});
negativeCube := .numerics.Refine(.numerics.NthRoot(-8, 3), {=
  absoluteWidth=1/1000, maxWork=30
});

.Table({=
  columns=["root", "status", "certified interval"],
  rows=[
    ["sqrt(2)", square[:status], square[:interval]],
    ["cuberoot(27)", cube[:status], cube[:interval]],
    ["cuberoot(-8)", negativeCube[:status], negativeCube[:interval]]
  ]
});
```

The radicand may itself be any certified real. Consequently the fourth root of
two below consumes an algebraic-real provider, while adding a Cauchy real then
uses the ordinary cross-family Oracle rule:

```rix
.Plugin.Load("numerics");
.Plugin.Load("algebraic-real");
.Plugin.Load("cauchy");

fourthRoot := .numerics.Sqrt(.ar.Sqrt2());
shifted := fourthRoot + .cauchy.Geometric(0, 1/2);
result := .numerics.Refine(shifted, {=
  absoluteWidth=1/1000, maxWork=180
});
{: shifted.__type, result[:status], result[:interval] };
```

An even root of an enclosure that cannot certify a nonnegative radicand returns
`:unknown` with `:radicandSignNotCertified`; it never chooses a complex or
absolute-value interpretation silently.

## Rational powers, exponential, and logarithm

Rational powers reuse the same universal root real:

```rix
.Plugin.Load("numerics");

power := .numerics.Refine(.numerics.Pow(27/8, 2/3), {=
  absoluteWidth=1/1000, maxWork=120
});
{: power[:status], power[:interval] };
```

Natural exponential and logarithm use certified rational series bounds. The
optional second argument changes the base:

```rix
.Plugin.Load("numerics");

e := .numerics.Refine(.numerics.Exp(1), {=
  absoluteWidth=1/10000, maxWork=160
});
ln2 := .numerics.Refine(.numerics.Ln(2), {=
  absoluteWidth=1/10000, maxWork=160
});
log4of3 := .numerics.Refine(.numerics.Log(3, 4), {=
  absoluteWidth=1/10000, maxWork=320
});
exact := .numerics.Exp(3, 4);  ## 64

{: e[:interval], ln2[:interval], log4of3[:interval], exact };
```

`.Log2(x)` and `.Log10(x)` are the corresponding base-selected conveniences.
Every non-exact result remains an algorithm real: callers choose precision and
work limits only when they ask to enclose or refine it.

## Certified trigonometry in radians

Trigonometric functions are universal Numerics algorithms, not Float
conversions. `Pi()` uses a certified Machin-formula enclosure. `Sin` and `Cos`
use exact rational Taylor bounds, while the input may come from any certified
real provider:

```rix
.Plugin.Load("numerics");

pi := .numerics.Pi();
sine := .numerics.Refine(.numerics.Sin(pi/6), {=
  absoluteWidth=1/10000, maxWork=400
});
cosine := .numerics.Refine(.numerics.Cos(pi/3), {=
  absoluteWidth=1/10000, maxWork=400
});

{: sine[:interval], cosine[:interval] };
```

`Tan`, `Sec`, `Csc`, and `Cot` are arithmetic compositions of those universal
reals. Their usual poles remain domain boundaries rather than being assigned a
finite value.

The inverse functions use monotone endpoint bounds and return radians.
`Asin`/`Arcsin`, `Acos`/`Arccos`, and `Atan`/`Arctan` are synonymous spellings:

```rix
.Plugin.Load("numerics");

angle := .numerics.Refine(.numerics.Asin(1/2), {=
  absoluteWidth=1/10000, maxWork=500
});
quarterTurn := .numerics.Refine(.numerics.Atan(1), {=
  absoluteWidth=1/10000, maxWork=300
});

{: angle[:interval], quarterTurn[:interval] };
```

An inverse-sine or inverse-cosine input that is not certified inside `-1:1`
returns `:unknown` with `:inverseTrigDomainNotCertified`. Numerics never
silently selects a complex branch or a Float approximation.

## Hyperbolic and special functions

The remaining scientific-calculator functions use the same refinement
contract. They can be selected lexically and called without a plugin prefix:

```rix
.Plugin.Load("bessel");
.numerics[:Refine, :Sinh, :Asinh, :Sinc, :Erf, :Gamma, :LambertW, :Zeta];

values := [
  Sinh(1), Asinh(1), Sinc(0), Erf(1), Gamma(5),
  LambertW(1), .bessel.J0(1), Zeta(2)
];
values |>> ((value) -> Refine(value, {=
  absoluteWidth=1/1000, maxWork=1200
}));
```

`Cbrt`, `Expm1`, `Log1p`, `Radians`, and `Degrees` provide the familiar
calculator conveniences. Hyperbolic reciprocal functions preserve their
ordinary poles, while inverse hyperbolic functions inherit the certified root
and logarithm domain checks.

Special functions publish their real-domain policy rather than silently
crossing a branch: `Gamma`/`LogGamma` and the Bessel Y family currently require positive
arguments, and `Zeta` currently requires an argument greater than one.
`LambertW(x)` is branch zero; `LambertW(x,-1)` is the lower real branch.
Uncertified domains return structured `:unknown` results.

## Geometry and the Gamma family

`Hypot` reuses universal arithmetic and roots. `Atan2` accepts `(y,x)`, keeps
the quadrant decision certified, and uses the branch `-Pi() < angle <= Pi()`.
The positive-real Gamma family shares the same bounded refinement contract:

```rix
.Plugin.Load("numerics");
.numerics[:Refine, :Hypot, :Atan2, :Beta, :LogBeta, :Digamma, :Trigamma];
values := [
  Hypot(3, 4),
  Atan2(1, -1),
  Beta(2, 3),
  LogBeta(2, 3),
  Digamma(1),
  Trigamma(1)
];
values |>> ((value) -> Refine(value, {=
  absoluteWidth=1/1000,
  maxWork=1200
}));
```

`Atan2(0,0)` is undefined and therefore refines to structured `:unknown`
evidence. Beta and the polygamma functions likewise report `:unknown` when
their positive-real domains cannot be certified.

## Kantorovich certification and interval Newton

`.numerics.Kantorovich` first checks the supplied initial interval and rational
bounds. The derivative interval must exclude zero, `derivativeLower` may not
overstate its certified magnitude, and an optional interval-valued second
derivative verifies `secondDerivativeUpper`. The Kantorovich inequality then
certifies an initial root enclosure. Refinement uses interval Newton and
intersects every new interval with the preceding one:

```rix
.Plugin.Load("numerics");

root := .numerics.Kantorovich(
  (x) -> x^2 - 2,
  (x) -> 2*x,
  {=
    interval=1:2,
    initial=3/2,
    derivativeLower=2,
    secondDerivativeUpper=2,
    secondDerivative=(x)->2
  }
);

result := .numerics.Refine(root, {=
  absoluteWidth=1/100000, maxWork=30, trace=1
});
.Table({=
  columns=["status", "evidence", "interval", "calls"],
  rows=[[
    result[:status], result[:evidenceLevel],
    result[:interval], result[:work][:calls]
  ]]
});
```

The function and derivative may accept exact points and rational intervals,
which makes interval evaluation visible and inspectable. Every Newton trace
step contains the materialized guess, derivative enclosure, new certified
interval, error radius, and `actualized=1`; there is no retained trail of lazy
arithmetic expressions between iterations.
