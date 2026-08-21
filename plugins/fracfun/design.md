# FractionFunction representation and transformation model

`FractionFunction` owns a displayed symbolic specification and a separate
evaluation specification. Construction initializes both from the same form.
Operators combine them in parallel. Presentation transformations replace only
the displayed spec, retaining the evaluation spec and therefore the source
domain.

Exactly polynomial/rational forms also cache canonical projections:

- `canonicalPolynomial` is an expanded semantic `Polynomial` when the whole
  form is polynomial;
- `canonicalRationalFunction` is a coprime, monic-denominator
  `RationalFunction`; and
- failures remain inspectable through `Record().canonicalError` rather than
  invalidating a useful formal expression.

This makes three relations explicit:

1. structural form equality;
2. canonical rational-function equivalence; and
3. equivalence together with inherited source-domain restrictions.

Canonical factorization and partial fractions live on `.ratfun` as checked
Q[x] presentations. FractionFunction Phase 2 retains this paired-form contract
by wrapping those verified results with the original FractionFunction, its
restriction specs, and `sourceDomainPreserved=1`; the canonical projection
does not learn source syntax or cancelled restrictions.

Removable-hole evidence is computed from the unreduced source numerator and
denominator. Their exact polynomial gcd records cancelled factors. Rational
roots of that gcd are reported as holes only when the canonical denominator
does not retain the same root as a pole. Residual factor polynomials remain in
the evidence, and completeness is asserted only when the relevant exact
factorizations split fully over Q. Thus partial factorization can add known
facts but cannot silently narrow the uncertainty.

Presentation Grids are views over the same wrapper data. They juxtapose source
form, canonical projection, verified presentation, and source domain; they do
not perform another transformation.
