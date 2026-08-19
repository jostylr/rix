---
title: Certified ranges of Calculus expression graphs
description: Range exact arithmetic graphs, preserve repeated inputs, subdivide dependency-sensitive expressions, and retain source-domain holes.
theme: Numbers and numerics
status: implemented
---

Ordinary interval arithmetic combines two operands as independent choices.
An immutable Calculus graph additionally records when two occurrences are the
same input. `.numerics.GraphRange` consumes that graph and exact rational range
bindings, then independently recomputes its claim before returning
`certified=1`.

## Exact primitive graphs

The initial evaluator supports exact constants, variables, negation,
addition, subtraction, multiplication, division, and Integer powers:

```{.rix exec=true}
.Plugin.Load("calculus");
.Plugin.Load("numerics");

x := .calculus.Variable(:x);
expression := 3*x^2-2*x+1;
answer := .numerics.GraphRange(expression,{= x=(-1):2 });

{:
  answer[:range],
  answer[:certified],
  answer[:domainStatus],
  answer[:checker][:accepted]
};
```

The result is an outward enclosure of every graph output. `exactImage=1` is a
stronger statement: the returned set is known to equal the image, not merely
contain it. Dependency can make a certified enclosure wider than the exact
image, so these fields are deliberately separate.

## One input occurrence really is one input

The graph identity proves that both sides of `x-x` use the same `x`:

```{.rix exec=true}
.Plugin.Load("calculus");
.Plugin.Load("numerics");

x := .calculus.Variable(:x);
independent := ((1:2) ~!: :RangeSet)-((1:2) ~!: :RangeSet);
dependent := .numerics.GraphRange(x-x,{= x=1:2 });

{: independent, dependent[:range], dependent[:work][:reuses] };
```

The independent set calculation is `[-1,1]`; the graph result is exactly
`{0}`. The trace records the structural reuse instead of replacing the second
input by a fresh interval choice.

## Cancellation must retain its hole

`x/x` is one wherever it is defined, but it is still undefined at zero:

```{.rix exec=true}
.Plugin.Load("calculus");
.Plugin.Load("numerics");

x := .calculus.Variable(:x);
quotient := .numerics.GraphRange(x/x,{= x=(-1):1 });
impossible := .numerics.GraphRange(1/(x-x),{= x=(-1):1 });

{:
  quotient[:range],
  quotient[:domainStatus],
  quotient[:exclusions][1][:reason],
  impossible[:range],
  impossible[:domainStatus]
};
```

The first image is `{1}` with `partiallyDefined` coverage. The second has a
certified empty image and `noDefinedInputs`: simplifying `x-x` to zero did not
turn division by zero into a value.

## Subdivision tightens without changing identity

For a graph such as `x*x`, plain interval multiplication remains a sound
Cartesian enclosure. Splitting the one exact binding can remove much of that
dependency overestimation while every piece still binds both reads to the
same graph variable:

```{.rix exec=true}
.Plugin.Load("calculus");
.Plugin.Load("numerics");

x := .calculus.Variable(:x);
broad := .numerics.GraphRange(x*x,{= x=(-1):1 });
tight := .numerics.GraphRange(x*x,{= x=(-1):1 },{= maxSubintervals=2 });

{: broad[:range], tight[:range], tight[:work] };
```

Subdivision uses exact rational half-open pieces whose union is the original
set. The public result remains their genuine range union, not an implicit hull.

## Policy and `0^0`

Graph evaluation inherits the same scoped policy as direct range arithmetic:

```{.rix exec=true}
.Plugin.Load("calculus");
.Plugin.Load("numerics");

x := .calculus.Variable(:x);
usual := .numerics.GraphRange(x^0,{= x=0:0 });
combinatorial := .RangePolicy(
  {= zeroPowerZero=:one },
  .numerics.GraphRange(x^0,{= x=0:0 })
);

{:
  usual[:range], usual[:domainStatus],
  combinatorial[:range], combinatorial[:domainStatus]
};
```

The convention is recorded in evidence so `.numerics.CheckGraphRange` can
recompute the result without depending on its current ambient scope. A
`divisionByZero=:throw` or `strict=1` scope similarly turns a proved exclusion
into an error after the mathematical result has been formed.

## Fail closed at semantic applications

The first bridge does not yet connect an `apply` node such as abstract `Exp`
to its trusted Numerics `RangeProvider`. It returns `status=:unknown`,
`domainStatus=:unresolved`, and an `unsupportedSemanticApplication`
diagnostic. This is intentional: the callable implementation link used for
point evaluation is not automatically a range proof.

The next semantic stage binds those IDs to checked domain and range providers.
Primitive derivative-sign and monotone-endpoint rules already work without
that authority link; semantic applications continue to fail closed.

## Use only checked simplification

