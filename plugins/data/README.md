# `.data`

Creates immutable, typed, in-memory relations without converting exact RiX
values to JavaScript numbers. It includes schema-checked rows, projection,
predicate filtering, stable sorting, joins, grouping and exact aggregation,
calculated columns, explicit missing-value handling, bounded row sources, and
a portable core `Table` view.

```rix
.Plugin.Load("data");
scores := .data.Relation([
    {= id="name", type=:String },
    {= id="score", type=:Rational }
], [["Ada", 7/8], ["Grace", 5/6]]);
bestFirst := .data.Sort(scores, ["score"], {= descending=1 });
.data.TableView(bestFirst, {= caption="Exact scores" });
```

Public operations are `Relation`, `Project`, `Rename`, `Distinct`, `Filter`,
`Sort`, `Join`, `Group`, `Aggregate`, `Frequency`, `Contingency`, `Calculate`,
`Missing`, `RowSource`, `ParseJSONL`, `RenderJSONL`, `Collect`, `TableView`,
`Schema`, and `Rows`. A filter or calculated-column function receives `(row, oneBasedIndex,
relation)`; `row` is a map keyed by schema ID. Sort is stable, accepts one or
more column IDs, puts missing values last by default, and supports
`descending=1` and `missingFirst=1`.

`Join(left,right,keys,options)` supports `:inner`, `:left`, `:right`, and
`:full` joins. Keys may be a shared column sequence or a map from left IDs to
right IDs. Missing keys do not match unless `missingMatches=1`; colliding
right-side names use `_right` or the requested suffix.

`Group(relation,keys)` returns `rix.data.groups@1`. `Aggregate` accepts specs
such as `{= id="average",column="score",op=:mean }`; operations are `count`,
`sum`, `mean`, `min`, `max`, and `first`. The `skip`, `propagate`, and `error`
aggregate missing policies are explicit. Exact sums and means remain exact.

`Missing` applies `:drop`, `:error`, or `:fill`. `RowSource(schema,producer,
{= maxRows=... })` plus `Collect` provides a deliberately bounded pull source;
it does not imply an unbounded or asynchronous stream.

`ParseJSONL(schema,text,options?)` scans line boundaries once and returns the
same bounded `rix.data.row-source@1` protocol. Individual JSON records are not
parsed until pulled. `maxRows` defaults to 1000, blank physical lines are
skipped unless `blankLines=:error`, and diagnostics retain physical line
numbers. Objects use schema column IDs; arrays use schema order.

`RenderJSONL(relationOrSource,options?)` writes one deterministic object per
line. Integer, Rational, and Interval cells use `$integer`, `$rational`, and
`$interval` tags so no exact value passes through a JSON number. Rendering a
RowSource pulls no more than its bound or the explicit `limit`. The result is a
string; permission-aware filesystem/network sinks remain host work rather than
an evaluator side effect.

```rix
schema := [
  {= id="n",type=:Integer,nullable=0 },
  {= id="ratio",type=:Rational,nullable=0 }
];
source := .data.ParseJSONL(schema, """{"n":{"$integer":"1"},"ratio":{"$rational":["1","3"]}}
{"n":{"$integer":"2"},"ratio":{"$rational":["2","3"]}}
""");
.data.RenderJSONL(.data.Collect(source,2));
```

Schema types are `Any`, `Integer`, `Rational`, `Number`, `Interval`, and
`String`. An `Interval` column accepts `RationalInterval` values and exact
Integer/Rational points. Its grouped sum and mean use interval arithmetic;
minimum and maximum return the tight endpoint ranges across all admissible
measurements. Interval keys compare and group by their exact endpoint pairs.
Columns are nullable unless `{= nullable=0 }` is specified. Unknown columns,
duplicate IDs, row-width mismatches, and incompatible cell types are errors.

`Frequency` returns a relation of counts and exact proportions. `Contingency`
returns `rix.data.contingency@1` with row/column levels, the count matrix,
margins, and total.

The semantic schemas are `rix.data.relation@1`, `rix.data.groups@1`,
`rix.data.contingency@1`, and `rix.data.row-source@1`. Renderers may consume a relation directly;
`.data.TableView` is for portable presentation and does not replace it.
