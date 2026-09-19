# `continued-fraction`

`continued-fraction` is a pure-RiX exact-real plugin for finite and lazy simple
continued fractions. It mounts callable `.continuedFraction` and the shorter
alias `.cf`, requires no JavaScript host approval, and implements the shared
bounded enclosure/refinement protocol.

## Finite values and parser interoperability

```rix
.Plugin.Load("continued-fraction");
q := .cf.Finite([3, 7, 16]);
q.Convergents();  ## [3, 22/7, 355/113]
q.Value();        ## 355/113

fromLiteral := .continuedFraction(3.~7~16);
fromLiteral.Coefficients();
```

The constructor accepts an exact Rational—including a value produced by RiX's
continued-fraction literal syntax—and recovers its canonical finite coefficient
sequence with `ToContinuedFraction()`. `Finite(coefficients)` preserves an
explicit finite sequence while `Value()` evaluates it exactly.

Coefficient indices use the conventional zero-based `a_0, a_1, ...` notation.
Convergent counts are positive and follow the existing RiX Rational convention:
`Convergent(1)` uses one coefficient.

## Finite generalized continued fractions

`GeneralizedFinite(b0, numerators, denominators, options?)` represents

```text
b0 + a1/(b1 + a2/(b2 + ... + an/bn)).
```

Every coefficient is an exact Integer or Rational. Partial numerators may be
signed, and partial denominators may be signed or zero, so this representation
does not inherit the positive-tail cylinder theorem used by regular continued
fractions.

```rix
.Plugin.Load("continued-fraction");
g := .cf.GeneralizedFinite(1, [-1,2], [2,-3]);
g.Convergents(); ## [1,1/2,1/4]
g.Value();       ## 1/4
g.Normalize()[:coefficients]; ## [0,4]
```

Convergents use the exact continuant recurrence. `ConvergentResult(n)` returns
`:denominatorZero` instead of creating an infinity when the recurrence
denominator is zero; strict `Convergent`, `Value`, and `Normalize` reject that
state. `ZeroStatus()` reports `:unknown` for such a singular representation.
Zero partial numerators are rejected because they terminate the fraction and
would make following terms misleading.

`Normalize()` evaluates a nonsingular finite generalized form exactly and
returns a `rix.continued-fraction.generalized-normalization@1` certificate plus
its canonical regular finite continued fraction. This is a value-preserving
regularization, not a claim that arbitrary infinite generalized fractions have
positive regular tails or certified convergence.

## Lazy and periodic values

```rix
.Plugin.Load("continued-fraction");
root := .cf.Sqrt2();
root.Coefficients(6);  ## [1, 2, 2, 2, 2, 2]
root.Convergents(5);   ## [1, 3/2, 7/5, 17/12, 41/29]
root.Enclosure(4);     ## 7/5:17/12
```

`Lazy(rule)` reads coefficient `n` from `rule(n)`. `Periodic(prefix, period)`
builds a repeating rule, and `Sqrt2()` supplies the proven
`[1; overline{2}]` recipe. RiX validates every observed coefficient exactly:
`a_0` may be any Integer and all later coefficients must be positive Integers.

For an arbitrary lazy rule, positivity of all future coefficients is an
explicit constructor guarantee. `Sqrt2()` upgrades the evidence level to a
plugin-provided proof of its quadratic equation.

## Certified cylinders and refinement

For a positive simple continued-fraction tail, consecutive convergents lie on
opposite sides of the represented real. Their ordered RationalInterval is
therefore a certified cylinder. `ErrorInterval(n)` translates that cylinder so
the `n`-term convergent is at zero.

```rix
.Plugin.Load("continued-fraction");
.Plugin.Load("numerics");
root := .cf.Sqrt2();
result := .numerics.Refine(root, {=
  absoluteWidth = 1 / 1000,
  maxWork = 20
});
root < {~ 3 / 2, 1 / 1000 };
```

