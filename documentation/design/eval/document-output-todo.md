# Document blocks, inline content, and assets

::: {.callout-note title="Status — record layer implemented; template layer proposed"}
The executable output API now includes the block, inline, and asset records
specified below, with deterministic text and safe HTML rendering. The document
template directive and inline-markup grammar remains proposed; it must lower to
these records rather than create a second document representation.
:::

## Portable model at a glance

RiX document output should be a thin semantic document tree, not a reduced
HTML DOM. It records what a document *is*—a quotation, an ordered list, a
display equation, an image with alternative text—and leaves tags, layout,
file fetching, and media playback to a renderer. A portable record must not
contain a DOM node, a browser `File`, an object URL, a local absolute path, or
an open network handle.

| Family | Proposed values | Essential portable fields | Renderer responsibility |
|---|---|---|---|
| Blocks | `Section`, `List`, `ListItem`, `Quote`, `Callout`, `CodeBlock`, `MathBlock` | children, labels/metadata, semantic role | hierarchy, typography, numbering, syntax highlighting, equation layout |
| Inline | `Text`, `Emphasis`, `Strong`, `Code`, `Math`, `Link`, `LineBreak` | children or source, plus link destination where applicable | escaping, inline typography, link policy, line breaking |
| Assets | `Asset`, `Image`, `Audio`, `Video` | stable reference, MIME type, integrity/dimensions where known, required accessibility text | resolving/embedding media, playback, download policy, conversion or fallback |

### Block records

All block `children` are ordered block-output values unless a row says
otherwise. A `Section` is structural: it owns a heading level, title, stable
`id`, and children. It is not merely a `Fragment` with a heading placed first.
This lets HTML establish a section outline and lets PDF/Quarto build bookmarks.

| Constructor | Proposed shape | Contract |
|---|---|---|
| `.Section` | `{= level, title, children, id?, metadata? }` | `level` is 1–6; `title` is inline content; `children` are blocks. A renderer may synthesize the visible heading from the section. |
| `.List` | `{= ordered?, items, start?, tight?, style? }` | `items` are `ListItem`; `ordered` defaults to false; `start` is valid only for ordered lists. `tight` is a presentation hint, not a change to nesting or meaning. |
| `.ListItem` | `{= children, marker? }` | Holds one or more blocks, so an item can contain a paragraph, nested list, table, or callout. `marker` is an optional semantic identifier, never pre-rendered bullet text. |
| `.Quote` | `{= children, attribution?, cite?, id? }` | A block quotation. `attribution` is inline content; `cite` is an optional portable citation/reference string. |
| `.Callout` | `{= variant, title?, children, id? }` | An authored aside. Initial `variant` values: `note`, `tip`, `warning`, `caution`, `important`. `kind` remains the output-record discriminator. Renderers may theme the variant, but must preserve it and the title in a plain fallback. |
| `.CodeBlock` | `{= code, language?, caption?, id?, lineNumbers? }` | `code` is literal source text, never executed by rendering. `language` is an advisory identifier such as `rix`, `javascript`, or `text`. |
| `.MathBlock` | `{= source, notation=:tex, label?, id?, alt? }` | A display equation. The first notation is `tex`; the exact source is retained even when a host cannot typeset it. `alt` supplies a spoken/plain fallback when source alone is inadequate. |

### Inline records

`Paragraph.children`, `Heading.content`, `Section.title`, `Quote.attribution`,
`Callout.title`, and `Link.children` use the inline vocabulary. Plain RiX
values embedded there retain the existing deterministic text-format behavior;
they do not silently become a table, graphic, or arbitrary block. A constructor
must reject a block output placed directly in an inline sequence, which fixes
the current renderer behavior that text-formats every paragraph child.

| Constructor | Proposed shape | Contract |
|---|---|---|
| `.Text` | `{= value, style? }` | The literal/text-formatted leaf already implemented today. |
| `.Emphasis` | `{= children }` | Semantic emphasis, not a CSS italic request. |
| `.Strong` | `{= children }` | Semantic strong importance, not a CSS bold request. |
| `.Code` | `{= code }` | Literal inline code; it never parses or executes as RiX. |
| `.Math` | `{= source, notation=:tex, alt? }` | Inline math with preserved source and a textual fallback. |
| `.Link` | `{= href, children, title? }` | A link destination plus accessible inline label. Renderers apply their own URL and external-navigation policy. |
| `.LineBreak` | `{= }` | An intentional hard line break; ordinary source wrapping remains whitespace. |

