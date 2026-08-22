# `.pdf`

Orchestrates portable documents, figures, and static slide content through the
LaTeX/TikZ lowering and a host PDF compiler. The CLI uses `pdflatex`, returns
the original PDF bytes, and records the toolchain. Interactive controls and
timelines must already have a static representation.

Use `.pdf.Render(document)` in a capable host or `.Out("report.pdf", document)`
with the CLI. Browser hosts without a compiler report
`pdf-toolchain-unavailable`.

The optional host regression test compiles
[`pdf-page-fixture.rix`](../../examples/renderers/pdf-page-fixture.rix), renders
its first page through Poppler, and checks page geometry plus nonblank ink
coverage without treating compiler-specific PDF bytes as a stable golden.

Phase 2 selects `document`, `figure`, or `slides` profiles, page size, PDF
metadata/bookmark policy, placement, and TikZ/SVG/PNG figure lowering. The
result records packages, pages, delegated assets, and reported fonts; an absent
font report is a visible diagnostic.
