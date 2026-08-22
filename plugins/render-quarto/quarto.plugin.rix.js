/**
id: quarto
description: Quarto Markdown renderer with front matter and portable figure lowering.
kind: host
mount: quarto
exports: [Render]
groups: [Renderers]
permissions: []
provides: [rix.renderer.quarto@1, rix.renderer.quarto@2]
schemas: [rix.quarto.project@1, rix.quarto.render@2]
targets: [quarto, text/x-quarto]
snapshot: true
deterministic: true
defaultEnabled: false
**/

import { field, installRendererPlugin, option, rixString, sequence } from "../renderers/common.js";
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

function projectAsset(options) {
    const project = option(options, "project");
    if (project === null) return null;
    const type = rixString(field(project, "type")) || "website";
    if (!["website", "book", "default"].includes(type)) throw new Error("quarto project type must be website, book, or default");
    const outputDir = rixString(field(project, "outputDir")) || "_site";
    if (outputDir.startsWith("/") || outputDir.split("/").includes("..")) throw new Error("quarto project outputDir must be safe and relative");
    const navigationValue = field(project, "navigation", []);
    const navigation = sequence(navigationValue, "quarto project navigation").map((entry) => {
        const path = rixString(entry);
        if (!path || path.startsWith("/") || path.split("/").includes("..")) throw new Error("quarto navigation entries must be safe relative paths");
        return path;
    });
    const navigationYaml = navigation.length ? `\n  navbar:\n    left:\n${navigation.map((path) => `      - ${JSON.stringify(path)}`).join("\n")}` : "";
    return {
        path: "_quarto.yml", mime: "application/yaml",
        content: `project:\n  type: ${type}\n  output-dir: ${JSON.stringify(outputDir)}${navigationYaml}\n`,
        metadata: { schema: "rix.quarto.project@1", type, outputDir, navigation },
    };
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
        const project = projectAsset(options);
        if (project) assets.push({ path: project.path, mime: project.mime, content: project.content });
        let figure = 0;
        const rendered = renderMarkdown(value, {
            format,
            render,
            quarto: true,
            rawMarkup: rixString(option(options, "rawMarkup", "fallback")) || "fallback",
            graphic: policy ? (graphic, state) => {
                figure += 1;
                const nested = render(graphic, policy, { alt: state.figureAlt || "" });
                const path = `${assetDirectory(options)}/figure-${figure}.${nested.extension}`;
                assets.push({ path, mime: nested.mime, content: nested.content });
                state.diagnostics.push(...nested.diagnostics);
                return `![${state.figureAlt || `Figure ${figure}`}](${path})`;
            } : null,
        });
        const codePolicy = (rixString(option(options, "codePolicy", "show")) || "show").toLowerCase();
        if (!["show", "hide", "execute"].includes(codePolicy)) throw new Error("quarto codePolicy must be show, hide, or execute");
        const execute = codePolicy === "execute" ? "" : `execute:\n  enabled: false\n  echo: ${codePolicy === "show" ? "true" : "false"}\n`;
        const frontMatter = quartoFrontMatter(options).replace(/\n---\n\n$/, `\n${execute}---\n\n`);
        return {
            ...rendered, assets,
            content: `${frontMatter}${rendered.content}`,
            metadata: { schema: "rix.quarto.render@2", assetPolicy: policy || "inline", codePolicy, project: project?.metadata || null },
        };
    },
};

export function install(api) {
    return installRendererPlugin({ ...api, definition });
}
