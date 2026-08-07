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
