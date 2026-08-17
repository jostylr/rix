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
available to JavaScript plugins from `rix/eval`.

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

## Current boundary

The public schemas deliberately contain semantic nodes—variables, exact
constants, applications, and operators—rather than private evaluator opcodes.
The bidirectional `{#}` bridge, semantic registry, and initial exact
differentiator are implemented. Domain and branch obligations, non-Integer
powers, higher and multivariate derivatives, definite integration, and
equation problems remain later phases. See
[the plugin roadmap](../TODO.md) and [design.md](design.md).
