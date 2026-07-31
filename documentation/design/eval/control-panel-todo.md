# Reactive control panels

## Contract

Control panels are host-rendered interactive output values. They do not create
an alternate state system. A RiX author declares state with the ordinary
reactive dollar syntax, passes the resulting identity to a control, and reads
the state with the same syntax used everywhere else:

```rix
$$x := 3;
$$view := .Fragment([
    .ControlPanel([
        .Controls.Slider($$x, 0:10, 1, "x")
    ], "Parameters"),
    .Text(@"x² = @{$x^2}")
]);
$view
```

The user-facing API must not require `.ReactiveGraph()`, `.Source(...)`, or a
second declaration mechanism. `$$x := value` declares the identity, `$x`
tracks a read, and a control edit replaces the same definition as if the
program had evaluated `$x := value`.

Controls emit semantic records rather than DOM events:

```js
{
  type: "control:set",
  controlId: "reactive:x:slider",
  targetId: "reactive:x",
  index: 4,
  source: "range"
}
```

The host-owned widget session validates and converts that record to an exact
RiX value, updates the reactive definition, and lets the ordinary dependency
graph refresh a named reactive `Fragment`, `Graphic`, `Table`, or other output.

## Checklist

### First usable slice

- [x] Confirm that controls use `$$name` identities declared with dollar syntax.
- [x] Define `.ControlPanel(controls, title?)` as an output container.
- [x] Define `.Controls.Slider($$target, interval, step, label?)` with a complete map form.
- [x] Preserve exact integer/rational values by rendering slider positions as integer indices.
- [x] Route `control:set` through a host-owned `ControlPanelWidgetSession`.
- [x] Make control edits replace the target definition like `$name := value` and report removed dependencies.
- [x] Provide HTML and text fallbacks.
- [x] Mount panels nested in `Fragment`, `Figure`, `Slide`, and `Slides` output trees.
- [x] Restore control focus after a reactive output rerender.
- [x] Add constructor, session, rendering, and host-enhancer tests.
- [x] Assign the new capabilities to the `Controls` sandbox group.

### Next controls

- [x] Add an exact number/expression input with host-supplied RiX source evaluation.
- [x] Add a choice/select control whose options retain RiX values.
- [x] Add a toggle control with explicit on/off RiX values rather than JavaScript booleans.
- [x] Add a range control backed by one exact interval-valued reactive identity.
- [x] Add a reset action with an explicit initial-value snapshot.
- [x] Add a runnable RiX Web tutorial and extend it alongside each control.

### Panel behavior

- [x] Keep dependency replacement explicit in warning metadata; disabled/read-only controls provide the non-replacing alternatives without a host-specific confirmation dialog.
- [x] Add panel descriptions, per-control help, disabled/read-only state, and validation messages.
- [x] Define atomic multi-control commits through `${ ... }` transaction semantics.
- [x] Add an optional staged/submit mode only if a transactional form workflow is needed.
- [x] Define portable serialization that omits runtime handles but retains target IDs and current-value snapshots.
- [x] Define static Markdown, Quarto, PDF, and no-JavaScript snapshots.

### Display formatting

- [x] Keep the reactive value exact and store formatted display snapshots separately.
- [x] Accept a named `format` map such as `{= value=Mixed }` rather than positional formatter arguments.
- [x] Support `value`, `low`, `high`, and `step` for sliders.
- [x] Support `value`, `start`, `end`, `low`, `high`, and `step` for interval ranges.
- [x] Support `value` and `option` for choices; explicit option labels take precedence.
- [x] Support `value`, `off`, and `on` for toggles, plus `value` and `initial` for resets.
- [x] Run formatter functions while rebuilding the reactive output snapshot so renderers do not need an evaluator.

### Accessibility and hosts

- [x] Verify range keyboard behavior, focus restoration, labels, and live value announcements in RiX Web and RiX Notebook.
- [x] Add shared control-panel styling to RiX Web, RiX Notebook, and standalone RiXCel hosts.
- [x] Exercise panels in live HTML and Quarto export.
- [x] Add an end-to-end example combining controls, a reactive table, and a draggable graphic.

## Atomic and staged commits

`ControlPanelWidgetSession` accepts a `control:batch` record whose `changes`
are ordinary semantic control edits. The session resolves and validates every
candidate first, rejects duplicate targets and cross-graph batches, then sends
literal deferred updates to the target graph's `applyBatch`. The dependency
closure is therefore recomputed once, and a failure leaves every prior formula
and value in place. This is the host-side equivalent of one `${ ... }`
transaction; it is not an alternate graph API exposed to RiX authors.

A panel with `mode=:staged` keeps validated candidate edits in its widget
session. Apply commits the most recent candidate for each target through the
same batch path. Discard clears the candidates and restores the native-control
previews. Immediate mode remains the default.

## Snapshot and export contract

`panel.Snapshot()` and the host helper `createControlPanelSnapshot(panel)`
produce an inert output value. Each control retains its semantic kind, target
ID, exact current value, exact bounds/options, formatted display snapshots,
labels, help, and validation message snapshot. Reactive-node and validator
function handles are removed, and the native controls render disabled with
`data-rix-interactive="false"`.

`serializeControlPanel(panel)` wraps that detached value in versioned
`rix.control-panel` JSON. Exact integers, rationals, intervals, maps, and
sequences use explicit JSON records, so no `BigInt` or floating-point coercion
is required. `renderControlPanelStaticHtml` supplies the no-JavaScript HTML
form, while `renderControlPanelMarkdown` supplies document source usable
unchanged by Markdown and Quarto HTML/PDF pipelines.

Native range inputs retain the browser's keyboard behavior and accessible
labels. Dual-handle ranges restore focus to the edited endpoint after a
reactive rerender; staged Apply restores action focus. The remounted panel's
polite live region receives the committed value or atomic-apply announcement.
RiX Web and RiX Notebook style the same semantic class names, and standalone
RiXCel includes the RiX Web output stylesheet during its build.

The runnable **Reactive control panels** tutorial exercises immediate and
staged panels in live HTML, inert export snapshots, and a final reactive
Fragment containing a control panel, table, and draggable Graphic.
