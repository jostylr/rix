# `calculus`

`calculus` is RiX's abstract mathematical-function layer. It keeps a
function's mathematical identity and facts separate from any algorithm used to
evaluate it, provides portable immutable expression graphs, and applies exact
derivative rules by stable semantic identity.

## Abstract functions and expressions

```rix
.Plugin.Load("calculus");
x := .calculus.Variable(:x);
Exp := .calculus.Exp();
f := 3 * Exp(x^2 + 1);
f.Record();
```

`Exp` has the stable semantic ID `rix.function.exp@1`. Its record carries the
initial-value characterization `y' = y`, `y(0) = 1`; calling it with an
abstract expression constructs an `apply` node. Arithmetic constructs
`operator` nodes under the versioned `rix.calculus.expression@1` schema.

The characterization is mathematical knowledge, not an executable algorithm.
Calling an abstract function with a concrete value therefore reports that no
implementation is attached.

## Core specification bridge

Portable expressions can cross the public `{#}` boundary in either direction:

```rix
.Plugin.Load("calculus");
x := .calculus.Variable(:x);
Exp := .calculus.Exp();
expression := 3 * Exp(x^2 + 1);
specification := .calculus.ToSpec(expression, [:x]);
restored := .calculus.FromSpec(specification);
```

The bridge preserves free variables, exact constants, arithmetic structure,
and semantic application IDs. Inputs may be supplied explicitly or inferred.
An omitted free variable or an unsupported core node is diagnosed instead of
being silently approximated or discarded. The same import/export helpers are
available to JavaScript plugins from `@ratmath/rix/eval`.

## Semantic registry

The live registry is keyed by `semanticId`, not by a RiX binding or function
object. Its function metadata, exact rules, executable implementation, domain,
branch declarations, and evidence occupy separate slots:

```rix
.Plugin.Load("calculus");
entry := .calculus.Resolve("rix.function.exp@1");
{: entry[:domain], entry[:exactrules], entry[:evidence] };
```

`.calculus.Register(function, options)` adds exact rules and their evidence.
A unary derivative rule receives the complete application expression and
returns the derivative with respect to its argument. Calculus supplies the
inner derivative through the chain rule. Reconstructing another function with
the same semantic ID therefore finds the same rule and registered
implementation.

## Exact differentiation

```rix
.Plugin.Load("calculus");
x := .calculus.Variable(:x);
Exp := .calculus.Exp();
derivative := .calculus.Differentiate(3 * Exp(x^2 + 1), :x);
.calculus.ToSpec(derivative);
```

The exact differentiator implements constant and variable linearity,
negation, sums, differences, products, quotients, Integer powers, and unary
semantic chain rules. `Exp` registers the identity `D Exp = Exp` with evidence
from its initial-value characterization. An unknown semantic application or a
non-Integer power is rejected rather than assigned an unjustified rule.

Deterministic structural keys let the power rule recognize the conservative
case `f' = c*f`. Thus `D(Exp(x)^2)` remains `2*Exp(x)^2`, with the optimization
recorded in the rule trace. This does not enable unrelated algebraic identities
such as exponential product combination; those belong to explicit Symbolic
transformations.

## Domain and branch obligations

Conditional transformations return `rix.calculus.transformation@1` records:

```rix
.Plugin.Load("calculus");
x := .calculus.Variable(:x);
result := .calculus.DifferentiateResult(.calculus.Log()(x^2), :x);
{: .calculus.ToSpec(result[:expression]), result[:obligations], result[:evidence] };
```

The derivative is `2*x/x^2`, accompanied by the requirement `x^2 > 0`.
Quotients retain a nonzero-denominator obligation, as do negative Integer
powers. Named rules currently cover:

- real-principal `Log`, requiring a positive argument;
- real `Abs`, represented as a piecewise semantic graph and deliberately left
  without a globally valid derivative at zero;
- real `Sin` and `Cos`, with exact mutually linked derivative identities;
- real-principal `Atan`, with derivative `1/(1+x^2)`;
- real-principal `Sqrt`, requiring a positive argument for its derivative;
- real-principal `Asin`, requiring an argument in the open unit interval; and
- principal `ComplexLog`, retaining its branch-cut obligation.

`.calculus.Differentiate` remains the convenience form for transformations
with no obligations. If obligations exist, it reports an error directing the
caller to `.DifferentiateResult`; it never returns the expression while
silently discarding its conditions. Custom semantic rules can pair
`derivative` with `derivativeObligations`, whose callable returns explicit
values built by `.calculus.Obligation(...)`.

## Checked simplification

`.calculus.SimplifyResult(expression)` returns the shared
`rix.calculus.graph-simplification@1` record. Its canonical v1 whitelist
removes exact neutral elements and double negation while preserving the
defined-input set. `.calculus.CheckSimplification(result)` independently
recomputes the target and visible rule sequence.

