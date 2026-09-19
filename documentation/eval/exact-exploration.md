# Exact exploration

The public JavaScript exports `createExactNumberLineGraphic`,
`traceExactArithmetic`, `exactExplorationInterval`, and
`boundedExactExplorationInterval` compose existing exact Core arithmetic and RiX
syntax. They do not add a second parser or invoke user functions to inspect an
expression.

## Portable number lines

```javascript
import { Rational, RationalInterval } from "@ratmath/core";
import { createExactNumberLineGraphic, renderGraphicSvg } from "@ratmath/rix";

const scene = createExactNumberLineGraphic([
  { id: "point", label: "One third", value: new Rational(1, 3) },
  { id: "bounds", label: "Reversed", value: new RationalInterval("2/3", "1/3") },
]);
const svg = renderGraphicSvg(scene, String);
```

The scene is an ordinary `Graphic`. Its coordinates are normalized in rational
arithmetic before renderer rounding. Tiny widths and huge magnitudes therefore
survive normalization. Original start/end values and orientation remain in the
retained plot series and SVG description, independent of the display profile.
The shared graphic tools provide keyboard selection, pan/zoom, coordinate
rounding disclosure, and a complete text table.

Number lines retain at most 64 records by default, configurable from 1 to 256.
The `exploration` metadata reports omitted records. Each endpoint's numerator
and denominator together must fit the 16,384-bit inspection budget. Values
outside the limit produce an explicit error; the caller retains the original
exact value. This helper does not alter that value.

A host can attach plain `explorationText` metadata with bounded provenance or
related exact-number facts. SVG descriptions include this inert text, escaped
as XML. It is never interpreted as markup or executable source.

## Bounded arithmetic evidence

`traceExactArithmetic(source, resolveLeaf, options)` accepts one expression and
calls `resolveLeaf` only for numeric literals, ordinary variable names, and
reactive reads such as `$width`. The resolver must return the current exact
Core value (or a result response with a `value` field). Hosts should read
reactive snapshots without recomputing formulas. RiX Web uses `readExactLeaf`
for this contract and captures the trace when a numeric response is produced.
Opening an older output therefore retains its original arithmetic snapshot.

The traversal handles grouping, unary `+`/`-`, and binary `+`, `-`, `*`, `/`, and
interval construction `:`. Calls, assignments, control flow, and unsupported
operators produce an unresolved step and are never replayed. This is an
arithmetic explanation, not a complete evaluator event log. Endpoint edits
have separate current results; they do not rewrite the captured explanation.

Each retained step records its source, dependencies, exact result, interval
width, and evidence status. Interval results are certified enclosures under
Core interval arithmetic. Width growth is disclosed without claiming that
repeated dependencies supply independent evidence. A divisor containing zero
is undefined; that status propagates through enclosing arithmetic. Missing or
unsupported operands remain unresolved.

The defaults are 64 visited nodes, 16 levels, and 8,192 source characters.
Callers can choose at most 256 nodes and 32 levels. Exact leaf/result endpoints
use the same 16,384-bit budget as number lines. Exhaustion retains partial
steps and a visible diagnostic. No unbounded evaluation history is collected.

## Web integration and acceptance

RiX Web adds presentation-only dashboard pins/groups and 64-snapshot histories
for at most 128 reactive identities. Histories hold canonical exact strings;
source values above 8,192 UTF-8 bytes remain available as current values but
are omitted from history. Pins/groups round-trip through session files;
histories are ephemeral, deduplicated observations at dashboard refreshes.
They are not an event log of every graph mutation while the view is closed.

Rational points link to existing public Fraction/continued-fraction services
for Farey parents, mediants, Stern–Brocot paths, convergents, and exact errors.
The Web bridge defaults to 128 path steps and 32 convergents (absolute maxima
256 and 64), with visible truncation/exhaustion. It reuses the existing
Stern–Brocot pages. No user-session function is invoked for linked inspection.

Run `bun test tests/tools/exact-exploration.test.js` in RiX and the Web short
profile for focused contracts. The optional Web
`scripts/check-exact-exploration-browser.js` exercises the actual calculator
with installed Chromium/Playwright, including SVG/HTML/text downloads, source
reinsertion, keyboard focus, undefined results, history limits, saved
presentation, reduced motion, and a narrow viewport at 200% zoom. Set
`RIX_PLAYWRIGHT_MODULE` and `RIX_CHROME_EXECUTABLE` when dependencies are outside
the Web package; the script never downloads browser dependencies. Artifacts
are written under the Web repository's `tmp/exact-exploration-browser/`.
