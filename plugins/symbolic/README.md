# Symbolic meta-plugin

`.symbolic` is a small opt-in umbrella joining representation-sensitive exact
work with portable abstract Calculus. Loading it activates `.fraction`,
`.fracfun`, and `.calculus`; dependencies also make `.poly` and `.ratfun`
available.

```rix
.Plugin.Load("symbolic");
f := .frac(6,8);
F := .ff`(x^2-1)/(x-1)`;
expression := .symbolic.CalculusExpression(F);
derivative := .symbolic.DifferentiateResult(F,:x);
{: f, F.Form(), .calculus.ToSpec(expression),
   derivative[:obligations], .symbolic.Services() };
```

The façade delegates construction and transformation to focused owners:

- `Fraction` and `FractionFunction` retain their established schemas;
- `CalculusExpression(value)` converts a FractionFunction or core `{#}` spec
  to the public Calculus expression schema;
- `Differentiate` is the obligation-free convenience form;
- `DifferentiateResult` preserves derivative obligations and evidence; and
- `Evaluate` / `EvaluateResult` follow linked Calculus implementations;
- repeated, partial, gradient, Jacobian, and Hessian façades accept
  FractionFunctions, Calculus expressions, or public specs; and
- selected-primitive, antiderivative-family, and definite-integral façades
  retain FractionFunction source-domain restrictions; and
- `Obligations(value)` exposes either a Calculus transformation's conditions
  or a FractionFunction's original denominator restrictions.

The meta-plugin is pure RiX and adds no alternate arithmetic rules.
`.fracfun` remains host-backed for closure rewriting and its paired
display/evaluation construction, but its expression and restriction outputs
now cross a stable public Calculus boundary.
