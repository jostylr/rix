# Portable images, audio, and video

An `Asset` declares a reference and MIME type. `Image` adds required alternative
text; `Audio` and `Video` can retain a transcript, title, and caption. Declaring
or importing any of these values performs no I/O.

```{.rix exec=true}
picture := .Image({=
    asset=.Asset("assets/diagram.png", "image/png"),
    alt="Two exact intervals on a number line",
    caption="The intervals overlap"
});
recording := .Audio({=
    asset=.Asset("assets/explanation.ogg", "audio/ogg"),
    title="Explanation", transcript="The shared interval is nonempty."
});
.Fragment([picture, recording]);
```

The host resolves bytes only when explicitly exporting a bundle. Web REPL,
Notebook engine, and RiXCel evaluation sessions expose `exportOutputBundle(value)`
and `importOutputBundle(json)`. The result has `document`, `manifest`, a `files`
Map of relative paths to bytes, `html`, and `text`; exports also return `json`.
These are host JavaScript APIs, not ambient filesystem capabilities granted to
RiX code. Web and RiXCel currently expose them to embedding applications.
Notebook's native and browser publication exports use the same resolver for
structured output and copy its assets beside the exported note.

## Host grants

Import `createMemoryAssetStore`, `bundleOutputDocument`, `encodeOutputBundle`,
and `decodeOutputBundle` from `@ratmath/rix/output-assets` (also exported from
the main and runtime entry points). A memory store sees only preloaded entries:

```javascript
const store = createMemoryAssetStore(new Map([
    ["assets/diagram.png", selectedImageBytes],
]));
const bundle = await bundleOutputDocument(output, { store });
const json = encodeOutputBundle(bundle);
const restored = await decodeOutputBundle(json); // no host or network calls
```

Node hosts can import `createNodeAssetStore` from
`@ratmath/rix/output-assets/node`. Its `roots` are explicitly granted filesystem
directories. Its `packages` map binds package IDs to granted directories.
`contentPaths` maps `sha256:<hex>` references to paths within those grants.
Real paths must remain inside the selected root; traversal and symlink escapes
are rejected. The ordinary Node host adapter starts with **no asset roots**;
embedders can supply `assetRoots`, `assetPackages`, and `assetContentPaths`.
Browser adapters accept an `assets` map or explicit `assetStore`.

References can be safe relative paths, `package:figures/diagram.png`, or a
lowercase `sha256:` digest with 64 hexadecimal digits. Paths cannot contain
absolute roots, traversal segments, backslashes, whitespace, URL escapes,
queries, or fragments. Package and content references must exist in the chosen
host store. Notebook stores use their existing selected-directory/ZIP grant;
publication export does not request a broader path scope.

HTTP(S) references remain links by default. A trusted host may supply both
`authorizeExternal(ref, asset)` and `store.readExternalAsset(ref, limits)`.
Fetching requires an explicit `true` authorization. The resolver does not
implement a network client or create a new network permission. Host readers
must enforce the supplied `maxBytes` and honor the abort signal. An authorized
external image is copied into the bundle and becomes a local reference.

## Validation and portable bundles

The resolver checks supported MIME signatures, declared byte counts, content
hashes, intrinsic image dimensions, and finite budgets. Supported local formats
are PNG, JPEG, GIF, static SVG, WAV, MP3, Ogg audio, MP4, WebM, UTF-8 text, JSON,
and PDF. These checks identify containers and dimensions; playback still uses
the host's installed media decoder. Unsupported formats get a readable
placeholder and a source-path diagnostic. SVG assets must be self-contained:
active content, external resources, stylesheet blocks, and entity/CSS escapes
are rejected.

Defaults are 128 assets, 16,000,000 bytes per asset, 64,000,000 unique asset
bytes, 16,000,000 image pixels, 32,768 units per image dimension, and a 5,000 ms
limit for each host read or authorization. Options `maxAssets`, `maxAssetBytes`,
`maxTotalBytes`, `maxPixels`, `maxDimension`, and `maxReadMs` can lower these or
raise them by at most sixteen times. `documentLimits` passes separate limits to
the [inert document codec](document-persistence.md). A failed asset remains
visible as `unavailable`, with its source path and reason in the manifest.

Resolved paths are `assets/<sha256>.<extension>`. Identical bytes share one
file even when multiple declarations reference them. `Asset.integrity` accepts
`sha256:<hex>` or standard `sha256-<base64>`; exported records use the hex form.
This hashes asset bytes only and does not define mathematical document signing.

`rix.output.bundle@1` contains an inert `rix.output.document@1`, a
`rix.output.asset-manifest@1`, and a sorted base64 file list. Each manifest entry
is `resolved`, `reference`, or `unavailable`. Import checks hashes, byte budgets,
MIME/dimensions, and agreement between files, manifest, and document. It never
reads an original path, fetches a URL, evaluates saved source, or installs a
plugin. The JSON envelope schema at `schemas/output-bundle.schema.json`
describes its default shape; the runtime performs the semantic checks.

## Rendering and moving an export

HTML images load lazily, use their declared accessible name, and use intrinsic
dimensions when no display dimensions are supplied. An explicit width or
height keeps the other dimension automatic. Audio/video have native keyboard
controls, an accessible name, no automatic preload, and visible transcripts.
External media is a link without a network-loaded `src`. Captions and
transcripts survive Markdown, Quarto, and LaTeX. Static formats use links for
audio/video. Portable LaTeX embeds PNG/JPEG; unsupported image formats retain
an accessible link and a diagnostic.

Write the `files` Map beside `html`/Markdown/LaTeX, preserving its relative
paths. The single JSON bundle can also be moved and imported before extracting
its verified file map. Notebook exports write a `<note>.rix-output.json`
sidecar for structured publications and the same content-addressed files in
each selected output directory. Ordinary notebook Markdown assets retain the
existing project-copy behavior.

The executable host example `examples/documents/portable-assets.mjs` builds a
self-contained SVG image bundle from a generated RiX graphic. Host integration
tests additionally generate a PNG, include a selected local image and audio
transcript, move the export, remove the original asset folder, disable network
access, and import into fresh Web, Notebook, and RiXCel sessions.
