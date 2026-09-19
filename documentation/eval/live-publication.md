# Static and live publication

A live publication starts with the complete rendered result in its HTML. With
JavaScript disabled, unavailable, or blocked, the same initial mathematical
result and its text alternatives remain available. Browser startup adds the
existing controls, viewport, selection, linked panels, and timeline tools. A
startup error is reported beside the retained result without replacing it.

The supported authoring pattern is an ordinary reactive output returned by a
tracked read. For example:

```rix
$$radius := 3;
$$view := .Fragment([
    .ControlPanel([.Controls.Slider($$radius, 1:8, 1, "Radius")]),
    .Graphics.Graphic([120, 80], [
        .Graphics.Circle([60, 40], $radius, {= id="circle", fill="#0c7b7f" })
    ])
]);
$view
```

Use explicit semantic IDs when a mark should retain its identity across
updates. The generated page uses the public observed-result contract; it does
not subscribe to an unrelated first reactive read or replay the entire program
for each slider movement.

## Packaging API

`@ratmath/rix/live-publication/node` exports:

```javascript
const { content, assets, diagnostics, descriptor } = await buildLivePublication({
    value, source, sourcePath: "measurement.rix", title: "Measurement",
    plugins: [], format, assetPrefix: "assets/measurement",
});
```

Write `content` to the output HTML file and each `assets` map entry relative to
that HTML file's directory. Use a unique stable `assetPrefix` per source page.
Batch builders can call `buildLiveRuntimeAssets()` once and pass its map as
`runtimeAssets` for each document. These APIs return data; they do not publish
files or grant the browser filesystem/process access. Runtime bundling uses
Bun and the repository's checked-in browser entry and styles.

The pure `@ratmath/rix/live-publication` helpers produce inert descriptions of
retained interaction identities and existing event/protocol names. They do
not serialize bindings, callbacks, evaluator contexts, or subscriptions.
Ordinary graphic descriptors refer to `rix.viewport@1` and `rix.selection@1`;
editable marks use `graphic:position`/`graphic:action`, controls use
`control:set`, and timelines retain `rix.timeline-view@1`.

Output traversal is limited to 10,000 nodes and 64 levels. Timeline lowering
retains at most 120 frames by default, reports truncation, and preserves the
exact first frame and its original per-frame timing. Markers and semantic
keyframes beyond the retained range are omitted. Source is limited to 1,000,000 UTF-8 bytes, and plugin
preloads to 128 safe catalog names. Hosts can lower these limits. The deprecated
LiveView wrapper continues through its existing runtime protocol; new
publications should use the tracked `$view` form above.

## Offline resources and content policy

The HTML references local configuration, runtime, and stylesheet files. Its
configuration is an external JavaScript data assignment, with no inline
script, dynamic evaluation, or startup fetch. Only the source filename is
retained for diagnostics; the exporting machine's absolute source path is not
included as a source URL. Both a local static server and a `file://` page work.

The emitted content security policy allows scripts only from the publication's
own origin. It blocks network connections, frames, objects, forms, and base URL
changes. Local/data images and local/blob media are permitted. Inline styles
remain enabled for the existing retained-output style attributes; inline
scripts remain blocked. External media references require an explicitly
authorized host policy or local asset packaging before use. Browser plugin
permissions remain those of the existing browser catalog: bundling does not
make native file/process services available.

## Incremental SVG updates

Generated live pages opt into the shared mount's `incrementalSvg` option.
Matching passive path, circle, rectangle, line, polygon, and text nodes are
retained by semantic ID and updated in place. Duplicate IDs, shape changes,
and exhausted matching budgets fall back to replacement. At most 10,000 old
marks are considered in one update.

Interactive SVG roots, drag targets, action handlers, and controls mount fresh
listeners from the new output snapshot. This prevents callbacks from retaining
obsolete bindings or firing twice. Their semantic IDs, selected mathematical
objects, viewport state, open disclosure sections, and focused controls are
restored through the existing shared widget protocol. Exact coordinates and
rounding disclosures update with the scene.

Run `bun test tests/eval/live-publication.test.js tests/tools/output-widgets.test.js`
for contracts. `scripts/check-live-publication-browser.js` uses locally
installed Chromium/Playwright (optional `RIX_PLAYWRIGHT_MODULE` and
`RIX_CHROME_EXECUTABLE`) to verify disabled JavaScript, CSP, offline startup,
retained SVG identity, repeated control/drag updates, stable selection/focus,
and preservation of the static result after a startup failure. It writes
artifacts only under `tmp/live-publication-browser/`.