### Asset records

`Asset` is a portable reference to bytes or to an application-managed asset,
not a replacement for `Graphic`. A `Graphic` remains a retained vector scene;
an asset can refer to a PNG, JPEG, WebP, PDF preview, generated plot raster,
audio, video, or another supported media resource.

| Constructor | Proposed shape | Contract |
|---|---|---|
| `.Asset` | `{= ref, mime, integrity?, bytes?, filename?, width?, height?, duration?, metadata? }` | `ref` is a relative package reference, content-addressed identifier, or approved URI scheme. `mime` is required. `integrity` is a content digest when known. Byte count, intrinsic dimensions, duration, and filename are optional metadata, not byte payloads. |
| `.Image` | `{= asset, alt, width?, height?, title?, caption?, id? }` | `asset` has an image MIME type; nonempty `alt` is required. Dimensions are display hints in CSS pixels or a declared unit, never a demand to resize source bytes. |
| `.Audio` | `{= asset, transcript?, title?, caption?, id? }` | `asset` has an audio MIME type. A transcript or descriptive fallback is required for publication/export; interactive hosts may additionally expose playback controls. |
| `.Video` | `{= asset, poster?, transcript?, title?, caption?, id? }` | `asset` has a video MIME type; `poster` is an optional image asset. A transcript or descriptive fallback is required. |

Asset resolution belongs to the host. A browser may allow package-relative
assets and approved `https` resources; a sealed notebook may resolve only
assets embedded in its document bundle; a CLI may print metadata and a local
reference. A renderer must fail clearly when policy denies a reference rather
than fetching it implicitly from the core evaluator.

## Renderer contract

The same tree should degrade honestly across targets.

| Value | HTML/live notebook | Markdown / Quarto | PDF | Terminal/plain text |
|---|---|---|---|---|
| `Section`, lists, quote | semantic HTML sections/lists/`blockquote` | native headings, lists, block quotes | document outline and typographic blocks | indentation, markers, and attribution lines |
| `Callout` | `<aside>`/role plus visible kind and title | Quarto callout when available; otherwise labeled block quote | styled aside with kind/title | `[Warning]`-style prefix followed by text |
| `CodeBlock` | escaped `<pre><code>`; optional host highlighter | fenced code block with language | monospaced/verbatim block with wrapping policy | fenced or indented literal source |
| `Math` / `MathBlock` | MathML/KaTeX/MathJax chosen by host | `$...$` / `$$...$$` TeX when supported | TeX engine or math layout system | source prefixed `math:` or supplied `alt` |
| `Link` | clickable anchor after URL-policy check | standard Markdown link | linked text or printed URL in notes | label followed by `<URL>` |
| `Image` | `<img>` with mandatory `alt` | Markdown image or Quarto figure | embedded image when resolvable | `[Image: alt — ref]` |
| `Audio` / `Video` | host controls plus transcript/description | linked asset and transcript; optional Quarto embed | poster/representative frame plus transcript/link | `[Audio]` / `[Video]` reference and transcript |

Unsupported rich media must retain a discoverable reference and accessibility
fallback. It must not disappear simply because the selected renderer cannot
play it.

## Proposed example

The following is deliberately a design example, not runnable RiX until these
constructors land. It shows constructor composition without injecting HTML.

