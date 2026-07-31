# Sheet views

`.Sheet` creates a portable two-dimensional view of a RiX tensor, matrix, array,
tuple, or sequence. It is part of the structured-output model: the result
retains exact RiX values and can be rendered as text or HTML without depending
on a browser DOM.

`.Sheet(value)` is an immutable snapshot. `.Sheet(.Bind(variable))` opts into a
live view whose semantic edits are handled by a host-owned widget session.
`.Sheet(.FormulaSheet(...))` displays the current results of a separate
formula-backed model. Formula source can be persisted in the versioned
[RiXCel document format](../design/eval/rixcel-format.md).

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
| `axisLabels` | Rank-length array of cosmetic coordinate-label arrays or `_` | all coordinates numeric/lettered |
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
    axisLabels = [["low", "high"], ["x", "y", "z"]],
    columnLabels = :dual
})
```

`axes` names the dimensions; `axisLabels` optionally names the coordinates
along each dimension. These are presentation metadata, not RiX identifiers:

```rix
named := .Sheet(t, {=
    axes = ["region", "measure", "scenario"],
    axisLabels = [
        ["North", "South"],
        ["Revenue", "Cost", "Margin"],
        ["Actual", "Forecast"]
    ],
    slice = [_, _, 2]
})
```

The visible headers are `North`/`South` and
`Revenue`/`Cost`/`Margin`. The hidden scenario selector shows `Actual` and
`Forecast`. The same entry still has numeric index `[2,3,2]` and canonical
address `grid[2,3,2]`; labels never change formula syntax or slot identity.
Each Sheet cell also carries `coordinateLabels` and a joined
`coordinateLabel` for accessible renderers and semantic selection events.

Complete labeled coordinates can be resolved without changing the underlying
numeric identity:

```rix
named.At({=
    region="South",
    measure="Cost",
    scenario="Forecast"
})
named.Index({=
    region="South",
    measure="Cost",
    scenario="Forecast"
}) # ( 2, 2, 2 )
```

`At` returns the exact value and `Index` returns the canonical numeric tuple.
Every axis must be supplied. Axis names and coordinate labels match exactly,
with an unambiguous case-insensitive fallback. Duplicate cosmetic labels remain
valid for display but produce an ambiguity error when used for lookup.

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
model := .FormulaSheet({:2x2:
    @{1}, @{ grid[1,1] + 1 };
    @{ grid[1,2] * 2 }, @{ grid[2,1] + 1 }
});

model[2,2]  # 5
.Sheet(model, {= title="Formula results" })
```

Tensor notation is preferred because its shape is explicit and extends to
rank-N FormulaSheets. A rectangular nested array remains accepted for rank 2.
Every entry must be a deferred RiX body. Formula evaluation has an isolated
context containing:

| Name | Meaning |
|---|---|
| `grid` | The current formula sheet; `grid[2,3]` records a dependency |
| `row` | Current 1-based row |
| `col` | Current 1-based column |
| `index` | Current rank-length coordinate tuple |

The model evaluates all slots in a new atomic epoch. A read of a slot already
being evaluated reports the complete path, such as
`grid[1,1] -> grid[1,2] -> grid[1,1]`. The cycle never reads a stale prior
value. Caller variables are unavailable; future imports will be explicit.

The formula and slot APIs are:

```rix
model.GetFormula(1, 2)
model.SetFormula(1, 1, @{10})
model.GetSource(1, 2)
model.SetSource(1, 1, "10", ":=")
model.GetAssignmentMode(1, 1)
model.At({= region="South", measure="Cost" })
model.Index({= region="South", measure="Cost" })
model.SlotAt({= region="South", measure="Cost" })
model.Recalculate()
model.Slot(2, 2)
```

`.FormulaSheet(formulas, options)` accepts an optional stable `id` and default
`assignmentMode`:

```rix
model := .FormulaSheet(
    {:1x2: @{2}, @{ grid[1,1] + 1 }},
    {= id="budget", assignmentMode=":=" }
)
```

Document-owned presentation can be placed in the FormulaSheet `view` option.
It becomes the default whenever `.Sheet(model)` is rendered and round-trips
through `.rixcel`:

