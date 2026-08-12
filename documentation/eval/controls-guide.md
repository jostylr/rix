# Reactive controls reference

Controls are portable output values backed by ordinary `$$` reactive
identities. Browser hosts turn them into native controls; the control session
converts every edit back to an exact RiX value and replaces the target identity.

## Setup

```rix
$$a := 1;
$$center := 1/2;
$$view := .Fragment([
    .ControlPanel([
        .Controls.Slider($$a, -5:5, 1, "a"),
        .Controls.Slider($$center, -3:3, 1/2, "center")
    ], "Parameters"),
    .Paragraph(@"a = @{$a}; center = @{$center}")
]);
.Out("index.html", $view)
```

The target argument must be a `$$` identity. Passing a number, expression, or
plain `$value` is rejected because the host would not know what to update.

## Constructors

All controls accept the complete map form. Positional forms below are
conveniences.

| Constructor | Positional form | Essential map fields |
| --- | --- | --- |
| Slider | `.Controls.Slider($$x, interval, step?, label?)` | `target`, `interval`, `step` or `steps` |
| Input | `.Controls.Input($$x, label?, help?)` | `target`, `placeholder` |
| Choice | `.Controls.Choice($$x, options, label?)` | `target`, `options` |
| Toggle | `.Controls.Toggle($$x, off, on, label?)` | `target`, `off`, `on` |
| Range | `.Controls.Range($$window, interval, step?, label?)` | interval-valued `target`, `interval` |
| Reset | `.Controls.Reset($$x, initial, label?)` | `target`, `initial` |
| Action | map form recommended | `target`, `action`, `label` |
| Hold | map form recommended | `target`, `key`, `pressed`, `released` |

Choice options can be raw values or `{= value=..., label="..." }` maps. An
Action receives the current target value and returns its replacement:

```rix
$$history := [];
.Controls.Action({=
    id="save",
    target=$$history,
    action=items -> items ++ [$a],
    label="Save a"
})
```

Input controls normally evaluate committed text as a RiX expression before
replacing their target. Set `inputMode=:text` when the target itself is source
text, a search query, a label, or another literal string. The host then commits
the typed characters without evaluating them:

```rix
$$formulaSource := "x^2 - 1/2";
.Controls.Input({=
    target=$$formulaSource,
    label="Formula in x",
    inputMode=:text
})
```

## ControlPanel

`.ControlPanel({= controls=[...], title=..., description=... })` groups
controls into an accessible output region. `mode="staged"` holds valid edits
until the user presses Apply; immediate mode is the default. Staged controls
must target one ReactiveGraph.

Common optional fields on every control are:

| Field | Meaning |
| --- | --- |
| `id` | Stable ID for styling and host events. |
| `label`, `help` | Accessible visible label and explanatory text. |
| `format` | Map of formatter callables for displayed fields, without changing exact values. |
| `validate` | Callable returning `_` for valid or an error string. |
| `disabled`, `readOnly` | Block local edits. |
| `shortcut` | Action-only `KeyboardEvent.key` shorthand such as `"ArrowLeft"`. |
| `style` | Renderer-neutral presentation hints. |
| `metadata` | Opaque renderer/plugin data. |

## Styling

The bundled HTML renderer understands `style` values `variant` (`"primary"`,
`"danger"`, `"quiet"`), `density` (`"compact"`, `"comfortable"`), and
`width` (`"auto"`, `"compact"`, `"full"`). Controls in a grid panel may also
use integer `row` and `column` positions from 1 through 4. Panel styles apply in this order:
`all`, `kinds`, `ids`, then the individual control’s style.

```rix
.ControlPanel({=
    style={=
        layout="grid",
        columns=3,
        all={= density="compact" },
        kinds={= action={= variant="primary" } },
        ids={=
            parent={= row=1, column=2 },
            left={= row=2, column=1 },
            right={= row=2, column=3 }
        }
    },
    controls=[...]
})
```

An Action opts into root-scoped keyboard navigation by naming `shortcut`:

```rix
.Controls.Action({=
    id="left",
    target=$$current,
    action=value -> LeftChild(value),
    label="Left child",
    shortcut="ArrowLeft"
})
```

The generated-page host routes shortcuts through the rendered button, so the
same validation, widget event, reactive update, and focus-restoration path is
used. Shortcuts are ignored while the user is editing an input, select,
textarea, or content-editable region. The root containing the mounted output
is the shortcut scope; a host using the low-level helpers can install the same
behavior once with `enhanceControlShortcuts(root)`.

For a temporary state that lasts only while a key is down, use a Hold control:

```rix
$$decimalPreview := _;
.Controls.Hold({=
    id="decimal-preview",
    target=$$decimalPreview,
    key="ArrowDown",
    pressed=1,
    released=_,
    label="Hold ↓ for decimals"
})
```

The browser host commits `pressed` once on keydown and `released` on keyup,
even when the pressed-state update rerenders the panel. Key-repeat events do
not produce repeated commits. Like Action shortcuts, Hold keys are ignored
while the event target is an input, select, textarea, or content-editable
region. The key is declarative `KeyboardEvent.key` data; other hosts can map
the same two exact values to touch, pointer, controller, or assistive input.

Unknown style and metadata fields remain on the portable control output for
other hosts/plugins to interpret.

## Mutable collections and `.Touch()`

Prefer replacing a collection with a new value, for example
`items -> items ++ [entry]`. In-place mutations such as `Push!` do not publish
deep reactive changes automatically. After an intentional batch of mutation,
call `.Touch()` on the identity:

```rix
$$items := [1];
$$size := $items.Len();
$items.Push!(2);
$$items.Touch();
$size  # 2
```

`.Touch()` preserves the current object, starts one reactive epoch, and
recomputes its dependent closure. It is available on every reactive node and
as `graph.Touch("name")` for explicit `.ReactiveGraph` values. It should not
be used to hide ordinary replacement state changes.

## Static export

`panel.Snapshot()` creates a detached, disabled control panel retaining exact
values, bounds/options, labels, validation messages, and target IDs while
omitting live nodes and callbacks. Browser, Markdown, and future print hosts
can render this snapshot without an evaluator.
