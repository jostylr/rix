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

import { installRendererPlugin, option, rixString } from "../renderers/common.js";
import { quartoFrontMatter, renderMarkdown } from "../renderers/document-renderers.js";

function assetPolicy(options) {
    const requested = (rixString(option(options, "assets")) || "inline").toLowerCase();
    if (requested === "inline") return null;
    if (["external", "svg", "external-svg"].includes(requested)) return "svg";
    if (["png", "external-png"].includes(requested)) return "png";
    throw new Error("quarto assets must be 'inline', 'svg', or 'png'");
}

function assetDirectory(options) {
    const directory = rixString(option(options, "assetDir")) || "assets";
    if (!directory || directory.startsWith("/") || directory.includes("\\") || directory.split("/").includes("..")) {
        throw new Error("quarto assetDir must be a safe relative directory");
    }
    return directory.replace(/\/$/, "");
}

export const definition = {
    target: "quarto",
    mime: "text/x-quarto",
    extension: "qmd",
    aliases: ["qmd", "text/x-quarto"],
    inputKinds: ["fragment", "section", "paragraph", "heading", "list", "quote", "callout", "code_block", "math_block", "table", "grid", "sheet", "figure", "graphic", "snapshots", "timeline", "timeline_render", "slide", "slides"],
    deterministic: true,
    description: "Quarto Markdown renderer with front matter and portable figure lowering",
    render({ value, options, format, render }) {
        const policy = assetPolicy(options);
        const assets = [];
        let figure = 0;
        const rendered = renderMarkdown(value, {
            format,
            render,
            quarto: true,
            graphic: policy ? (graphic, state) => {
                figure += 1;
                const nested = render(graphic, policy, { alt: state.figureAlt || "" });
                const path = `${assetDirectory(options)}/figure-${figure}.${nested.extension}`;
                assets.push({ path, mime: nested.mime, content: nested.content });
                state.diagnostics.push(...nested.diagnostics);
                return `![${state.figureAlt || `Figure ${figure}`}](${path})`;
            } : null,
        });
        return { ...rendered, assets, content: `${quartoFrontMatter(options)}${rendered.content}` };
    },
};

export function install(api) {
    return installRendererPlugin({ ...api, definition });
}
