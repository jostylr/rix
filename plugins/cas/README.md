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
- sine and cosine of affine expressions;
- nonnegative integer powers of affine sine/cosine through degree 8, using
  the standard two-degree reduction recurrence;
- products of two affine sine/cosine factors, in every ordering, using
  product-to-sum (including equal and opposite frequencies);
- logarithms of affine expressions by integration by parts;
- `x^n Exp(a*x+b)` by repeated integration by parts; and
- canonical RationalFunctions whose exact partial fractions have only rational
  linear residual factors, including repeated factors and polynomial parts, or
  one irreducible quadratic residual with a linear numerator.

Reciprocal and linear partial-fraction primitives use the public
`Log(Abs(u))` graph and retain the actual `u != 0` domain obligation. Integrals
whose source already contains real-principal `Log(u)` retain `u > 0`, because
that is the source function's domain. Irreducible quadratics use a principal
`Atan` graph after exact completion of the square.

`CheckIntegral` independently reruns the deterministic rule selection and
compares the structural antiderivative. This is rule replay, not a general
theorem prover. The retained rules and existing derivative service make the
calculation inspectable in a lesson.

Power-reduction records retain the degree, affine slope, and recurrence step.
Its RiX implementation uses diagnostic `?_>` prep guards to separate these
applicability checks from primitive construction, while preserving the exact
unsupported reasons. See the [guard tutorial](../../documentation/eval/function-returns.md).
Product-to-sum records retain both affine arguments. A zero sum/difference
frequency integrates as a constant times `x`, never by dividing by zero.
These identities hold on the entire real line and introduce no additional
domain obligations. Negative/noninteger trig powers, degrees above 8, mixed
powers such as `Sin(x)^2*Cos(x)^3`, and nonaffine arguments are outside this
rung. The degree budget keeps graph construction and classroom derivative
checks bounded; it is not a mathematical restriction on the recurrence.

Unsupported inputs return `status=:unsupported`, `antiderivative=_`, and a
reason such as `:unsupportedSemanticFunction` or
`:nonlinearResidualPartialFraction`. The plugin never fabricates a closed form.

## Deliberate boundary

The current layer does not attempt general Risch integration, unrestricted
trigonometric identity search, special-function reductions, multivariate
Groebner simplification, or enormous heuristic simplification portfolios.
Useful next additions are mixed trigonometric powers, selected radical
substitutions, exact definite-integral symmetries, and broader
assumption-aware simplification.

See [tutorial.md](tutorial.md) for runnable course examples.
