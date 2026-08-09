# Stern–Brocot generated page

This example is the declarative companion to the prewritten page in
apps/webcalc. Both versions use the pure RiX stern-brocot plugin.

Generate the standalone reactive page from the repository root:

    bun rix/bin/rix.js --out=rix/examples/stern-brocot/out \
        rix/examples/stern-brocot/stern-brocot-page.rix

The first generated slice supports exact parent/child/root navigation, direct
fraction input, callable formula input, a portable Graphic, and exact node,
path, boundary, continued-fraction, convergent, and visible-tree tables.

Clickable Graphic nodes, pan/zoom, URL history, and dialog output remain host
interaction work. The prewritten page retains those native browser behaviors
while the shared protocols are developed.
