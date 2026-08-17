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

The calculus record and registry say which mathematical function and exact
rule are meant. The Numerics result says how a value was computed and what
evidence the finite work supports. Domain obligations, higher derivatives,
integration, and equation specifications extend this same boundary in later
phases.
