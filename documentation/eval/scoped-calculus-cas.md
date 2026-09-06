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

Current boundary: differentiation, symbolic integration, and graph simplification
require rational constants. Extended constants can be constructed and numerically
evaluated, but derivative/rewrite laws for those providers are not assumed. Polynomial
compilation, specification conversion, and the older certified range/primitive-graph
pipeline still require their own identity-aware conversions; they reject scoped input
rather than forgetting identities. Use core `Eval` for scoped enclosure evaluation.
