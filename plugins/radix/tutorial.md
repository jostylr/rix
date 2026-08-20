---
title: Inspect an exact repeating expansion
description: Compute bounded positional digits and a rational's exact repeating period.
theme: Numbers and numerics
status: implemented
---

Load the plugin and inspect the familiar repeating decimal for one seventh:

```rix
.Plugin.Load("radix");
expansion := (1/7).Expansion(10, {= maxDigits=20 });
{:
    expansion.Get("nonRepeatingDigits"),
    expansion.Get("repeatingDigits"),
    (1/7).PeriodLength(10),
    (1/7).RadixString(10)
};
```

The same operation remains safe for a denominator with a large period. A
small budget returns an explicit partial result:

```rix
.Plugin.Load("radix");
(1/982451653).Expansion(10, {= maxDigits=40 });
```

Formatting can use any collision-free single-glyph alphabet. This base-62
policy keeps exact digit generation separate from its display glyphs:

```rix
.Plugin.Load("radix");
alphabet := "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
{:
    61.RadixString(62, {= alphabet=alphabet }),
    (1/3).RadixString(62, {= alphabet=alphabet })
};
```

Grouping works from the radix point outward. The shorthand `groupSize` applies
to both sides; either side can be overridden independently:

```rix
.Plugin.Load("radix");
{:
    1234567.RadixString(10, {= groupSize=3 }),
    (1/7).RadixString(10, {=
        fractionGroupSize=2,
        groupSeparator=" "
    })
};
```

Both bounded analyses expose portable work diagnostics:

```rix
.Plugin.Load("radix");
bounded := (1/97).PeriodInfo(10, {= maxWork=3 });
{:
    bounded[:status],
    bounded[:work],
    bounded[:diagnostics]
};
```
