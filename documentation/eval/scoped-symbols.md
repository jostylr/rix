# Scoped mathematical symbols

`::x` introduces or retrieves the current programming scope's mathematical
symbol named x. This is separate from ordinary RiX bindings. `@::x` retrieves
an already introduced enclosing symbol, skipping the immediate scope; a
missing capture is an error. Function activations introduce fresh local
symbol namespaces. Closures retain enclosing namespaces, and deep-copying a
symbol preserves identity. Persistent top-level evaluations share symbols
until the context is reset.

```{.rix exec=true}
x := 7;
symbol := ::x;
copy ::= symbol;
.SameSymbol(symbol,copy) ##@ == 1;
.SameSymbol(symbol,::x) ##@ == 1;
{;
    local := ::x;
    .SameSymbol(local,@::x) ##@ == _;
    .SameSymbol(@symbol,@::x) ##@ == 1;
};
```

`.SameSymbol(a,b)` compares identities and returns 1 or _. It requires scoped
symbol operands. `.SymbolId()` exposes a session-local identity string for
inspection, not a portable serialization identifier. `.ExpressionKey(value)`
is an identity-aware structural key. `==` establishes matching expression
trees and exact constant equality; different symbolic trees return `?`, not
false. Additional mathematical reasoning is a later stage.

`::name` requires adjacency. Use spaces around assignments: `x := ::x`.
`:=::` otherwise overlaps the reserved removed solve token `:=:`. Existing
infix interval subdivision (`0:1 :: 3`) is unchanged. Index-leading `::`
remains slicing syntax: `[::]` is a full slice and `[::x]` is not a symbolic
index (currently an invalid slice). Parentheses, as in `[(::x)]`, explicitly
select an expression; an ordinary array still need not accept that index type.

## Staged consumer conversion

Core symbolic arithmetic is available without loading plugins. Existing
name-based calculus/CAS, range, and specification consumers deliberately
reject scoped expressions until their identity-aware conversion lands. This
prevents silent identification of distinct same-named symbols. Existing
constructor-based plugin examples are unaffected.

`:::x`, immutable symbolic definitions, and mathematical-context headers are
not part of this stage. Their intended semantics are recorded in
[the implementation ledger](../../docs/design/core-mathematics.md).
