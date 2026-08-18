# Polynomial and rational-function forms in RiX

## Current status

`Polynomial` has one semantic representation: a callable function
with an attached `rix.polynomial@1` identity and an expanded, sparse
coefficient map in one indeterminate. Arithmetic and composition normalize
back to that representation. Exact coefficient records round-trip. The core
symbolic system can explicitly recenter a polynomial with
`.Transform(spec, :center, point)`, but that produces a transformed symbolic
specification rather than a persistent alternate Polynomial representation.
Centered and rational-root factorization presentations, square-free
decomposition, rational-root search, public gcd/lcm, resultants, and versioned
factor evidence are implemented without changing that identity.

`RationalFunction` similarly has one semantic representation: a callable
`rix.rational-function@1` value containing two canonical Polynomials over the
exact rationals. They are coprime and the denominator is monic. Operations,
composition, portable records, Polynomial promotion, exact partial fractions,
together/factored presentations, and zero/pole multiplicity evidence are
implemented over Q[x]. The
`.fracfun` plugin now supplies form-preserving expressions with inherited
source-domain restrictions and explicit canonical projection.

## What established systems do

- SymPy distinguishes expression-preserving combination from canonical
  reduction: `together()` combines terms while retaining structure, whereas
  `cancel()` returns a standard expanded coprime numerator/denominator form.
  Its rational-function fields represent values as polynomial pairs and cancel
  automatically. See the official [polynomial manipulation reference](https://docs.sympy.org/latest/modules/polys/reference.html),
  [simplification tutorial](https://docs.sympy.org/latest/tutorial/simplification.html),
  and [domains introduction](https://docs.sympy.org/latest/modules/polys/domainsintro.html).
- Sage fraction-field elements normalize numerator and denominator so equal
  field values have the same pair. Its rational function field exposes those
  numerator/denominator elements directly. See Sage's
  [fraction-field element documentation](https://doc.sagemath.org/html/en/reference/rings/sage/rings/fraction_field_element.html)
  and [rational function field documentation](https://doc.sagemath.org/html/en/reference/function_fields/sage/rings/function_field/element_rational.html).
- Wolfram Language keeps general expressions and offers explicit structural
  transformations such as `Together`, `Cancel`, `Apart`, `Factor`, and
  `Expand`; its documentation emphasizes that a rational expression has many
  useful forms. See [Rational Functions](https://reference.wolfram.com/language/guide/RationalFunctions.html),
  [Together](https://reference.wolfram.com/language/ref/Together.html.en), and
  [Algebraic Calculations](https://reference.wolfram.com/language/tutorial/AlgebraicCalculations.html?view=all).
- Symbolics.jl's simplifier permits fraction cancellation under the default
  assumption that denominators are nonzero, and lets callers disable fraction
  simplification. See [Expression Manipulation](https://symbolics.juliasymbolics.org/v6.29/manual/expression_manipulation/).

The common split is useful: a mathematical fraction-field *value* has
canonical equality, while an expression tree or presentation records how that
value was written.

## RiX decision

Keep Polynomial and RationalFunction as canonical semantic values. Do not make
expanded, centered, factored, partial-fraction, or continued-fraction spellings
different notions of equality. Instead add explicit presentation/result values
that retain parameters and evidence:

- `PolynomialExpansion` for a chosen center and basis;
- `PolynomialFactorization` for unit, ordered factors, multiplicities,
  coefficient domain, algorithm, and verification evidence;
- `RationalPresentation` for together/factored/partial-fraction views; and
- `FractionFunction` when original exclusions and removable holes must survive
  cancellation (implemented by `.fracfun`).

Each implemented presentation converts back to its canonical semantic value, and
formatters may select a presentation without changing arithmetic or `==`.
Algorithms may use a presentation internally for efficiency, but must leave
canonical equality independent of display and source history.

Together, factored, and partial-fraction values use versioned schemas and
retain explicit `rix.algebra.transformation@1` events. Conversion reconstructs
from the presentation fields and verifies exact equality with the retained
canonical source. Partial fractions split every rational linear factor,
including repetitions, and retain one proper residual for factors not split
over Q. A false completeness claim therefore cannot silently discard an
irreducible factor. Broader coefficient fields remain a Phase 3 concern.

This separation makes the domain rule explicit. As fraction-field values,
`(x^2-1)/(x-1)` and `x+1` are equal and both are defined at `1`; their reduced
denominator defines the pole set. As source expressions, the first formula has
an inherited exclusion at `1`. That second concept should be represented by a
domain-bearing wrapper, not smuggled into RationalFunction equality.
