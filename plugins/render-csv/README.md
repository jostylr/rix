# `.csv`

Schema-aware CSV and TSV interchange for core `Table` values,
`rix.data.relation@1` relations, and `rix.data.row-source@1` streams. Phase 2
adds typed import, explicit locale/decimal rules, bounded streaming rows,
comment/metadata sidecars, and opt-in nested-cell flattening with diagnostics.

## Exact export

```rix
.Plugin.Load("csv");
table := .Table(["name", "value"], [["half", 1/2], ["unknown", _]]);
.csv.Render(table).Get("content");
```

Canonical mode is the default and never decimalizes exact rationals. Locale
mode writes only terminating decimals, so it cannot silently approximate an
exact value such as `1/3`:

```rix
.csv.Render(.Table(["value"], [[3/2], [10005]]), {=
    delimiter=:semicolon,
    decimal=:locale,
    locale="de-DE",
    grouping=1
}).Get("content");
```

Supported locale names are `invariant`, `en-US`, `de-DE`, and `fr-FR`.
`decimalMark` and `groupMark` can override their marks. A locale decimal mark
may not equal the delimiter; decimal-comma files should use semicolon or tab.
No ambient operating-system locale is consulted.

## Typed import

`.csv.Parse(text, schema?, options?)` returns a `.data` Relation. With an
explicit schema, header labels are validated and every cell is converted to
`String`, `Integer`, `Rational`, `Number`, or `Interval`. `Any` deliberately
imports as text to avoid inference surprises. Empty text is missing by default.

```rix
.Plugin.Load("csv");
.Plugin.Load("data");
schema := [
    {= id="name", type=:String, nullable=0 },
    {= id="mass", type=:Rational },
    {= id="bounds", type=:Interval }
];
source := """# instrument: scale-7
name;mass;bounds
sample A;1,25;1,2:1,3
sample B;;2:2
""";
relation := .csv.Parse(source, schema, {=
    delimiter=:semicolon, decimal=:locale, locale="de-DE"
});
.data.Rows(relation);
.csv.Sidecar(relation);
```

Without a schema, the header supplies unique column names and every column is
nullable `String`. Use `header=0` with an explicit schema for headerless input.
`headerPolicy` accepts `:labels` (default), `:ids`, or `:ignore`. `missing` may
be one token or a sequence of tokens. RFC-style quotes, doubled quotes,
embedded newlines, LF, and CRLF are accepted; malformed quotes report their
physical line.

Lines beginning with `comment` (`#` by default) are omitted from the rows and
retained in `rix.csv.sidecar@1`. Comments shaped as `key: value` are also
indexed in the sidecar metadata map. Set `comment=""` to disable this rule.

## Bounded row streams

`.csv.ParseStream` has the same arguments as `.csv.Parse`, but returns the
standard `.data` RowSource protocol. Record boundaries and the sidecar are
read once; typed cells are converted when their one-based row is pulled.

```rix
stream := .csv.ParseStream(source, schema, {=
    delimiter=:semicolon, decimal=:locale, locale="de-DE"
});
.csv.Collect(stream, 1);                    # Relation containing one row
.csv.Render(stream, {= limit=1 });          # render without a Relation copy
.data.Collect(stream, 1);                   # same shared RowSource protocol
```

The source is finite and publishes its row bound. Rendering a RowSource uses
that bound unless a smaller nonnegative `limit` is supplied.

## Sidecars and flattening

Export can prepend sorted metadata and ordered comments:

```rix
.csv.Render(table, {=
    metadata={= source="lab", revision=2 },
    comments=["reviewed exact measurements"]
});
```

Nested cells are rejected with a row/column path by default. `flatten=:json`
serializes them as deterministic JSON and emits one `csv-flattened-cell`
diagnostic per affected cell. Exact nested values use tagged objects such as
`{"$rational":"1/3"}` rather than lossy JSON numbers. This is cell
serialization, not relational normalization or automatic unflattening.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `delimiter` | comma, or tab for TSV | One character, `:comma`, `:tab`, or `:semicolon`. |
| `newline` | `:lf` | Export records as `:lf` or `:crlf`. |
| `header` | `1` | Read/write a header record. |
| `headerPolicy` | `:labels` | Import validation by labels, ids, or ignored header. |
| `finalNewline` | `1` | Include the final export record terminator. |
| `missing` | `""` | Export marker or import marker/sequence. |
| `skipBlank` | `1` | Ignore blank import records. |
| `comment` | `"#"` | Record-start comment prefix; empty disables comments. |
| `comments` | none | Ordered export comment sequence. |
| `metadata` | none | Sorted scalar export metadata map. |
| `decimal` | `:canonical` | Canonical fraction text or exact `:locale` decimals. |
| `locale` | `invariant` | Explicit locale profile; never inherited from the host. |
| `decimalMark`, `groupMark` | locale profile | Explicit locale mark overrides. |
| `grouping` | `0` | Add export digit groups in locale mode. |
| `flatten` | `:reject` | Reject nested cells or use tagged `:json`. |
| `limit` | source bound | Maximum rows pulled while rendering a RowSource. |
