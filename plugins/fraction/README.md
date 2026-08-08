# Fraction plugin

`.fraction`, with aliases `.frac` and `.f`, exposes the unreduced
`@ratmath/core` `Fraction` type as a complete RiX numeric workspace. A Fraction
is an integer numerator/denominator pair: `1/2` and `2/4` can be mathematically
equivalent without being the same Fraction.

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

See [tutorial.md](tutorial.md).