```rix
model := .FormulaSheet(
    {:2x1x2: @{1}; @{2} ;; @{3}; @{4}},
    {=
        id="named-model",
        view={=
            title="Scenario model",
            axes=["region", "measure", "scenario"],
            axisLabels=[
                ["North", "South"],
                ["Value"],
                ["Actual", "Forecast"]
            ],
            slice=[_, _, 2]
        }
    }
);
.Sheet(model)
```

Each slot then has a stable document ID such as `budget:slot:1:2`. `source` is
the authoritative editable RiX body, while `assignmentMode` is a separate
field. `SetSource` stores those fields, recompiles the body into deferred IR
inside the FormulaSheet, and starts the usual atomic graph epoch. `SetFormula`
remains the lower-level API for callers that already have a deferred value.

Formula source uses implied `:=`. An explicit leading assignment mode is split
from the authoritative body:

```rix
model.SetSource(1, 1, "10")       # source "10", mode :=
model.SetSource(1, 1, "::= 10")  # source "10", mode ::=
```

The interactive formula bar exposes the same choice as a selector and shows
the selected cell's exact computed value. Passing a separate mode that
conflicts with an explicit source prefix is an error rather than silently
discarding either choice.

Inside a formula, `near` addresses a relative rank-N coordinate and records an
ordinary dependency:

```rix
model := .FormulaSheet({:2x2:
    @{10}, @{ near[0,-1] + 1 };
    @{ near[-1,0] * 2 }, @{ near[0,-1] + near[-1,0] }
})
```

Offsets are relative to the current `index`. Out-of-range reads report the
origin and axis; `near[0,0]` is a normal self-cycle and is rejected.

Dollar indexing is the concise reactive API. It avoids exposing graph node
names:

```rix
$$total := $model[1,1] + $model[2,2];
$model[1,1] := @{10}
```

`$model[1,1]` reads that exact cell and records a dependency.
`$model[1,1] := @{...}` replaces its deferred formula. `$$model[1,1]` is the
raw cell identity when an observable handle is needed. Multiple indexed
updates may be placed in `${ ... }` to commit in one graph epoch.

`SetFormula` keeps the new deferred formula and begins a complete
recalculation. Successful results commit together. If evaluation fails, the
last committed values remain available and involved slots retain diagnostics.

This is deliberately distinct from `.Bind`: a Binding editor computes one new
value immediately, whereas a FormulaSheet owns source, compiled formulas, and
the dependency graph. In RiX Web and the notebook, Enter on a FormulaSheet
cell edits its stored formula body; the WidgetSession passes source and mode to
the FormulaSheet compiler, publishes a `sheet:formula` event, and refreshes all
dependent cells.

The versioned persistent `.rixcel` format is available:

```rix
saved := .RiXCelExport(model);
restored := .RiXCelImport(saved)
```

Version 1 stores stable IDs, dense rank-N shape, authoritative source,
assignment mode, and JSON-safe view metadata. Import validates and recompiles
source in a fresh FormulaSheet context, then rebuilds values and dependencies
through an initial epoch. Compiled IR and runtime caches are deliberately not
trusted or persisted. See the
[RiXCel format specification](../design/eval/rixcel-format.md). Browser
file-open/save, explicit imports, and sparse rank-N storage remain on the
implementation checklist.

## CSV and TSV interchange

Delimited import creates a rank-2 FormulaSheet whose cells contain literal
values, not executable foreign formulas:

```rix
table := .RiXCelImportCsv("""name,value
alpha,3
beta,4.5""", {= header=1, id="csv-table" });
.Sheet(table)
```

With `header=1`, the first record becomes cosmetic column labels. Empty fields
become `_`; integer and decimal fields become exact RiX numbers; other fields
become quoted RiX strings. A field beginning with `=` remains a string and is
also retained in slot view metadata as a non-executable `foreignFormula`.

`.RiXCelImportTsv` behaves the same way with tab separators. Computed rank-2
values can be emitted with `.RiXCelExportCsv(sheet)` or
`.RiXCelExportTsv(sheet)`. Delimited export is value-oriented; authoritative
RiX formulas and dependency structure remain available through `.RiXCelExport`.

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

Ordinary RiX dollar bindings are the concise layer over this runtime:

```rix
${
    $$source1 := 2;
    $$source2 := 3;
    $$target1 := $source1 + $source2;
    $$target2 := $target1 * 4
};

$source1 := 10;  # target1 is 13 and target2 is 52
```

