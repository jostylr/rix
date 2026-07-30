# Sheet views

`.Sheet` creates a portable two-dimensional view of a RiX tensor, matrix, array,
tuple, or sequence. It is part of the structured-output model: the result
retains exact RiX values and can be rendered as text or HTML without depending
on a browser DOM.

`.Sheet(value)` is an immutable snapshot. `.Sheet(.Bind(variable))` opts into a
live view whose semantic edits are handled by a host-owned widget session.
`.Sheet(.FormulaSheet(...))` displays the current results of a separate
formula-backed model. Persistent formula source and the full RiXCel document
remain in the [RiXCel checklist](../design/eval/rixcel-todo.md).

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

Use the arrow keys, Home, and End to move around a focused sheet. In a read-only
Sheet, Enter or a double-click activates the selected address. In RiX Web this
inserts the canonical address into the formula input; in the notebook it
inserts the address at the current editor selection. Selection never mutates
the source tensor.

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

The live form is:

```rix
.Sheet(.Bind(m))
```

`.Bind` requires a variable name so it can capture lvalue identity. The
resulting lens supports `Get`, `Set`, `At`, and `Slice`:

```rix
lens := .Bind(m)
lens.At(2, 3).Get()
lens.At(2, 3).Set(5 / 7)
```

A Binding captures the RiX `Cell` behind the name. If `m` is later rebound with
`:=`, an existing Binding continues to refer to the original Cell instead of
silently switching targets.

RiX Web and the editable notebook result pane translate edits into semantic
`sheet:set` events containing a full 1-based tensor index and a RiX value. A
host-owned `WidgetSession` validates the index, updates the Binding, increments
its revision, and creates a refreshed Sheet. The browser DOM is never stored in
the Binding or Sheet.

The editor accepts RiX expressions, not untyped display text. Use quotes for
strings. On a live cell, Enter, F2, or double-click begins editing. Enter
commits the edit and returns focus to the same highlighted cell; Escape returns
without committing. Arrow navigation can then continue from that cell.

Live Binding handles are runtime-only. `WidgetSession.snapshot()` detaches the
current Sheet with `binding=null` and `editable=false`; persisted and static
exports therefore retain the current exact values but cannot write back into a
dead evaluation context.

## Formula-backed prototype

Use `.FormulaSheet` when each coordinate owns a formula and the whole grid must
be recalculated as one dependency graph:

```rix
model := .FormulaSheet([
    [@{1}, @{ grid[1,1] + 1 }],
    [@{ grid[1,2] * 2 }, @{ grid[2,1] + 1 }]
]);

model[2,2]  # 5
.Sheet(model, {= title="Formula results" })
```

Every entry must currently be a deferred RiX body. Formula evaluation has an
isolated context containing:

| Name | Meaning |
|---|---|
| `grid` | The current formula sheet; `grid[2,3]` records a dependency |
| `row` | Current 1-based row |
| `col` | Current 1-based column |
| `index` | Current `[row, col]` tuple |

The model evaluates all slots in a new atomic epoch. A read of a slot already
being evaluated reports the complete path, such as
`grid[1,1] -> grid[1,2] -> grid[1,1]`. The cycle never reads a stale prior
value. Caller variables are unavailable; future imports will be explicit.

The formula and slot APIs are:

```rix
model.GetFormula(1, 2)
model.SetFormula(1, 1, @{10})
model.Recalculate()
model.Slot(2, 2)
```

`SetFormula` keeps the new deferred formula and begins a complete
recalculation. Successful results commit together. If evaluation fails, the
last committed values remain available and involved slots retain diagnostics.

This is deliberately distinct from `.Bind`: a Binding editor computes one new
value immediately, whereas a FormulaSheet owns formulas and reexecutes their
dependency graph. In RiX Web and the notebook, Enter on a FormulaSheet cell
edits its stored formula body; committing publishes a `sheet:formula` event and
refreshes all dependent cells. The first persistent `.rixcel` format,
assignment modes, explicit imports, and rank-N formula storage are tracked in
the implementation checklist.

