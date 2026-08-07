# Cayley methods

`Cayley` stores an exact complex value as magnitude and a rational direction coordinate. It is useful for multiplication, division, and integer powers.

## Method reference

| Full syntax | Result | Meaning |
|---|---|---|
| `cayley.Cartesian()` | exact Cartesian value | Convert back to Cartesian form. |
| `cayley.Cayley()` | `Cayley` | Return the receiver unchanged. |
| `cayley.Conjugate()` | `Cayley` | Conjugate by negating the direction. |
| `cayley.Re()` | exact value | Return the real component. |
| `cayley.Im()` | exact value | Return the imaginary component. |
| `cayley.NormSquared()` | exact value | Return the square of the magnitude. |
| `cayley.Magnitude()` | exact value | Return the magnitude coordinate. |
| `cayley.Direction()` | exact value | Return the direction coordinate; a negative real may use `Infinity`. |
| `cayley.Inverse()` | `Cayley` | Return the exact multiplicative inverse. |
| `cayley.CheckTraits()` | `1 \| null` | Validate attached semantic traits. |

## Checked examples

```{.rix exec=true id=cayley-methods}
c := .Complex.Cayley(3 + 4~{i});
c.Cartesian() ##@ == 3 + 4~{i};
c.Cayley() ##@ == c;
c.Conjugate().Cartesian() ##@ == 3 - 4~{i};
c.Re() ##@ == c.Cartesian().Re();
c.Im() ##@ == c.Cartesian().Im();
c.NormSquared().CheckTraits() ##@ == 1;
c.Magnitude() ##@ == 5;
c.Direction() ##@ == 1/2;
c.Inverse().Magnitude() ##@ == 1/5;
c.CheckTraits() ##@ == 1;
```

Direction is an exact rational parametrization rather than an angle measured by a floating-point transcendental function.

[Back to the methods overview](../methods-guide.md)
