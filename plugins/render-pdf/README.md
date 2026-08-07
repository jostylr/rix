# `.pdf`

Orchestrates portable documents, figures, and static slide content through the
LaTeX/TikZ lowering and a host PDF compiler. The CLI uses `pdflatex`, returns
the original PDF bytes, and records the toolchain. Interactive controls and
timelines must already have a static representation.

Use `.pdf.Render(document)` in a capable host or `.Out("report.pdf", document)`
with the CLI. Browser hosts without a compiler report
`pdf-toolchain-unavailable`.
