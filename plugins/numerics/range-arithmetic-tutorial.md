---
title: Exact range arithmetic and domain policy
description: Propagate rational measurement sets through exact arithmetic, preserve disconnected answers, and inspect certified exclusions.
theme: Numbers and numerics
status: implemented
---

A `RangeSet` is a set of possible real values. Arithmetic on it computes the
Cartesian image: every left value is combined with every right value. The
result is exact when rational endpoints suffice, and every result carries a
checked `rangeEvidence` record.

## Construct open and unbounded sets exactly

Closed bounded intervals have the short conversion syntax used below. For
open endpoints, disconnected pieces, or infinity, import the versioned public
range-set record. A false closure flag excludes a finite endpoint; `_` in a
low or high endpoint means negative or positive infinity according to its
position. Infinite endpoints must be open.

```{.rix exec=true}
false := 0 == 1;
openUnit := .TypeImport({=
  type="RationalIntervalSet", version=1, cache=_,
  data={= components=[{=
    low=0, high=1, lowClosed=false, highClosed=false
  }] }
});
outside := .TypeImport({=
  type="RationalIntervalSet", version=1, cache=_,
  data={= components=[
    {= low=_, high=(-1), lowClosed=false, highClosed=1 },
    {= low=1, high=_, lowClosed=1, highClosed=false }
  ] }
});

{:
  openUnit.ToString(),
  outside.ToString(),
  openUnit.ContainsValue(0),
  outside.ContainsValue(0)
};
```

The component array may arrive out of order or with overlaps; v1 import
normalizes it. Export with `.TypeExport(value)` to obtain the same portable
shape. Merely importing an older supported record never rewrites its source.

## A calibration with rational uncertainty

Suppose a sensor reports between `99/100` and `101/100`, and calibration is
`3*x-1/10`. Every operation below is exact:

```{.rix exec=true}
measurement := (99/100:101/100) ~!: :RangeSet;
calibrated := 3*measurement - 1/10;
evidence := calibrated.RangeEvidence();

{=
  possibleOutputs=calibrated,
  coverage=evidence[:domain][:coverage],
  checked=evidence[:certified],
  rule=evidence[:evidence][:rule]
};
```

The input width is physical uncertainty; it is not a numerical error to be
refined away. No floating-point endpoint enters this computation.

## A pole creates a union, not a failure

Reciprocal is undefined at exactly zero. Other input points remain meaningful:

```{.rix exec=true}
possibleDenominator := ((-1):1) ~!: :RangeSet;
answer := possibleDenominator.Reciprocal();
report := .RangeEvidence(answer);

{=
  answer=answer,
  components=answer.Split().Len(),
  coverage=report[:domain][:coverage],
  exclusions=report[:domain][:exclusions],
  diagnostics=report[:diagnostics]
};
```

The exact image is `(-inf,-1] U [1,inf)`. The record is still certified:
`partiallyDefined` reports that zero was excluded, rather than invalidating
the values produced by every nonzero input.

If the request contains only zero, the defined image is the certified empty
set:

```{.rix exec=true}
zero := (0:0) ~!: :RangeSet;
answer := zero.Reciprocal();
{:
  answer,
  answer.RangeEvidence()[:domain][:coverage],
  answer.RangeEvidence()[:certified]
};
```

This distinction matters: an empty image proved from the mathematical domain
is not the same as an unresolved computation.

## Report mode and selective throwing

The default policy reports exclusions in metadata and returns the defined
image. A scope can make selected mathematical diagnostics throw:

```{.rix exec=true}
x := ((-1):1) ~!: :RangeSet;

reported := .RangePolicy({= divisionByZero=:report }, x.Reciprocal());
ordinary := reported.RangeEvidence()[:domain][:coverage];

## Uncomment to turn this particular exclusion into an error:
## .RangePolicy({= divisionByZero=:throw }, x.Reciprocal());

ordinary;
```

`strict=1` is shorthand for throwing on every proved range-domain diagnostic.
Policies inherit into nested scopes; an inner scope can override one category.
Changing the policy changes control flow, never the mathematical range or its
checker rule.

## The `0^0` convention is explicit

Real range arithmetic treats `0^0` as undefined by default. If an interval
also contains nonzero values, the output still contains `1` and the excluded
tuple is reported:

```{.rix exec=true}
base := (0:2) ~!: :RangeSet;
usual := base^0;
combinatorial := .RangePolicy({= zeroPowerZero=:one }, base^0);

{=
  usualRange=usual,
  usualCoverage=usual.RangeEvidence()[:domain][:coverage],
  combinatorialRange=combinatorial,
  combinatorialCoverage=combinatorial.RangeEvidence()[:domain][:coverage]
};
```

The convention is stored in evidence. A portable checker does not depend on
whatever policy happens to be active when it later reads the result.

## Union, intersection, hull, and components

Set union retains gaps. Hull is deliberately separate:

```{.rix exec=true}
left := (1:2) ~!: :RangeSet;
right := (4:5) ~!: :RangeSet;
pieces := left \/ right;

{=
  union=pieces,
  hull=left |\/| right,
  intersection=pieces /\ ((3/2):(9/2)),
  components=pieces.Split(),
  containsWhole=((1:2) ? pieces),
  overlaps=((2:4) ?/\ pieces),
  disjoint=((5:6) !/\ left)
};
```

Use `.Split()` with no argument to obtain connected components. An eventual
split specification can add subdivisions without changing this meaning.

## Dependency: why `A-A` is not automatically zero

Range arithmetic treats operands as independent choices:

```{.rix exec=true}
.Plugin.Load("numerics");
.Plugin.Load("calculus");

a := (1:2) ~!: :RangeSet;
independent := a-a;
graphX := .calculus.Variable(:x);
dependent := .numerics.GraphRange(graphX-graphX,{= x=1:2 });

{: independent, dependent[:range] };
```

The first result is `[-1,1]`: it includes `1-2` and `2-1`. The callback uses
one repeated graph input occurrence, so the graph checker proves the exact
`{0}` result without subdivision. See
[Certified ranges of Calculus expression graphs](calculus-range-tutorial.md)
for subdivision and domain-sensitive cancellation.

## Operators, named primitives, and methods

These three styles share the same metadata contract:

```{.rix exec=true}
a := (1:2) ~!: :RangeSet;
b := (3:4) ~!: :RangeSet;

operatorForm := a+b;
namedForm := .RangeAdd(a, b);
methodForm := a.Add(b);

{:
  operatorForm,
  namedForm,
  methodForm,
  .RangeEvidence(namedForm)[:schema]
};
```

Named primitives are useful to providers and tools; operators are the usual
interactive spelling. `RangeEvidence(value)` and `value.RangeEvidence()` are
equivalent inspection paths.

For transcendental endpoints, continue with
[Certified ranges from uncertain measurements](interval-ranges-tutorial.md).
For the proof vocabulary and general-function architecture, see
[Certified ranges for general functions](range-certification.md).
