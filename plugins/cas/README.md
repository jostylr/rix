# `.cas`

`.cas` is RiX's browser-safe, course-level computer-algebra layer. It composes
the public `.calculus`, `.poly`, and `.ratfun` contracts and does not require a
network service, native executable, or hidden evaluator representation.

## Checked simplification and polynomial forms

`Simplify(expression)` delegates to the checked Calculus graph simplifier and
returns `rix.cas.rewrite@1`. `CheckSimplification(result)` recomputes the claim.

`NormalizePolynomial`, `Expand`, `Collect`, and `Factor` convert a supported
univariate Calculus graph through the canonical exact Polynomial service.
Collect exposes ascending coefficients; Factor retains exact reconstruction
evidence and a residual when rational linear factorization is incomplete.

```rix
.Plugin.Load("cas");
x := .calculus.Variable(:x);
collected := .cas.Collect((x+1)*(x-1),x);
factored := .cas.Factor(x^2-1,x);
{: collected[:coefficients],factored[:factors] };
```

## Integration ladder

`Integrate(value,variable)` returns `rix.cas.integral@1` with an antiderivative,
the rules used, and domain obligations. The implemented ladder covers:

- sums, differences, constant factors, and integer powers;
- powers and reciprocals of affine expressions;
- exponentials of affine expressions;
- logarithms of affine expressions by integration by parts;
- `x^n Exp(a*x+b)` by repeated integration by parts; and
- canonical RationalFunctions whose exact partial fractions have only rational
  linear residual factors, including repeated factors and polynomial parts.

Real logarithm results carry a positive-argument obligation. RiX does not
silently replace `log(x)` by an unrepresented `log(abs(x))`; negative-domain
branches need an explicit absolute-value expression contract in a later rung.

`CheckIntegral` independently reruns the deterministic rule selection and
compares the structural antiderivative. This is rule replay, not a general
theorem prover. The retained rules and existing derivative service make the
calculation inspectable in a lesson.

Unsupported inputs return `status=:unsupported`, `antiderivative=_`, and a
reason such as `:unsupportedSemanticFunction` or
`:nonlinearResidualPartialFraction`. The plugin never fabricates a closed form.

## Deliberate boundary

The current layer does not attempt general Risch integration, unrestricted
trigonometric identity search, special-function reductions, multivariate
Groebner simplification, or enormous heuristic simplification portfolios.
Useful next additions are an explicit absolute-value graph, the common
trigonometric tables and reductions, quadratic partial fractions, selected
radical substitutions, and exact definite-integral symmetries.

See [tutorial.md](tutorial.md) for runnable course examples.
