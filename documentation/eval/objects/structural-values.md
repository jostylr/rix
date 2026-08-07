# Structural value methods

Backtick arithmetic produces structural symbols, literals, forms, or algebra values. All four runtime shapes share this method surface.

## Method reference

| Full syntax | Result | Meaning |
|---|---|---|
| `value.Inspect()` | `Map` | Return structured kind, head, mode, arguments/components, and source span metadata. |
| `value.Render()` | `String` | Render the canonical structural tree. |
| `value.Collapse()` | `any` | Evaluate a fully concrete structural value into ordinary exact RiX values. |
| `value.ToExact()` | `any` | Convert a structural algebra value to its exact RiX algebra representation. |
| `value.Simplify(nonzeroNames...)` | structural value | Simplify conservatively; supplied names are assumed nonzero. |
| `value.Head()` | `String` | Return the form head, algebra profile, literal kind, or `Symbol`. |
| `value.Arguments()` | `Array` | Return form arguments or algebra components. |
| `value.SourceSpan()` | `Tuple \| null` | Return the one-based source span as `{: start, end }`. |
| `value.MapArguments(mapper)` | structural value | Transform each immediate form argument or algebra component. |
| `value.CheckTraits()` | `1 \| null` | Validate attached semantic traits. |

## Checked examples

```{.rix exec=true id=structural-value-methods}
form := `x+1`;
form.Inspect().Get("kind") ##@ == "form";
form.Render() ##@ == "Sum(x, 1)";
(`6/4`).Collapse() ##@ == 3/2;
(`.SArith.Complex:3-4i`).ToExact() ##@ == 3 - 4~{i};
(`x*2/x`).Simplify(:x) ##@ == 2;
form.Head() ##@ == "Sum";
form.Arguments() ##: array[2];
form.SourceSpan() ##: tuple[2];
form.MapArguments((argument) -> argument).Render() ##@ == "Sum(x, 1)";
form.CheckTraits() ##@ == 1;
```

`Simplify` does not cancel a symbolic factor unless it is named as nonzero. This prevents a cosmetic rewrite from silently changing a function's domain.

[Back to the methods overview](../methods-guide.md)
