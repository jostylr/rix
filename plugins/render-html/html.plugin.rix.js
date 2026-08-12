/**
id: html
description: Standalone semantic HTML renderer for portable RiX output trees.
kind: host
mount: html
exports: [Render]
groups: [Renderers]
permissions: []
provides: [rix.renderer.html@1]
targets: [html, text/html]
snapshot: true
deterministic: true
defaultEnabled: false
**/

import { renderOutputHtml } from "../../src/runtime/output.js";
import { diagnostic, escapeHtml, installRendererPlugin, option, rixString } from "../renderers/common.js";

const DEFAULT_STYLE = `:root{font-family:system-ui,sans-serif;color:#172033;background:#f5f7ff}*{box-sizing:border-box}body{line-height:1.5;max-width:72rem;margin:2rem auto;padding:0 1rem}[data-rix-layout=stack]{display:grid}[data-rix-layout=cluster]{display:flex;flex-wrap:wrap;align-items:center}[data-rix-layout=grid],[data-rix-layout=split]{display:grid}[data-rix-columns="2"]{grid-template-columns:repeat(2,minmax(0,1fr))}[data-rix-columns="3"]{grid-template-columns:repeat(3,minmax(0,1fr))}[data-rix-columns="4"]{grid-template-columns:repeat(4,minmax(0,1fr))}[data-rix-layout=split]{grid-template-columns:minmax(16rem,.8fr) minmax(0,1.4fr)}[data-rix-gap=compact]{gap:.5rem}[data-rix-gap=normal]{gap:1rem}[data-rix-gap=spacious]{gap:2rem}[data-rix-variant=card],[data-rix-variant=hero],[data-rix-variant=muted]{padding:1.25rem;border:1px solid #dfe3ed;border-radius:1rem;background:#fff}[data-rix-variant=hero]{background:linear-gradient(145deg,#fff,#f1edff)}[data-rix-variant=muted]{background:#f7f8fc}.rix-output-control-panel[data-rix-layout=grid]{grid-template-columns:1fr}.rix-output-control-list{display:grid;gap:.5rem}.rix-output-control-panel[data-rix-layout=grid][data-rix-columns="3"] .rix-output-control-list{grid-template-columns:repeat(3,minmax(0,1fr))}.rix-output-control-panel[data-rix-layout=grid][data-rix-columns="4"] .rix-output-control-list{grid-template-columns:repeat(4,minmax(0,1fr))}[data-rix-control-row="1"]{grid-row:1}[data-rix-control-row="2"]{grid-row:2}[data-rix-control-row="3"]{grid-row:3}[data-rix-control-row="4"]{grid-row:4}[data-rix-control-column="1"]{grid-column:1}[data-rix-control-column="2"]{grid-column:2}[data-rix-control-column="3"]{grid-column:3}[data-rix-control-column="4"]{grid-column:4}table{width:100%;border-collapse:collapse;margin:1rem 0;background:#fff}th,td{border:1px solid #cbd5e1;padding:.35rem .6rem}figure{margin:1.5rem 0}.rix-output-svg{max-width:100%;height:auto}pre{overflow:auto;background:#f8fafc;padding:1rem}.rix-output-callout{border-left:.3rem solid #64748b;padding:.5rem 1rem;background:#f8fafc}@media(max-width:760px){[data-rix-layout=grid],[data-rix-layout=split],[data-rix-columns]{grid-template-columns:1fr}}`;

function staticDiagnostics(value, diagnostics, seen = new Set()) {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (value.type === "output" && (value.kind?.startsWith("control_") || value.kind === "control_panel" || value.kind === "drag_point" || value.kind === "graphic_action")) {
        diagnostics.push(diagnostic("html-static-interaction", `Standalone HTML preserves ${value.kind} markup but needs a host widget runtime for interaction`, "warning"));
    }
    for (const child of value.children || []) staticDiagnostics(child, diagnostics, seen);
    if (value.content) staticDiagnostics(value.content, diagnostics, seen);
    for (const slide of value.slides || []) staticDiagnostics(slide, diagnostics, seen);
    for (const snapshot of value.snapshots || []) staticDiagnostics(snapshot.content, diagnostics, seen);
}

export const definition = {
    target: "html",
    mime: "text/html",
    extension: "html",
    aliases: ["htm", "text/html"],
    inputKinds: [],
    deterministic: true,
    description: "Standalone semantic HTML renderer for portable RiX output trees",
    render({ value, options, format }) {
        const title = rixString(option(options, "title")) || "RiX output";
        const style = rixString(option(options, "style")) || DEFAULT_STYLE;
        const body = renderOutputHtml(value, format);
        const diagnostics = [];
        staticDiagnostics(value, diagnostics);
        return {
            content: `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${style}</style></head><body><main>${body}</main></body></html>\n`,
            diagnostics,
        };
    },
};

export function install(api) {
    return installRendererPlugin({ ...api, definition });
}
