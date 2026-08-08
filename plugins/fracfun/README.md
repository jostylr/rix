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

Factorization, partial fractions, and verified presentation evidence remain
later algebra phases rather than implicit construction behavior.

## Canonical projections and equality

Each exactly projectable value carries cached canonical Polynomial and/or
RationalFunction links. `P()`/`Polynomial()` retrieves the Polynomial projection;
`R()`/`Canonical()` retrieves the RationalFunction projection.

- `==` and `SameForm()` compare the displayed expression tree;
- `Equivalent()` compares canonical rational-function values; and
- `SameFunction()` additionally compares source denominator restrictions.

`Record()` reports whether each canonical cache is available.

## Domains

The callable body retains the original evaluation expression independently of
the displayed transformed spec. Therefore cancelling `(x^2-1)/(x-1)` does not
make the result callable at `x=1`; `.Canonical()` is the explicit boundary that
forgets the removable hole. `Domain()` exposes the source denominator specs.

See [tutorial.md](tutorial.md) and [design.md](design.md).
