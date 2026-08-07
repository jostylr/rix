---
title: Optional Float math
description: Load IEEE-754 approximate math without making it a core RiX numeric type.
theme: Numbers and numerics
status: implemented
---

Load `float` only when a calculation intentionally needs IEEE-754 behavior:

```rix
.Plugin.Load("float");
viaNamespace := .float.Float(1 / 3);
viaMethod := (1 / 3).Float();
{: viaNamespace, viaMethod, .float.Sin(viaMethod) };
```

`value.Float()` is the receiver-first spelling of the same explicit
conversion. The method appears on integers and rationals only while the plugin
is loaded; neither spelling permits exact arithmetic to become approximate
silently.

The package owns the `Float` semantic type and the `.float` command namespace.
This keeps other future numerical plugins—interval oracles, Cauchy sequences,
continued fractions—from competing for a single global approximate type.

For display-oriented decimal work, rounding is explicit:

```rix
.float.Round(.float.Float(2.675), 2);
.float.Floor(.float.Float(2.675), 2);
.float.Ceiling(.float.Float(2.675), 2);
```

The results preserve the actual stored IEEE value, rather than pretending that
the input was a decimal real number.