Finite values return an exact point enclosure immediately. Lazy values consume
at most one new coefficient per refinement call and retain the best certified
cylinder when the budget is exhausted.

## Certified functions to native regular-CF streams

`FromRefinable(real, options?)` accepts any certified, arbitrarily refinable
singleton provider and exposes its value as a native regular continued
fraction. This immediately covers the roots, elementary functions, trig
functions, and special functions implemented by `numerics`:

```rix
.Plugin.Load("numerics");
.Plugin.Load("continued-fraction");
e := .cf.FromRefinable(.numerics.Exp(1));
ln2 := .cf.FromRefinable(.numerics.Ln(2));
erf1 := .cf.FromRefinable(.numerics.Erf(1));
e.Coefficients(8);    ## [2,1,2,1,1,4,1,1]
ln2.Coefficients(6);  ## [0,1,2,3,1,6]
```

The extractor retains an exact Möbius form `(A*x+B)/(C*x+D)` of the original
source. It emits a coefficient only when the whole transformed RationalInterval
has one floor, then replaces the form by `1/(T-a)`. If the denominator can
still be zero or the enclosure straddles an Integer, it refines the original
source rather than transforming a rounded approximation.

This is the run-length-accelerated form of a Farey/Stern–Brocot walk. A
one-mediant-at-a-time walk provides useful intermediate brackets, but may take
`a_n` comparisons to discover coefficient `a_n`; the stable-floor operation
discovers that run length at once. `Enclosure(n)` still returns the adjacent
convergent/Farey pair for the certified prefix.

The bounded controls are `maxRefinements` (default `64`), `sourceMaxWork`
(default `200` per request), `initialSourceWidth` (default `1`), and `trace`.
Rational boundaries may remain unresolved under every prescribed finite work
budget. `CoefficientResult` reports that honestly as `budgetExhausted`.

## Root specialization

`Sqrt(rational)` recognizes perfect squares exactly. A nonsquare rational uses
the exact quadratic-surd recurrence and returns an explicitly periodic stream:

```rix
.cf.Sqrt(2/3).Record()[:prefix];  ## [0,1]
.cf.Sqrt(2/3).Record()[:period];  ## [4,2]
.cf.Sqrt(2/3).Coefficients(8);    ## [0,1,4,2,4,2,4,2]
```

`NthRoot(value,n)` folds perfect rational nth powers. Nonquadratic irrational
rational roots use Oracle's certified Newton brackets followed by
`FromRefinable`; such roots are not generally periodic. For a non-rational
refinable radicand, load `numerics` before calling `NthRoot`, or construct the
function explicitly and pass it to `FromRefinable`.

## Periodic quadratic recognition

`QuadraticForm()` recognizes an explicitly periodic stream as a quadratic
irrational presentation. It multiplies the exact coefficient matrices, solves
the repeating tail's Möbius fixed-point equation, substitutes the finite
prefix, and returns primitive ascending Integer coefficients:

```rix
.Plugin.Load("continued-fraction");
root := .cf.Sqrt2();
root.QuadraticForm()[:coefficients];               ## [-2, 0, 1]
root.Translate(3).QuadraticForm()[:coefficients];  ## [7, -6, 1]
root.Reciprocal().QuadraticForm()[:coefficients];  ## [-1, 0, 2]
```

The result includes both matrices, their determinants, the discriminant, the
source enclosure, and evidence connecting the equation to the periodic stream.
It certifies that the represented value satisfies the equation; it does not
silently claim that the initial cylinder isolates one root from every other
root of that polynomial.

## Best approximations and exact transformations

`BestApproximation(maxDenominator, options?)` returns the last convergent before
the next denominator exceeds the requested bound. Its certificate uses the
classical best-approximation theorem for the scaled error `|q*x-p|` (the
"second kind"):

```rix
best := root.BestApproximation(10);
best[:approximation]; ## 7/5; next denominator is 12
```

