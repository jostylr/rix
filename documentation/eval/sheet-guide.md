# Sheet views

`.Sheet` creates a portable two-dimensional view of a RiX tensor, matrix, array,
tuple, or sequence. It is part of the structured-output model: the result
retains exact RiX values and can be rendered as text or HTML without depending
on a browser DOM.

The current `Sheet` value is an immutable snapshot. It does not yet edit its
source value. Live bindings, formula slots, dependency tracking, and the RiXCel
document model are tracked in the [RiXCel checklist](../design/eval/rixcel-todo.md).

## Basic tensor view

```rix
m := {:2x3: 1, 2, 3; 4, 5, 6}
.Sheet(m)
```

The visible rows and columns correspond to tensor axes 1 and 2. Each rendered
entry retains a canonical RiX address:

```text
grid[1,1]  grid[1,2]  grid[1,3]
grid[2,1]  grid[2,2]  grid[2,3]
```

HTML renderers expose the address as `data-rix-address` and as the cell title.
RiX Web and the RiX notebook enhance this markup with pointer and keyboard
selection. Selecting an entry shows `C2 · grid[2,3]` without parsing a display
label back into RiX source.

`grid` is the default address-base string stored by the Sheet; `.Sheet` does
not create a `grid` binding and `grid` is not a property of the Sheet. If an
activated address should evaluate immediately, either name the source value
`grid` or set `address` to its actual binding name:

```rix
m := {:2x3: 1, 2, 3; 4, 5, 6}
.Sheet(m, {= address="m" })
```

Use the arrow keys, Home, and End to move around a focused sheet. Enter or a
double-click activates the selected address. In RiX Web this inserts the
canonical address into the formula input; in the notebook it inserts the
address at the current editor selection. Selection never mutates the source
tensor.

By default, column headers use a dual display such as `C · 3`. The letter is a
familiar spreadsheet label; the number is the RiX tensor coordinate.

## Options

`.Sheet(data, options)` accepts these options:

| Option | Meaning | Default |
|---|---|---|
| `title` | Optional display title | `_` |
| `address` | Base used by canonical cell addresses | `"grid"` |
| `axes` | Rank-length array of axis names | `["axis1", ...]` |
| `viewAxes` | Visible tensor axes, using 1-based RiX indices | `[1,2]` |
| `slice` | Rank-length locator; visible axes must contain `_` | visible axes `_`, hidden axes `1` |
| `columnLabels` | `:dual`, `:letters`, or `:numbers` | `:dual` |

The complete map form is also accepted:

```rix
.Sheet({=
    data = m,
    title = "Exact matrix",
    address = "coefficients",
    axes = ["row", "column"],
    columnLabels = :dual
})
```

## Rank-N tensor planes

A `Sheet` always presents at most two axes. Other axes select a plane:

```rix
t := {:2x3x2:
    1, 2, 3; 4, 5, 6 ;;
    7, 8, 9; 10, 11, 12
}

depth2 := .Sheet(t, {=
    axes = ["row", "column", "depth"],
    slice = [_, _, 2],
    address = "cube"
})
```

The top-right visible entry has value `9`, tensor index `[1,3,2]`, and address
`cube[1,3,2]`.

RiX Web and the notebook render a selector for every hidden axis. Changing a
selector swaps the visible plane in the immutable snapshot; it does not mutate
the tensor. The portable Sheet value retains one plane record for every hidden
axis combination so this interaction also works in static and live notebook
output without re-evaluation.

Any two axes may be visible:

```rix
rowByDepth := .Sheet(t, {=
    viewAxes = [1, 3],
    slice = [_, 2, _],
    columnLabels = :numbers
})
```

This fixes tensor axis 2 at index 2 and displays rows against depth.

## Vectors, matrices, and sequences

A rank-1 value is displayed as one sheet column:

```rix
.Sheet([10, 20, 30], {= address="vector" })
```

Matrix syntax is accepted directly:

```rix
.Sheet([1, 2; 3, 4])
```

Nested arrays must be rectangular. Ragged input is rejected instead of being
silently padded.

## Snapshot and live-view boundary

This is a snapshot:

```rix
view := .Sheet(m)
```

Changing `m` later does not mutate `view`. This matches `Table`, `Grid`,
`Fragment`, and `Graphic`, which are portable output descriptions rather than
live UI sessions.

The planned live form is conceptually:

```rix
.Sheet(.Bind(m))
```

`Binding` and `Widget` are not implemented yet. They will route semantic edit
events back to a RiX binding and create a refreshed `Sheet` value. The same
event/update model is intended for interactive graphics and other notebook
controls.