```rix
photo := .Image({=
    asset=.Asset({=
        ref="assets/newton-portrait.jpg",
        mime="image/jpeg",
        integrity="sha256:example-digest",
        width=1200,
        height=800
    }),
    alt="A handwritten Newton iteration beside an exact rational interval",
    width=560,
    caption="Iteration notes preserved as a portable image asset"
});

recording := .Audio({=
    asset=.Asset({= ref="assets/explanation.ogg", mime="audio/ogg" }),
    title="Spoken explanation",
    transcript="The interval narrows at every exact Newton step."
});

report := .Section({=
    level=1,
    id="newton-report",
    title=[.Text("Newton report: "), .Math({= source="x^2 = 2" })],
    children=[
        .Paragraph([
            .Text("The "), .Emphasis("exact interval"),
            .Text(" is retained; see "),
            .Link({= href="https://example.invalid/method", children="the method note" }),
            .Text("."), .LineBreak(),
            .Strong("No floating-point state is stored.")
        ]),
        .Callout({=
            variant=:note,
            title="Display policy",
            children=[.Paragraph([.Text("Inline "), .Code(".Math"), .Text(" keeps its TeX source.")])]
        }),
        .Quote({=
            children=[.Paragraph("Truth is ever to be found in simplicity.")],
            attribution="Isaac Newton"
        }),
        .CodeBlock({=
            language="rix",
            caption="One exact update",
            code="next := (x + 2 / x) / 2;"
        }),
        .MathBlock({=
            source="x_{n+1} = \\frac{x_n + 2/x_n}{2}",
            notation=:tex,
            alt="x sub n plus one equals one half of x sub n plus two divided by x sub n"
        }),
        .List({=
            ordered=1,
            items=[
                .ListItem(.Paragraph("Start with an exact interval.")),
                .ListItem({= children=[
                    .Paragraph("Refine it."),
                    .List({= items=[.ListItem(.Paragraph("Keep the endpoint proof."))] })
                ]})
            ]
        }),
        photo,
        recording
    ]
});
```

An HTML host can render the image and audio controls after applying its asset
policy. Quarto can emit a native callout, fenced RiX code, TeX display math,
an image figure, and a transcript plus audio link. A PDF renderer can include
the image, typeset the equation, and append or link the transcript. A terminal
still shows the section, quote, list, code, equation source/alt text, image
alternative text, and audio transcript.

The same example can eventually have concise document-template spelling:

```text
h1: Newton report: @{.Math({= source="x^2 = 2" })} #newton-report

The *exact interval* is retained; see [the method note](https://example.invalid/method).

callout: note — Display policy
    Inline `.Math` keeps its TeX source.

quote: Isaac Newton
    Truth is ever to be found in simplicity.

code: rix
    next := (x + 2 / x) / 2;

math: tex
    x_{n+1} = \\frac{x_n + 2/x_n}{2}

ol:
    - Start with an exact interval.
    - Refine it.
        ul:
            - Keep the endpoint proof.
```

Template inline syntax lowers directly to the inline records above. It is a
small authoring convenience, not a second document representation.

## Template language proposal

The template language should be a compact RiX document notation, not a
Markdown clone. It has three jobs only: split text into blocks, recognize a
small fixed directive set, and lower inline runs plus `@{...}` holes into the
same output records available through constructors. It does not accept raw
HTML, arbitrary attributes, Markdown tables, reference links, code execution
fences, or a general extension grammar.

### What it borrows from Markdown—and what it does not

It borrows familiar *presentation* conventions: blank lines separate
paragraphs; indented bodies belong to a preceding block; `-` marks a list item;
and a code block has a language name followed by literal indented source. It
also borrows a deliberately narrow inline vocabulary:

| Source | Lowers to |
|---|---|
| `*text*` | `Emphasis` |
| `**text**` | `Strong` |
| `***text***` | nested `Strong(Emphasis(...))` |
| `` `source` `` | `Code` |
| `$tex$` | `Math` |
| `[label](link: primary {attributes})` | `Link` |
| `[alt](image: primary {attributes})` | `Image` (when inline images are enabled) |

It does **not** borrow CommonMark's many precedence rules. `# title`, fenced
code, reference links, raw HTML, and Markdown tables remain literal text. The
block directive is still `h1:` through `h6:`, never `#`. A compact `Doc`
tagged-backtick spelling can be added as an alias later; `@\"\"\"...\"\"\"` stays the
initial template literal so ordinary RiX backticks remain available to RiX.

Delimiters are strict rather than clever: matching delimiters are required,
crossing or unclosed delimiters are errors, and only emphasis/strong may nest.
Code and math take their bodies literally apart from interpolation. A backslash
escapes the following delimiter or a backslash outside code/math; it has no
meaning inside code/math.

