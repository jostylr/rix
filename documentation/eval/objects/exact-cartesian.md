# Exact Cartesian methods

Exact generator and exact expression values arise from named exact generators such as `~{i}` and expressions built from them. Both runtime object types share these methods.

## Method reference

| Full syntax | Result | Meaning |
|---|---|---|
| `value.Conjugate()` | exact value | Conjugate an exact Cartesian complex expression. |
| `value.Re()` | exact value | Return the real component. |
| `value.Im()` | exact value | Return the imaginary component. |
| `value.NormSquared()` | exact value | Return `Re(value)^2 + Im(value)^2`. |
| `value.Cayley()` | `Cayley` | Convert Cartesian form to exact Cayley magnitude/direction coordinates. |
| `value.CheckTraits()` | `1 \| null` | Validate attached semantic traits. |

## Checked examples

```{.rix exec=true id=exact-cartesian-methods}
z := 3 + 4~{i};
z.Conjugate() ##@ == 3 - 4~{i};
z.Re() ##@ == 3;
z.Im() ##@ == 4;
z.NormSquared() ##@ == 25;
z.Cayley().Cartesian() ##@ == z;
z.CheckTraits() ##@ == 1;
```

These operations are exact. No floating approximation is selected when converting between Cartesian and Cayley forms.

[Back to the methods overview](../methods-guide.md)
