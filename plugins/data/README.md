# `.data`

Creates immutable, typed, in-memory relations without converting exact RiX
values to JavaScript numbers. Phase 1 is intentionally small: schema-checked
rows, projection, predicate filtering, stable sorting, and a portable core
`Table` view.

```rix
.Plugin.Load("data");
scores := .data.Relation([
    {= id="name", type=:String },
    {= id="score", type=:Rational }
], [["Ada", 7/8], ["Grace", 5/6]]);
bestFirst := .data.Sort(scores, ["score"], {= descending=1 });
.data.TableView(bestFirst, {= caption="Exact scores" });
```

Public operations are `Relation`, `Project`, `Filter`, `Sort`, `TableView`,
`Schema`, and `Rows`. A filter predicate receives `(row, oneBasedIndex,
relation)`; `row` is a map keyed by schema ID. Sort is stable, accepts one or
more column IDs, puts missing values last by default, and supports
`descending=1` and `missingFirst=1`.

Initial schema types are `Any`, `Integer`, `Rational`, `Number`, and `String`.
Columns are nullable unless `{= nullable=0 }` is specified. Unknown columns,
duplicate IDs, row-width mismatches, and incompatible cell types are errors.

The relation schema is `rix.data.relation@1`. Renderers may consume that
semantic value directly; `.data.TableView` is for portable presentation and
does not replace the relation.

