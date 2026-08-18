# `.algebra`

Provides the presentation and cross-plugin façade for canonical callable
Polynomials and RationalFunctions. The pure-RiX `.poly` and `.ratfun` plugins
own those identities and their exact algorithms. `.algebra` delegates to those
methods, wraps division results with verification/factor metadata, connects
synthetic division to the portable core Grid, and exposes explicit rational
presentations. Loading `.algebra` automatically loads the exact dependency
stack.
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
- `Gcd(left, right)` and `Lcm(left, right)` return monic exact polynomials over
  the rational coefficient field.
- `SquareFreeDecomposition(polynomial)` returns verified factors with their
  multiplicities and the polynomial's leading unit.
- `RationalRoots(polynomial)` returns the distinct exact rational roots.
- `FactorEvidence(polynomial)` returns versioned linear-factor,
  multiplicity, residual, completeness, and reconstruction evidence.
- `CenteredExpansion(polynomial, center)` returns the exact coefficients of
  ascending powers of `(x-center)` as a versioned presentation value.
- `Factorization(polynomial)` separates a nonzero exact unit, rational linear
  factors with multiplicities, and a monic residual. `complete` is true only
  when that residual is constant.
- `RationalFunction(numerator, denominator)` constructs the canonical exact
  Q[x] fraction-field value; `CoefficientDomain(value)` returns its versioned
  exact-domain descriptor.
- `Together(rationalFunction)` and `Factored(rationalFunction)` expose checked
  canonical-pair and rational-factor presentations.
- `PartialFractions(rationalFunction)` returns the exact polynomial part,
  repeated rational-linear-pole terms, and a proper residual for denominator
  factors not split over Q.
- `PoleZeroEvidence(rationalFunction)` reports exact rational zeros and poles,
  their multiplicities, residual factors, completeness, and reduced-domain
  policy.
- `Expand(presentation)`, `presentation.Expand()`, and
  the type-specific `Polynomial()`/`RationalFunction()` methods rebuild the
  canonical semantic value from presentation fields and reject inconsistent
  records. They never use the retained source as a shortcut.
- `Resultant(left, right)` returns the exact Sylvester resultant; zero
  certifies that the polynomials share a factor.
- `SignEvidence(polynomial, point)` and `RootCountEvidence(polynomial,
  interval)` return versioned exact witnesses; `SignAt` and `RootCount` are
  their concise value-only forms.
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
`/%` retain quotient/remainder meaning. Phase 2 gcd/lcm, square-free,
rational-root, factor-evidence, and resultant operations are public through
both `.poly` receiver methods and this façade. RationalFunction cancellation
uses that same public exact gcd. General exact root isolation remains the
separate `.algebraicReal` service.

Centered and factorization values use schemas
`rix.algebra.centered-expansion@1` and `rix.algebra.factorization@1`. They are
explicit presentation values, not alternate Polynomial identities: equality
remains canonical on expanded Polynomial coefficients and the variable name.
Their portable `Record()` forms retain provenance and the claimed source, and
every conversion back validates the basis or factors, reconstructs from the
presentation data, and checks exact equality with that source.

Rational views use `rix.rational-function.together@1`,
`rix.rational-function.factored@1`, and
`rix.rational-function.partial-fractions@1`; divisor evidence uses
`rix.rational-function.divisor-evidence@1`. Their portable records carry
`rix.algebra.transformation@1` provenance. Together/factored/partial expansion
is accepted through either `.ratfun.Expand` or `.algebra.Expand` and requires
exact reconstruction. The declared coefficient domain is Q[x]; extension-field
and multivariate identities are Phase 3 work rather than an implicit fallback.

See [tutorial.md](tutorial.md).