`***text***` is the one compact nesting shorthand and lowers to nested strong
and emphasis semantics. Runs of four or more asterisks are rejected as ambiguous;
write explicit nested pairs when that meaning is wanted.

### Grammar

The following is the proposed initial grammar. `INLINE` is scanned as literal
text interleaved with holes; it is not a general expression grammar.

```text
DOCUMENT       := (BLANK | BLOCK)*
BLOCK          := STANDALONE_HOLE | DIRECTIVE_BLOCK | PARAGRAPH
DIRECTIVE_BLOCK := DIRECTIVE ":" HEADER? LABEL? (NEWLINE INDENT BODY)?
PARAGRAPH      := INLINE (NEWLINE INLINE)*
BODY           := BLOCK | LIST_ITEM_LINE
LIST_ITEM_LINE := "-" SPACE INLINE (NEWLINE INDENT BODY)*
DIRECTIVE      := "h1" … "h6" | "p" | "section" | "fig" | "table"
               | "quote" | "callout" | "code" | "math" | "ul" | "ol" | "slide"
               | "asset" | "image" | "audio" | "video"
STANDALONE_HOLE := SPACE* HOLE SPACE*
HOLE           := "@{" RIX_SOURCE "}"
LABEL          := SPACE "#" IDENTIFIER
```

Indentation is four spaces per document level; tabs are rejected. A blank line
ends a paragraph but does not change the indentation stack. Only the directive
names above are special at the start of a physical line, so prose such as
`Note: this is text` remains a paragraph.

`h1:` through `h6:` introduce `Section` records in a template. A lower-numbered
or equal heading closes the current section and starts a sibling/ancestor;
a higher-numbered heading starts a child section. Skipping a level is an error
(`h1:` directly to `h3:`), which keeps the resulting tree obvious. Direct
`.Heading(...)` and `.Section(...)` constructors remain available when a
caller needs to construct the records explicitly. `section:` is the explicit
alternative with header form `section: LEVEL TITLE #id` and an indented block
body.

`ul:` and `ol:` own their marker semantics. Both use `-` body markers; the
enclosing directive determines whether they become bullets or numbered items.
Nested content is indented one additional level under an item. This avoids the
extra grammar and renumbering rules needed for accepting both `-` and `1.`
markers everywhere.

`quote:` accepts an optional attribution header and a block body. `callout:`
uses `callout: VARIANT — TITLE`, where `VARIANT` is one of the five callout
variants and the em dash/title portion is optional. `code: LANGUAGE` makes its
indented body literal source. `math:` makes its indented body TeX. Both still
recognize holes, so a calculated value can be inserted into literal source or
TeX.

Asset directives use `image: PRIMARY {attributes}`, `audio: PRIMARY
{attributes}`, `video: PRIMARY {attributes}`, or the generic `asset:` form.
The primary is an asset reference; `{attributes}` supplies a required MIME type
and semantic metadata such as `alt`, `width`, `height`, `caption`, or
`transcript`. In the inline form `[text](type: primary {attributes})`, `text`
is visible link content for `link:` and alternative text for `image:`. Audio
and video remain block constructs; inline audio/video syntax is rejected rather
than silently selecting a player or a link rendering.

### `@{...}` interaction

The scanner recognizes a hole by finding balanced RiX braces while respecting
RiX string, backtick, comment, and nested-container syntax. The body is handed
unchanged to the normal RiX parser/evaluator; the document parser never
interprets RiX operators or names.

| Hole location | Accepted value | Lowering rule |
|---|---|---|
| A line containing only one hole | any block output, `Fragment`, table, graphic, or other existing output | splice the output value as one block child; a raw value becomes `Paragraph(Text(...))` |
| Inside paragraph/directive header text | raw RiX value or inline output | raw value uses deterministic text formatting; inline output is inserted as that inline node; block output is an error |
| `fig:` / `table:` body | one standalone output hole | use it as the figure content; no string fallback |
| `code:` or `math:` body, inline code, inline math | raw RiX value | format the value as literal source/TeX text; output values are errors |