## Reactive dependent views

`.ReactiveGraph()` is the scalar dependency runtime. It owns named source and
computed nodes, records dependencies from reads made during deferred
evaluation, and propagates changes through the transitive graph in a single
atomic epoch:

```rix
graph := .ReactiveGraph("totals");
source1 := graph.Source("source1", 2);
source2 := graph.Source("source2", 3);
target1 := graph.Derive("target1", @{ source1 + source2 });
target2 := graph.Derive("target2", @{ target1 * 4 });

source1.Set(10);  # target1 is 13 and target2 is 52
```

The equivalent `.RG` notation removes the repeated string names:

```rix
graph := `.RG.Init.Set:
    $source1 := 2
    source source2 := 3
    target1 := source1 + source2
    target2 := target1 * 4
`;

`.RG:
    target3 := target2 + source1
`
```

`$name` and `source name` both declare externally settable source nodes.
Unmarked assignments declare computed nodes. `Init` creates a graph, and `Set`
makes it the default for subsequent `.RG:` blocks in the current RiX execution
context. `.RG.Use(graph): ...` applies one block without changing the default;
`.RG.Set(graph): ...` applies it and changes the default.

The notation first produces a graph plan, so normal RiX can inspect or apply the
same declarations:

```rix
plan := .RG.Analyze(@{
    source1 := .RG.Source(2);
    source2 := .RG.Source(3);
    target1 := source1 + source2
});

graph := .RG.Init("totals", plan);
.RG.Apply(graph, .RG.Analyze("target2 := target1 * 4"))
```

Static plan analysis identifies declarations and source markers. Runtime reads
remain authoritative for dependency edges, including conditional reads and
reads made inside functions. `$` is a source marker only inside `.RG` source;
ordinary RiX continues to use `$` for the current callable.

FormulaSheet is a coordinate adapter over the same runtime. `.Graph()` exposes
its graph so named computations and `grid[...]` formulas participate in one
dependency network:

```rix
values := .FormulaSheet([[@{120}, @{40}, @{8}]]);
graph := values.Graph();

`.RG.Use(graph):
    average := (grid[1,1] + grid[1,2]) / 2
    functionvalue := {;
        Scale(x) -> x * grid[1,3];
        Scale(grid[1,1])
    }
`;

.LiveView(values, @{
    .Fragment([
        .Sheet(source, {= title="Editable inputs" }),
        .Table(
            ["quantity", "value"],
            [
                ["Average of first and second", average],
                ["Scale(first), where Scale(x) = x * third", functionvalue]
            ]
        ),
        .Graphics.Graphic([260, 140], [
            .Graphics.Path(
                [[20, 120], [source[1,1], source[1,2]]],
                {= stroke="#4f46e5", width=3 }
            ),
            .Graphics.Circle(
                [source[1,1], source[1,2]],
                source[1,3],
                {= fill="#f97316" }
            )
        ])
    ])
})
```

Graph names are strings in RiX user-identifier form and are canonicalized to
lowercase, matching ordinary user bindings. A FormulaSheet graph reserves
`grid`, `row`, `col`, and `index` for its coordinate evaluation context.

`average` dynamically depends on the first two slots. `functionvalue` depends
on the first and third, even though the third read occurs inside a locally
defined function. Changing a formula marks its downstream nodes dirty,
recomputes those nodes in dependency order, and emits one commit. Cycles report
their complete graph path and preserve the last successfully committed values.

FormulaSheet and Binding implement the host-neutral `subscribe(listener)`
contract. The `.LiveView` body runs in an isolated context where `source` is
the subscribed object and named nodes from a FormulaSheet graph are available
by name. A successful FormulaSheet commit or Binding update rederives the
complete output and publishes a `live:commit` event.

This contract is intentionally independent of the interaction that caused the
update. A formula editor uses `sheet:formula`; a future draggable Graphic point
can write a coordinate through a Binding. Both cause the same LiveView
rederivation without making Graphics depend on spreadsheet code.
