/**
id: markdown
description: CommonMark-oriented renderer for portable RiX documents.
kind: host
mount: markdown
exports: [Render]
groups: [Renderers]
permissions: []
provides: [rix.renderer.markdown@1, rix.renderer.markdown@2]
schemas: [rix.markdown.render@2]
targets: [markdown, text/markdown]
snapshot: true
deterministic: true
defaultEnabled: false
**/

import { numericFormatterPolicy } from "../../src/runtime/numeric-presentation.js";

import { installRendererPlugin, option, rixString } from "../renderers/common.js";
import { renderMarkdown } from "../renderers/document-renderers.js";

export const definition = {
    target: "markdown",
    mime: "text/markdown",
    extension: "md",
    aliases: ["md", "text/markdown"],
    inputKinds: ["fragment", "section", "paragraph", "heading", "list", "quote", "callout", "code_block", "math_block", "table", "grid", "sheet", "figure", "graphic", "snapshots", "timeline", "timeline_render", "slide", "slides"],
    deterministic: true,
    description: "CommonMark-oriented renderer for portable RiX documents",
    render({ value, options, format, render }) {
        const policy = (rixString(option(options, "assets", "inline")) || "inline").toLowerCase();
        if (!["inline", "svg", "png"].includes(policy)) throw new Error("markdown assets must be inline, svg, or png");
        const directory = rixString(option(options, "assetDir", "assets")) || "assets";
        if (!directory || directory.startsWith("/") || directory.split("/").includes("..")) throw new Error("markdown assetDir must be a safe relative directory");
        const assets = [];
        const theme = rixString(option(options, "theme")) || value?.documentTheme?.entries?.get("name")?.value || "plain";
        let figure = 0;
        const result = renderMarkdown(value, {
            format, render,
            rawMarkup: rixString(option(options, "rawMarkup", "fallback")) || "fallback",
            graphic: policy === "inline" ? null : (graphic, state) => {
                figure += 1;
                const nested = render(graphic, policy, { alt: state.figureAlt || "", numericPolicy: numericFormatterPolicy(state.format) });
                const path = `${directory}/figure-${figure}.${nested.extension}`;
                assets.push({ path, mime: nested.mime, content: nested.content });
                state.diagnostics.push(...nested.diagnostics);
                return `![${state.figureAlt || `Figure ${figure}`}](${path})`;
            },
        });
        return { ...result, assets, metadata: { schema: "rix.markdown.render@2", assetPolicy: policy, assetDirectory: directory, theme } };
    },
};

export function install(api) {
    return installRendererPlugin({ ...api, definition });
}
