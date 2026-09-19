---
title: Assemble a numbered report
description: Combine prose, an exact table, and a plot with portable cross-references.
theme: Data and documents
status: implemented
plugin: document
---

## Resolve references over a template and output nodes

The core `@"""…"""` language creates portable prose. `.document.Ref` can appear
inside an interpolation even when the labeled figure or table comes later.

```rix
.Plugin.Load("document");
.Plugin.Load("plot");
intro := @"""
h1: Results #results

p: The exact values are in @{.document.Ref("tbl-values")}. The fitted plot is @{.document.Ref("fig-curve")}.
""";
values := .document.Label("tbl-values", .Table(
    ["x", "x² - 1"],
    [[-1, 0], [0, -1], [1, 0]],
    {= caption="Selected exact values" }
));
curve := .document.Label("fig-curve", .Figure(
    .plot.Polynomial([1, 0, -1], [-2, 2]),
    "A fitted polynomial view"
));
report := .document.Report("Exact polynomial report", [intro, values, curve], {=
    author="RiX",
    theme=.document.Theme(:compact, {= accent="#275dad" })
});
report;
```

The report is still a core Fragment. Load any document renderer to export the
same numbered links and captions.

```rix
.Plugin.Load("markdown");
.markdown.Render(report).Get("content");
```

## Reuse a course-report template

The template stores presentation defaults while the report supplies its title
and children. Bibliography and asset values remain portable data; declaring an
asset does not read it.

```rix
.Plugin.Load("document");
bib := .document.Bibliography([
    {= key="knuth84", author="Donald Knuth", year=1984,
       title="Literate Programming" }
]);
assets := .document.AssetManifest([
    {= id="logo", path="images/logo.svg", mime="image/svg+xml",
       alt="Course logo", checksum="sha256:abc" }
]);
numbers := .document.Numbering({=
    style=:roman, tableStart=3, citationStyle="author-year"
});
course := .document.Template("course-report", {=
    author="Ada", theme=:compact, bibliography=bib, assets=assets,
    numbering=numbers,
    header=.document.Header(.Paragraph("Exact mathematics")),
    footer=.document.Footer(.Paragraph("Generated with RiX"))
});
discussion := .Paragraph([
    .Text("Compare "), .document.Citation("knuth84"), .Text(".")
]);
values := .Table(["x", "x² - 1"], [[-1, 0], [0, -1], [1, 0]]);
templated := .document.ApplyTemplate(course, {=
    title="Evidence report", children=[discussion, values]
});
[.document.Asset(assets, "logo"), .document.References(templated), templated];
```

## Isolate target-specific source

Raw target text is explicit and has a portable fallback. Generic HTML and text
views see only the fallback; a matching renderer may opt into the raw content
under its own policy.

```rix
.Plugin.Load("document");
latexOnly := .document.TargetMarkup(
    :latex,
    "\\newcommand{\\CourseName}{Exact Mathematics}",
    "[LaTeX preamble omitted]"
);
latexOnly;
```

## Save an inert report

The persisted tree keeps exact numbers, labels and asset declarations without
capturing an execution scope. Loading returns the value and visible diagnostics.

```rix
.Plugin.Load("document");
report := .document.Report("Saved results", [.Paragraph([.Strong("Exact"), 1/3])]);
savedReport := .document.EncodeJSON(report);
importedReport := .document.DecodeJSON(savedReport);
importedReport[:diagnostics];
importedReport[:value];
```

For live controls or editable Sheet views, save `.document.Snapshot(value)`.
The explicit snapshot retains the current display but removes callbacks and
reactive bindings. Opening the JSON never runs source or fetches assets.
