---
title: Transform an exact relation
description: Validate, filter, sort, and present a small exact dataset.
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
