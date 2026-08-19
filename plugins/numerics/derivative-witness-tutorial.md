---
title: Evidence for ranges of general functions
description: See which derivative, domain, and identity facts can eventually certify a user function—and why samples or labels cannot.
theme: Numbers and numerics
status: implemented
---

General functions need more than endpoint evaluation. RiX must know which
mathematical function is meant, where it is defined, and why all interior
extrema have been covered. This tutorial builds the useful records while being
explicit about the current boundary: exact set/arithmetic graph evidence,
authority-bound derivative-sign reasoning, and closed monotone endpoint
formation are checked today. Rational-polynomial Sturm sequences, root counts
with explicit endpoint topology, and complete isolations are checked as well.
Primitive `derivative.graph`, structurally checked monotone composition, and
binding an obligation-free polynomial derivative isolation back to its source
graph are checked. One-sided root counts and closed monotonicity partitions at
exact rational critical points are checked too. Semantic derivative rules
remain staged.

## The shape of a derivative-range witness

For `F(x)=x^2` on `[1,2]`, the derivative is `2*x`, whose exact range is
`[2,4]`. The portable witness binds both graph identities and the exact input:

```{.rix exec=true}
input := (1:2) ~!: :RangeSet;
derivativeRange := 2*input;

witness := {=
  schema="rix.calculus.derivative-range-witness@1",
  functionGraph=:graphSquareV1,
  derivativeGraph=:graphTwoXV1,
  variable=:x,
  input=input,
  range=derivativeRange,
  evidence=derivativeRange.RangeEvidence()
};

{:
  witness[:range],
  witness[:evidence][:certified],
  witness[:range].Contains((2:4) ~!: :RangeSet)
};
```

The arithmetic evidence proves the range of `2*x`. The implemented
`monotone.derivativeSign` checker can consume this only after a checked or
authority-resolved derivative-range premise binds `graphTwoXV1` to
`graphSquareV1`. The implemented `derivative.graph` rule establishes that
relationship directly from immutable primitive expression graphs and their
domain obligations. Matching names or source text is not enough.

## From derivative sign to monotonicity

Once a checked derivative identity and derivative range exist, excluding the
wrong sign proves monotonicity on one connected input piece:

```{.rix exec=true}
input := (1:2) ~!: :RangeSet;
derivativeRange := 2*input;
nonnegative := derivativeRange.Contains((2:4) ~!: :RangeSet);

monotonicityCandidate := {=
  schema="rix.calculus.monotonicity-witness@1",
  functionGraph=:graphSquareV1,
  input=input,
  direction=:nondecreasing,
  derivativeRange={=
    schema="rix.calculus.derivative-range-witness@1",
    functionGraph=:graphSquareV1,
    derivativeGraph=:graphTwoXV1,
    variable=:x,
    input=input,
    range=derivativeRange,
    evidence=derivativeRange.RangeEvidence()
  }
};

{: nonnegative, monotonicityCandidate[:direction] };
```

For a decreasing proof the derivative enclosure must lie in
`(-inf,0]`; a range containing both signs proves neither direction. A critical
point partition can split such an input, but its completeness needs checked
root isolation—Sturm evidence for polynomials—not a list found by sampling.

For example, the coefficient array `[0,-1,0,1]` means `x^3-x`, in increasing
degree order. The checker independently derives the canonical sequence

```text
[x^3-x, 3*x^2-1, (2/3)*x, 1]
```

and counts three distinct roots in `[-2,2]`. Three pairwise-disjoint rational
intervals around `-1`, `0`, and `1` are complete only when each has root count
one and their counts sum to the search-set count. Changing the final constant,
omitting an interval, or overlapping two intervals is rejected.

Root endpoints use an explicit policy: `open`, `closed`, `leftClosed`, or
`rightClosed` must agree with the exact range-set topology. The checker obtains
one-sided Sturm signs from exact polynomial derivatives, including at repeated
roots. `endpointsNotRoots` remains available as the stricter assertion that
rejects a root at either counting endpoint.

## Exact critical endpoints form closed monotonicity pieces

Consider `f(x)=x^3-3*x` on `[-2,2]`. Its derivative `3*x^2-3` has the exact
rational roots `-1` and `1`. Complete closed singleton isolations let the
checker form the closed cover

```text
[-2,-1] increasing, [-1,1] decreasing, [1,2] increasing.
```

The pieces share only the certified critical roots. That overlap is
intentional: both neighboring endpoint calculations may use the attained
function value, and a later union removes the duplication harmlessly. It is
not passed off as a pairwise-disjoint `partition.cover` fact.

The same directions are visible through the public derivative-sign strategy:

