# Common unary calculator functions

This is the working inventory for functions that users commonly expect to call
with one numeric argument. “Universal” means the operation should accept any
certified refinable real through the Numerics/Oracle protocol. Exact discrete
operations can remain in Core or a more specific plugin.

## Implemented calculator baseline

| Family | Functions | Current home |
| --- | --- | --- |
| Magnitude and rounding | `Abs`, `Sign`, `Floor`, `Ceiling`, `Round` | Core methods or explicit Float rounding |
| Roots and powers | `Sqrt`, `NthRoot`; rational powers through `Pow(x,p/q)` | Numerics |
| Exponential and logs | `Exp`, `Log`, `Ln`, `Log2`, `Log10` | Numerics |
| Circular trig | `Sin`, `Cos`, `Tan`, `Sec`, `Csc`, `Cot` | Numerics |
| Inverse circular trig | `Asin`/`Arcsin`, `Acos`/`Arccos`, `Atan`/`Arctan` | Numerics |
| Certified constant used by unary functions | `Pi()` | Numerics |

## High-priority additions

These are common on scientific and graphical calculators and fit the existing
universal-real protocol.

| Family | Suggested functions | Notes |
| --- | --- | --- |
| Hyperbolic trig | `Sinh`, `Cosh`, `Tanh`, `Sech`, `Csch`, `Coth` | Can be built from certified `Exp`; direct formulas should avoid needless cancellation. |
| Inverse hyperbolic | `Asinh`, `Acosh`, `Atanh` plus `Arc…` aliases | Log/root identities with explicit real domains. |
| Near-zero stable forms | `Expm1`, `Log1p` | Important when a small input would make `Exp(x)-1` or `Log(1+x)` lose useful enclosure width. |
| Root conveniences | `Cbrt` | Alias for `NthRoot(x,3)` with real behavior on negative inputs. |
| Angle conversion | `Radians`, `Degrees` | Exact multiplication/division by certified pi; the trig functions themselves remain radian-based. |
| Normalized trig | `Sinc` | Must define the removable value at zero explicitly. |

## Common exact or discrete unary operations

These are expected in calculator interfaces but do not necessarily belong in
Numerics because exact Integer/Rational or collection methods can implement
them without real approximation:

- `Negate`, `Reciprocal`, `Square`, and `Cube` as keypad conveniences;
- `Trunc`, `FractionalPart`, nearest-integer rounding modes, and `Clamp` presets;
- `Factorial`, `DoubleFactorial`, `Gamma`-at-integers, and binomial-row helpers;
- numerator, denominator, integer part, and rational simplification;
- primality, next/previous prime, divisor count, and Euler totient;
- real/imaginary part, conjugate, magnitude, and argument for complex values.

## Broader scientific-calculator functions

These are recognizable but should follow the baseline families because their
certified algorithms, domains, branch policies, or error bounds need separate
design work:

- `Gamma`, `LogGamma`, `Digamma`, and `Beta`;
- `Erf`, `Erfc`, the normal CDF, and inverse normal CDF;
- `LambertW` with an explicit real branch argument rather than an ambiguous
  unary default;
- Bessel functions (`J0`, `J1`, `Y0`, `Y1`) and related special functions;
- `Zeta` and other analytic-number-theory functions;
- degree-specific trig names such as `SinD` only if angle conversion proves too
  cumbersome in calculator use.

Recommended next implementation order: hyperbolic functions, their inverses,
`Expm1`/`Log1p`, `Cbrt`, angle conversion, then `Sinc`. Special functions
should be introduced family by family with certified-domain tests rather than
as unrelated one-off names.