`@@{` escapes to the literal characters `@{` in every context, including code
and math. Outside code/math, backslash escapes the next delimiter or a
backslash. Inside code/math it is ordinary content, so TeX and source spelling
are preserved.

An attribute map is deliberately smaller than a RiX expression map: it is a
comma-separated `name=value` list inside `{...}`. Attribute values may be a
quoted string, number, bare word, or hole. A primary ends at whitespace, `{`,
or `)`; quote it when it needs spaces. Unknown attributes are errors for the
built-in type. This is sufficient for portable asset metadata without turning
the document parser into a second RiX parser.

The template scanner should evaluate each hole in document order, so it sees
the normal lexical scope and cannot reorder effects. It should first build a
small block/inline token tree with source ranges, then evaluate holes while
lowering. That makes diagnostics point to the directive, indentation, or RiX
hole that failed.

### Parser cost and boundary

This is a linear scanner over the template plus normal RiX parses for each
hole. It needs an indentation stack, blank-line tracking, a fixed directive
lookup, a short stack of the currently open inline delimiters, and a
tokenizer-aware balanced-hole reader. It does *not* need CommonMark's delimiter
algorithm, link/reference resolution, HTML block rules, table alignment
grammar, or an arbitrary extension parser. Nested lists and sections are the
only recursive document structures; both follow indentation or heading level
directly.

The parser replaces the initial paragraph/heading/figure/table splitter behind
compatibility tests. The built-in directive registry remains fixed by default
so prose cannot become syntax due to a loaded plugin. A control panel remains
ordinary RiX output inserted through `@{panel}`; a `panel:` directive would hide
the important relationship between the panel and its reactive values.

## Implementation checklist

### 1. Lock the shared schema

- [x] Add runtime constructors for block, inline, and asset records with map
  and positional forms only where positional form stays unambiguous.
- [x] Introduce `isInlineOutput` and `isBlockOutput` classification. Preserve
  existing `.Text` compatibility while rejecting block children in `Paragraph`.
- [ ] Define stable JSON serialization tags and exact-value rules for every
  record before persistence APIs ship.
- [x] Add required-field validation for nonempty image alt text, asset MIME
  type, valid section level, and valid list nesting. Publication-level
  audio/video transcript enforcement remains a host/export policy.
- [ ] Define URI/reference policy hooks in hosts; keep resolution and fetching
  out of the evaluator and output record.

### 2. Implement basic static rendering

- [x] Extend deterministic text formatting for every new value, including
  indentation, source/alt fallbacks, and links.
- [x] Extend the HTML renderer with escaped semantic markup and no implicit
  remote asset fetching.
- [ ] Add Markdown/Quarto rendering adapters with explicit unsupported-media
  fallbacks; add PDF through that shared document path rather than a separate
  incompatible tree.
- [ ] Add renderer tests proving a paragraph preserves inline semantics rather
  than text-formatting `Emphasis`, `Link`, `Math`, or `Code` children.

### 3. Add document-template support

- [x] Implement `quote:`, `callout:`, `code:`, `math:`, `ul:`, `ol:`, and
  asset directives as fixed entries that lower to shared block records.
- [x] Define strict heading-to-section nesting and list-body indentation.
- [x] Add strict inline lowering for emphasis, strong, code, math, links, and
  images, including `@{...}`/`@@{` rules.
- [x] Keep standalone `@{...}` block splices distinct from inline holes.

### 4. Integrate media safely

- [ ] Add host asset stores for RiX Web, Notebook, and RiXCel with package-
  relative/content-addressed references and explicit external-URL approval.
- [ ] Add image dimensions, lazy-loading, caption/figure integration, and
  missing-asset diagnostics.
- [ ] Add audio/video controls only in capable hosts; render transcript and
  reference everywhere else.
- [ ] Add end-to-end examples covering a generated plot raster, image asset,
  audio transcript, and PDF/Quarto export.

### 5. Documentation and accessibility

- [ ] Add a runnable tutorial once the first constructors are implemented.
- [ ] Test keyboard navigation and screen-reader names for links and media;
  test MathBlock plain-language fallbacks.
- [ ] Document export lossiness explicitly whenever a target cannot embed a
  media type, preserve a link, or typeset the chosen math notation.
