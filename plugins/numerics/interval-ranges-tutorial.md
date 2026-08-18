---
title: Certified ranges from uncertain measurements
description: Propagate exact rational measurement intervals through elementary, hyperbolic, and statistical functions without losing certification.
theme: Numbers and numerics
status: implemented
---

An uncertain measurement such as `100 +/- 1` denotes a set of possible real
inputs.  In RiX, write that set as an exact `RationalInterval` and ask Numerics
for an enclosure of every corresponding output.

## Your first certified range

```{.rix exec=true}
.Plugin.Load("numerics");

measurement := 99/100:101/100;
image := .numerics.Sin(measurement);
answer := image.Range({=
  endpointTolerance=1/1000000,
  maxWork=240,
  maxSubintervals=8
});

{:
  answer[:status],
  answer[:interval],
  answer[:certified],
  answer[:domainStatus]
};
```

`.numerics.Sin(measurement)` is an immutable set-valued interval image.  It is
not a claim that the input is one hidden real.  `.Range(...)` computes the
outer rational enclosure.  The equivalent namespace spelling is
`.numerics.Range(image, options)`.

The certificate says

```text
for every x in 99/100:101/100, sin(x) is in answer[:interval].
```

## Measurement width and numerical tolerance are different

The physical input uncertainty should normally remain visible in the output.
`endpointTolerance` controls only how accurately RiX computes the two outer
range boundaries.

```{.rix exec=true}
.Plugin.Load("numerics");

coarse := .numerics.Range(.numerics.Exp(99/100:101/100), {=
  endpointTolerance=1/1000,
  maxWork=80
});
fine := .numerics.Range(.numerics.Exp(99/100:101/100), {=
  endpointTolerance=1/1000000,
  maxWork=240
});

{=
  sameInputWidth = coarse[:input].Width() == fine[:input].Width(),
  coarseBoundaryError = coarse[:achievedEndpointTolerance],
  fineBoundaryError = fine[:achievedEndpointTolerance],
  coarseRange = coarse[:interval],
  fineRange = fine[:interval]
};
```

The fine request should improve boundary uncertainty; it should not pretend
that the original measurement became more precise.

## A pendulum measured with a ruler

For the small-angle model `T=2*pi*sqrt(L/g)`, suppose length is known only to
`99/100:101/100` metres and use exact `g=981/100`.  Enclose the root and pi
separately, then combine their certified rational intervals with ordinary
interval arithmetic:

```{.rix exec=true}
.Plugin.Load("numerics");

length := 99/100:101/100;
gravity := 981/100;

root := .numerics.Range(.numerics.Sqrt(length/gravity), {=
  endpointTolerance=1/1000000,
  maxWork=120
});
pi := .numerics.Refine(.numerics.Pi(), {=
  absoluteWidth=1/1000000,
  maxWork=120
});

period := 2*pi[:interval]*root[:interval];
{= length=length, certifiedPeriodSeconds=period };
```

Every endpoint remains an exact Rational.  No binary64 rounding is part of the
certificate.

## Subdivision and dependency

Ordinary interval arithmetic forgets that two occurrences of `x` are the same
quantity.  On `1:2`, direct evaluation of `x-x` gives `-1:1`.  Bounded
subdivision restores some correlation:

```{.rix exec=true}
.Plugin.Load("numerics");

coarse := .numerics.Range((x)->x-x, 1:2, {=
  maxSubintervals=1,
  maxWork=20
});
split := .numerics.Range((x)->x-x, 1:2, {=
  maxSubintervals=16,
  maxWork=160
});

{: coarse[:interval], split[:interval] };
```

The exact answer is zero.  More pieces contract the overestimate while each
piece and the final hull remain certified.

A general callback can directly return a supported Numerics interval image:

```{.rix exec=true}
.Plugin.Load("numerics");

wave := .numerics.Range(
  (x)->.numerics.Sin(x),
  1:2,
  {= endpointTolerance=1/100000, maxSubintervals=8, maxWork=320 }
);
wave[:interval];
```

## Extrema and poles are proof questions

For trigonometric functions, Numerics encloses pi and uses those bounds to
prove landmarks.  Because `1:2` contains `pi/2`, the sine range has exact upper
endpoint `1`:

```{.rix exec=true}
.Plugin.Load("numerics");

sine := .numerics.Range(.numerics.Sin(1:2), {=
  endpointTolerance=1/10000,
  maxWork=120,
  maxSubintervals=4
});
{= range=sine[:interval], landmarks=sine[:evidence][:landmarks] };
```

A reciprocal trigonometric range has three honest outcomes:

