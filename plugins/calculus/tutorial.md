---
title: Differentiate an abstract exponential and refine its values
description: Build portable function expressions, differentiate by semantic identity, and attach a certified numerical realization.
theme: Algebra and analysis
status: implemented
---

## Construct an abstract expression

The abstract function retains its semantic identity and characterization even
when it has no evaluation algorithm:

```rix
.Plugin.Load("calculus");
x := .calculus.Variable(:x);
Exp := .calculus.Exp();
expression := 3 * Exp(x^2 + 1);
.Table({=
  columns=["kind", "schema", "operation"],
  rows=[[
    expression[:kind],
    expression[:schema],
    expression[:operation]
  ]]
});
```

Inspect `Exp.Record()`. Its `facts` field records both `y' = y` and the initial
condition `y(0) = 1`; its `hasImplementation` field is null.

## Cross the public specification boundary

The portable graph can become a core symbolic specification and return without
losing the exponential's semantic ID:

```rix
.Plugin.Load("calculus");
x := .calculus.Variable(:x);
Exp := .calculus.Exp();
expression := 3 * Exp(x^2 + 1);
specification := .calculus.ToSpec(expression, [:x]);
restored := .calculus.FromSpec(specification);
.Table({=
  columns=["specification", "restored kind", "semantic function"],
  rows=[[
    specification,
    restored[:kind],
    restored[:operands][1][:semanticId]
  ]]
});
```

The core specification remains inert for semantic applications. Calculus can
nevertheless resolve the retained semantic ID through its rule registry.

## Differentiate by semantic identity

`Exp` registers its exact outer derivative separately from any numerical
implementation. Arithmetic and chain rules build another portable graph:

```rix
.Plugin.Load("calculus");
x := .calculus.Variable(:x);
Exp := .calculus.Exp();
expression := 3 * Exp(x^2 + 1);
derivative := .calculus.Differentiate(expression, :x);
entry := .calculus.Resolve(Exp);
.Table({=
  columns=["derivative", "semantic ID", "rule evidence"],
  rows=[[
    .calculus.ToSpec(derivative),
    entry[:semanticId],
    entry[:evidence][:derivative][:identity]
  ]]
});
```

The derivative is exact because the registry contains `D Exp = Exp` and the
ordinary product, power, and chain rules apply. Finite differences or sampled
values never become exact derivative evidence.

## Keep domain and branch obligations with the result

Some exact formulas are conditional. Use `DifferentiateResult` to keep the
derivative, the conditions under which it is valid, and its rule evidence in
one transformation record:

```rix
.Plugin.Load("calculus");
x := .calculus.Variable(:x);
logResult := .calculus.DifferentiateResult(.calculus.Log()(x^2), :x);
sqrtResult := .calculus.DifferentiateResult(.calculus.Sqrt()(x), :x);
asinResult := .calculus.DifferentiateResult(.calculus.Asin()(x), :x);
complexResult := .calculus.DifferentiateResult(.calculus.ComplexLog()(x), :x);
.Table({=
  columns=["function", "derivative", "kind", "required relation"],
  rows=[
    ["Log", .calculus.ToSpec(logResult[:expression]),
      logResult[:obligations][1][:kind], logResult[:obligations][1][:relation]],
    ["Sqrt", .calculus.ToSpec(sqrtResult[:expression]),
      sqrtResult[:obligations][1][:kind], sqrtResult[:obligations][1][:relation]],
    ["Asin", .calculus.ToSpec(asinResult[:expression]),
      asinResult[:obligations][1][:kind], asinResult[:obligations][1][:relation]],
    ["ComplexLog", .calculus.ToSpec(complexResult[:expression]),
      complexResult[:obligations][1][:kind], complexResult[:obligations][1][:relation]]
  ]
});
```

The real rules retain positivity or open-interval requirements. The complex
rule retains the selected principal branch and its branch cut. The convenience
`.calculus.Differentiate(...)` form deliberately errors for these examples;
it returns a bare expression only when the obligation list is empty.

Operators participate in the same contract. This quotient result records that
its original denominator must remain nonzero:

```rix
.Plugin.Load("calculus");
x := .calculus.Variable(:x);
result := .calculus.DifferentiateResult((x+1)/(x-1), :x);
{: .calculus.ToSpec(result[:expression]), result[:obligations] };
```

Custom semantic rules use the same mechanism: register `derivative` and a
separate `derivativeObligations` callable returning values made with
`.calculus.Obligation(...)`. This keeps a formula, its preconditions, and the
evidence for each in distinct registry slots.

