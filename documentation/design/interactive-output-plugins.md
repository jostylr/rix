# Interactive output, snapshots, and timelines

RiX owns exact state and portable output trees. Browser playback, PDF writing,
and video encoding are host responsibilities. The common boundary is a
**scene**: an ordinary RiX callable that receives one exact state and returns
block output, normally a `.Graphics.Graphic`, a plot graphic, or a
`.Fragment` containing one.

```rix
Scene = state -> {;
    a := state["a"];
    center := state["center"];
    ## return a Graphic, Figure, or Fragment
}
```

There is deliberately no special function type named `Scene`. A normal RiX
callable keeps scenes composable and allows one gallery to use several scene
functions.

## Controls and exact actions

`.Controls.Action` is a real button in the browser renderer. Its callback is
called with the target's current exact value and must return the next exact
value. The change is published by replacing that reactive identity, exactly
like a slider edit.

```rix
$$frozen := [];
.Controls.Action({=
    id="freeze",
    target=$$frozen,
    action=versions -> versions ++ [{= coefficients=[a, b, c], color=color }],
    label="Freeze quadratic"
})
```

The button emits `control:action`; a host routes it through the same control
session used for `control:set`. A static control-panel snapshot disables it.

### Styling controls

Controls accept `style={= ... }` and `metadata={= ... }`. `metadata` is an
opaque renderer handoff. `style` is a small portable semantic vocabulary:

| Key       | Values understood by the bundled HTML renderer |
| --------- | ---------------------------------------------- |
| `variant` | `"primary"`, `"danger"`, `"quiet"`             |
| `density` | `"compact"`, `"comfortable"`                   |
| `width`   | `"auto"`, `"compact"`, `"full"`                |

`ControlPanel.style` makes global and selective rules. Precedence is `all`,
then `kinds`, then `ids`, then the individual control's own `style`.

```rix
.ControlPanel({=
    style={=
        all={= density="compact" },
        kinds={= action={= variant="primary" } },
        ids={= ("clear-frozen")={= variant="danger" } }
    },
    controls=[...]
})
```

Renderers retain these style maps even when they do not understand a value, so
plugins can add their own metadata without altering RiX's exact values.

### Reactive collection boundary

Reactivity is currently tracked at the named `$$` identity, not through a
deep proxy. Replacing a source (including via a slider or Action) recomputes
all `$` dependents. In-place collection operations such as `Push!`, `Set!`, or
map mutation change the collection but **do not** publish a reactive epoch;
derived output that read a nested item remains stale. This holds at every
depth of arrays, tuples, maps, and tensors.

For reactive UI state, Actions should return a fresh replacement value:

```rix
Action=versions -> versions ++ [newVersion]
```

A future `Reactive.Collection`/lens capability can add tracked deep mutation,
but it must make the affected reactive identity and publication semantics
explicit rather than silently proxy arbitrary nested values.

## Snapshots: the comic-strip primitive

`.Snapshots` expands a list of `[scene, states]` tuples into a portable static
grid. `.Graphics.Snapshots` is the equivalent graphics namespace entry point.
Each tuple can name a different scene function; states are evaluated in the
listed order. This naturally produces a row-major comic strip.

```rix
centers := [-2, 0, 2];
.Snapshots({=
    title="Three quadratics at shared centers",
    columns=3,
    entries=[
        {: quadraticOne, centers},
        {: quadraticTwo, centers},
        {: quadraticThree, centers}
    ]
})
```

The result is a block output value and can be placed inside `.Fragment`,
`.Figure`, slides, or `.Out`. The HTML host renders it as a responsive grid;
the quadratic example declares it as `comic.html`. A PDF exporter should use
the exact same item order and fixed graph window when writing a print grid.

## Timeline

`.Timeline.Sequence` accepts the same scene tuples and materializes ordered
frames. `.Timeline.Render(timeline, frame)` selects a one-based frame for
static renderers. `duration`, `easing`, and `title` remain part of the
portable timeline descriptor.

```rix
motion := .Timeline.Sequence({=
    duration=2,
    easing="linear",
    entries=[{: scene, [{= center=-3}, {= center=0}, {= center=3}]}]
});
.Timeline.Render(motion, 2)
```

The bundled HTML renderer intentionally displays the selected frame; it does
not yet play or scrub. A browser animation plugin can consume `timeline`
values to add a transport bar or frame recording, while a Manim-style plugin
can lower the same exact frames to video. A future `.Out("name.pdf", value)`
backend should handle `snapshots` and `timeline_render` as static print
layout; it is not implemented by the CLI yet.
