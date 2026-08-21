---
title: Transform and combine exact relations
description: Validate, join, aggregate, derive, and present exact relational data.
theme: Data and documents
status: implemented
plugin: data
---

## Keep exact cells through a relation

The relation validates its schema without turning rational values into binary
floating point. Transformations return new relations, so the original remains
available.

```rix
.Plugin.Load("data");
measurements := .data.Relation([
    {= id="name", label="Sample", type=:String, nullable=0 },
    {= id="value", label="Exact value", type=:Rational }
], [
    ["alpha", 7/8],
    ["beta", _],
    ["gamma", 5/6]
]);
known := .data.Filter(measurements, row -> row["value"] != _);
ordered := .data.Sort(known, ["value"], {= descending=1 });
.data.TableView(ordered, {= caption="Known measurements" });
```

`Project` chooses and orders columns explicitly. `Rows` returns row maps when
you need to inspect the transformed semantic value rather than its Table view.

```rix
names := .data.Project(ordered, ["name"]);
.data.Rows(names);
```

Relations can go directly to the CSV renderer without passing through a Table
or losing exact values.

```rix
.Plugin.Load("csv");
.csv.Render(ordered).Get("content");
```

## Join and aggregate

Join keys are explicit. A full join retains unmatched rows, while grouping
and aggregation keep rational totals and means exact.

```rix
.Plugin.Load("data");
sales := .data.Relation(["team", {= id="amount", type=:Rational }], [
    ["red", 1/3], ["blue", 2/3], ["red", 5/3]
]);
labels := .data.Relation(["team", "label"], [
    ["red", "R"], ["blue", "B"], ["gold", "G"]
]);
joined := .data.Join(sales, labels, ["team"], {= type=:full });
totals := .data.Aggregate(.data.Group(sales, ["team"]), [
    {= id="count", op=:count },
    {= id="total", column="amount", op=:sum },
    {= id="average", column="amount", op=:mean }
]);
.Fragment([
    .data.TableView(joined, {= caption="Full join" }),
    .data.TableView(totals, {= caption="Exact grouped values" })
]);
```

## Make missing values and finite sources explicit

`Missing` never guesses a policy. `RowSource` is pull-based and capped by
`maxRows`; `Collect` may impose a smaller cap.

```rix
.Plugin.Load("data");
raw := .data.Relation(["name", {= id="value", type=:Rational }], [
    ["a", 1/2], ["b", _], ["c", 3/2]
]);
filled := .data.Missing(raw, ["value"], :fill, 0);
derived := .data.Calculate(filled, {= id="double", type=:Rational },
    (row) -> 2*row["value"]
);
source := .data.RowSource([{= id="n", type=:Integer }],
    (index) -> [index],
    {= maxRows=10 }
);
[.data.Rows(derived), .data.Rows(.data.Collect(source, 3))];
```

## Preserve interval-valued measurements

An `Interval` column keeps bounded measurement uncertainty through exact
grouped aggregation. The result encloses every total, mean, minimum, and
maximum consistent with the input rows.

```rix
.Plugin.Load("data");
measured := .data.Relation([
    {= id="batch",type=:String,nullable=0 },
    {= id="distance",type=:Interval,nullable=0 }
],[["a",9:11],["a",23/2:25/2],["a",12:16]]);
summary := .data.Aggregate(.data.Group(measured,["batch"]),[
    {= id="mean",column="distance",op=:mean },
    {= id="minimum",column="distance",op=:min },
    {= id="maximum",column="distance",op=:max }
]);
.data.Rows(summary);
```

`Rename` and `Distinct` support cleaning, while `Frequency` and `Contingency`
produce the standard categorical summaries.
