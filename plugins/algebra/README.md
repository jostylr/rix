# `.algebra`

Provides canonical exact univariate polynomials beyond the small intrinsic
`.Algebra` layout helpers. Coefficients are ordered from highest degree to the
constant term, stored as exact rationals, and normalized by removing leading
zeros. The zero polynomial has canonical coefficients `[0]` and degree `-1`.

```rix
.Plugin.Load("algebra");
p := .algebra.Polynomial([1, -6, 11, -6]);
factor := .algebra.Polynomial([1, -2]);
division := .algebra.Divide(p, factor);
.algebra.Coefficients(.algebra.Quotient(division));
```

## Public operations

- `Polynomial(coefficients, options?)` constructs a canonical polynomial;
  `variable` defaults to `"x"`.
- `Coefficients(polynomial)` and `Record(polynomial)` provide exact portable
  round trips. `Polynomial(Record(p))` reconstructs `p`.
- `Evaluate(polynomial, value)` uses exact Horner evaluation.
- `Equal(left, right)` compares canonical coefficients and variable names.
- `Divide(dividend, divisor)` returns exact quotient and remainder values.
- `SyntheticDivide(polynomial, root)` performs division by `x-root` and also
  retains a portable ruled Grid.
- `Quotient`, `Remainder`, and `Grid` inspect a division result.
- `IsFactor(polynomial, candidate)` is true exactly when the verified remainder
  is zero.

Division records use schema `rix.algebra.division@1`. Their `identity` metadata
records the verified relation `dividend = divisor * quotient + remainder`, and
their `factor` metadata distinguishes an exact factor from a nonzero remainder.
Polynomial records use `rix.algebra.polynomial@1` and declare canonical
coefficient equality. Phase 1 is univariate and does not attempt factor search,
gcd, root isolation, or rational functions.

See [tutorial.md](tutorial.md).