```{.rix exec=true}
.Plugin.Load("numerics");

safe := .numerics.Range(.numerics.Tan(0:1), {= maxWork=80 });
provedPole := .numerics.Range(.numerics.Tan(1:2), {= maxWork=80 });
unresolved := .numerics.Range(
  .numerics.Tan(15707/10000:15708/10000),
  {= endpointTolerance=1/100, maxWork=20, maxSubintervals=2 }
);

{:
  {= status=safe[:status], range=safe[:interval] },
  {= status=provedPole[:status], diagnostics=provedPole[:diagnostics] },
  {= status=unresolved[:status], diagnostics=unresolved[:diagnostics] }
};
```

The second result proves `:poleInInput` and reports `:domainViolation`.  The
third has too little landmark precision to prove or exclude the pole, so it
reports `:unknown` with `:poleNotExcluded`.  Increasing work may resolve it.

## Strict real domains

If even one possible input is outside the supported real domain, the whole
closed-input request reports a domain violation:

```{.rix exec=true}
.Plugin.Load("numerics");

{:
  .numerics.Range(.numerics.Log((-1):2)),
  .numerics.Range(.numerics.Sqrt((-1):2)),
  .numerics.Range(.numerics.Asin(0:2)),
  .numerics.Range(.numerics.Acosh(1/2:2)),
  .numerics.Range(.numerics.Atanh((-1):1))
};
```

RiX does not silently discard invalid inputs or select a complex branch.

## Hyperbolic and statistical examples

Monotonicity and symmetry give tight ranges without blind sampling:

```{.rix exec=true}
.Plugin.Load("numerics");

temperature := (-1):1;
probabilityBand := .numerics.Range(.numerics.NormalCDF(temperature), {=
  endpointTolerance=1/10000,
  maxWork=500
});
densityBand := .numerics.Range(.numerics.NormalPDF(temperature), {=
  endpointTolerance=1/10000,
  maxWork=500
});
coshBand := .numerics.Range(.numerics.Cosh(temperature), {=
  endpointTolerance=1/10000,
  maxWork=300
});

{=
  normalProbability=probabilityBand[:interval],
  normalDensity=densityBand[:interval],
  hyperbolicCosine=coshBand[:interval]
};
```

`Cosh` and normal PDF are even, so an interval crossing zero includes their
known extremum at zero.  `Sinh`, `Tanh`, `Asinh`, `Acosh`, `Atanh`, `Erf`,
`Erfc`, and normal CDF use certified endpoint monotonicity.  `Csch` and `Coth`
report a domain violation when the input contains zero.

## Reading a range result

The result schema is `rix.numerics.range-enclosure@1`.  The most useful fields
are:

| Field | Meaning |
| --- | --- |
| `status` | `:enclosed`, `:budgetExhausted`, `:unknown`, or `:domainViolation` |
| `range` | Outer `RationalIntervalSet`, or null when unresolved |
| `interval` | Compatibility projection for one closed connected bounded range; otherwise null |
| `certified` | `1` only when the interval has a containment proof |
| `domainStatus` | Whether the function is defined over the whole input |
| `requestedEndpointTolerance` | Requested numerical boundary tolerance |
| `achievedEndpointTolerance` | Boundary tolerance actually achieved |
| `rangeWidth` | Total output range width, including measurement uncertainty |
| `work` | Calls/iterations and request limits |
| `evidence` | Algorithm and mathematical property used for containment |

`:budgetExhausted` may still have `certified=1`: the current interval remains
safe, but the requested endpoint tolerance was not reached.

## Choosing work and subdivision

- Start with `maxSubintervals=8` and increase it when repeated variables make
  a generic interval expression too wide.
- Increase `maxWork` when endpoint algorithms or pole/critical-point proofs do
  not reach the requested tolerance.
- Tighten `endpointTolerance` only when uncertainty in the computed range
  boundary matters.  It cannot remove physical input uncertainty.
- Inspect `status`, `domainStatus`, and `diagnostics` before consuming
  `interval`.
- Prefer a specialized range provider when a function has known monotonicity,
  critical points, singularities, or derivative bounds.

For the certification strategies useful to arbitrary user functions, see
[range-certification.md](range-certification.md).  For the current coverage and
remaining representation work, see
[interval-ranges-checklist.md](interval-ranges-checklist.md).

## Disconnected range-set foundation

The runtime now has an exact `RationalIntervalSet` value for results that one
closed interval cannot represent. A closed interval converts to a range set;
unions, intersections, containment, and hulls remain exact:

```{.rix exec=true}
left := ((-3):(-1)) ~: :RangeSet;
right := (1:3) ~: :RangeSet;
outside := left.Union(right);
window := ((-2):2) ~: :RangeSet;

{:
  outside.ToString(),
  outside.Intersection(window).ToString(),
  outside.ContainsValue(0),
  outside.ContainsValue(2),
  outside.Hull().ToString()
};
```

