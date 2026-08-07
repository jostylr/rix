# RationalInterval methods

`RationalInterval` stores exact rational endpoints. Bounds are available both in source order (`Start`, `End`) and sorted order (`Low`, `High`).

## Method reference

| Full syntax | Result | Meaning |
|---|---|---|
| `interval.Start()` | `Rational` | Return the first stored endpoint. |
| `interval.End()` | `Rational` | Return the second stored endpoint. |
| `interval.Low()` | `Rational` | Return the lesser bound. |
| `interval.High()` | `Rational` | Return the greater bound. |
| `interval.Width()` | `Rational` | Return `High() - Low()`. |
| `interval.IsAscending()` | `1 \| null` | Test whether source order is ascending. |
| `interval.Midpoint()` | `Rational` | Return the arithmetic midpoint. |
| `interval.Mediant()` | `Rational` | Return the endpoint mediant. |
| `interval.Negate()` | `RationalInterval` | Negate the interval. |
| `interval.Reciprocal()` | `RationalInterval` | Return the reciprocal interval; zero-containing intervals are invalid. |
| `interval.Overlaps(other)` | `1 \| null` | Test whether two intervals overlap. |
| `interval.Contains(other)` | `1 \| null` | Test whether the whole other interval is contained. |
| `interval.ContainsValue(value)` | `1 \| null` | Test exact rational membership. |
| `interval.ContainsZero()` | `1 \| null` | Test whether zero lies in the interval. |
| `interval.Intersection(other)` | `RationalInterval \| null` | Return the shared interval. |
| `interval.Union(other)` | `RationalInterval` | Return the covering interval. |
| `interval.ShortestDecimal(base?)` | `Rational \| null` | Find the contained rational with the smallest power-of-base denominator. |
| `interval.DenominatorInterval(denominator?, onEmpty?)` | `RationalInterval \| null` | Restrict to a fixed denominator grid. `onEmpty` is `error`, `null`, or `mid`. |
| `interval.Random(parameters?)` | `Rational \| Array` | Sample exact points using the current `.RNG`; parameters are `{: count, denominator?, tolerance? }`. |
| `interval.RandomPartition(parameters?)` | `Array` | Split at distinct random exact points using the same parameter tuple. |
| `interval.E(exponent)` | `RationalInterval` | Multiply both bounds exactly by `10^exponent`. |
| `interval.BitLength()` | `Integer` | Return the combined exact storage bit length. |
| `interval.ToMixedString()` | `String` | Format both endpoints as mixed numbers. |
| `interval.ToString()` | `String` | Return the exact interval spelling. |
| `interval.CheckTraits()` | `1 \| null` | Validate attached semantic traits. |

## Bounds and interval operations

```{.rix exec=true id=rational-interval-operations}
i := 1/4:3/4;
j := 1/2:1;
i.Start() ##@ == 1/4;
i.End() ##@ == 3/4;
i.Low() ##@ == 1/4;
i.High() ##@ == 3/4;
i.Width() ##@ == 1/2;
i.IsAscending() ##@ == 1;
i.Midpoint() ##@ == 1/2;
i.Mediant() ##@ == 1/2;
i.Negate() ##@ == (-3/4):(-1/4);
(1:2).Reciprocal() ##@ == 1/2:1;
i.Overlaps(j) ##@ == 1;
(0:1).Contains(i) ##@ == 1;
i.ContainsValue(1/2) ##@ == 1;
(-1:2).ContainsZero() ##@ == 1;
i.Intersection(j) ##@ == 1/2:3/4;
i.Union(j) ##@ == 1/4:1;
```

## Grids, random sampling, and formatting

```{.rix exec=true id=rational-interval-grids-random}
i := 1/10:4/10;
i.ShortestDecimal() ##@ == 1/10;
i.ShortestDecimal(2) ##@ == 1/4;
i.DenominatorInterval(10) ##@ == 1/10:2/5;
(1/3:2/3).DenominatorInterval(2) ##@ == 1/2:1/2;
.RNG(:default, {= seed=456 });
point := (0:1).Random({: 1, 1000 });
(0:1).ContainsValue(point) ##@ == 1;
parts := (0:1).RandomPartition({: 4, 1000 });
parts.Len() ##@ == 4;
(1/4:3/4).E(2) ##@ == 25:75;
i.BitLength() ##@ > 0;
(7/3:8/3).ToMixedString().Len() ##@ > 0;
i.ToString() ##@ == "1/10:2/5";
i.CheckTraits() ##@ == 1;
```

Seeding `.RNG` makes examples and simulations repeatable. Without an explicit seed, the host's configured random source is used.

[Back to the methods overview](../methods-guide.md)
