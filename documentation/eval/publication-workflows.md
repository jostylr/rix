# Publication workflows

Publication profiles define a repeatable document/input/target matrix. The CLI
builds retained RiX results. Notebook builds ordinary Markdown documents with
RiX cells and preserves the surrounding prose. Neither workflow publishes to a
remote service.

## CLI builds

Run the [complete showcase](../../examples/publication-workflow/README.md):

```sh
bun bin/rix.js publish examples/publication-workflow/build.json --out=tmp/publication
bun bin/rix.js publish examples/publication-workflow/build.json --profile=live --out=tmp/live
bun bin/rix.js publish examples/publication-workflow/build.json --watch --out=tmp/publication
bun bin/rix.js publish --capabilities
```

The JSON manifest uses `schema: "rix.publication-build@1"`, a `profiles` record,
`defaultProfile`, an output directory, and `documents`. Each document specifies a
unique `id` and a relative `.rix` `source`; optional `dependencies` declare extra
files to watch. `assetRoots` and `assetPackages` explicitly identify local media
roots already available to the CLI. No asset roots are granted by default. Source
paths cannot traverse outside the manifest directory. File/plugin reads otherwise
retain the existing trusted CLI host permissions.

Each profile selects `targets`, `plugins`, `live`, a partial publication `plan`,
and `inputs` mapping names to short RiX initialization programs. Documents may
override `inputs`. Each job runs its initialization and source once in an isolated
process; its final retained value is the publication. Source `.Out` declarations
are suppressed in this workflow: the profile defines the complete target set.
The existing `rix --out` command still executes explicit `.Out` declarations.

Outputs use `document-id/input-name/document.ext`, local content-addressed media,
and `source.rix-output.json`. `manifest.json` uses
`rix.publication-artifacts@1`, records artifact sizes and SHA-256 hashes, dependency
hashes and diagnostics per document/input/target. It has no timestamps and does
not expose absolute source paths. Repeated source builds produce the same
manifest; native compilers may embed their own timestamps in binary artifacts.

A target unavailable for a value or missing its native compiler produces
`document.ext.unavailable.txt` with the reason and text fallback. This is a visible
warning. Invalid source fails that document and prevents replacement of the
published directory; successful siblings remain reviewable through the returned
manifest. `--json` prints machine-readable diagnostics, and a failed one-shot
build exits unsuccessfully.

Watch mode tracks source, configured dependencies, operator files, loaded plugin
files and resolved media. Unchanged jobs reuse their last successful result.
Changes are debounced; superseded worker process groups are killed. An owned
output directory is replaced from a complete staging tree, with rollback if the
rename fails. Readers never see a partially written file set, although directory
replacement has a brief rename gap. An arbitrary pre-existing directory is never
replaced. A syntax error preserves the last successful build and watching resumes
when its input changes. `--watch-for=MS` optionally bounds an unattended watch run.

Default limits are 32 documents, 16 inputs per document, 8 targets, 256 matrix
entries, 2 MB per source, 64 MB output, 256 dependencies, 30 seconds per job and
5 minutes per build. The dependency hash budget is output budget plus one source
budget. Numeric profile fields can lower these budgets or raise them by at most
16 times their defaults. Live HTML additionally caps source at 1 MB and retained
animation at 120 frames; diagnostics identify truncation.

## Notebook profiles

Project and notebook TOML files can define named profiles:

```toml
default_export_profile = "review"

[export_profiles.review]
targets = ["html", "markdown", "quarto", "bundle"]
plugins = ["document"]

[export_profiles.review.plan]
theme = "compact"

[export_profiles.review.inputs.small]
source = "n := 3;"

[export_profiles.review.inputs.large]
source = "n := 7;"
```

Notebook profiles override project profiles with the same name; other project
profiles are inherited. A notebook may select an inherited default. Undefined
profiles are rejected before saving. Profiles survive ordinary note/project
renames and additions. Open Export and select a named profile; Custom targets
retains the existing export controls. Native Quick export uses the selected
default profile. Inputs execute as hidden setup cells in a fresh run per note.

The native host writes a staged directory and restores the old owned directory
if replacement fails. Browser exports create the complete ZIP before download.
Both include manifests, local media, separate graphic SVGs and output bundles.
Relative Markdown images inside the selected project are copied; external image
URLs remain inert text and produce a diagnostic. Native live profiles copy the
existing Notebook runtime and KaTeX locally; browser profiles currently provide
static initial results with an explicit warning for `live = true`.

Notebook time limits and cancellation are cooperative between document/target
steps; a currently synchronous cell cannot be interrupted by this exporter.
Host engine worker/cancellation work is tracked separately. Native files remain
within existing selected-directory grants; publication adds no process permission.

## Available targets

| Output | CLI | Native Notebook | Notebook Web |
| --- | --- | --- | --- |
| Markdown, HTML, Quarto, inert bundle | Source artifacts | Full Markdown document | Full Markdown document |
| SVG, TikZ, Canvas plan, glTF | Supported retained value produces source | SVG figures within document | SVG figures within document |
| LaTeX | Source document/figure; article and slides plans | Diagnostic plus Markdown fallback | Diagnostic plus Markdown fallback |
| PDF | `pdflatex`, with bounded reference reruns | Diagnostic plus Markdown fallback | Diagnostic plus Markdown fallback |
| PNG | `rsvg-convert` or ImageMagick | Diagnostic plus Markdown fallback | Diagnostic plus Markdown fallback |
| GIF and frame manifests | Retained frames; ImageMagick for binary GIF | Diagnostic plus Markdown fallback | Diagnostic plus Markdown fallback |
| Live HTML | Local runtime, CSP, no-JS snapshot, retained controls and incremental SVG | Existing local Notebook live runtime | Static result with diagnostic |
| Quarto compilation | Quarto source; invoke installed Quarto separately | Quarto source | Quarto source |

`publish --capabilities` reports native tool availability on the current machine.
No remote CDN is required by live CLI publication. Supported browser plugins are
bounded by the packaged runtime; unsupported plugin startup preserves the static
result and displays its diagnostic. See [live publication](live-publication.md),
[publication plans](publication-plan.md) and [portable assets](output-assets.md).
PDF/A, tagged PDF, embedded fonts and platform signing remain unverified; artifacts
do not claim those properties.