Neutral identities can be removed before evaluation with
`{= checkedSimplify=1 }`. The transformation is recorded and rechecked, while
the original graph remains the public function identity:

```{.rix exec=true}
.Plugin.Load("calculus");
.Plugin.Load("numerics");

x := .calculus.Variable(:x);
safe := .numerics.GraphRange(-(-(x+0)),{= x=(-2):3 },{= checkedSimplify=1 });
hole := .numerics.GraphRange(x/x,{= x=(-1):1 },{= checkedSimplify=1 });

{:
  safe[:simplification][:targetGraph],
  safe[:checker][:accepted],
  hole[:simplification][:changed],
  hole[:domainStatus]
};
```

The canonical simplifier refuses cancellation, annihilating-zero, and
zero-power rewrites because they can stop evaluating a partial operand. The
full rule contract and extension criteria are documented in
[Proof-preserving simplification](proof-preserving-simplification.md).

## Check a derivative before using its sign

`DifferentiateResult` exposes a rule trace, but a trace is not a certificate by
itself. `CheckDerivativeGraph` independently repeats primitive differentiation
and checks the exact structural derivative plus every ordered domain
obligation:

```{.rix exec=true}
.Plugin.Load("calculus");
.Plugin.Load("numerics");

x := .calculus.Variable(:x);
squareDerivative := .calculus.DifferentiateResult(x^2,:x);
quotientDerivative := .calculus.DifferentiateResult((x+1)/(x-1),:x);

{:
  .numerics.CheckDerivativeGraph(squareDerivative)[:accepted],
  .numerics.CheckDerivativeGraph(quotientDerivative)[:obligationDescriptors]
};
```

The primitive whitelist covers constants, variables, arithmetic, division,
and Integer powers. Division and negative powers retain nonzero obligations.
With the default `0^0` convention, differentiating `x^0` retains the source
obligation `x != 0`; producing the constant derivative zero must not silently
fill the original hole.

## Prove monotonicity from the checked derivative

`DerivativeSign` combines the identity check, a certified derivative graph
range, and exact discharge of the carried obligations:

```{.rix exec=true}
.Plugin.Load("calculus");
.Plugin.Load("numerics");

x := .calculus.Variable(:x);
squareDerivative := .calculus.DifferentiateResult(x^2,:x);
quotientDerivative := .calculus.DifferentiateResult((x+1)/(x-1),:x);

increasing := .numerics.DerivativeSign(squareDerivative,{= x=1:2 });
decreasing := .numerics.DerivativeSign(squareDerivative,{= x=(-2):(-1) });
crossing := .numerics.DerivativeSign(squareDerivative,{= x=(-1):1 });
safeQuotient := .numerics.DerivativeSign(quotientDerivative,{= x=2:3 });
crossingPole := .numerics.DerivativeSign(quotientDerivative,{= x=0:2 });

{:
  increasing[:direction], decreasing[:direction],
  crossing[:status], safeQuotient[:direction],
  crossingPole[:domainStatus]
};
```

The derivative of `x^2` spans both signs on `[-1,1]`, so this strategy is
inconclusive there; it does not claim that a sign-changing enclosure proves
non-monotonicity. On `[2,3]`, the quotient denominator `x-1` is proved
nonzero and its derivative is nonpositive. On `[0,2]`, the same obligation
cannot be discharged, so the result remains unresolved rather than deleting
the pole.

The `x^0` obligation is discharged over inputs containing zero only inside a
`RangePolicy({= zeroPowerZero=:one }, ...)` scope. The active convention is
copied into the result, so later review does not silently inherit a different
ambient convention.

## Recognize specialized exact structure

`.numerics.RecognizeGraph` exposes a conservative univariate polynomial or
rational-function hook for later Sturm and rational-domain strategies:

```{.rix exec=true}
.Plugin.Load("calculus");
.Plugin.Load("numerics");

x := .calculus.Variable(:x);
polynomial := .numerics.RecognizeGraph(x^3-2*x+1,:x);
rational := .numerics.RecognizeGraph((x+1)/(x-1),:x);
uncancelled := .numerics.RecognizeGraph(x/x,:x);

{:
  polynomial[:kind], polynomial[:numerator],
  rational[:denominator],
  uncancelled[:sourceDomainRestrictions]
};
```

Coefficients are exact and ordered from constant term upward. Recognition does
not cancel `x/x`: the denominator and its source restriction remain visible.
An identically zero denominator is rejected instead of being converted to an
empty or constant polynomial. The hook recognizes structure. The checker can
now verify canonical Sturm sequences and complete rational root isolations;
binding those roots to the checked derivative graph and forming the final
extremum range remains the next polynomial stage.

See [Calculus graphs as certified-range subjects](calculus-range-bridge.md)
for the boundary design and
[Evidence for ranges of general functions](derivative-witness-tutorial.md)
for the next proof layer.
