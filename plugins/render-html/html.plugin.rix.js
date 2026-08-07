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

const DEFAULT_STYLE = `body{font-family:system-ui,sans-serif;line-height:1.5;max-width:72rem;margin:2rem auto;padding:0 1rem;color:#172033}table{border-collapse:collapse;margin:1rem 0}th,td{border:1px solid #cbd5e1;padding:.35rem .6rem}figure{margin:1.5rem 0}.rix-output-svg{max-width:100%;height:auto}pre{overflow:auto;background:#f8fafc;padding:1rem}.rix-output-callout{border-left:.3rem solid #64748b;padding:.5rem 1rem;background:#f8fafc}`;

function staticDiagnostics(value, diagnostics, seen = new Set()) {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (value.type === "output" && (value.kind?.startsWith("control_") || value.kind === "control_panel" || value.kind === "drag_point")) {
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
