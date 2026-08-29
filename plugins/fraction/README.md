# Fraction plugin

`.fraction`, with aliases `.frac` and `.f`, exposes the unreduced
`@ratmath/core` `Fraction` and `FractionInterval` types as a complete RiX exact
workspace. A Fraction is an integer numerator/denominator pair: `1/2` and `2/4`
can be mathematically equivalent without being the same Fraction.

The plugin algorithms and receiver/operator registrations are pure RiX. Two
narrow core bridges construct a `Fraction` and expose its stored pair; the old
host installer remains only in `fraction.reference.js` for comparison.

```rix
.Plugin.Load("fraction");
a := .frac(6,8);
b := .f`3/4`;
c := `6/8`;                 ## structural arithmetic already preserves the pair
{: a, b, c, a.Rational() };
```

Ordinary RiX `6/8` is evaluated before a receiver method and is therefore the
reduced Rational `3/4`. Consequently `(6/8).F()` is `Fraction(3,4)`, while
``(`6/8`).F()`` remains `Fraction(6,8)`. Use `.frac(6,8)`, ``.f`6/8` ``, or the
existing structural backticks when the written components matter.

## Arithmetic and equality

The plugin installs Fraction-dominant variants for `+`, `-`, `*`, `/`, integral
`^`, unary `-`, comparisons, and exact equality. Results are never reduced.
General addition uses cross-products, so `` `1/2` + `2/4` `` is `8/8`.

`==` and `SamePair` compare the represented components. `Equivalent` and order
comparisons compare mathematical values. `Rational()` is the explicit
canonical boundary.

## Classroom and mediant operations

- `AddLikeDenominator` requires equal denominators and retains that denominator.
- `AddLCMDenominator` rewrites both inputs over their least common denominator.
- `Mediant` adds represented numerators and denominators, so the unreduced pair
  intentionally affects the result.
- `Scale`, `Reduce`, `FareyParents`, and `SternBrocotPath` expose the existing
  core representation-sensitive algorithms.

`Record()` reports schema `rix.fraction@1`. Loading `.fracfun` or `.symbolic`
loads this plugin automatically.

## Fraction intervals

`Interval(a,b)` constructs the core representation-sensitive
`FractionInterval`. Its endpoints are ordered by value without reducing their
stored numerator/denominator pairs.

```rix
.Plugin.Load("fraction");
interval := .fraction.Interval(.frac(6,8), .frac(1,2));
{:
    interval.Low(),
    interval.High(),
    interval.Mediant(),
    interval.MediantSplit(),
    interval.PartitionWithMediants(2),
    interval.RationalInterval()
};
```

`MediantSplit()` returns two `FractionInterval` values.
`PartitionWithMediants(depth)` repeats the split with an explicit depth bound of
20. `RationalInterval()` is the deliberate boundary where endpoint
representations are reduced. `Record()` uses schema
`rix.fraction-interval@1`.

## Signed infinity boundaries

`Infinity(sign)` constructs a normalized `-1/0` or `1/0`. These values are
extended boundaries for Stern–Brocot and FractionInterval exploration, not
ordinary Rational values. They print explicitly, and an interval containing
one cannot convert to RationalInterval.

```rix
.Plugin.Load("fraction");
whole := .fraction.Interval(.fraction.Infinity(-1), .fraction.Infinity());
{: whole.Mediant(), whole.MediantSplit() };
```

The exceptional mediant of `[-1/0,1/0]` is the signed-tree root `0/1`. A zero
sign and the indeterminate pair `0/0` are always rejected.

## Continued fractions and bounded Farey search

`value.ContinuedFraction()` (or `.fraction.ContinuedFraction(value)`) returns
a finite `rix.fraction.continued-fraction@1` adapter. It retains the written
numerator and denominator alongside the reduced exact value and Euclidean
coefficients. `.fraction.FromContinuedFraction(source)` accepts that adapter or
a finite `rix.continued-fraction.finite@1` value without importing the
continued-fraction plugin. Its exact result record includes the reconstructed
Fraction, source, recurrence evidence, and component provenance.
When `.continuedFraction` is loaded, its callable constructor accepts the
adapter directly and retains that provenance as transformation evidence.

`FareySearch(value,{= maxSteps=...,maxDenominator=... })` walks the signed
Stern–Brocot/Farey tree deterministically. It returns `:found`,
`:budgetExhausted`, or `:denominatorLimit`, plus the best reached Fraction,
path, exact bounds, every attempted mediant, and the target's original written
pair. A bounded miss is ordinary inspectable output rather than an exception.

See [tutorial.md](tutorial.md).
