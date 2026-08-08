# `.csv`

Exports core `Table` values and `rix.data.relation@1` relations as deterministic
CSV or TSV text. Exact integers and rationals are written canonically (`3/2`,
not a decimal approximation), missing cells are empty by default, and strings
use RFC-style double-quote escaping.

```rix
.Plugin.Load("csv");
table := .Table(["name", "value"], [["half", 1/2], ["unknown", _]]);
.csv.Render(table).Get("content");
```

Generic `.Render(table, "tsv")` selects a tab delimiter, and `.Out("data.tsv",
table)` uses the same alias. Options are:

| Option | Default | Meaning |
| --- | --- | --- |
| `delimiter` | comma, or tab for the `tsv` alias | One character, or `:comma`, `:tab`, `:semicolon`. |
| `newline` | `:lf` | `:lf` or `:crlf`. |
| `header` | `1` | Set to `0` to omit labels. |
| `finalNewline` | `1` | Set to `0` to omit the last record terminator. |
| `missing` | `""` | Text used for null cells. |

Nested collections, maps, graphics, and other non-scalar cells are rejected
instead of being flattened silently. Import, locale-specific decimals, and
streaming output are later phases.