```rix
.Plugin.Load("calculus");
x := .calculus.Variable(:x);
safe := .calculus.SimplifyResult(-(-(x+0)));
unsafe := .calculus.SimplifyResult(x/x);
{: safe[:targetGraph], safe[:checker][:accepted], unsafe[:changed] };
```

The second transformation deliberately does nothing: cancellation would make
the target defined at zero. Conditional rewrites will require checked domain
witnesses rather than bare assumptions.

## Explicit implementations

An implementation can be supplied without changing the semantic identity:

```rix
.Plugin.Load("calculus");
.Plugin.Load("numerics");
CertifiedExp := (x) -> .numerics.Exp(x);
Exp := .calculus.Exp(CertifiedExp);
real := Exp(1/2);
.numerics.Refine(real, {= absoluteWidth=1/1000, maxWork=40 });
```

The implementation link is explicit and its evidence is recorded separately.
It does not turn a Float approximation into an exact function. Concrete calls
resolve an attached or semantic-ID-registered implementation; Numerics remains
responsible for refinement and evidence.

## Symbolic/numerical propagation

`.calculus.EvaluateResult(expression, bindings)` walks a composite exact graph.
Exact operators apply to the concrete values supplied by the bindings, while
each semantic application resolves its implementation through the registry:

```rix
.Plugin.Load("calculus");
.Plugin.Load("numerics");
x := .calculus.Variable(:x);
Exp := .calculus.Exp((value)->.numerics.Exp(value));
Log := .calculus.Log((value)->.numerics.Ln(value));
derivative := .calculus.DifferentiateResult(Exp(Log(x)),:x);
evaluation := .calculus.EvaluateResult(derivative,{= x=2 });
{: .calculus.ToSpec(derivative[:expression]),
   evaluation[:links], evaluation[:obligations], evaluation[:value] };
```

The exact differentiator never differentiates the numerical algorithm. It
uses registered mathematical identities to build a new exact graph; any
semantic applications surviving in that graph retain their IDs and therefore
find the same linked implementations. `rix.calculus.evaluation@1` records the
links actually invoked. Missing implementations are explicit errors.

Evaluation shares structurally identical semantic applications by default and
reports `semanticEvaluations`, `reuseCount`, and reuse records. Pass
`{=reuseCommonSubexpressions=_}` to disable sharing. The default assumes linked
mathematical implementations are referentially transparent.

Evaluating a conditional transformation does not prove its conditions.
`EvaluateResult` evaluates each obligation's subject and reports status
`unresolved`; `.Evaluate` refuses to return a bare value while obligations
remain. The linked provider retains its own evidence class, so a Float result
does not become certified and a Numerics enclosure does not become an exact
identity.

## Higher and multivariate derivatives

The same obligation-preserving machinery supports:

- `DifferentiateN` / `DifferentiateNResult` for repeated derivatives;
- `Partial` / `PartialResult` for explicit partial differentiation;
- `Gradient` / `GradientResult`;
- `Jacobian` / `JacobianResult`; and
- `Hessian` / `HessianResult`.

Convenience forms return expressions only when every component is
unconditional. Detailed forms return transformation records under
`rix.calculus.derivative-collection@1`; repeated and mixed differentiation
accumulates the earlier obligations and evidence instead of restarting from a
bare derivative expression.

## Integral specifications

`rix.calculus.integral@1` distinguishes three inert mathematical records:

- `SelectedPrimitive(integrand, variable, primitive, options)` chooses one
  representative and retains its declared verification/evidence;
- `AntiderivativeFamily(...)` keeps a representative and a named integration
  constant as separate fields; and
- `DefiniteIntegral(integrand, variable, lower, upper, options)` keeps ordered
  endpoints.

These constructors preserve obligations and do not imply that a primitive was
checked or a definite integral evaluated. `.symbolic` supplies matching
façades and imports FractionFunction source restrictions.

## Current boundary

The public schemas deliberately contain semantic nodes—variables, exact
constants, applications, and operators—rather than private evaluator opcodes.
The bidirectional `{#}` bridge, semantic registry, obligation-bearing
transformation results, representative real/complex branch-aware rules, and
exact higher/multivariate differentiation are implemented. Registry-driven
evaluation preserves linked implementation and common-subexpression reuse
provenance. Integral formulation and inert differential/boundary/Fredholm equation records
are implemented. Explicit derivative declarations preserve caller assumptions.
The `.cas` layer supplies bounded exact integration, symmetry and certified or
explicitly approximate quadrature; general non-Integer branch semantics remain
later work. See [course calculus](../../documentation/eval/course-calculus.md). `.fracfun`
now projects its display/evaluation forms and source
denominator restrictions through the same public Calculus expression schema;
its closure rewriting and paired-form construction remain host-owned. See
[the plugin roadmap](../TODO.md) and [design.md](design.md).
