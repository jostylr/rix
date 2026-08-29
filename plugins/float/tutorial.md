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

Mixed expressions are deliberately rejected:

```rix
.float(1/2) + .float(1/3); ## Float + Float is valid
.float(1/2 + 1/3);         ## or do exact work first, then convert
```

By contrast, `1/2 + .float(1/3)` is an error: choose an explicit conversion.
The same rule covers comparisons, `Min`/`Max`, and certified-real arithmetic.
No real backend silently turns itself into Float, and Float never enters the
automatic Oracle bridge.

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

Choose the storage format explicitly when binary32 behavior is relevant:

```rix
single := .float.Binary32(1 / 10);
double := .float.Binary64(1 / 10);
{: single.Format(), single.Value(), double.Value() };

single.NextUp();
double.NextAfter(1);
```

Operations round back to the receiver format. Mixing binary32 and binary64 is
an error until one side is converted explicitly. `NextUp`, `NextDown`, and
`NextAfter` provide deterministic adjacent representable values without
claiming anything about the real number that may have produced the Float.

Exceptional values remain inspectable:

```rix
overflow := .float.Binary32(10^100);
signedZero := .float.Binary32(-1 / 10^100);
infinity := .float.Binary32(1) / .float.Binary32(0);
nan := .float.Binary64(0) / .float.Binary64(0);

{: overflow.Classify(), signedZero.Diagnostics(),
   infinity.Classify(), nan.Classify() };
```

`Classify()` returns a `rix.float.classification@1` record. Its class, sign,
format, operation, and diagnostic sequence distinguish overflow, underflow,
signed zero, subnormals, infinities, and NaN. `.float.Interval` rejects
non-finite stored values instead of inventing an enclosure.

With `.numerics`, Float is an honest sampling backend rather than a refiner:

```rix
.Plugin.Load("numerics");

sample := .numerics.Sample(viaMethod); ## :approximate stored-value sample
refine := .numerics.Refine(viaMethod); ## :unsupported
viaMethod < {~ 1 / 2, 1 / 1000 };      ## undecided: providerUncertified
```

The point interval in `sample` exactly identifies the stored binary32 or binary64 value.
It does not certify the intended real that led to that value, so neither
Numerics nor a Halo comparison promotes it to proof.

Reproducible reductions make both order and rounding policy explicit:

```rix
.Plugin.Load("float");
sequential := .float.Sum([1,1/100000000,-1],
  {= policy=:sequential,format=:binary64 });
compensated := .float.Sum([1,1/100000000,-1],
  {= policy=:compensated,format=:binary64 });
dot := .float.Dot([1,2,3],[4,5,6],{= policy=:pairwise });
{:
  sequential[:value],
  compensated[:value],
  dot[:value],
  dot[:errorEstimate]
};
```

The error estimate is deliberately labeled approximate, not certified. For
complex IEEE work, use the separate Float-complex schema:

```rix
z := .float.Complex(1,2,:binary32);
w := .float.Complex(3,4,:binary32);
product := .float.ComplexMul(z,w);
{: product, .float.ComplexConjugate(product), .float.ComplexAbs(product) };
```

These values never acquire the exact Complex type or its arithmetic overloads.
