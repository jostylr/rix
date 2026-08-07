/**
id: quarto
description: Quarto Markdown renderer with front matter and portable figure lowering.
kind: host
mount: quarto
exports: [Render]
groups: [Renderers]
permissions: []
provides: [rix.renderer.quarto@1]
targets: [quarto, text/x-quarto]
snapshot: true
deterministic: true
defaultEnabled: false
**/

import { installRendererPlugin } from "../renderers/common.js";
import { quartoFrontMatter, renderMarkdown } from "../renderers/document-renderers.js";

export const definition = {
    target: "quarto",
    mime: "text/x-quarto",
    extension: "qmd",
    aliases: ["qmd", "text/x-quarto"],
    inputKinds: ["fragment", "section", "paragraph", "heading", "list", "quote", "callout", "code_block", "math_block", "table", "grid", "sheet", "figure", "graphic", "snapshots", "timeline", "timeline_render", "slide", "slides"],
    deterministic: true,
    description: "Quarto Markdown renderer with front matter and portable figure lowering",
    render({ value, options, format, render }) {
        const rendered = renderMarkdown(value, { format, render, quarto: true });
        return { ...rendered, content: `${quartoFrontMatter(options)}${rendered.content}` };
    },
};

export function install(api) {
    return installRendererPlugin({ ...api, definition });
}
