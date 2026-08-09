# Rational methods

`Rational` represents a reduced exact fraction. An Integer receiver uses the Integer surface; write a fraction such as `7/1` or convert to `:Rational` when Rational-only methods are required.

## Method reference

| Full syntax | Result | Meaning |
|---|---|---|
| `rational.Numerator()` | `Integer` | Return the reduced numerator. |
| `rational.Denominator()` | `Integer` | Return the positive reduced denominator. |
| `rational.Negate()` | `Rational` | Return the additive inverse. |
| `rational.Reciprocal()` | `Rational` | Exchange numerator and denominator. |
| `rational.Abs()` | `Rational` | Return the non-negative magnitude. |
| `rational.Floor()` | `Integer` | Round toward negative infinity. |
| `rational.Ceil()` | `Integer` | Round toward positive infinity. |
| `rational.Trunc()` | `Integer` | Round toward zero. |
| `rational.Round(mode?)` | `Integer` | Round with `half-even` by default; modes are `half-even`, `half-up`, `toward-zero`, `floor`, and `ceil`. |
| `rational.RoundTo(places, mode?)` | `Rational` | Round to an exact number of decimal places. Negative places round left of the decimal point. |
| `rational.E(exponent)` | `Rational` | Multiply exactly by `10^exponent`. |
| `rational.ToMixedString()` | `String` | Format as a mixed number. |
| `rational.ToDecimal()` | `String` | Format an exact terminating or repeating decimal representation. |
| `rational.ToDecimalApproximation(places)` | exact or `CertifiedApproximation` | Return an exact terminating result when possible, otherwise a parseable certified decimal prefix. |
| `rational.ToContinuedFraction(maxTerms?)` | `Array` | Return continued-fraction terms. |
| `rational.ToContinuedFractionString()` | `String` | Format the continued fraction. |
| `rational.ToContinuedFractionApproximation(maxTerms)` | exact or `CertifiedApproximation` | Return an exact finite continued fraction when complete, otherwise its certified cylinder. |
| `rational.Convergents(maxCount?)` | `Array` | Return successive continued-fraction convergents. |
| `rational.Convergent(index)` | `Rational` | Return a one-based convergent. |
| `rational.ApproximationError(other)` | `Rational` | Return the absolute error from another exact rational. |
| `rational.BestApproximation(maxDenominator)` | `Rational` | Find the closest rational with a bounded denominator. |
| `rational.BestConvergent(maxDenominator)` | `Rational` | Find the best continued-fraction convergent under the bound. |
| `rational.BitLength()` | `Integer` | Return the combined exact storage bit length. |
| `rational.ToString()` | `String` | Return the reduced fraction spelling. |
| `rational.CheckTraits()` | `1 \| null` | Validate attached semantic traits. |

## Structure, signs, and rounding

```{.rix exec=true id=rational-structure-rounding}
q := -7/3;
q.Numerator() ##@ == -7;
q.Denominator() ##@ == 3;
q.Negate() ##@ == 7/3;
q.Reciprocal() ##@ == -3/7;
q.Abs() ##@ == 7/3;
q.Floor() ##@ == -3;
q.Ceil() ##@ == -2;
q.Trunc() ##@ == -2;
(7/2).Round() ##@ == 4;
(5/2).Round("half-even") ##@ == 2;
(1/3).RoundTo(2) ##@ == 33/100;
(123/10).RoundTo(-1).Numerator() ##@ == 10;
(3/4).E(2).Numerator() ##@ == 75;
```

Colon strings such as `:half-even` are ordinary RiX strings, so quoted spellings also work.

## Formatting and continued fractions

```{.rix exec=true id=rational-format-continued-fractions}
q := 355/113;
(7/3).ToMixedString() ##@ == "2..1/3";
(1/8).ToDecimal() ##@ == "0.125";
cf := q.ToContinuedFraction();
cf.Len() ##@ == 3;
cf.Get(3) ##@ == 16;
q.ToContinuedFraction(2).Len() ##@ == 2;
q.ToContinuedFractionString().Len() ##@ > 0;
q.Convergents().Len() ##@ == 3;
q.Convergents(2).Len() ##@ == 2;
q.Convergent(2) ##@ == 22/7;
q.ApproximationError(22/7) ##@ == 1/791;
q.BestApproximation(100) ##@ == 311/99;
q.BestConvergent(100) ##@ == 22/7;
q.BitLength() ##@ > 0;
q.ToString() ##@ == "355/113";
q.CheckTraits() ##@ == 1;
(1/7).ToDecimalApproximation(5).ToString() ##@ == "0.14285?";
(103993/33102).ToContinuedFractionApproximation(3).ToString() ##@ == "3.~7~15?";
```

`BestApproximation` searches all denominators under the bound; `BestConvergent` restricts the result to continued-fraction convergents, so the answers can differ.

[Back to the methods overview](../methods-guide.md)
