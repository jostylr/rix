---
title: Export exact rows as CSV
description: Produce quoted CSV and TSV without decimalizing rational cells.
theme: Renderers and exporters
status: implemented
plugin: csv
---

## Quote text and preserve exact values

CSV quotes fields containing commas, quotes, or line breaks. Rationals keep
their exact numerator and denominator, and missing cells remain empty.

```rix
.Plugin.Load("csv");
table := .Table(["label", "value", "note"], [
    ["""comma, quote "yes"""", 3/2, "ordinary"],
    ["missing", _, """two
lines"""]
]);
.csv.Render(table).Get("content");
```

Use the `tsv` target alias for tabs, or choose CRLF records explicitly when a
consumer requires them.

```rix
.Render(table, "tsv").Get("content");
.csv.Render(table, {= newline=:crlf }).Get("content");
```
