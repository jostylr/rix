# Saving mathematical values

```{.rix exec=true}
::y = ::x-0;
saved := .MathEncodeJSON((::x,::y,::x));
loaded := .MathDecodeJSON(saved);
.SameSymbol(loaded[1],loaded[3]) ##@ == 1;
loaded[1]==loaded[2] ##@ == 1;
.SameSymbol(::x,loaded[1]) ##@ == _;
```

Definitions and shared identities survive; runtime scopes do not. Imported
symbols are fresh, even when they share a display name with existing symbols.
Use one document for values that need shared identity. Large integers and
rationals remain exact. Descending interval endpoint order is preserved.

Built-in pi is saved as an allowlisted `namedConstant` node with semantic ID
`rix.constant.pi@1`, so exact trigonometric meanings survive loading. A generic
generator named `pi` remains a fresh formal generator; its spelling does not
grant it the built-in meaning. Named-constant loading executes no code.

```{.rix exec=true}
lines := .MathEncodeJSONL([::x,::x]);
rows := .MathDecodeJSONL(lines);
.SameSymbol(rows[1],rows[2]) ##@ == _;
context := {& :::t | 1:0 & :::t*::a };
restored := .MathDecodeJSON(.MathEncodeJSON(context));
restored[:validation] ##@ == :unverifiedImport;
restored[:domains][1][:domain][:orientation] ##@ == :desc;
```

JSONL stores one independent document per physical line. These convenience
APIs materialize bounded strings and sequences; they are not an unbounded
streaming transport. Errors identify the failing line.

```{.rix exec=true}
.Plugin.Load("numerics");
real := .ExpressionReal(.numerics.Sqrt(2));
restored := .MathDecodeJSON(.MathEncodeJSON(real));
.ExpressionConstantInfo(restored)[:provider] ##@ == :realSnapshot;
.ExpressionConstantInfo(restored)[:refinable] ##@ == _;
.ExpressionConstantInfo(restored)[:validation] ##@ == :unverifiedImport;
```

Saved reals load as frozen singleton snapshots, retaining enclosures but not
closures. Refinement reports that no recipe is installed. This is explicit
degradation, not a claim that a saved enclosure proves its subject. Context
consistency and real evidence are unverified on import. No source code,
plugins, or refinement run while loading. Callables and unsupported values
fail serialization rather than disappearing silently.

See the [full format specification](../../docs/design/mathematical-json.md)
for node forms, examples, budgets, and the frozen-real envelope profile.
