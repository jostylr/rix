# Certified accuracy and performance

RiX tests transcendental functions against two complementary kinds of
standard result:

1. exact identities, such as `NormalCDF(0)=1/2`, `J_-n(x)=(-1)^n J_n(x)`,
   `Gamma(1)=1`, and `Zeta(2)=Pi()^2/6`; and
2. outward-rounded decimal reference intervals drawn from NIST DLMF and the
   NIST/SEMATECH probability references.

The machine-readable decimal corpus is
[`benchmarks/numerics-reference-corpus.js`](../../benchmarks/numerics-reference-corpus.js).
Its test requires every RiX result to be certified, meet its requested width,
and overlap the independent outward reference interval. Rounded decimals are
not treated as exact transcendental numbers.

Run only the conformance suite with:

```sh
bun test tests/eval/numerics-reference-corpus.test.js
```

## What a precision request guarantees

For a result with `status=:enclosed`, `certified=1`, interval `a:b`, and
`achievedWidth <= w`, the represented real is proven to lie in `a:b`. The
midpoint therefore has absolute error at most `(b-a)/2`. This is stronger than
agreement with a floating-point library at a displayed number of digits.

There is no fixed decimal ceiling in the algorithms: endpoints are exact
Rationals and the main series, bisection, and recurrence algorithms admit
continued refinement. The practical limit is the requested work budget,
running time, and growth of Rational numerators and denominators. A
`:budgetExhausted` result can still carry a valid certified interval; it means
only that the requested width was not attained.

Current limitations matter:

- elementary series near their range-reduced centers scale well;
- general Gamma-family bounds still combine several bounded constants and
  series, although exact positive integers and half-integers use direct
  identities;
- normal PDF/CDF now use direct request-sized refiners. Normal quantile shares
  its certified `sqrt(2*pi)` interval across comparisons, but exact-rational
  bisection is still noticeably more expensive than a single forward call;
- Bessel Y uses the alternating Euler-Maclaurin remainder for Euler's constant
  rather than the former quadratic-width harmonic bound;
- generic arithmetic composition can still request much tighter internal
  widths than an outer request needs; the precision sweep reports endpoint
  digit growth so these cases are visible;
- forward integer-order Bessel recurrence can widen badly when the order is
  much larger than `|x|`. Certification remains valid, but Miller/backward
  recurrence is the planned performance fix.

## Reproducible benchmark

Run:

```sh
bun run bench:numerics
```

The runner reports requested and achieved width, work calls, wall time, and
reference overlap. Work calls are the more portable comparison; wall time is
machine-specific. A representative Apple-silicon development run gave:

| Function | Requested width | Achieved width | Calls | Approximate time |
| --- | ---: | ---: | ---: | ---: |
| `Pi()` | `1e-7` | `2.98e-8` | 5 | 14 ms |
| `Exp(1)` | `1e-7` | `1.87e-8` | 9 | 13 ms |
| `Log(2)` | `1e-7` | `1.05e-8` | 7 | 17 ms |
| `Sin(1)` | `1e-7` | `4.18e-9` | 5 | 8 ms |
| `Gamma(1/2)` | `1e-3` | `4.00e-4` | 28 | 11 ms |
| `J(2,1)` | `1e-3` | `1.15e-4` | 6 | 6 ms |
| `Y(2,1)` | `1e-3` | `4.64e-5` | 36 | 42 ms |
| `NormalPDF(0)` | `1e-6` | `1.12e-8` | 59 | 20 ms |
| `NormalCDF(1)` | `1e-5` | `7.31e-7` | 57 | 23 ms |
| `NormalQuantile(0.975)` | `1e-3` | `4.88e-4` | 347 | 0.19 s |

These figures are guidance, not pass/fail timing thresholds. The conformance
test asserts mathematics and certification; the benchmark exposes performance
regressions without making CI depend on host speed.

## Precision scaling

Run the warm-runtime sweep with:

```sh
bun run bench:numerics:sweep
```

It requests widths `1e-3`, `1e-6`, `1e-12`, and `1e-24`, warms each case,
then reports the median of three samples. Plugins are loaded only once, though
each timed sample still includes parsing its short RiX expression. Alongside
time and work counts, the sweep reports the largest numerator/denominator
digit count at either interval endpoint. That size is a useful warning for
exact-Rational growth that a wall-clock measurement alone can hide.

For a fast smoke run over the first two widths and one sample per cell:

```sh
bun ./benchmarks/numerics-precision-sweep.js --quick
```

A representative full sweep reached `1e-24` with `:enclosed` status in every
case. Median times at that width were approximately 16 ms for `Exp(1)`, 51 ms
for `Gamma(1/2)`, 299 ms for `Y(2,1)`, 69 ms for `NormalCDF(1)`, and 5.75 s
for `NormalQuantile(0.975)`. The first four paths therefore scale credibly to
deep precision; inverse-normal bisection remains the clear high-precision
optimization target.