```rix
.Plugin.Load("calculus");
PositiveOnly := .calculus.Function("example.positive-only@1", {=
  name=:PositiveOnly,
  domain=:positiveReal,
  codomain=:real
});
.calculus.Register(PositiveOnly, {=
  derivative=(application)->1,
  derivativeObligations=(application)->[
    .calculus.Obligation(:domain,:positive,application[:arguments][1], {=
      reason=:customPositiveDomain
    })
  ],
  derivativeEvidence=:definition
});
x := .calculus.Variable(:x);
result := .calculus.DifferentiateResult(PositiveOnly(x^2), :x);
{: .calculus.ToSpec(result[:expression]), result[:obligations] };
```

## Move form-preserving rational functions into Calculus

The Symbolic workspace loads Calculus and exposes the public bridge. A
FractionFunction contributes both its expression and its original denominator
restrictions:

```rix
.Plugin.Load("symbolic");
F := .ff`(x^2-1)/(x-1)`;
C := F.Cancel();
derivative := .symbolic.DifferentiateResult(F, :x);
.Table({=
  columns=["display form", "cancelled display", "source expression", "source obligations"],
  rows=[[
    .calculus.ToSpec(F.CalculusExpression()),
    .calculus.ToSpec(C.CalculusExpression()),
    .calculus.ToSpec(C.EvaluationCalculusExpression()),
    .symbolic.Obligations(C)
  ]]
});
```

Cancellation changes the displayed expression but not the source-domain hole.
The public Calculus view makes that distinction available to other plugins
without exposing FractionFunction's private symbolic tree representation.

## Attach a certified realization

Numerics supplies an algorithm without becoming the owner of the abstract
identity:

```rix
.Plugin.Load("calculus");
.Plugin.Load("numerics");
CertifiedExp := (x) -> .numerics.Exp(x);
Exp := .calculus.Exp(CertifiedExp);
result := .numerics.Refine(Exp(1/2), {=
  absoluteWidth=1/1000,
  maxWork=40
});
.Table({=
  columns=["semantic function", "status", "certified", "interval"],
  rows=[[
    Exp.SemanticId(),
    result[:status],
    result[:certified],
    result[:interval]
  ]]
});
```

## Propagate links through composition and differentiation

A composite Calculus graph does not copy numerical closures into its portable
records. Instead, evaluation resolves every semantic application by ID. Exact
differentiation builds a new graph first; surviving semantic applications then
find the same linked providers:

```rix
.Plugin.Load("calculus");
.Plugin.Load("numerics");
x := .calculus.Variable(:x);
Exp := .calculus.Exp((value)->.numerics.Exp(value));
Log := .calculus.Log((value)->.numerics.Ln(value));
expression := Exp(Log(x));
derivative := .calculus.DifferentiateResult(expression,:x);
evaluation := .calculus.EvaluateResult(derivative,{= x=2 });
refined := .numerics.Refine(evaluation[:value],{=
  absoluteWidth=1/1000,
  maxWork=40
});
.Table({=
  columns=["exact derivative", "implementation IDs", "obligations", "refined value"],
  rows=[[
    .calculus.ToSpec(derivative[:expression]),
    evaluation[:links].Map((link)->link[:semanticId]),
    evaluation[:obligationValues],
    refined[:interval]
  ]]
});
```

Both `Log` and `Exp` are resolved during evaluation, and their implementation
evidence appears in `evaluation[:links]`. The exact rule for `Log` still leaves
the positive-argument obligation. Its subject is evaluated at `2`, but its
status remains `unresolved`: numerical evaluation is not a proof engine.

If an exact rule eliminates a semantic application—for example the outer
`Log` in `D Log(x)=1/x`—the derivative no longer needs that implementation.
Conversely, an unknown semantic function cannot be differentiated merely
because it has a numerical algorithm.

## Compute higher and multivariate derivatives

Repeated and mixed derivatives retain the variable path and accumulate prior
conditions:

```rix
.Plugin.Load("calculus");
x := .calculus.Variable(:x);
y := .calculus.Variable(:y);
f := x^2+x*y+y^2;
gradient := .calculus.Gradient(f,[:x,:y]);
jacobian := .calculus.Jacobian([x*y,x+y],[:x,:y]);
hessian := .calculus.Hessian(f,[:x,:y]);
higher := .calculus.DifferentiateNResult(.calculus.Log()(x),:x,2);
{: gradient.Map((entry)->.calculus.ToSpec(entry)),
   jacobian.Map((row)->row.Map((entry)->.calculus.ToSpec(entry))),
   hessian.Map((row)->row.Map((entry)->.calculus.ToSpec(entry))),
   .calculus.ToSpec(higher[:expression]),
   higher[:variables],
   higher[:obligations] };
```

`GradientResult`, `JacobianResult`, and `HessianResult` expose every component
transformation plus their flattened obligations. The shorter forms used above
return expression arrays only when all components are unconditional.

The Calculus record and registry say which mathematical function and exact
rule are meant. The Numerics result says how a value was computed and what
evidence the finite work supports. Integration and equation specifications
extend this same boundary in later phases.
