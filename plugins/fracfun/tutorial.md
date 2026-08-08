---
title: Explore form-preserving functions
description: Keep polynomial and quotient forms visible while applying expansion, recentering, combination, and cancellation explicitly.
theme: Algebra and analysis
status: implemented
plugin: fracfun
---

Use `.ff` for both preserved polynomial forms and fractional forms. Values are
ordinary callables.

```rix
.Plugin.Load("fracfun");
P := .ff`(x+1)*(x+1)`;
R := .ff`(x^2-1)/(x-1)`;
Q := (`x^2+1`).ff();
{: P(2), R(3), Q(2), P.Form(), R.Form() };
```

## Operations preserve their construction

Addition and multiplication retain their expression trees. `Together` is an
explicit choice.

```rix
.Plugin.Load("fracfun");
A := .ff`1/x`;
B := .ff`1/(x+1)`;
Sum := A+B;
Product := A*B;
{: Sum.Form(), Product.Form(), Sum.Together().Form() };
```

## Expand and recenter explicitly

```rix
.Plugin.Load("fracfun");
P := .ff`(x+1)*(x+1)`;
Q := .ff`x^2+1`;
{: P.Expand().Form(), Q.Recenter(2).Form() };
```

## Compare form, value, and function domain

```rix
.Plugin.Load("fracfun");
A := .ff`(x^2-1)/(x-1)`;
B := .ff`x+1`;
C := A.Cancel();
{: A == B, A.Equivalent(B), A.SameFunction(B),
   C.Equivalent(B), C.SameFunction(A) };
```

`C` displays a cancelled form but still has the source hole at `1`. Crossing
to canonical RationalFunction semantics is explicit.

```rix
.Plugin.Load("fracfun");
F := .ff`(x^2-1)/(x-1)`;
C := F.Cancel();
{: F.Domain(), C.Domain(), F.Canonical()(1) };
```

Calling `C(1)` still reports division by zero, while `F.Canonical()(1)` is `2`.

## Canonical projections

```rix
.Plugin.Load("fracfun");
PForm := .ff`(x+1)*(x+1)`;
RForm := .ff`(x^2-1)/(x-1)`;
P := PForm.P();
R := RForm.R();
{: P(3), R(3), PForm.Record(), RForm.Record() };
```

## Reactive forms

```rix
.Plugin.Load("fracfun");
$$y := 2;
$$F := `.ff.Var(x):(x+@($y))/(x-1)`;
$$G := $F + .ff`1/(x-1)`;
$y := 4;
{: $F(3), $G(3), $G.Form() };
```
