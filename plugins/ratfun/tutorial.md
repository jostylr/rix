---
title: Work with exact rational functions
description: Construct, cancel, compose, and reactively update callable RationalFunction values.
theme: Algebra and analysis
status: implemented
plugin: ratfun
---

Load the focused plugin. Its `.rf` and `.rationalFunction` aliases are the same
callable value, and `.poly` is loaded as a dependency.

```rix
.Plugin.Load("ratfun");
R := .rf`(x^2 - 1)/(x - 1)`;
{: R(3), R.Numerator().Coefficients(), R.Denominator().Coefficients() };
```

## Convert a symbolic or structural form

`.R()` mirrors Polynomial `.P()`. An explicit symbolic input is the clearest
choice when other names are coefficients.

```rix
.Plugin.Load("ratfun");
y := 2;
R := {#x# (x + y)/(x - 1)}.R();
S := (`(t^2 - 4)/(t - 2)`).R(:t);
{: R(3), S(5) };
```

The named backtick header is useful when bare free symbols would be ambiguous.

```rix
.Plugin.Load("ratfun");
y := 2;
R := `.rf.Var(x):(x + y)/(x - 1)`;
R(3);
```

## Polynomial promotion and field operations

After `.ratfun` is loaded, `/` between Polynomials creates a RationalFunction.
The usual field operations stay in that semantic type. `//`, `%`, and `/%`
remain the distinct quotient/remainder operations supplied by `.algebra`.

```rix
.Plugin.Load("algebra");       ## loads ratfun, then poly
P := .p`x^2 - 1`;
Q := .p`x - 1`;
R := P/Q;
S := 1/Q;
T := (R + S)^2;
{: R(2), S(2), T(2), P // Q, P % Q };
```

## Composition

Calling with a Polynomial or RationalFunction substitutes it and returns a
canonical RationalFunction, or the narrower Polynomial type if the resulting
denominator is `1`.

```rix
.Plugin.Load("ratfun");
R := .rf`(x + 1)/(x - 1)`;
P := .p`x^2`;
Q := .rf`1/x`;
{: R(P)(2), R.Compose(Q)(2) };
```

## Reactive coefficients

Canonicalization evaluates coefficients exactly when a value is built.
Reactive definitions rebuild the RationalFunction whenever a read dependency
changes; ordinary definitions remain snapshots.

```rix
.Plugin.Load("ratfun");
$$y := 2;
$$P := `.p.Var(x):x + @($y)`;
Q := .p`x - 1`;
$$R := $P/Q;
$$S := $R + 1/Q;

$y := 4;
{: $R(3), $S(3) };            ## (7/2, 4)
```

## Cancellation and domains

RationalFunctions use reduced fraction-field semantics. Cancelled source
restrictions are not remembered.

```rix
.Plugin.Load("ratfun");
R := .rf`(x^2 - 1)/(x - 1)`;
{: R(1), R.Domain(), R == .rf`x + 1` };
```

Here `R(1)` is `2`. A future restricted-expression wrapper can represent the
same formula with a removable hole at `1` when source-domain fidelity matters.
