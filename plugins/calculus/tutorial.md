---
title: Link an abstract exponential to certified numerics
description: Build portable function expressions and explicitly attach a certified numerical realization.
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

The calculus record says which mathematical function is meant. The Numerics
result says how its value was computed and what evidence the finite work
supports. Later Calculus phases will use the exact facts to differentiate
compositions while retaining this same implementation boundary.
