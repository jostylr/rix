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
- Gamma-family and Bessel-Y bounds need substantially more work because their
  proofs combine several bounded constants and series;
- generic arithmetic composition sometimes requests much tighter internal
  widths than the outer request needs. The standard normal PDF/CDF currently
  show this over-refinement clearly;
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
| `Gamma(1/2)` | `1e-3` | `5.86e-5` | 376 | 0.76 s |
| `J(2,1)` | `1e-3` | `1.15e-4` | 6 | 6 ms |
| `Y(2,1)` | `1e-3` | `7.47e-6` | 930 | 0.35 s |
| `NormalCDF(1)` | `1e-5` | much narrower than requested | 87 | 2.8 s |
| `NormalQuantile(0.975)` | `1e-3` | `4.88e-4` | 964 | 0.33 s |

These figures are guidance, not pass/fail timing thresholds. The conformance
test asserts mathematics and certification; the benchmark exposes performance
regressions without making CI depend on host speed.
