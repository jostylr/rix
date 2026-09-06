# Mathematical constant providers

Core expression arithmetic promotes supported scalar values into constant
nodes. `.ExpressionConstant(value)` explicitly constructs one, and
`.ExpressionConstantInfo(value)` accepts either a scalar or a constant node.
It inspects capabilities without evaluating an expression or refining a real.

```{.rix exec=true}
e := ::x + (0:1);
.ExpressionConstantInfo(e.Operands()[2])[:denotation] ##@ == :setEnclosure;
.ExpressionHasExtendedConstants(e) ##@ == 1;
.ExpressionConstant(0:1)==(2:3) ##@ == _;
.ExpressionConstant(1:1)==1 ##@ == 1;
p := 1~{pi};
.ExpressionConstantInfo(p)[:provider] ##@ == :exactScalar;
.ExpressionConstant(p)==p ##@ == 1;
.ExpressionConstant(p)!=_ ##@ == 1;
```

## Supported providers

| Provider | Denotation | Available laws |
| --- | --- | --- |
| Finite Integer/Rational | Exact singleton | Commutative, associative, distributive; cancellation with its ordinary nonzero precondition |
| Bounded RationalInterval | Set enclosure, even when endpoints coincide | Addition/multiplication are commutative and associative; no general distributivity or cancellation |
| Core exact generator/expression | Exact scalar | Commutative, associative, distributive; cancellation undecided |

These are laws of the provider's addition and multiplication, not blanket
claims about division, exponentiation, or partially defined expressions.
User-defined exact polynomial quotients need not be fields, so cancellation
is deliberately `?` for exact scalars. `1~{pi}` uses the core exact scalar
registry; it is not a numerical approximation to pi or a refinement oracle.

The inspection record has schema `rix.math.constant-provider@1`, `provider`,
`denotation`, `exact`, `refinable`, `commutative`, `associative`, `distributive`,
`cancellation`, and `enclosure`. Decisions use `1`, `_`, or `?`. The
`refinable` flag is `_` for these adapters: this interface currently provides
no refinement procedure, including for trivially exactly known rationals.
Intervals expose their unchanged oriented enclosure; other providers return
`_` in that field. Unsupported objects and nonfinite rational components
error instead of acquiring inferred capabilities from a schema label.

## Equality and structural identity

`_` is absence, not an unresolved mathematical value. Expressions compare
unequal to `_`, preserving ordinary optional-result and diagnostic checks.

Overlapping nonsingleton interval constants compare as `?`, including two
identical interval records. Disjoint interval constants compare unequal, and
matching point intervals can establish equality. General expression trees
containing intervals remain undecided; structural matching must not become a
proof about unknown values in an enclosure.

Exact constant equality uses the core exact scalar normal forms. Matching
forms prove equality; different generator forms remain undecided rather than
claiming mathematical inequality. Two distinct generators with the same
display name have different structural keys. Constants' keys are built from
rational components, oriented endpoints, generator IDs, and term powers—not
display strings. Keys are session-local structural data, not saved-file IDs.

## Remaining adapters and consumer work

Refinable reals need an adapter to the existing Numerics capability/refinement
protocol, preserving singleton evidence, budgeted refinement, identity, and
the distinction between certified and merely claimed facts. Merely wrapping
a map with a real-looking schema is not supported. Physical quantities need
dimension-aware operations; quaternion/octonion values need their own
noncommutative/nonassociative laws. They are not included by accepting the
unrelated commutative core exact-generator representation.

The old calculus/CAS and range/specification paths reject extended constants
until their provider-aware conversion lands. Rational-only plugin expressions
still work. Core construction and inspection work without loading a plugin.
Portable mathematical serialization is a separate stage.