This is the representation layer, not yet a claim that every Numerics range
provider returns disconnected or unbounded results. Provider migration and
proof validation are tracked in
[general-range-development-checklist.md](general-range-development-checklist.md).

### Union, hull, containment, and components

The language operators distinguish a real set union from its hull:

```{.rix exec=true}
left := 1:2;
right := 4:5;
pieces := left \/ right;

{=
  union=pieces,
  hull=left |\/| right,
  twoComponents=pieces.Split().Len() == 2,
  scalarContained=(3/2 ? pieces),
  wholeRangeContained=((1:2) ? pieces),
  overlaps=((1:3) ?/\ (3:4)),
  disjoint=((1:2) !/\ (3:4))
};
```

`\/` and `/\` return exact normalized range sets for interval operands.
`|\/|` is the explicit hull. `x ? range` checks a point; `subrange ? range`
checks that every point of the left range is contained. `?/\` (also spelled
`?&`) tests overlap and `!/\` tests disjointness. Calling `.Split()` with no
argument returns the connected components.

## Scoped knowledge for a general function

The first general-provider surface can attach local direct range knowledge to
a callable. It is useful for orchestration and for developing provider
contracts, but it is deliberately **not** a certification authority:

```{.rix exec=true}
.Plugin.Load("numerics");

Identity = (x)->x;
IdentityHint = (input, request)->{=
  valueKind=:rangeProviderResult,
  schema="rix.numerics.range-provider-result@1",
  functionId=:identityTutorial,
  input=input,
  status=:approximate,
  range=input ~!: :RangeSet,
  certified=_,
  domainStatus=:allDefined,
  goalMet=_,
  achievedEndpointTolerance=0,
  evidenceLevel=:heuristic,
  work={= calls=0, iterations=0 },
  evidence={= kind=:tutorialAssertion }
};

HintedIdentity := .numerics.WithRangeKnowledge(Identity, {=
  functionId=:identityTutorial,
  directRange=IdentityHint,
  provenance={= provider=:measurementTutorial }
});

candidate := .numerics.Range(HintedIdentity, 99/100:101/100);
checked := .numerics.CheckRangeResult(
  IdentityHint((99/100:101/100) ~!: :RangeSet, {= }),
  HintedIdentity,
  99/100:101/100
);

{: candidate[:range], candidate[:certified], checked[:valid], checked[:certifying] };
```

The result is structurally valid but remains heuristic: `certified` and
`checked[:certifying]` are null. Even if `IdentityHint` writes
`certified=1` or declares itself trusted, validation rejects the claim with
`:untrustedCertificationClaim`.

## A trusted direct provider

A plugin or explicitly trusted session can cross the host registration
boundary. Here the provider's invariant is especially easy to audit: the
identity function maps every input set to itself. The direct provider is a RiX
multifunction; additional guarded variants could support later input forms.

```{.rix exec=true}
.Plugin.Load("numerics");

TrustedIdentityRange = {>
  (input, request) ?- [input ? :RationalIntervalSet] /RangeSet/ -> {=
    valueKind=:rangeProviderResult,
    schema="rix.numerics.range-provider-result@1",
    functionId=:trustedIdentityTutorial,
    input=input,
    status=:enclosed,
    range=input,
    certified=1,
    domainStatus=:allDefined,
    goalMet=1,
    achievedEndpointTolerance=0,
    evidenceLevel=:trustedCapability,
    work={= calls=1, iterations=0 },
    evidence={= kind=:identityRangeInvariant }
  },
  (input, request) /Unsupported/ ->
    .Error("TrustedIdentityRange needs a RationalIntervalSet")
};

TrustedIdentity = (x)->x;
.numerics.RegisterRangeProvider(TrustedIdentity, {=
  functionId=:trustedIdentityTutorial,
  directRange=TrustedIdentityRange,
  provenance={=
    provider=:measurementTutorial,
    invariant=:identityMapsEverySetToItself
  }
});

possibleInputs := (99/100:101/100) \/ (2:201/100);
answer := .numerics.Range(TrustedIdentity, possibleInputs);

{: answer[:range], answer[:certified], answer[:evidenceLevel] };
```

This yields the same disconnected set with `certified=1`. The certification
chain ends in a trusted-provider invariant, so whoever grants registration
authority is responsible for reviewing that invariant. Inside an imported
script, registration requires the explicit `Plugins` permission. A copied
`trust=:trustedCapability` field is not a seal, and a descriptor registered for
one callable cannot be reused with another.

The other future certifying path is a theorem witness accepted by the small
independent checker; that path does not require trusting an arbitrary callback.
