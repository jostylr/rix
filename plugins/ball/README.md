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

## Nested square roots

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

Further elementary functions, complex balls, and a high-performance ball
backend remain later work. Universal weighted roots and validated interval
Newton are available through `.numerics` without adding algorithm state to the
ball representation.

See [tutorial.md](tutorial.md).

## JavaScript comparison implementation

[`ball.js`](ball.js) retains the original host implementation for comparison
and profiling. It is intentionally not a plugin manifest and is not bundled or
discovered by RiX hosts.