The three forms are deliberately distinct:

- `name` reads the current value without recording a dependency.
- `$name` reads and records a dependency; on the left of `:=`, it replaces the
  cell's deferred definition while preserving identity.
- `$$name` retrieves cell identity; on the left of `:=`, it declares a new
  reactive cell. `$$alias := $$name` gives a new name to the same cell.

There is no source/computed declaration type at this layer. A definition with
no tracked reads behaves as an input; one with tracked reads is recomputed from
its dependencies. Redeclaring an existing `$$name` is an error. A plain
reactive read inside a reactive definition is allowed as an untracked snapshot
and emits a warning by default.

`${ ... }` is an immediate transaction, analogous in spelling to deferred
`@{ ... }`. It stages every reactive declaration and update in its body,
evaluates the affected closure once, then commits all results together. A
cycle or evaluation failure rolls back the whole reactive batch. Outside a
transaction, each `$name := ...` or `$$name := ...` is its own atomic epoch.
Bare `$` and `$$` retain their callable-self meanings; adjacency to an
identifier selects the reactive forms. An uppercase declaration whose value is
callable is a reactive function:

```rix
$$Scale := x -> x * $source;
Scale(4);                       # untracked function call
$Scale(4);                      # tracked function call
$Scale := x -> x + $source      # identity-preserving replacement
```

A reactive output is an ordinary named reactive value. Reading it as the final
result lets an interactive host observe the same node it renders:

```rix
$$source := 2;
$$target := $source * 4;
$$frag := .Text($target);
$frag;
$source := 3             # an observer of $frag redraws it as 12
```

FormulaSheet is a coordinate adapter over the same runtime. Dollar indexing
selects coordinate cell identities and places new definitions into the same
graph:

```rix
values := .FormulaSheet({:1x3: @{120}, @{40}, @{8}});

$$average := ($values[1,1] + $values[1,2]) / 2;
$$functionvalue := {;
    Scale(x) -> x * $values[1,3];
    Scale($values[1,1])
};

$$frag := .Fragment([
    .Sheet($values, {= title="Editable inputs" }),
    .Table(
        ["quantity", "value"],
        [
            ["Average of first and second", $average],
            ["Scale(first), where Scale(x) = x * third", $functionvalue]
        ]
    ),
    .Graphics.Graphic([260, 140], [
        .Graphics.Path(
            [[20, 120], [$values[1,1], $values[1,2]]],
            {= stroke="#4f46e5", width=3 }
        ),
        .Graphics.Circle(
            [$values[1,1], $values[1,2]],
            $values[1,3],
            {= fill="#f97316" }
        )
    ])
]);

$frag
```

The verbose `.ReactiveGraph` string API canonicalizes names to lowercase.
Dollar bindings preserve RiX identifier case, so `$$Scale` and `$$scale` are
distinct. A FormulaSheet graph reserves `grid`, `row`, `col`, and `index` for
its coordinate evaluation context.

`average` dynamically depends on the first two slots. `functionvalue` depends
on the first and third, even though the third read occurs inside a locally
defined function. Changing a formula marks its downstream nodes dirty,
recomputes those nodes in dependency order, and emits one commit. Cycles report
their complete graph path and preserve the last successfully committed values.

FormulaSheet and Binding implement the host-neutral `subscribe(listener)`
contract. A FormulaSheet is already reactive: `$values` returns that same
FormulaSheet while recording every slot as a dependency, whereas
`$values[1,2]` records only one coordinate. Plain `.Sheet(values)` constructs
from the current sheet without adding a whole-sheet dependency;
`.Sheet($values)` makes an enclosing reactive output rebuild after any slot
changes.

When RiX Web receives a direct final read such as `$frag`, it renders the
current Fragment and subscribes to that node. Each successful graph commit
replaces the portable output and remounts its interactive children. Removing
or rerunning the output disposes the old subscription. `.LiveView` remains
available as a verbose, explicit-source compatibility layer, but is not needed
for the normal named reactive-output pattern.

This contract is intentionally independent of the interaction that caused the
update. A formula editor uses `sheet:formula`; a future draggable Graphic point
can write a coordinate through a Binding. Both cause the same graph propagation
and observed-output redraw without making Graphics depend on spreadsheet code.
