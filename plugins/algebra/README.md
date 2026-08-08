# `.algebra`

Provides verified exact transformations for callable semantic Polynomials from
the `poly` plugin. Loading `.algebra` automatically loads that dependency.
Coefficients are ordered from highest degree to the constant term and normalized
by removing leading zeros. The zero polynomial has coefficients `[0]` and
degree `-1`.

```rix
.Plugin.Load("algebra");
P := .p`x^3 - 6x^2 + 11x - 6`;
F := .p`x - 2`;
division := P.Divide(F);
division.Quotient().Coefficients();
```

## Public operations

- `Polynomial(coefficients, options?)` constructs a callable Polynomial;
  `variable` defaults to `"x"`.
- `Coefficients(polynomial)` and `Record(polynomial)` provide exact portable
  round trips. `Polynomial(Record(p))` reconstructs `p`.
- `Evaluate(polynomial, value)` is equivalent to calling `polynomial(value)`.
- `Equal(left, right)` compares canonical coefficients and variable names.
- `Divide(dividend, divisor)` returns exact quotient and remainder values.
- `SyntheticDivide(polynomial, root)` performs division by `x-root` and also
  retains a portable ruled Grid.
- `Quotient`, `Remainder`, and `Grid` inspect a division result.
- `IsFactor(polynomial, candidate)` is true exactly when the verified remainder
  is zero.
- Receiver methods include `P.Divide(F)`, `P.SyntheticDiv(root)`,
  `division.Quotient()`, `division.Remainder()`, and `division.Grid()`.
- `P // F`, `P % F`, and `P /% F` return the quotient, remainder, and a tuple of
  both. `/` remains scalar division for Polynomials.

Division records use schema `rix.algebra.division@1`. Their `identity` metadata
records the verified relation `dividend = divisor * quotient + remainder`, and
their `factor` metadata distinguishes an exact factor from a nonzero remainder.
Polynomial records use `rix.polynomial@1` and declare canonical symbolic
coefficient equality. Phase 1 is univariate and does not attempt factor search,
gcd, root isolation, or rational functions.

See [tutorial.md](tutorial.md).
