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

## Certified arithmetic graph ranges

`.numerics.GraphRange` accepts scoped arithmetic expressions with `(symbol,range)`
binding pairs. It retains symbol identities in dependency tracking, expands immutable
definitions, and records the original identity bindings for independent checker replay.
Name-keyed maps are rejected for scoped graphs. Bound symbols must be instantiated;
mathematical contexts and extended constant providers are not accepted by this engine.

```{.rix exec=true}
.Plugin.Load("numerics");
a := ::x; b := {; ::x };
same := .numerics.GraphRange(a-a,[(a,1:2)]);
different := .numerics.GraphRange(a-b,[(a,1:2),(b,1:2)]);
same[:interval] ##@ == 0:0;
different[:interval] ##@ == (-1):1;
.numerics.CheckGraphRange(different)[:certified] ##@ == 1;
```

Unlike naive interval subtraction, the repeated-input rule knows that `a-a` is zero.
Different same-named symbols are independent coordinates. Certification does not mean
an expression is defined everywhere: for `x/x`, the source hole at zero is retained.

```{.rix exec=true}
.Plugin.Load("numerics");
ans := .numerics.GraphRange(::x/::x,[(::x,(-1):1)],
    {= maxDepth=200,maxWork=20000,maxSubintervals=2 });
ans[:interval] ##@ == 1:1;
ans[:domainStatus] ##@ == :partiallyDefined;
.numerics.CheckGraphRange(ans)[:certified] ##@ == 1;
ans[:budgets][:maxDepth] ##@ == 200;
```

| Option | Default | Meaning |
| --- | ---: | --- |
| `maxDepth` | 128 | Nesting, including immutable definition expansion |
| `maxWork` (`maxNodes` alias) | 10000 | Preflight traversal visits and evaluated nodes per partition |
| `maxSubintervals` | 1 | Requested one-variable subdivision count; existing components are retained |

The effective limits are exposed in `[:budgets]`; evidence retains options for replay.
Depth and traversal validation runs before recursive key construction or simplification.
Exceeding preflight limits throws rather than producing a certificate. Evaluation work
exhaustion can return an uncertified `:unknown` report. Subdivision and work settings
accept positive safe integers without the former 10000/1000000 upper caps. Increasing
them can substantially increase runtime/memory; `maxWork` is not a total wall-clock
or all-partitions budget. Arithmetic growth is not yet bounded by `maxDigits` here.

`maxDepth` is configurable, including above 128. The shared mathematical budget parser
still enforces a separate 512-level host stack-safety ceiling. That is not an algorithmic
degree limit; supporting deeper expressions safely requires iterative replacements for
the remaining recursive routines, rather than merely removing the stack guard.

## Checked derivatives, Lipschitz and Taylor ranges

`CheckDerivativeGraph` independently recomputes scoped derivative stages and their
obligations. `DerivativeSign`, `LipschitzRange`, and `TaylorRange` now use the same
identities in their bindings and replayable evidence. Definitions expand before the
independent differentiation; another same-named symbol is never substituted for the
selected differentiation variable.

```{.rix exec=true}
.Plugin.Load("calculus"); .Plugin.Load("numerics");
d := .calculus.DifferentiateResult(::x^2,::x);
dd := .calculus.DifferentiateNResult(::x^2,::x,2);
.numerics.DerivativeSign(d,[(::x,1:2)])[:direction] ##@ == :nondecreasing;
ans := .numerics.LipschitzRange(d,[(::x,(-1):1)],{= maxSubintervals=2 });
ans[:checker][:accepted] ##@ == 1;
taylor := .numerics.TaylorRange(dd,[(::x,(-1):1)]);
taylor[:certified] ##@ == 1;
taylor[:curvature] ##@ == :convex;
```

The midpoint Lipschitz enclosure bounds variation using the first derivative.
Subdivision often tightens it. Taylor uses the first derivative at the midpoint
and a second-derivative remainder bound. These strategies currently require one
matching, closed, bounded input range (possibly subdivided). Carried domain
obligations must be discharged: an interval crossing a pole is not certified.

A uniform derivative sign establishes monotonicity only on a connected variable
domain. For example, the derivative of `1/x` is negative on both `[-2,-1]` and
`[1,2]`, but the function is not globally nonincreasing across their union.
The sign report can still certify the derivative enclosure while leaving
`monotonicityCertified` false and `direction` unknown.

