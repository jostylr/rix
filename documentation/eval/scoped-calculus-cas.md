# Scoped calculus and course CAS

Calculus differentiation (including higher/partial derivatives, gradients, Jacobians
and Hessians), semantic construction, CAS integration, and checked graph simplification
now preserve core symbol identities. Pass an actual symbolic variable, not its name.
Same-spelled symbols from different scopes remain independent.

```{.rix exec=true}
.Plugin.Load("cas");
a := ::x; b := {; ::x };
expr := a^2+b;
.calculus.Differentiate(expr,a).Eval([(a,3)])[:value] ##@ == 6;
.calculus.Differentiate(expr,b).Eval()[:value] ##@ == 1;
primitive := .cas.Integrate(a*b,a);
primitive[:antiderivative].Eval([(a,2),(b,3)])[:value] ##@ == 6;
.cas.CheckIntegral(primitive)[:accepted] ##@ == 1;
```

Derivative and integral records retain the selected symbol itself. Definitions are
expanded for these algorithms; a defined symbol cannot be chosen as an independent
variable. Passing `:x` for a graph containing scoped symbols errors instead of choosing
by spelling. Named constructor expressions remain usable with explicit name selectors.

```{.rix exec=true}
.Plugin.Load("cas");
simple := .cas.Simplify(::x+0);
.SameSymbol(simple[:expression],::x) ##@ == 1;
.cas.CheckSimplification(simple)[:accepted] ##@ == 1;
.calculus.Sqrt()(::x).Eval([(::x,4)])[:value] ##@ == 2;
```

Core/scoped `.calculus.EvaluateResult` uses identity binding pairs or mathematical
contexts and returns the core `rix.math.evaluation@1` report, including provider
evidence and per-call budgets. It does not dispatch arbitrary linked implementations;
the separate named-graph linked evaluator remains available for that purpose.
`Evaluate` only unwraps a complete value. Use `EvaluateResult` for enclosures or
conditional results. Name-keyed maps cannot bind scoped variables.

```{.rix exec=true}
.Plugin.Load("calculus");
d := .calculus.DifferentiateResult(.calculus.Log()(::x),::x);
.calculus.EvaluateResult(d,[(::x,2)])[:value] ##@ == 1/2;
.calculus.EvaluateResult(d,[(::x,-2)])[:status] ##@ == :invalidAssumptions;
```

Transformation obligations are never discarded. Real nonzero, positive, nonnegative,
and open-unit-interval conditions translate to core checks. Other domain or branch
obligations remain explicit and conditional. Extracting `[:expression]` deliberately
leaves those transformation conditions behind; prefer evaluating the entire result.

## Scoped univariate polynomials

`poly(expr,variable)` accepts a core univariate expression and an explicit symbol.
CAS `NormalizePolynomial`, `Expand`, `Collect`, and `Factor` use this identity-aware
coefficient compiler for scoped inputs. Coefficients are rational; a second distinct
symbol is rejected, even if it has the same name. The callable polynomial retains
the symbol in `Variable()` and in its records. Its derivatives, arithmetic, factors,
and subsequent CAS integration retain that identity too.

```{.rix exec=true}
.Plugin.Load("cas");
p := .cas.Collect((::x+1)^3,::x);
.SameSymbol(p[:polynomial].Variable(),::x) ##@ == 1;
p[:polynomial].Evaluate(2) ##@ == 27;
.cas.Expand((::x+1)^3,::x)[:expression].Eval([(::x,0)])[:value] ##@ == 1;
.cas.Integrate(p[:polynomial])[:antiderivative].Eval([(::x,1)])[:value] ##@ == 15/4;
```

`.MathPolynomialCoefficients(expr,variable,options)` returns ascending coefficients
using the core configurable traversal, digit, degree, term, sum, product-pair, and
exponent budgets. This is coefficient lowering, not name-based specification
conversion; it does not create a hidden programming variable. To use explicit
budgets with CAS, compile coefficients first and construct a polynomial record:

```{.rix exec=true}
.Plugin.Load("cas");
coefficients := .MathPolynomialCoefficients((::x+1)^32,::x,{= maxProductPairs=4096 });
p := .poly({= coefficients=coefficients,order=:ascending,variable=::x });
.SameSymbol(p.Variable(),::x) ##@ == 1;
p.Degree() ##@ == 32;
```

Only total polynomial operations are compiled: rational constants, the selected
variable, addition/subtraction/multiplication, nonnegative integer powers, and division
by a nonzero constant polynomial. A zero power with a potentially zero base is rejected
instead of erasing an undefined point. Semantic applications, nonconstant denominators,
and nonrational coefficients are not accepted. Reconstruction skips zero coefficients
and emits constant terms without `x^0`, so the returned polynomial works at zero.

## Executable specifications with scoped inputs

`.SpecFromExpression(expr,[::x,::y],options)` (also `.calculus.ToSpec`) compiles
rational-arithmetic expression graphs into specification IR. The explicit array
determines positional input order; symbols are matched by identity, never spelling.
Definitions expand at conversion. Every free symbol must be supplied once. Unused
independent input symbols are allowed, including for a constant expression.

```{.rix exec=true}
a := ::x; b := {; ::x };
spec := .SpecFromExpression(a^2+b,[b,a]);
F := .Poly(spec);
F(2,3) ##@ == 11;
expr := .ExpressionFromSpec(F);
expr.Eval([(a,3),(b,2)])[:value] ##@ == 11;
.InspectSpec(spec)[:symbolBindings].Len() ##@ == 2;
```

Private input slots carry a separate identity table, exposed by `InspectSpec` as
`symbolBindings` pairs of `(slot,symbol)`. Displayed slot names are implementation
details, not reusable variable names or portable source. Save the core expression
with its ordered symbols using mathematical JSON/JSONL, not printed spec text.
The spec captures no programming variables: outer-scope symbolic values must also
be supplied explicitly. Arithmetic, partial application, composition, and supported
specification transformations retain the table. Explicit derivative/integral selectors
on these specs must be symbols, not colon-strings. An unconverted consumer that loses
the table errors instead of exporting name-based substitutes.

```{.rix exec=true}
P := .SpecFromExpression(::x^2,[::x]);
Q := .SpecFromExpression(::y+1,[::y]);
expr := .ExpressionFromSpec(P(Q));
expr.Eval([(::y,3)])[:value] ##@ == 16;
.ExpressionFromSpec(.Deriv(P,::x)).Eval([(::x,3)])[:value] ##@ == 6;
```

Conversion accepts exact rational constants and arithmetic operators, preserving
the original operation tree before any explicitly requested transformation.
Per-call `maxVisits` and `maxDepth` options bound traversal, including definition
expansion. This budget does not bound subsequent execution of the compiled callable.
Mathematical contexts, bound symbols, extended constants, mixed named/scoped variables,
and semantic applications are rejected in this increment. In particular, a context
must not be stripped automatically: that would silently discard its assumptions.
Use core `Eval` when conditions or provider evidence must accompany the answer.

Current boundary: differentiation, symbolic integration, and graph simplification
require rational constants. Extended constants can be constructed and numerically
evaluated, but derivative/rewrite laws for those providers are not assumed. Contextual
and semantic specification conversion and the older certified range/primitive-graph
pipeline still require their own identity-aware conversions; they reject scoped input
rather than forgetting identities. Use core `Eval` for scoped enclosure evaluation.
