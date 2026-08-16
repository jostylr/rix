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
| Exponential and logs | `Exp`, `Log`, `Ln`, `Log2`, `Log10` | Numerics |
| Stable exponential/log forms | `Expm1`, `Log1p` | Numerics |
| Circular trig | `Sin`, `Cos`, `Tan`, `Sec`, `Csc`, `Cot` | Numerics |
| Inverse circular trig | `Asin`/`Arcsin`, `Acos`/`Arccos`, `Atan`/`Arctan` | Numerics |
| Hyperbolic trig | `Sinh`, `Cosh`, `Tanh`, `Sech`, `Csch`, `Coth` | Numerics |
| Inverse hyperbolic | `Asinh`, `Acosh`, `Atanh` and `Ar…` aliases | Numerics |
| Angle and normalized trig | `Radians`, `Degrees`, `Sinc` | Numerics |
| Special functions | `Gamma`, `LogGamma`, `Erf`, `Erfc`, `LambertW`, `J0`, `J1`, `Y0`, `Y1`, `Zeta` | Numerics |
| Certified constants used by unary functions | `Pi()`, `EulerGamma()` | Numerics |

## Implemented domain notes

- `Sinc(0)` is certified as its removable value `1`, including when zero arrives
  through another refinable-real provider.
- `Gamma` and `LogGamma` currently certify the positive-real branch.
- `Y0` and `Y1` currently certify positive real arguments.
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

## Further scientific-calculator candidates

These are recognizable but should follow the baseline families because their
certified algorithms, domains, branch policies, or error bounds need separate
design work:

- `Digamma`, `Beta`, and incomplete gamma/beta functions;
- the normal CDF and inverse normal CDF;
- higher-order Bessel functions and related Airy functions;
- analytic continuation and explicit branch policy for `Zeta` at real
  arguments below one;
- degree-specific trig names such as `SinD` only if angle conversion proves too
  cumbersome in calculator use.

Recommended next implementation order: `Digamma`/`Beta`, normal-distribution
functions, higher-order Bessel functions, then explicitly designed analytic
continuations for the current positive-domain special functions.
