# Common unary calculator functions

This is the working inventory for functions that users commonly expect to call
with one numeric argument. “Universal” means the operation should accept any
certified refinable real through the Numerics/Oracle protocol. Exact discrete
operations can remain in Core or a more specific plugin.

## Implemented calculator baseline

| Family | Functions | Current home |
| --- | --- | --- |
| Magnitude and rounding | `Abs`, `Sign`, `Floor`, `Ceiling`, `Round` | Core methods or explicit Float rounding |
| Roots and powers | `Sqrt`, `Cbrt`, `NthRoot`; rational powers through `Pow(x,p/q)` | Numerics |
| Geometric helpers | `Hypot(x,y)`, `Atan2(y,x)` | Numerics |
| Exponential and logs | `Exp`, `Log`, `Ln`, `Log2`, `Log10` | Numerics |
| Stable exponential/log forms | `Expm1`, `Log1p` | Numerics |
| Circular trig | `Sin`, `Cos`, `Tan`, `Sec`, `Csc`, `Cot` | Numerics |
| Inverse circular trig | `Asin`/`Arcsin`, `Acos`/`Arccos`, `Atan`/`Arctan` | Numerics |
| Hyperbolic trig | `Sinh`, `Cosh`, `Tanh`, `Sech`, `Csch`, `Coth` | Numerics |
| Inverse hyperbolic | `Asinh`, `Acosh`, `Atanh` and `Ar…` aliases | Numerics |
| Angle and normalized trig | `Radians`, `Degrees`, `Sinc` | Numerics |
| Special functions | `Gamma`, `LogGamma`, `Beta`, `LogBeta`, `Digamma`, `Trigamma`, `Erf`, `Erfc`, `LambertW`, `Zeta` | Numerics |
| Bessel functions | `.bessel.J(n,x)`, `.bessel.Y(n,x)` plus `J0`, `J1`, `Y0`, `Y1` | Bessel façade over Numerics |
| Normal distribution | `.stats.NormalPDF`, `.stats.NormalCDF`, `.stats.NormalQuantile` | Statistics façade over Numerics |
| Certified constants used by unary functions | `Pi()`, `EulerGamma()` | Numerics |

## Implemented domain notes

- `Sinc(0)` is certified as its removable value `1`, including when zero arrives
  through another refinable-real provider.
- `Gamma` and `LogGamma` currently certify the positive-real branch. Gamma
  uses exact positive-integer and direct positive-half-integer identities.
- `Beta`, `LogBeta`, `Digamma`, and `Trigamma` currently certify positive-real
  arguments. Positive integer Beta values and `Beta(1/2,1/2)` use exact/common
  identities before the general bounded algorithm.
- `Atan2(y,x)` returns angles in `-pi < angle <= pi`, chooses `pi` on the
  negative horizontal axis, and returns `:unknown` at `(0,0)`.
- `.bessel.Y(n,x)` currently certifies positive real arguments and exact
  integer orders. `J` accepts every real argument.
- `Zeta` currently certifies the defining real branch for arguments greater
  than one.
- `LambertW(x)` is the principal real branch; `LambertW(x,-1)` selects the
  lower real branch. Domain uncertainty returns a structured `:unknown` result.

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

## Scientific real-function roadmap

- [x] Calculator geometry: `Hypot` and quadrant-aware `Atan2`.
- [x] Gamma family: `Beta`, `LogBeta`, `Digamma`, and `Trigamma` on the
  positive-real domain.
- [x] Normal PDF, CDF, and inverse CDF under the statistics/probability surface.
- [x] Integer-order Bessel `J(n,x)` and `Y(n,x)`.
- [ ] Modified Bessel `I`/`K`.
- [ ] Reusable certified quadrature.
- [ ] Incomplete/regularized gamma and beta functions, followed by Airy and
  elliptic-integral families.
- [ ] Analytic continuation and explicit pole/sign policy for Gamma and Zeta.
- [ ] Degree-specific trig names such as `SinD` only if angle conversion proves
  too cumbersome in calculator use.
