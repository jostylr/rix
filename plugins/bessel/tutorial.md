---
title: Certified Bessel functions
description: Evaluate the first cylindrical Bessel functions through a clear namespace and refine their certified intervals.
theme: Numbers and numerics
status: implemented
plugin: bessel
order: 24
---

## Keep letter-and-order names in context

The short conventional names are recognizable in a formula about Bessel
functions but ambiguous in a general calculator. The plugin therefore keeps
them under the `.bessel` namespace instead of installing bare `J0`, `J1`,
`Y0`, and `Y1` variables.

```rix
.Plugin.Load("bessel");
values := [
  .bessel.J0(0),
  .bessel.J1(1),
  .bessel.Y0(1),
  .bessel.Y1(1)
];
values |>> ((value) -> .numerics.Refine(value, {=
  absoluteWidth=1/1000,
  maxWork=1200
}));
```

Loading `bessel` automatically loads its Numerics and Oracle dependencies.
All functions return certified refinable real values rather than Float
samples. The Y family currently accepts positive real arguments only; an
unresolved or invalid real domain produces structured `:unknown` evidence.

## Use the universal implementation directly when needed

The algorithms remain part of Numerics so every certified real provider can
use them. Their explicit universal names also make the relationship clear:

```rix
.Plugin.Load("numerics");
result := .numerics.Refine(.numerics.BesselJ0(1), {=
  absoluteWidth=1/10000,
  maxWork=400
});
[result[:status], result[:interval], result[:certified]];
```

For ordinary calculator code, prefer `.bessel.J0(1)`. The longer Numerics
names are mainly useful to code that deliberately works with the universal
algorithm layer.

## Select any integer order

`J(n,x)` and `Y(n,x)` keep the family letter in the Bessel namespace while
making the order explicit:

```rix
.Plugin.Load("bessel");
results := [.bessel.J(2, 1), .bessel.J(-3, 1), .bessel.Y(2, 1)];
results.Map((value) -> .numerics.Refine(value, {=
  absoluteWidth=1/1000,
  maxWork=7000
}));
```

Negative orders use `J_-n=(-1)^n J_n` and `Y_-n=(-1)^n Y_n`. The Y family
requires a certifiably positive argument.

## Modified families

The same namespace provides integer-order `I` and `K`:

```rix
modified := [.bessel.I(2, 1), .bessel.K(2, 1)];
modified.Map((value) -> .numerics.Refine(value, {=
  absoluteWidth=1/1000,
  maxWork=12000
}));
```

`I` accepts real arguments and follows integer parity. `K(-n,x)=K(n,x)` and
requires `x>0` on the real branch.
