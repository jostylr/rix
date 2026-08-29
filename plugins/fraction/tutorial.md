---
title: Explore unreduced fractions
description: Preserve written numerator-denominator pairs, compare representations, and use classroom and mediant operations.
theme: Algebra and analysis
status: implemented
plugin: fraction
---

Load `.fraction` directly or through `.fracfun`/`.symbolic`. Its `.frac` and
`.f` aliases refer to the same plugin.

```rix
.Plugin.Load("fraction");
a := .frac(6,8);
b := .f`6/8`;
c := `6/8`;
{: a, b, c, a.Numerator(), a.Denominator() };
```

## Rational values versus written pairs

Ordinary `/` constructs a reduced Rational before `.F()` can run. Structural
backticks or the two-component constructor preserve the pair.

```rix
.Plugin.Load("fraction");
canonicalPair := (6/8).F();
writtenPair := (`6/8`).F();
{: canonicalPair, writtenPair, canonicalPair.Rational(), writtenPair.Rational() };
```

## Unreduced arithmetic

Usual arithmetic uses the represented components and does no cancellation.

```rix
.Plugin.Load("fraction");
a := `1/2`;
b := `1/3`;
c := `2/4`;
d := `3/6`;
{: a+b, a-b, c*d, c/d, c^2, -c };
```

## Classroom denominator policies

General `+` uses cross-products. Two explicit methods model the common
classroom steps of retaining like denominators or first finding the LCM.

```rix
.Plugin.Load("fraction");
a := `1/4`;
b := `2/4`;
c := `1/6`;
{: a+b, a.AddLikeDenominator(b), a+c, a.AddLCMDenominator(c) };
```

## Representation-sensitive mediants

Pair equality and mathematical equivalence answer different questions, and a
mediant deliberately uses the represented components.

```rix
.Plugin.Load("fraction");
written := `6/8`;
canonical := (6/8).F();
other := `1/2`;
{: written == canonical, written.Equivalent(canonical),
   written.Mediant(other), canonical.Mediant(other) };
```

## Subdivide a fraction interval

Fraction intervals keep the written endpoint pairs. Their mediants therefore
make each classroom subdivision step inspectable.

```rix
.Plugin.Load("fraction");
interval := .fraction.Interval(.frac(1,3), .frac(2,3));
{=
    interval=interval,
    mediant=interval.Mediant(),
    split=interval.MediantSplit(),
    depthTwo=interval.PartitionWithMediants(2),
    canonical=interval.RationalInterval()
};
```

The four depth-two intervals retain unreduced mediants such as `4/6` where the
represented construction step matters.

## Use infinity only as an explicit boundary

The signed Stern–Brocot tree uses `-1/0` and `1/0` as boundary markers. They do
not silently become ordinary numbers.

```rix
.Plugin.Load("fraction");
whole := .fraction.Interval(
    .fraction.Infinity(-1),
    .fraction.Infinity(1)
);
{= root=whole.Mediant(), halves=whole.MediantSplit() };
```

Calling `whole.RationalInterval()` is intentionally an error because core
RationalInterval has only finite Rational endpoints. `0/0` is never admitted.

## Round-trip through a finite continued fraction

The adapter keeps the original written pair even though continued-fraction
coefficients describe its reduced value:

```rix
.Plugin.Load("fraction");
written := .frac(42,56);
adapter := written.ContinuedFraction();
restored := .fraction.FromContinuedFraction(adapter);
{: adapter[:coefficients],adapter[:componentProvenance],restored[:fraction] };
```

It also consumes the finite protocol owned by `.continuedFraction`:

```rix
.Plugin.Load("continued-fraction");
external := .continuedFraction.FromRational(7/11);
.fraction.FromContinuedFraction(external);
```

The other direction is direct as well:

```rix
asContinuedFraction := .continuedFraction(adapter);
{: asContinuedFraction.Value(),asContinuedFraction.Record()[:evidence] };
```

## Bound a Farey search

```rix
found := .fraction.FareySearch(.frac(42,56),
  {= maxSteps=20,maxDenominator=20 });
partial := .fraction.FareySearch(.frac(355,113),
  {= maxSteps=3,maxDenominator=1000 });
{: found[:status],found[:path],found[:componentProvenance],
   partial[:status],partial[:result],partial[:bounds] };
```

The partial result remains usable and its trace records every represented
mediant considered before the explicit work limit.
