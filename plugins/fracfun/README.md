# FractionFunction plugin

`.fracfun`, with `.fractionFunction` and `.ff` aliases, provides immutable,
callable, form-preserving polynomial and rational expressions. It is the
representation-sensitive counterpart to canonical `.poly` and `.ratfun`.

The same entry surface handles polynomial forms and quotients naturally:

```rix
.Plugin.Load("fracfun");
P := .ff`(x+1)*(x+1)`;
R := .ff`(x^2-1)/(x-1)`;
Q := (`x^2+1`).ff();
{: P(2), R(3), Q(2) };
```

Loading `.fracfun` loads `.fraction`, `.ratfun`, and `.poly` through declared
service dependencies.

## Preserved forms and explicit transformations

Operators build expression trees without expansion, combination, cancellation,
or coefficient reduction. The following methods return new FractionFunctions:

- `Simplify()` performs explicit identities;
- `Expand()` expands products;
- `Together()` combines nested quotients over a common denominator;
- `Recenter(point)` rewrites a polynomial form in powers of `x-point`;
- `Cancel()` displays the canonical cancelled quotient while preserving the
  original evaluation domain; and
- `ForgetRestrictions()` deliberately adopts the displayed form's domain.

Phase 2 presentations reuse the verified exact algorithms from `.poly` and
`.ratfun`, but wrap their canonical result together with the original
FractionFunction and its authoritative domain:

- `Factor()`/`Factored()` returns rational linear factors, multiplicities, and
  any exact residual factors;
- `SquareFree()`/`SquareFreeDecomposition()` returns separate verified
  numerator and denominator decompositions; and
- `PartialFractions()` returns the exact canonical partial-fraction
  presentation.

Each result has schema `rix.fraction-function.presentation@1`. `Source()` (or
`Function()`) returns the original FractionFunction, `Presentation()` returns
the canonical presentation, and `Domain()` returns the source restrictions.
The `sourceDomainPreserved` flag is always exact `1`. Calling
`presentation.Presentation().Expand()` may reconstruct the canonical
RationalFunction, but it never replaces the wrapper's authoritative source.

## Canonical projections and equality

Each exactly projectable value carries cached canonical Polynomial and/or
RationalFunction links. `P()`/`Polynomial()` retrieves the Polynomial projection;
`R()`/`Canonical()` retrieves the RationalFunction projection.

- `==` and `SameForm()` compare the displayed expression tree;
- `Equivalent()` compares canonical rational-function values; and
- `SameFunction()` additionally compares source denominator restrictions.

`Record()` reports whether each canonical cache is available and includes both
symbolic-spec and portable Calculus forms of the source restrictions.

## Domains

The callable body retains the original evaluation expression independently of
the displayed transformed spec. Therefore cancelling `(x^2-1)/(x-1)` does not
make the result callable at `x=1`; `.Canonical()` is the explicit boundary that
forgets the removable hole. `Domain()` exposes the source denominator specs.

`PoleZeroEvidence()` combines canonical zero/pole multiplicities with
source-domain removable holes under
`rix.fraction-function.divisor-evidence@1`. `RemovableHoleEvidence()` exposes
the source numerator/denominator pair, their exact gcd, verified rational
factor evidence, every original restriction's factor evidence, and the known
rational holes. `complete=1` is reported only when both cancelled factors and
remaining poles split completely over the rational coefficient field;
otherwise the verified residual polynomials remain visible and no unproved
roots are claimed.

## Teaching views

`TransformationGrid()` places the source form, canonical projection, verified
factored/square-free/partial-fraction result, and authoritative source domain
side by side. Every individual presentation also has `Grid()`. These are
portable `Grid` outputs, so terminal, document, and web renderers can choose
their own layout without changing the mathematics.

## Calculus bridge

FractionFunction now exports its paired forms through the public
`rix.calculus.expression@1` schema:

- `CalculusExpression()` exports the displayed form;
- `EvaluationCalculusExpression()` exports the source-domain evaluation form;
- `RestrictionExpressions()` exports every original denominator; and
- `Domain()` and `Record()` include those expressions under
  `calculusRestrictions`.

Load `.symbolic` to activate FractionFunction and Calculus together. Its
`DifferentiateResult` façade uses Calculus's exact rules, while
`.symbolic.Obligations(F)` converts source denominators into explicit nonzero
obligations. Higher derivatives and concrete evaluation are available through
the corresponding Symbolic façades. This is a public interchange boundary; the host plugin still owns
closure rewriting and construction of its paired display/evaluation forms.

See [tutorial.md](tutorial.md) and [design.md](design.md).
