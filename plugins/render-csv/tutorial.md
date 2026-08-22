---
title: Exact, typed CSV interchange
description: Import typed measurements, inspect provenance, stream rows, and export without losing exact values.
theme: Renderers and exporters
status: implemented
plugin: csv
---

## Quote text and preserve exact values

CSV quotes fields containing commas, quotes, or line breaks. Canonical mode
keeps exact numerator/denominator text and missing cells remain empty.

```rix
.Plugin.Load("csv");
table := .Table(["label", "value", "note"], [
    ["""comma, quote "yes"""", 3/2, "ordinary"],
    ["missing", _, """two
lines"""]
]);
.csv.Render(table).Get("content");
```

TSV selects tabs automatically. CRLF is always an explicit choice.

```rix
.Render(table, "tsv").Get("content");
.csv.Render(table, {= newline=:crlf }).Get("content");
```

## Import typed measurements

The schema makes conversion auditable: identifiers stay text, masses become
exact rationals, and measurement bounds become rational intervals. The locale
policy is part of the call, not hidden machine configuration.

```rix
.Plugin.Load("data");
schema := [
    {= id="sample", type=:String, nullable=0 },
    {= id="mass", type=:Rational },
    {= id="bounds", type=:Interval }
];
source := """# instrument: scale-7
# unit: kg
sample;mass;bounds
A;1,25;1,2:1,3
B;;2:2
""";
measurements := .csv.Parse(source, schema, {=
    delimiter=:semicolon,
    decimal=:locale,
    locale="de-DE"
});
.data.Rows(measurements);
```

The result contains `5/4`, the interval `6/5:13/10`, and a missing mass—not
binary floating approximations. Inspect the retained comments and indexed
`key: value` metadata:

```rix
.csv.Sidecar(measurements);
.csv.Sidecar(measurements).Get("metadata");
```

## Pull a bounded stream

Use the shared RowSource protocol when downstream work needs only a prefix or
should avoid constructing a second full Relation. Typed conversion happens as
each row is pulled.

```rix
stream := .csv.ParseStream(source, schema, {=
    delimiter=:semicolon,
    decimal=:locale,
    locale="de-DE"
});
.data.Rows(.csv.Collect(stream, 1));
.Render(stream, :csv, {= limit=1 }).Get("content");
```

## Choose decimal output consciously

Locale mode can represent `3/2` exactly as `1,5`. It refuses `1/3`, because a
finite decimal would not equal the known exact value. Canonical mode remains
the lossless fallback.

```rix
.csv.Render(.Table(["value"], [[3/2], [10005]]), {=
    delimiter=:semicolon,
    decimal=:locale,
    locale="de-DE",
    grouping=1
}).Get("content");
```

```rix
.csv.Render(.Table(["value"], [[1/3]]), {= decimal=:locale });
```

## Make exceptional nesting visible

CSV is flat. The default error names the exact nested cell. If a consumer
expects JSON-in-CSV, opt in; exact nested numbers receive lossless tags and the
RenderResult records a diagnostic.

```rix
flattened := .csv.Render(
    .Table(["payload"], [[{= estimate=1/3, flags=["exact", "reviewed"] }]]),
    {=
        flatten=:json,
        metadata={= source="tutorial" },
        comments=["nested payload is intentional"]
    }
);
flattened.Get("content");
flattened.Get("diagnostics");
```
