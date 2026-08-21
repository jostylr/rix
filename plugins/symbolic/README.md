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
- `SimplifyResult` returns the shared checked, domain-preserving graph rewrite
  and `CheckSimplification` independently repeats it;
- repeated, partial, gradient, Jacobian, and Hessian façades accept
  FractionFunctions, Calculus expressions, or public specs; and
- selected-primitive, antiderivative-family, and definite-integral façades
  retain FractionFunction source-domain restrictions; and
- `Obligations(value)` exposes either a Calculus transformation's conditions
  or a FractionFunction's original denominator restrictions.

## Discover transformations without moving their implementations

`Transformations()` returns immutable
`rix.symbolic.transformation-descriptor@1` records. Each record names a stable
ID, its owning plugin and mount, the operation, accepted input family, exact
result family, domain policy, verification style, and an explanatory call
shape.

```rix
.Plugin.Load("symbolic");
canonical := .symbolic.Transformations({= category=:canonical });
cancel := .symbolic.Transformation("fracfun.cancel");
{: canonical.Map((entry)->{: entry[:id], entry[:owner] }),
   cancel[:domainPolicy], cancel[:call] };
```

Supported filters are `owner`, `category`, `operation`, `input`, and
`domainPolicy`; `FindTransformations(options)` is an explicit alias for the
filtered form. A descriptor deliberately contains no callback or handler.
Invoke the documented operation through its owner—for example,
`value.Cancel()` or `.ratfun.Factored(value)`. This keeps plugin ownership,
type checks, evidence, and error behavior in one place.

The meta-plugin is pure RiX and adds no alternate arithmetic rules.
`.fracfun` remains host-backed for closure rewriting and its paired
display/evaluation construction, but its expression and restriction outputs
now cross a stable public Calculus boundary.
