# RationalIntervalSet methods

`RationalIntervalSet` is an immutable normalized finite union of exact rational
interval components. Unlike a hull, it preserves gaps. Components may also
have open endpoints or open infinite ends when imported from the portable
range-set form.

## Operators

```{.rix exec=true id=rational-interval-set-operators}
pieces := (1:2) \/ (4:5);
pieces.ToString() ##@ == "[1,2] U [4,5]";
((1:2) |\/| (4:5)) ##@ == 1:5;
((1:3) /\ (2:4)).ToRationalInterval() ##@ == 2:3;
((1:2) /\ (3:4)).ToString() ##@ == "empty";
(3/2 ? pieces) ##@ == 1;
((1:2) ? pieces) ##@ == 1;
((1:3) ? pieces) ##@ == _;
((1:2) ?/\ (2:3)) ##@ == 1;
((1:2) !/\ (3:4)) ##@ == 1;
```

For ranges on the left of `?`, membership means whole-range containment. For
a scalar on the left, it means ordinary point membership. `?&` remains an
alias for `?/\`.

## Method reference

| Full syntax | Result | Meaning |
|---|---|---|
| `range.Components()` | `Array` | Return endpoint/closure records for normalized components. |
| `range.Split()` | `Array<RationalIntervalSet>` | Return one range set per connected component. |
| `range.Union(other)` | `RationalIntervalSet` | Exact normalized union. |
| `range.Intersection(other)` | `RationalIntervalSet` | Exact intersection, possibly empty. |
| `range.Contains(other)` | `1 \| null` | Test whole-range containment. |
| `range.ContainsValue(value)` | `1 \| null` | Test exact scalar membership. |
| `range.Hull()` | `RationalIntervalSet` | Return the smallest connected range set covering all components. |
| `range.ToRationalInterval()` | `RationalInterval \| null` | Convert only one closed bounded component losslessly. |
| `range.ToString()` | `String` | Format gaps, endpoint topology, and infinities unambiguously. |

`Split()` currently takes no argument. A future split specification can add
width-, point-, or count-based subdivision without changing the no-argument
meaning: connected components.

[Back to the methods overview](../methods-guide.md)
