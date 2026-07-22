---
title: Optional Float math
description: Load IEEE-754 approximate math without making it a core RiX numeric type.
---

# Optional Float math

RiX exact Integers and Rationals are always available. Load `float` when a
calculation intentionally needs IEEE-754 behavior:

```rix
.Plugin.Load("float")
x := .float.Float(1 / 3)
.float.Sin(x)
```

The package owns the `Float` semantic type and the `.float` command namespace.
This keeps other future numerical plugins—interval oracles, Cauchy sequences,
continued fractions—from competing for a single global approximate type.

For display-oriented decimal work, rounding is explicit:

```rix
.float.Round(.float.Float(2.675), 2)
.float.Floor(.float.Float(2.675), 2)
.float.Ceiling(.float.Float(2.675), 2)
```

The results preserve the actual stored IEEE value, rather than pretending that
the input was a decimal real number.
