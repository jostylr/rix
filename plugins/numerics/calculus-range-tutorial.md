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

The next stage binds semantic IDs to checked domain and range providers, then
adds derivative-sign and monotone-endpoint proof rules. Until that authority
link exists, exact arithmetic composition is certified and semantic
applications fail closed.

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
empty or constant polynomial. The hook recognizes structure; a future Sturm
module must still prove complete derivative roots before it can certify a
polynomial extremum range.

See [Calculus graphs as certified-range subjects](calculus-range-bridge.md)
for the boundary design and
[Evidence for ranges of general functions](derivative-witness-tutorial.md)
for the next proof layer.
