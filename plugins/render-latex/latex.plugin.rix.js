/**
id: latex
description: Standalone LaTeX renderer for portable RiX documents and figures.
kind: host
mount: latex
exports: [Render]
groups: [Renderers]
permissions: []
provides: [rix.renderer.latex@1]
targets: [latex, text/x-tex]
snapshot: true
deterministic: true
defaultEnabled: false
**/

import { boolValue, installRendererPlugin, option, rixString } from "../renderers/common.js";
import { renderLatex } from "../renderers/document-renderers.js";

export const definition = {
    target: "latex",
    mime: "text/x-tex",
    extension: "tex",
    aliases: ["tex", "text/x-latex"],
    inputKinds: ["fragment", "section", "paragraph", "heading", "list", "quote", "callout", "code_block", "math_block", "table", "grid", "sheet", "figure", "graphic", "snapshots", "timeline", "timeline_render", "slide", "slides"],
    deterministic: true,
    description: "Standalone LaTeX renderer for portable RiX documents and figures",
    render({ value, options, format }) {
        const standaloneValue = option(options, "standalone", true);
        return renderLatex(value, {
            format,
            standalone: standaloneValue === true || standaloneValue === null || boolValue(standaloneValue),
            title: rixString(option(options, "title")),
        });
    },
};

export function install(api) {
    return installRendererPlugin({ ...api, definition });
}
