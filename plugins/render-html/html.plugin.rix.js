/**
id: html
description: Standalone semantic HTML renderer for portable RiX output trees.
kind: host
mount: html
exports: [Render]
groups: [Renderers]
permissions: []
provides: [rix.renderer.html@1, rix.renderer.html@2]
schemas: [rix.html.render@2]
targets: [html, text/html]
snapshot: true
deterministic: true
defaultEnabled: false
**/

import { renderOutputHtml } from "../../src/runtime/output.js";
import { resolvePublicationPlan, validatePublicationTree, publicationDiagnostics } from "../../src/runtime/publication-plan.js";
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

function prepareHtmlValue(value, state, seen = new Map()) {
    if (!value || typeof value !== "object") return value;
    if (seen.has(value)) return seen.get(value);
    if (value.documentTargetMarkup) {
        const { target, content } = value.documentTargetMarkup;
        if ((target === "html" || target === "htm") && state.rawMarkup === "deny") throw new Error("html rawMarkup policy denies explicit target markup");
        if ((target === "html" || target === "htm") && state.rawMarkup === "allow") {
            const marker = `RIXRAWMARKUP${state.replacements.length}END`;
            state.replacements.push([marker, content]);
            return { ...value, value: { type: "string", value: marker } };
        }
    }
    if (value.type === "output" && value.kind === "graphic" && state.assetPolicy !== "inline") {
        state.figure += 1;
        const rendered = state.render(value, state.assetPolicy, {});
        const path = `${state.assetDir}/figure-${state.figure}.${rendered.extension}`;
        state.assets.push({ path, mime: rendered.mime, content: rendered.content });
        state.diagnostics.push(...rendered.diagnostics);
        return {
            type: "output", kind: "image", asset: { type: "output", kind: "asset", ref: path, mime: rendered.mime },
            alt: `Figure ${state.figure}`, width: null, height: null, title: null, caption: null, id: null,
        };
    }
    const clone = Array.isArray(value) ? [] : { ...value };
    seen.set(value, clone);
    if (Array.isArray(value)) {
        value.forEach((entry) => clone.push(prepareHtmlValue(entry, state, seen)));
        return clone;
    }
    for (const key of ["children", "items", "slides"]) {
        if (Array.isArray(value[key])) clone[key] = value[key].map((entry) => prepareHtmlValue(entry, state, seen));
    }
    if (value.content) clone.content = prepareHtmlValue(value.content, state, seen);
    if (Array.isArray(value.snapshots)) clone.snapshots = value.snapshots.map((entry) => ({ ...entry, content: prepareHtmlValue(entry.content, state, seen) }));
    return clone;
}

export const definition = {
    target: "html",
    mime: "text/html",
    extension: "html",
    aliases: ["htm", "text/html"],
    inputKinds: [],
    deterministic: true,
    description: "Standalone semantic HTML renderer for portable RiX output trees",
    render({ value, options, format, render }) {
        const plan=resolvePublicationPlan(value,options);
        const publication=Boolean(value?.publicationPlan || option(options,"publicationPlan"));
        validatePublicationTree(value,plan);
        const title = rixString(option(options, "title")) || "RiX output";
        const stylePolicy = (rixString(option(options, "stylePolicy", "inline")) || "inline").toLowerCase();
        if (!["inline", "external", "none"].includes(stylePolicy)) throw new Error("html stylePolicy must be inline, external, or none");
        const assetPolicy = (rixString(option(options, "assets", "inline")) || "inline").toLowerCase();
        if (!["inline", "svg", "png"].includes(assetPolicy)) throw new Error("html assets must be inline, svg, or png");
        const rawMarkup = (rixString(option(options, "rawMarkup", "fallback")) || "fallback").toLowerCase();
        if (!["allow", "fallback", "deny"].includes(rawMarkup)) throw new Error("html rawMarkup must be allow, fallback, or deny");
        const assetDir = rixString(option(options, "assetDir", "assets")) || "assets";
        if (!assetDir || assetDir.startsWith("/") || assetDir.split("/").includes("..")) throw new Error("html assetDir must be a safe relative directory");
        const layoutStyle=publication?` .rix-publication-flow{column-count:${plan.profile==="article"?plan.columns:1};column-gap:2em}.rix-publication-flow table,.rix-publication-flow figure{column-span:all}.rix-publication-flow .rix-output-slide{break-after:page;min-height:20rem;padding:2rem;border:1px solid #cbd5e1;aspect-ratio:${plan.slideSize==="wide"?"16 / 9":"4 / 3"}}@media(max-width:700px){.rix-publication-flow{column-count:1}}@media print{thead{display:table-header-group}table,figure{break-inside:avoid}@page{size:${plan.pageSize==="letterpaper"?"letter":plan.pageSize==="a4paper"?"A4":"A5"}}}`:"";
        const style = (rixString(option(options, "style")) || DEFAULT_STYLE)+layoutStyle;
        const reportTheme = value?.documentTheme?.entries;
        const theme = rixString(option(options, "theme")) || (publication?plan.theme:null) || reportTheme?.get("name")?.value || "plain";
        if (!/^[a-z][a-z0-9_-]*$/i.test(theme)) throw new Error("html theme must be a simple theme name");
        const accent = reportTheme?.get("accent")?.value || "#275dad";
        const diagnostics = publicationDiagnostics(plan,"html");
        if(publication && plan.runningRegions) diagnostics.push(diagnostic("publication-running-region-flow","HTML keeps report regions in document flow; browser printing does not guarantee repeated running regions","info"));
        staticDiagnostics(value, diagnostics);
        const state = { rawMarkup, assetPolicy, assetDir, render, assets: [], diagnostics, replacements: [], figure: 0 };
        const prepared = prepareHtmlValue(value, state);
        let body = renderOutputHtml(prepared, format);
        if(publication) body=`<article data-rix-publication="${plan.schema}" data-rix-profile="${plan.profile}"><div class="rix-publication-flow">${body}</div>${plan.index.length?`<nav aria-label="Index"><h2>Index</h2><ul>${plan.index.map(entry=>`<li><a href="#${escapeHtml(entry.label)}">${escapeHtml(entry.term)}</a></li>`).join("")}</ul></nav>`:""}</article>`;
        for (const [marker, content] of state.replacements) body = body.replaceAll(marker, content);
        const styleHref = `${assetDir}/rix.css`;
        if (stylePolicy === "external") state.assets.push({ path: styleHref, mime: "text/css", content: style });
        const themedStyle = `:root{--rix-accent:${accent}}${style}`;
        if (stylePolicy === "external") state.assets[state.assets.length - 1].content = themedStyle;
        const styleTag = stylePolicy === "inline" ? `<style>${themedStyle}</style>` : stylePolicy === "external" ? `<link rel="stylesheet" href="${escapeHtml(styleHref)}">` : "";
        return {
            content: `<!doctype html>\n<html lang="en" data-rix-theme="${escapeHtml(theme)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>${styleTag}</head><body><main>${body}</main></body></html>\n`,
            diagnostics,
            assets: state.assets,
            metadata: { schema: "rix.html.render@2", assetPolicy, stylePolicy, rawMarkup, theme, publicationPlan:plan },
        };
    },
};

export function install(api) {
    return installRendererPlugin({ ...api, definition });
}
