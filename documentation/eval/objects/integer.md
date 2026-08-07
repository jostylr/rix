# Integer methods

`Integer` is RiX's exact whole-number object. Integer methods never mutate the receiver.

## Method reference

| Full syntax | Result | Meaning |
|---|---|---|
| `integer.Negate()` | `Integer` | Return the additive inverse. |
| `integer.Abs()` | `Integer` | Return the non-negative magnitude. |
| `integer.E(exponent)` | `Integer \| Rational` | Multiply by exactly `10^exponent`; a negative exponent may produce a Rational. |
| `integer.BitLength()` | `Integer` | Return the number of binary digits needed for the magnitude. |
| `integer.ToString()` | `String` | Return the exact base-10 spelling. |
| `integer.CheckTraits()` | `1 \| null` | Check attached semantic traits, warning and returning `null` on a failed check. |

## Checked examples

The `##@` comments are executable RiX checks run by the documentation build.

```{.rix exec=true id=integer-methods}
(-12).Negate() ##@ == 12
(-12).Abs() ##@ == 12
125.E(2) ##@ == 12500
45.E(-1) ##@ == 9/2
13.BitLength() ##@ == 4
(-120).ToString() ##@ == "-120"
7.CheckTraits() ##@ == 1
```

`E` is exact scientific scaling, not floating-point conversion. For example, `45.E(-1)` remains the exact Rational `9/2`.

[Back to the methods overview](../methods-guide.md)
