---
title: Work with callable polynomials
description: Define, compose, reactively update, and exactly divide semantic Polynomial functions.
theme: Algebra and analysis
status: implemented
plugin: poly
---

Load the focused polynomial plugin directly, or load `.algebra`, which requires
and activates it automatically.

```rix
.Plugin.Load("poly");
P := `x^3 - 6x^2 + 11x - 6`.P();
{: P(2), P.Coefficients(), P.Degree() };
```

## Contextual coefficients

A symbolic specification declares the indeterminate explicitly. Other ordinary
names remain live closure coefficients.

```rix
.Plugin.Load("poly");
y := 2;
P := {#x# x^2 + y*x}.P();
y ~= 3;
P(2);                         ## 10
```

## Reactive dependency chains

Structural-arithmetic splices take snapshots. Placing a reactive read inside a
reactive polynomial definition records the dependency and rebuilds the value.
Derived reactive polynomials record their `$P` reads in the same graph.

```rix
.Plugin.Load("poly");
$$y := 2;
$$P := `.p.Var(x):x^2 + @($y)*x`;
$$Q := $P*$P + 1;

$y := 3;
{: $P(2), $Q(2) };            ## (10, 101)
```

## Operators and composition

Polynomial addition, subtraction, multiplication, nonnegative integral powers,
scalar division, negation, and equality preserve Polynomial identity. Passing a
Polynomial to another Polynomial evaluates by substitution, so it is ordinary
composition.

```rix
.Plugin.Load("poly");
P := `x^2 + 1`.P();
Q := `x + 2`.P();
R := P(Q);
A := P + 2;
B := Q^3;
{: R(3), A(3), B(1) };
```

Loading `.algebra` adds receiver methods and exact division operators:

```rix
.Plugin.Load("algebra");       ## also loads poly
P := .p`x^3 - 6x^2 + 11x - 6`;
F := .p`x - 2`;
division := P.SyntheticDiv(2);
Q := P // F;                   ## quotient
R := P % F;                    ## remainder
pair := P /% F;                ## {: quotient, remainder }
{: division.Quotient()(4), Q(4), R(4), pair[1](4) };
```

Only reactive definitions recompute. `Q := $P*$P + 1` takes the current value
of `$P`; `$$Q := $P*$P + 1` records a dependency and rebuilds when `$P`
changes. The same rule applies to every other RiX value.