`CheckDerivativeGraph(d,options)` and the range strategies accept `maxDepth`,
`maxWork`, and `maxDerivativeOrder` (default 16, configurable positive safe integer).
Depth and node budgets apply to the source, claimed derivative, and each recomputed
derivative stage. The shared 512-level stack ceiling still applies. These are
per-stage/per-partition limits, not a global deadline. The checker order budget is
separate from any course-level derivative-construction limits.

## Scoped polynomial and rational recognition

`RecognizeGraph(expr,::x,options)` retains the selected symbol and uses it as the
only independent polynomial coordinate. Unlike polynomial-only collection, it
can recognize a rational expression while preserving all source denominator
restrictions. Recognition is structural, not a proof that the function is defined
everywhere, and it never cancels away source holes.

```{.rix exec=true}
.Plugin.Load("numerics");
ans := .numerics.RecognizeGraph(::x/::x,::x);
ans[:kind] ##@ == :rationalFunction;
ans[:sourceDomainRestrictions].Len() ##@ == 1;
.SameSymbol(ans[:variable],::x) ##@ == 1;
limited := .numerics.RecognizeGraph((::x+1)^8,::x,{= maxProductPairs=2 });
limited[:recognized] ##@ == _;
raised := .numerics.RecognizeGraph((::x+1)^8,::x,{= maxProductPairs=100 });
raised[:recognized] ##@ == 1;
```

Recognition accepts core `MathBudgets` options: `maxVisits`, `maxDepth`, `maxDigits`,
`maxTerms`, `maxDegree`, `maxProductPairs`, `maxSumTerms`, and `maxExponent` govern
the relevant work. Effective core settings appear in `budgets` on success.
Malformed options or preflight traversal exhaustion throw; unsupported algebra and
arithmetic-budget exhaustion return `recognized=_` with a reason. Coefficients
remain rational, and foreign symbols and semantic applications remain unsupported.

## Inspecting a small derivative proof

A proof adapter translates an algorithm's result into the checker's fixed vocabulary.
The earlier adapters identified coordinates by strings such as `"x"`. Derivative,
derivative-sign, complete polynomial critical-point, and monotonicity-partition proof
rules now retain scoped symbols. They reject replacing a symbol with its name or with
a different same-named symbol. Existing named graphs continue to use name strings.

`DerivativeProof` builds a one-node `derivative.graph` transcript and checks it
independently. This is a bounded, browser-safe proof example, not an external prover
or a general-purpose proof language. No trusted-leaf resolver is exposed to RiX code.

```{.rix exec=true}
.Plugin.Load("calculus"); .Plugin.Load("numerics");
d := .calculus.DifferentiateResult(::x^2,::x);
proof := .numerics.DerivativeProof(d);
proof[:accepted] ##@ == 1;
proof[:evidenceLevel] ##@ == :checkedEvidence;
proof[:trustedDependencies].Len() ##@ == 0;
.SameSymbol(proof[:conclusion][:variable],::x) ##@ == 1;
proof[:evidence][:nodes][1][:rule] ##@ == "derivative.graph";
```

The conclusion is a derivative identity **with its retained obligations**. It does
not by itself prove that the source is defined throughout a particular interval.
For that, continue with derivative-sign or certified range evaluation. This adapter
currently accepts first derivatives only and forwards `maxDepth`, `maxWork`, and
`maxDerivativeOrder` options to independent checking. It does not import arbitrary
user-supplied proof transcripts or execute saved proof code.

The native `checkRangeEvidence(document,options)` API also supports scoped symbols
in these rules. Its `limits` object contains configurable nonnegative safe integers
`maxNodes` (default 10000), `maxComponents` (10000), and `maxPolynomialDegree` (256).
Optional `derivativeOptions` and `recognitionOptions` forward the corresponding
algorithm budgets; they are host-supplied, not trusted limits asserted by a document.
Proof-DAG traversal is iterative; a 2000-node chain is tested. This removes a proof
chain's stack-depth restriction, **not** the separate expression traversal ceiling.
Native trusted leaves still require explicit host authorization and remain tracked.

Current boundary: differentiation, symbolic integration, and graph simplification
require rational constants. Extended constants can be constructed and numerically
evaluated, but derivative/rewrite laws for those providers are not assumed. Contextual
and semantic specification conversion and broader provider-aware certified kernels
remain pending, as does scoped monotone-composition proof substitution. A trusted
semantic derivative identity does not automatically make
its function numerically evaluable by the arithmetic range engine. Use core `Eval`
for the supported provider-aware scoped enclosure surface.
