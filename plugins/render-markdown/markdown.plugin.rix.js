/**
id: markdown
description: CommonMark-oriented renderer for portable RiX documents.
kind: host
mount: markdown
exports: [Render]
groups: [Renderers]
permissions: []
provides: [rix.renderer.markdown@1]
targets: [markdown, text/markdown]
snapshot: true
deterministic: true
defaultEnabled: false
**/

import { installRendererPlugin } from "../renderers/common.js";
import { renderMarkdown } from "../renderers/document-renderers.js";

export const definition = {
    target: "markdown",
    mime: "text/markdown",
    extension: "md",
    aliases: ["md", "text/markdown"],
    inputKinds: ["fragment", "section", "paragraph", "heading", "list", "quote", "callout", "code_block", "math_block", "table", "grid", "sheet", "figure", "graphic", "snapshots", "timeline", "timeline_render", "slide", "slides"],
    deterministic: true,
    description: "CommonMark-oriented renderer for portable RiX documents",
    render({ value, format, render }) {
        return renderMarkdown(value, { format, render });
    },
};

export function install(api) {
    return installRendererPlugin({ ...api, definition });
}
