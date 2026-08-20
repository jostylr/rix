# `ball`

`ball` is an opt-in certified-real package implemented entirely in RiX. It
provides exact rational midpoint-radius `Ball` snapshots and nested recipes whose
successive snapshots are guaranteed to be contained in their predecessors.
Loading it evaluates `ball.plugin.rix`; it does not request approval for a
JavaScript host installer.

## Finite balls

```rix
.Plugin.Load("ball");
b := .ball(3 / 2, 1 / 4);
b.Interval();
b.RoundOut(16);
```

`Ball(m, r)` denotes the closed interval `[m-r, m+r]`. Both stored values and
both derived endpoints are exact Rationals. Arithmetic on finite balls uses
exact interval hulls, so `+`, `-`, `*`, `/`, and unary `-` round outward by
construction. Division rejects a divisor containing zero.

`RoundOut(bits)` widens a ball to the smallest enclosing dyadic interval whose
endpoint denominators divide `2^bits`. This is explicit representation
rounding; no endpoint is silently rounded through an IEEE-754 number.

## Nested roots and elementary functions

```rix
.Plugin.Load("ball");
root := .ball.Sqrt(2);
root.Ball(0);  ## 0:2
root.Ball(8);  ## 181/128:91/64
```

`Sqrt` currently accepts a nonnegative exact Integer or Rational. A rational
perfect square immediately produces a point ball. Otherwise, exact bisection
creates a deterministic nested chain. The recipe retains the mathematical
identity and can produce a new snapshot at a later precision; a finite `Ball`
is only one certified snapshot and cannot refine itself.

Phase 2 adds `NthRoot`, `Cbrt`, `Exp`, `Log`, `Sin`, `Cos`, and `Tan` as native
`NestedBallReal` recipes. They use the certified Numerics algorithms but wrap
every answer back into an exact rational Ball enclosure:

```rix
e := .ball.Exp(1, {= guardBits=4 });
answer := e.Refine({= absoluteWidth=1/1000, maxWork=100 });
{: answer[:interval], answer[:evidence][:internalWorkingWidth] };
```

`guardBits` defaults to 3. An output request of width `epsilon` is sent to the
internal algorithm at width `epsilon/2^guardBits`, subject to the same bounded
work policy. The returned evidence records both widths and the underlying
Numerics certificate. This is explicit precision escalation, not Float guard
digits. Finite Balls denote sets rather than singletons, so elementary
functions reject them; use Numerics range images when a set-valued function
image is intended.

## Refinement and Halo comparisons

`Ball` and `NestedBallReal` implement the shared `Enclose`, `Refine`, and
`NumericsCapabilities` receiver protocol. They register the
`rix.enclosable-real@1` capability for `.numerics` and language Halo
comparisons:

```rix
.Plugin.Load("ball");
.Plugin.Load("numerics");
result := .numerics.Refine(.ball.Sqrt(2), {=
  absoluteWidth = 1 / 1000,
  maxWork = 20
});
.ball.Sqrt(2) < {~ 3 / 2, 1 / 1000 };
```

A successful result contains a `CertifiedApproximation`, exact interval,
achieved width, evidence, and work record. A nested recipe that exhausts its
budget reports `:budgetExhausted`; a finite ball requested below its existing
width reports `:resolutionFloor`. Both retain the best certified enclosure.
Overlap never proves equality or ordering.

## Nested arithmetic

Nested ball recipes support `+`, `-`, `*`, `/`, integer powers, unary `-`, and
absolute value while retaining the `NestedBallReal` family. A Rational operand
is embedded as an exact point recipe. Arithmetic with another certified real
family instead produces an Oracle recipe; finite Balls remain set-valued
snapshots and keep their native outward-rounded interval arithmetic.

## Complex balls

`Complex(real, imaginary, radius, imaginaryRadius?)` constructs an exact
axis-aligned rectangular enclosure from two rational Balls. `ComplexParts`
accepts the component Balls directly. Addition, subtraction, multiplication,
division, negation, and conjugation use exact component interval arithmetic:

```rix
z := .ball.Complex(1,2,1/10);
w := .ball.Complex(-1,1,1/5);
product := z*w;
product.ContainsParts(-3,-1);  ## certified true
z.Conjugate();
```

Division rejects a denominator whose rectangular enclosure can include zero.
Rectangular enclosures are intentionally retained rather than silently
converting to a circular radius through an approximate square root. A
high-performance Arb/MPFR-style backend remains Phase 4 work.

See [tutorial.md](tutorial.md).

## JavaScript comparison implementation

[`ball.js`](ball.js) retains the original host implementation for comparison
and profiling. It is intentionally not a plugin manifest and is not bundled or
discovered by RiX hosts.