```{.rix exec=true}
.Plugin.Load("calculus");
.Plugin.Load("numerics");

x := .calculus.Variable(:x);
derivative := .calculus.DifferentiateResult(x^3-3*x,:x);
left := .numerics.DerivativeSign(derivative,{= x=(-2):(-1) });
middle := .numerics.DerivativeSign(derivative,{= x=(-1):1 });
right := .numerics.DerivativeSign(derivative,{= x=1:2 });

{: left[:direction], middle[:direction], right[:direction] };
```

Inside the evidence DAG, `polynomial.monotonicityPartition` independently
recomputes these pieces and signs from the complete critical-point fact.
`monotone.polynomialPiece` then exposes each piece to
`range.monotoneEndpoints`. Non-singleton isolations of irrational roots remain
rational bands; the checker does not invent an irrational value as a rational
split point.

Once monotonicity is checked, `range.monotoneEndpoints` verifies exact
singleton endpoint bindings for the same function identity and forms their
outer hull on a closed bounded connected input. It rejects open or unbounded
pieces until a one-sided-limit vocabulary exists.

## Samples are search hints, not enclosures

Five observations cannot rule out a narrow spike between them. The scoped
provider surface therefore forces an asserted sampled range to remain
heuristic:

```{.rix exec=true}
.Plugin.Load("numerics");

Spiky = (x)->x;
SampleHint = (input, request)->{=
  valueKind=:rangeProviderResult,
  schema="rix.numerics.range-provider-result@1",
  functionId=:sampledSpikyTutorial,
  input=input,
  status=:approximate,
  range=(0:1) ~!: :RangeSet,
  certified=_,
  domainStatus=:allDefined,
  goalMet=_,
  achievedEndpointTolerance=0,
  evidenceLevel=:heuristic,
  work={= calls=5, iterations=0 },
  diagnostics=[:samplesDoNotBoundInterior],
  evidence={= kind=:fiveSamples }
};

Hinted := .numerics.WithRangeKnowledge(Spiky, {=
  functionId=:sampledSpikyTutorial,
  directRange=SampleHint
});
answer := .numerics.Range(Hinted, 0:1);

{: answer[:status], answer[:certified], answer[:evidenceLevel] };
```

Sampling is still useful for choosing subdivisions or looking for candidate
critical points. It simply cannot be an ancestor of a certified evidence root.

## A monotonicity label cannot grant itself authority

Changing the label from `heuristic` to `trustedCapability`, adding
`monotone=1`, and writing `certified=1` does not create a proof. The validator
rejects self-certification from a scoped callback:

```{.rix exec=true}
.Plugin.Load("numerics");

Identity = (x)->x;
BareLabel = (input, request)->{=
  valueKind=:rangeProviderResult,
  schema="rix.numerics.range-provider-result@1",
  functionId=:bareMonotoneTutorial,
  input=input,
  status=:enclosed,
  range=input,
  certified=1,
  domainStatus=:allDefined,
  goalMet=1,
  achievedEndpointTolerance=0,
  evidenceLevel=:trustedCapability,
  work={= calls=0, iterations=0 },
  evidence={= monotone=1 }
};

Labeled := .numerics.WithRangeKnowledge(Identity, {=
  functionId=:bareMonotoneTutorial,
  directRange=BareLabel,
  trust=:trustedCapability
});
validation := .numerics.CheckRangeResult(
  BareLabel((0:1) ~!: :RangeSet, {= }), Labeled, 0:1
);

{: validation[:valid], validation[:reason], validation[:certifying] };
```

There are two certifying routes: a host-authorized provider with a reviewed
invariant, or a theorem DAG accepted by the independent checker. Both bind the
exact callable or immutable graph identity. Neither trusts display names.

## Which knowledge is most useful?

For a new function, prioritize facts in this order:

1. exact real domain and singularities;
2. a stable immutable expression graph and exact derivative identity;
3. derivative ranges or Lipschitz constants on exact input pieces;
4. monotonicity, symmetry, periodicity, and a global codomain bound;
5. complete critical-point isolation, including endpoint conventions; and
6. direct specialized range algorithms with reviewed outward-enclosure
   invariants.

These facts compose. For example, odd symmetry can reflect one checked
half-range, periodicity can reduce a huge input to finitely many pieces, and a
global `[-1,1]` bound can safely finish a sine range when tight endpoints are
not needed. Domain evidence always travels alongside range evidence.

See [the checker vocabulary](checker-vocabulary-v1-proposal.md) for the exact
rule names and [the general range design](range-certification.md) for ownership
across Core, runtime, Numerics, Calculus, Symbolic, and function plugins.
