# Graphic coordinate disclosure

Graphics retain exact mathematical sources even when a display cannot distinguish
them. In Web and Notebook, open **Text alternative**, then **Coordinate rounding
and uncertainty** to inspect every retained coordinate. The table gives the source,
displayed SVG decimal, outward bounds, and ascending/reversed interval order. It
also explains precision, rounding, collision sets, and explicit clip regions.
Labels that overlap remain separate semantic objects and retained text entries.

This view consumes the renderer's `rix.svg.coordinate-lowering@1` metadata; hosts
do not calculate a second rounding policy. Exact input and certified enclosure
bounds remain distinct from approximate input. The outward expansion applies to
exact geometry, not a claim that floating-point inputs have become certified.
Clipping is reported as an explicit retained operation; it does not infer that
every clipped object disappeared or that ordinary label overlap is equality.

SVG exports retain a plain-text `<desc>` and escaped, inert `<metadata>` with the
same sources and policy. HTML exports retain the complete text/table view without
JavaScript. Canvas plans expose `accessibility.coordinateDisclosure`, `textPlan`,
and `text`. Their coordinate disclosure describes the SVG reference lowering;
the `numericPolicy` explicitly states that Canvas uses approximate binary numbers
and does not certify an outward pixel enclosure. Interval coordinates are drawn
at their midpoint while the original interval and orientation remain available.
PNG RenderResult metadata already retains `coordinateLowering`; raster pixels
alone do not preserve the full text alternative.

Keyboard controls use the shared viewport/selection protocol. `[` and `]` select
objects; Alt+arrow keys move between spatial neighbors; arrows pan, `+` and `-`
zoom, and Home resets. Search and the object selector remain available for dense
scenes. Reactive replacements preserve open disclosures, the focused toolbar or
semantic identity, and selected-object text. Removed identities are cleared;
focus restoration does not interrupt an unrelated editor. Repeated unchanged
status messages do not trigger new live-region writes, and pointer movement
updates the non-live inspector. Reduced-motion styling is shared by both hosts.

## Verification

`tests/tools/graphic-coordinate-disclosure.test.js` covers large exact ratios,
intervals narrower than floating-point display, reversed intervals, rounding
collisions, labels, clipping, approximate inputs, and HTML escaping. The shared
viewport tests include 256 deterministic pan/zoom/responsive transform cases.
The fixture source is `tests/fixtures/graphic-coordinate-scenes.js`.

Run `bun scripts/check-graphic-accessibility-browser.js` with an installed
Playwright module. If it is supplied externally, set `RIX_PLAYWRIGHT_MODULE` to
its entry module; `RIX_CHROME_EXECUTABLE` may select an installed Chromium binary.
No browser or dependency is downloaded. This check mounts the shared Web and
Notebook output contract, exercises keyboard selection, 64× view zoom, reactive
focus, reduced motion, and 360px layout at 200% CSS zoom, and saves viewport
screenshots and an accessibility-tree snapshot below `tmp/`.

The browser checks verify DOM/ARIA behavior; they do not substitute for a user
study or a manual audit with each operating system's screen reader.
