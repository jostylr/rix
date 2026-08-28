# Hosting RiX output widgets

Hosts render portable output with `renderOutputHtml` and add interaction with
`mountOutputWidgets`. Import `rix/styles/output-widgets.css` to style graphics,
geometry workbenches, audio traces, text alternatives, focus states, compact
layouts, and print fallbacks without copying rules from a particular app.

The stylesheet is the `rix.output-widgets.css@1` visual contract. Hosts may set
these custom properties on an output container:

- `--rix-widget-accent`, `--rix-widget-accent-strong`, and
  `--rix-widget-accent-soft`;
- `--rix-widget-border` and `--rix-widget-border-accent`;
- `--rix-widget-surface` and `--rix-widget-surface-soft`;
- `--rix-widget-text`, `--rix-widget-muted`, and `--rix-widget-focus`;
- `--rix-widget-font`, `--rix-widget-mono`, and `--rix-widget-radius`.

Application-specific layout should wrap the widget rather than restyle its
internal tree. Interactive controls are hidden by the shared print rules while
the retained SVG and comprehensive text alternative remain visible.