`maxCoefficients` bounds coefficient requests. Exhaustion returns the best
convergent reached with `status=:budgetExhausted`, but does not claim optimality
through the unsearched denominator range.

`Translate(integer)` and `Reciprocal()` preserve the simple stream directly
when their elementary coefficient rules apply. Transduced streams use the
general homographic form `(a*x+b)/(c*x+d)`.

## Native Gosper arithmetic

The four field operations now default to exact coefficient transducers whenever
both operands are native continued fractions (or one is an exact Integer or
Rational):

```rix
.Plugin.Load("continued-fraction");
x := .cf.Sqrt2();
y := .cf.Periodic([1], [1,2]);  ## sqrt(3)
(x+y).Coefficients(6);  ## [3, 6, 1, 5, 7, 1]
(x-y).Coefficients(6);  ## [-1, 1, 2, 6, 1, 5]
(x*y).Coefficients(6);  ## [2, 2, 4, 2, 4, 2]
(x/y).Coefficients(6);  ## [0, 1, 4, 2, 4, 2]
```

The binary state is Gosper's exact bihomographic form

```text
(a*x*y + b*x + c*y + d) / (e*x*y + f*x + g*y + h).
```

An output coefficient is emitted only when the exact floors at every corner of
the current positive-tail square agree and its denominator is separated from
zero. Otherwise the transducer consumes another input coefficient, choosing
the less-consumed side for fair progress. `CoefficientResult(index, options)`
exposes each certified transaction, an optional `trace`, and
`maxInputTerms`; `Coefficient(index)` is the strict convenience form.

Finite/finite operations fold to a finite exact continued fraction. Object
identity also makes `x-x`, nonzero `x/x`, and `x+x` exact or homographic rather
than losing correlation. Squaring an explicitly periodic quadratic uses its
primitive equation. Other binary results have `kind=:gosper` and remain real
coefficient streams, so they can be chained into later operations.

This is a productive exact-real algorithm, not a promise that every requested
coefficient appears within every finite budget. A result on a rational boundary
can require unbounded input before its next floor is forced. Budget exhaustion
returns structured uncertainty; it never guesses a term. Certified numerical
refinement uses the parallel Oracle recipe as an enclosing witness and remains
available even when coefficient production is temporarily unresolved. Arithmetic
with another exact-real family still meets at Oracle.

## Is zero still possible?

`ZeroStatus(options?)` separates facts about the represented stream from facts
about a bounded prefix:

- finite `[0]` is exactly zero;
- a finite `[0,a1,...]` with at least one positive tail coefficient is positive;
- a declared infinite regular stream is nonzero even when `a0=0`, because its
  positive infinite tail makes the value strictly positive;
- a bounded cylinder or a Gosper result whose first stable coefficient has not
  appeared can still include zero, so the answer is `status=:unknown`;
- subtraction of separately constructed equal streams is the central example:
  equality is not inferred from matching observations, while `x-x` for the
  same object is recognized exactly;
- division by a finite exact zero has no coefficient stream; refinement returns
  a structured domain-unknown result. A transduced divisor that has not yet
  been separated from zero likewise remains unresolved under bounded work.

Infinite generalized, signed-digit, and retracting continued fractions remain
future work; those representations require convergence evidence beyond the
finite continuant and zero-separation rules above.

See the runnable [Gosper arithmetic exploration](../../explorations/continued-fractions/gosper-arithmetic.md).

See the runnable [certified function extraction exploration](../../explorations/continued-fractions/certified-function-extraction.md)
for the Möbius and Farey-pair views, roots, elementary functions, and a
rational-boundary demonstration.

See [tutorial.md](tutorial.md).

## Checked fraction evidence

The [portable fraction derivation guide](../fraction/derivation-tutorial.md)
connects written Fraction pairs, bounded Farey paths, exact convergent errors,
conditional lazy-tail bounds, symbolic constants and static document views.
The same inert records drive the Web exact-number inspector.
