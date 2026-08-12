# Stern–Brocot generated page

This example is the declarative companion to the prewritten page in
rix-web. Both versions use the pure RiX stern-brocot plugin.

Generate the standalone reactive page from the repository root:

    bun rix/bin/rix.js --out=rix/examples/stern-brocot/out \
        rix/examples/stern-brocot/stern-brocot-page.rix

The generated slice supports exact parent/child/root navigation, direct
fraction input, plain RiX formula-source input evaluated with exact `x` in a
fresh scope, a portable Graphic, and exact node, path, boundary,
continued-fraction, convergent, and visible-tree tables. Its responsive layout
uses the portable document style vocabulary rather than embedded HTML.

Parent, left, and right are arranged as a three-row navigation pad and expose
declarative ArrowUp, ArrowLeft, and ArrowRight shortcuts. The parent and both
child cards in the Graphic are also `.Graphics.Action` scene subtrees, so a
click, Enter, or Space dispatches a RiX action through the shared widget
protocol. ArrowDown is intentionally not a navigation action. Holding it
activates a declarative `.Controls.Hold` state that renders the graph and
formula-result labels as decimals; releasing it restores their fraction
spellings. This is cosmetic: the selected fraction, formula result, and exact
data remain unchanged. A box sets the maximum decimal digit budget from 1 through 80.
Terminating decimals and repeating decimals whose complete cycle fits the
budget stay naturally short rather than being padded to that length. Root
remains unbound.

Node-card widths and the Graphic coordinate width are derived from the exact
fraction strings, so deep nodes with long numerators and denominators remain
inside their boxes. The same Graphic includes a live formula-result card; it
updates with both the selected node and the formula source.

Pan/zoom, URL history, and dialog output remain host interaction work. The
prewritten page retains those native browser behaviors while the shared
protocols are developed.

The rix-web build publishes this page at `docs/stern-brocot-rix/` and the
prewritten hybrid at `docs/stern-brocot.html`.
