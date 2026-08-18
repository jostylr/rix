# Rational-function plugin

`.ratfun` provides semantic, callable univariate rational functions over
exact rational coefficients. It is also available as `.rationalFunction` and
`.rf`; all three names refer to the same loaded plugin value. Loading it
automatically loads `.poly`. Loading `.algebra` automatically loads both.

Canonicalization, arithmetic, composition, symbolic conversion, and receiver
methods are implemented in RiX over the single pure-RiX Polynomial identity.
`ratfun.reference.js` and `rational-function.js` are retained only as comparison
and compatibility sources for the still-host-backed `.fracfun` package.

```rix
.Plugin.Load("ratfun");
R := .rf`(x^2 - 1)/(x - 1)`;
S := (`1/(x + 1)`).R();
T := {#x# (x + 2)/(x - 2)}.R();
{: R(3), S(3), T(3) };
```

The constructor accepts two Polynomials, a record, a Polynomial or exact
scalar to lift, a structural form, or a single-input symbolic specification.
Use `.ratfun.Var(x):...` inside a backtick label or `.R(:x)` when a structural
form has more than one free symbol.

## Canonical value and domain policy

A `RationalFunction` is a fraction-field value, not a record of the source
expression. Construction and every operation:

1. expands numerator and denominator into exact coefficient Polynomials;
2. divides out their monic polynomial gcd; and
3. scales the denominator to be monic.

Thus `(x^2-1)/(x-1)` is the same value as `x+1`, and it evaluates to `2` at
`x=1`. `Domain()` reports the zeros of the *reduced* denominator as excluded.
Restrictions contributed only by cancelled source factors are deliberately not
preserved. The `.fracfun` plugin is the domain-aware, form-preserving workspace
for removable holes; keeping that concern separate prevents RationalFunction
equality from depending on source history.

## Operators and methods

`+`, `-`, `*`, `/`, unary `-`, exact integral `^`, `==`, and `!=` accept
RationalFunctions, Polynomials, and exact scalars where mathematically valid.
Polynomial division promotes to RationalFunction after this plugin is loaded;
negative Polynomial powers do likewise. Calls compose naturally with scalar,
Polynomial, or RationalFunction arguments. Composition may return the narrower
Polynomial type when canonical cancellation leaves denominator `1`.

Receiver methods include `R`, `RationalFunction`, `Numerator`, `Denominator`,
`Variable`, `CoefficientDomain`, `Record`, `Evaluate`, `Compose`, `Domain`,
`IsPolynomial`, `ToPolynomial`, `Together`, `Factored`, `PartialFractions`, and
`PoleZeroEvidence`. Values are normalized eagerly. `Record()` is a portable
round trip using schema `rix.rational-function@1`.

## Exact presentations and divisor evidence

Phase 2 transformations remain separate from canonical equality:

- `Together()` exposes the canonical coprime numerator and monic denominator;
- `Factored()` records exact rational linear factors, units, multiplicities,
  and any monic unfactored residual;
- `PartialFractions()` returns an exact polynomial part, repeated rational
  linear-pole terms, and one proper residual over the denominator portion not
  split over Q; and
- `PoleZeroEvidence()` reports exact rational zeros and poles with
  multiplicities, residual factors, completeness, and the reduced-domain
  policy.

Presentation methods return versioned immutable values. Their `Record()` forms
can be passed to `.ratfun.Expand(record)` or `.algebra.Expand(record)`. Expansion
rebuilds exclusively from the displayed fields and rejects a record unless it
reconstructs the retained canonical RationalFunction exactly. Every operation
and presentation records `rix.algebra.transformation@1` provenance.

The implemented coefficient domain is exact univariate Q[x].
`CoefficientDomain()` publishes its `rix.coefficient-domain@1` descriptor.
Records that claim another coefficient domain are rejected explicitly;
extension fields and multivariate domains belong to Algebra Phase 3.

See [tutorial.md](tutorial.md) for a runnable lesson and
[design.md](design.md) for representation, presentation, and domain decisions.
