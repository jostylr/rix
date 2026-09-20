# RiXCel named regions and block formatting

RiXCel v3 records named regions and formatting as sparse history events. Bounds
are inclusive numeric coordinates with one entry per tensor axis, including
hidden plane axes. They never change formulas, exact values, dependency targets,
or the numeric `grid[...]` addresses. A name is navigation metadata, not a new
formula variable or implicit reference alias.

```rix
sheet := .FormulaSheet([[@{1/3}, @{2}], [@{3}, @{4}]]);
sheet := sheet.SetRegion("Summary", [1,1], [2,2]);
sheet := sheet.FormatRegion([1,1], [2,2], "" {"bold":true,"numberFormat":"decimal","precision":2} "".Slice(2,-1));
.Sheet(sheet)
```

`SetRegion(name,start,end)` and `FormatRegion(start,end,styleJSON)` return a new
sheet. Keep that result; the original sheet is unchanged. Delete a name with
`sheet := sheet.SetRegion("Summary", _, _)`. Region names contain 1–64 ASCII
letters, digits or underscores and start with a letter. At most 256 names may
exist. Redefining a name replaces its bounds.

The JSON style whitelist is `bold`/`italic` (boolean), `color`/`background`
(`#RRGGBB`), `align` (`left`, `center`, `right`), `numberFormat` (`exact`,
`decimal`), and `precision` (0–20 decimal places). Later format layers override
individual properties; a null property clears an earlier property. Arbitrary
CSS and HTML are rejected. Formatting the full extent of a sparse tensor
records one event without allocating its cells. There may be at most 10,000
format layers and at most 10,000 total history events.

HTML Sheet output includes visual styles. Shared text output honors numeric
formatting; text cannot express colors or font styles. Decimal displays use
nearest-even rounding and mark rounded values with `≈`. The formula editor,
source history and exported numeric values retain the exact value. Detached
static Sheet snapshots retain their per-cell formatting. Editable widget value
updates use the same numeric display policy as their initial rendering.

For a host, the two event payloads are:

```json
{"type":"view:region","name":"Summary","start":[1,1,2],"end":[4,5,2]}
{"type":"view:format","start":[1,1,2],"end":[4,5,2],"style":{"bold":true}}
```

A deletion sets both `start` and `end` to null. Replay exposes names under
`view.regions` and ordered format layers under `view.formats`.
`rixCelCellFormat(view,index)` resolves a cell's style without materializing the
region. Validation rejects reversed, out-of-bounds or wrong-rank bounds before
publishing the edit. Formatting and names participate in undo/redo and history
branching. Insertion before a region shifts its bounds; insertion strictly
inside it expands the region to include the new coordinates; insertion after
its end leaves it unchanged. Formatting ranges follow the same rule.
