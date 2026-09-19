# Numeric presentation without changing values

The document plugin attaches `rix.numeric-presentation@1` to existing output
nodes. The mathematical tree remains the source of truth. Labels, tables,
grids, captions, controls and text alternatives use the same policy in HTML,
Markdown, Quarto, LaTeX, SVG, TikZ and Canvas. Child policies replace inherited
policies; changing a policy never recalculates a value.

```{.rix exec=true}
.Plugin.Load("document");
policy := .document.NumericPolicy({= notation=:decimal,decimalPlaces=2 });
report := .document.Present(.Fragment([
    .Paragraph(["Rounded: ",1/3,"; exact override: ",.document.Present(7/3,{= fraction=:mixed })]),
    .Table(["source","descending"],[[1/3,5/3:4/3]])
]),policy);
saved := .document.EncodeJSON(report);
.document.DecodeJSON(saved)[:value];
```

`Present(number, policy)` creates an ordinary Text record retaining the number;
`Present(output, policy)` retains the output's children by reference. The policy
and exact source are persisted separately by document JSON and portable bundles.
The rounded display is not a replacement for the source record. Include the
saved JSON/bundle when values need to be recovered from a publication.

| Option | Values and limits |
|---|---|
| `notation` | `exact` (default), `decimal`, `scientific`, `engineering`, `repeating` |
| `fraction` | `improper` (default) or `mixed`, using existing `2..1/3` spelling |
| `significantDigits` | 1–256, default 12 |
| `decimalPlaces` | 0–256 for decimal notation; omitted uses significant digits |
| `rounding` | `nearest-even` (default), `floor`, `ceil`, `toward-zero` |
| `locale` | `invariant` (default), `en-US`, `de-DE`, `fr-FR` |
| `grouping` | 0 or 1; default 0 |
| `maxPeriod` | 1–4096, default 1024; finite repeat discovery work |

These locale profiles are deterministic display adapters: they do not change
RiX parsing, decimal-point syntax, or mathematical identity. Localized display
strings need the source record for unambiguous recovery. Scientific notation
uses `E`; repeating decimals use the existing `0.1#6` grammar.

All exact rounding uses integer arithmetic, including very large numerators and
denominators. Source integer components are limited to 16,384 digits for this
display service. A rounded value carries `≈`. Exhausted period discovery falls
back to bounded decimal display with `[period limit]`. Formal Fraction values
always retain their original numerator and denominator, including under decimal
policies. Existing `.Format`/`_>` numeral formatting remains available separately.

Intervals preserve start/end order. Decimal/scientific endpoints round outward,
overriding scalar rounding choices; narrow intervals cannot collapse merely
because their nearest displays coincide. Certified approximations keep an
explicit certified enclosure; ordinary approximate inputs never acquire one.
Graphic geometry still uses the coordinate-lowering policy, separately from
this label policy. Exact coordinate disclosures retain their source strings.

Control labels may be formatted, but editable expression inputs retain the
original source text. Explicit custom control formatters still own nonnumeric
labels. This policy does not reinterpret literal strings, code, or TeX math.

Renderer options also accept `numericPolicy` for one export without changing
the saved tree. A persisted node policy overrides that export default.

```{.rix exec=true}
.Plugin.Load("document"); .Plugin.Load("markdown");
.markdown.Render(.Paragraph([1/3]), {=
    numericPolicy={= notation=:scientific,significantDigits=3 }
}).Get("content");
```

JavaScript hosts can use `createNumericPolicy`, `withNumericPresentation` and
`presentNumericValue`. The latter returns the original `value`, source spelling,
policy, display text, evidence category, rounding/exhaustion flags and interval
orientation/outward policy. It returns null for nonnumeric values. Unknown
options, invalid versions, excessive limits and nonfinite values fail clearly.
