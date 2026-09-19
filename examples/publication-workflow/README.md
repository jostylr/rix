# Publication showcase

From the `rix` repository:

```sh
bun bin/rix.js publish examples/publication-workflow/build.json --out=tmp/publication-showcase
bun bin/rix.js publish examples/publication-workflow/build.json --profile=live --out=tmp/publication-live
bun bin/rix.js publish examples/publication-workflow/build.json --watch --out=tmp/publication-showcase
```

Review builds two documents at two named inputs. Each has HTML, Markdown, Quarto,
LaTeX, an inert output bundle, and PDF when `pdflatex` is installed. Missing native
output produces a readable `.unavailable.txt` artifact and a diagnostic. The live
profile ships its own runtime and initial result; open each `document.html` offline
or serve the output folder locally. Move the folder to verify that bundled media
and local scripts remain usable. No hosted publication is performed.

Inspect `manifest.json` for per-document diagnostics, source dependency hashes,
and every artifact checksum. Change one source while watch runs: only affected
inputs rebuild. Introduce a syntax error and the last successful output remains
in place. Correct it and the next build replaces the complete output.

Open `Notebook` as a native Notebook project, or ZIP its contents and open the
archive in Notebook Web. Choose the inherited `review` export profile. It creates
two named input variants and a Quarto website from the ordinary Markdown source.
