---
title: Explore exact forms and abstract derivatives together
description: Activate unreduced fractions, form-preserving functions, portable Calculus expressions, and visible domain obligations through one meta-plugin.
theme: Algebra and analysis
status: implemented
plugin: symbolic
---

`.symbolic` loads the formal and Calculus workspaces while preserving the
focused plugin mounts and aliases.

```rix
.Plugin.Load("symbolic");
fraction := .frac(6,8);
form := .ff`(x^2-1)/(x-1)`;
canonical := form.R();
{: fraction, form.Form(), canonical(3), .symbolic.Services() };
```

Use `.fraction`, `.fracfun`, or `.calculus` directly when only one focused
surface is needed.

## Cross into a portable Calculus expression

FractionFunction's displayed form crosses the same public schema as a core
`{#}` specification:

```rix
.Plugin.Load("symbolic");
F := .ff`(x+1)*(x-1)`;
expression := .symbolic.CalculusExpression(F);
fromSpec := .symbolic.CalculusExpression({#t# t^2+1});
{: .calculus.ToSpec(expression), .calculus.ToSpec(fromSpec) };
```

## Differentiate unconditional expressions

`.symbolic.Differentiate` delegates to Calculus and returns a bare expression
when no condition would be lost:

```rix
.Plugin.Load("symbolic");
x := .calculus.Variable(:x);
Exp := .calculus.Exp();
derivative := .symbolic.Differentiate(Exp(x^2+1), :x);
.calculus.ToSpec(derivative);
```

## Preserve quotient domains and function branches

Use `DifferentiateResult` whenever a formula has conditions. The result keeps
the transformed expression, obligations, and rule evidence together:

```rix
.Plugin.Load("symbolic");
x := .calculus.Variable(:x);
logResult := .symbolic.DifferentiateResult(.calculus.Log()(x^2), :x);
form := .ff`(x^2-1)/(x-1)`;
formResult := .symbolic.DifferentiateResult(form, :x);
.Table({=
  columns=["source", "derivative", "obligations"],
  rows=[
    ["Log(x^2)", .calculus.ToSpec(logResult[:expression]), logResult[:obligations]],
    [form.Form(), .calculus.ToSpec(formResult[:expression]), formResult[:obligations]]
  ]
});
```

`Log` requires a positive real argument. The quotient requires its denominator
to be nonzero. Real-principal `Sqrt` and `Asin`, and principal `ComplexLog`, use
the same contract for their domain or branch requirements.

## Keep cancelled holes visible

A cancelled FractionFunction has a different display form but retains its
source-domain evaluation expression. Symbolic exposes both and converts the
stored denominator into a Calculus obligation:

```rix
.Plugin.Load("symbolic");
F := .ff`(x^2-1)/(x-1)`;
C := F.Cancel();
{: .calculus.ToSpec(C.CalculusExpression()),
   .calculus.ToSpec(C.EvaluationCalculusExpression()),
   .symbolic.Obligations(C),
   C.Domain().Get("calculusRestrictions") };
```
