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

## Evaluate through linked numerical implementations

The Symbolic façade can evaluate a Calculus expression or transformation while
retaining the implementation links and unresolved conditions:

```rix
.Plugin.Load("symbolic");
.Plugin.Load("numerics");
x := .calculus.Variable(:x);
Exp := .calculus.Exp((value)->.numerics.Exp(value));
Log := .calculus.Log((value)->.numerics.Ln(value));
derivative := .symbolic.DifferentiateResult(Exp(Log(x)),:x);
evaluation := .symbolic.EvaluateResult(derivative,{= x=2 });
{: .calculus.ToSpec(derivative[:expression]),
   evaluation[:links].Map((link)->link[:semanticId]),
   evaluation[:obligationValues] };
```

Differentiation uses exact semantic rules. Evaluation separately follows the
linked providers. Seeing that an obligation's subject is `2` does not by itself
mark the positivity obligation proved.

## Use higher and multivariate façades

```rix
.Plugin.Load("symbolic");
P := .ff`x^3+x`;
second := .symbolic.DifferentiateN(P,:x,2);
gradient := .symbolic.Gradient({#x,y# x^2+x*y },[:x,:y]);
{: .calculus.ToSpec(second),
   .symbolic.Evaluate(second,{= x=3 }),
   gradient.Map((expression)->.calculus.ToSpec(expression)) };
```

`Jacobian`, `Hessian`, and each corresponding `...Result` form follow the
same variable ordering and obligation rules as the focused Calculus API.

## Use the shared derivative graph and integral façades

Symbolic exposes Calculus reuse rather than introducing a second
differentiator:

```rix
.Plugin.Load("symbolic");
x := .calculus.Variable(:x);
Exp := .calculus.Exp((value)->value+1);
derivative := .symbolic.DifferentiateResult(Exp(x)^2,:x);
evaluation := .symbolic.EvaluateResult(derivative,{= x=2 });
{: .calculus.ToSpec(derivative[:expression]),
   derivative[:evidence], evaluation[:semanticEvaluations] };
```

The result uses the exact differential identity `D Exp = Exp` to retain
`2*Exp(x)^2`; general exponential-product normalization remains a distinct
symbolic transformation.

The integral façades accept Calculus expressions, core specifications, and
FractionFunctions:

```rix
.Plugin.Load("symbolic");
F := .ff`1/x`;
x := .calculus.Variable(:x);
family := .symbolic.AntiderivativeFamily(F,:x,.calculus.Log()(x),:C);
definite := .symbolic.DefiniteIntegral(F,:x,1,2);
{: family, definite };
```

FractionFunction's original nonzero-denominator obligation is copied into both
integral records. These are formulation records, not automatic integration or
proof results.
