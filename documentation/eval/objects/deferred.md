# Deferred methods

Deferred syntax such as `@{; expression }` stores lowered RiX code without running it. Its methods evaluate or inspect that stored code.

## Method reference

| Full syntax | Result | Meaning |
|---|---|---|
| `deferred.Eval(bindings? = _, mode? = :inherit)` | `any` | Evaluate with optional bindings. `:inherit` sees the current scope; `:fresh` uses an isolated scope. |
| `deferred.Desugar(depth? = -1)` | `String` | Render lowered IR. `0` shows only the outer node and `-1` is unlimited. |
| `deferred.Inspect(bindings? = {= }, depth? = -1)` | `String` | Evaluate in a fresh scope and return inputs, trace, and output. |
| `deferred.CheckTraits()` | `1 \| null` | Validate attached semantic traits. |

## Checked examples

```{.rix exec=true id=deferred-methods}
x := 10;
d := @{; x + y };
d.Eval({= y=5 }) ##@ == 15;
@{; x + 1 }.Eval({= x=6 }, :fresh) ##@ == 7;
@{; 1 + 2 }.Desugar(0) ##@ == "DEFER(...)";
@{; 1 + 2 }.Desugar().Len() ##@ > 0;
@{; x + y }.Inspect({= x=3, y=4 }, 0).Includes("Output: 7") ##@ == 1;
d.CheckTraits() ##@ == 1;
```

`Inspect` always isolates the code. Its trace can re-evaluate nested side-effectful expressions, so use `depth=0` when inspecting mutations or output operations.

[Back to the methods overview](../methods-guide.md)
