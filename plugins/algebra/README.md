# `.algebra`

Provides the presentation and cross-plugin façade for canonical callable
Polynomials. The pure-RiX `.poly` plugin owns Polynomial identity and all exact
coefficient algorithms. `.algebra` delegates to those methods, wraps division
results with verification/factor metadata, and connects synthetic division to
the portable core Grid. Loading `.algebra` automatically loads both `.poly`
and `.ratfun`.
Coefficients are ordered from highest degree to the constant term and normalized
by removing leading zeros. The zero polynomial has coefficients `[0]` and
degree `-1`.

```rix
.Plugin.Load("algebra");
P := .p`x^3 - 6x^2 + 11x - 6`;
F := .p`x - 2`;
division := .algebra.Divide(P, F);
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
- Polynomial receiver methods such as `P.Divide(F)` and
  `P.SyntheticDiv(root)` come from `.poly`; `.algebra.Divide(P, F)` and
  `.algebra.SyntheticDivide(P, root)` add presentation wrappers with
  `division.Quotient()`, `division.Remainder()`, and `division.Grid()`.
- `P // F`, `P % F`, and `P /% F` return the quotient, remainder, and a tuple of
  both. `P / F` instead creates a canonical RationalFunction.

Algebra façade records use schema `rix.algebra.division@1` and retain the
canonical `rix.polynomial.division@1` record in `core`. Their `identity` metadata
records the verified relation `dividend = divisor * quotient + remainder`, and
their `factor` metadata distinguishes an exact factor from a nonzero remainder.
Polynomial records use `rix.polynomial@1` and compare their current canonical
coefficient arrays. `.algebra` requires `.ratfun`, so `/` promotes two
Polynomials to a canonical `rix.rational-function@1` value while `//`, `%`, and
`/%` retain quotient/remainder meaning. Public factor search, gcd, and root
isolation remain later algebra work; RationalFunction cancellation currently
uses a private exact Euclidean gcd.

See [tutorial.md](tutorial.md).
