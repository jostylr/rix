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

Future factorization and partial-fraction work should continue this pattern.
They should return new FractionFunction presentations plus separate evidence
records where algorithms make nontrivial claims. They must not silently change
canonical value or inherited domain.
