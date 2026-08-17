# `calculus`

`calculus` begins RiX's abstract mathematical-function layer. Phase 1 keeps a
function's mathematical identity and facts separate from any algorithm used to
evaluate it. It also provides portable, immutable expression graphs that other
plugins can inspect without reading evaluator IR.

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
It does not turn a Float approximation into an exact function. Phase 1 merely
dispatches concrete arguments to the attached callable; Numerics remains
responsible for refinement and evidence.

## Phase 1 boundary

The public schemas deliberately contain semantic nodes—variables, exact
constants, applications, and operators—rather than private evaluator opcodes.
Exact differentiation, conversion to and from `{#}` specifications, domain and
branch obligations, definite integration, and equation problems are later
phases. See [the plugin roadmap](../TODO.md) and [design.md](design.md).
