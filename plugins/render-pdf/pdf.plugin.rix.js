/**
id: pdf
description: PDF document and figure renderer orchestrated through LaTeX.
kind: host
mount: pdf
exports: [Render]
groups: [Renderers]
permissions: [process, files]
provides: [rix.renderer.pdf@1, rix.renderer.pdf@2]
schemas: [rix.pdf.render@2]
targets: [pdf, application/pdf]
snapshot: true
deterministic: false
defaultEnabled: false
**/

import { UnsupportedRenderError } from "../../src/runtime/renderer-registry.js";
import { boolValue, installRendererPlugin, option, plainValue, rixString } from "../renderers/common.js";
import { renderLatex } from "../renderers/document-renderers.js";

export function createDefinition(compileLatex = null) {
    return {
        target: "pdf",
        mime: "application/pdf",
        extension: "pdf",
        aliases: ["application/pdf"],
        inputKinds: ["fragment", "section", "paragraph", "heading", "list", "quote", "callout", "code_block", "math_block", "table", "grid", "sheet", "figure", "graphic", "snapshots", "timeline_render", "slide", "slides"],
        deterministic: false,
        description: "PDF document and figure renderer orchestrated through LaTeX",
        render({ value, options, format, render }) {
            if (typeof compileLatex !== "function") {
                throw new UnsupportedRenderError("PDF rendering needs a host LaTeX compiler; this host installed only the portable renderer contract", {
                    code: "pdf-toolchain-unavailable",
                    target: "pdf",
                });
            }
            const profile = (rixString(option(options, "profile")) || (["slide","slides"].includes(value?.kind) ? "slides" : ["graphic", "figure"].includes(value?.kind) ? "figure" : "document")).toLowerCase();
            if (!["document", "figure", "slides"].includes(profile)) throw new Error("PDF profile must be document, figure, or slides");
            if (profile === "slides" && !["slide","slides"].includes(value?.kind)) throw new Error("PDF slides profile requires explicit Slide/Slides content");
            const bookmarksValue = option(options, "bookmarks", true);
            const bookmarks = bookmarksValue === true || boolValue(bookmarksValue);
            const metadata = plainValue(option(options, "metadata")) || {};
            const latex = renderLatex(value, {
                format,
                standalone: true,
                title: rixString(option(options, "title")),
                render,
                rawMarkup: rixString(option(options, "rawMarkup", "fallback")) || "fallback",
                figureAsset: rixString(option(options, "figureAsset", "tikz")) || "tikz",
                assetDir: rixString(option(options, "assetDir", "assets")) || "assets",
                pageSize: rixString(option(options, "pageSize", profile === "slides" ? "a4paper" : "letterpaper")) || "letterpaper",
                placement: rixString(option(options, "placement", "htbp")) || "htbp",
                bookmarks,
                metadata,
                publicationPlan: option(options, "publicationPlan"), outputTarget: "pdf",
            });
            const compiled = compileLatex(latex.content, options, latex.assets);
            const fontDiagnostics = compiled.fonts
                ? []
                : [{ level: "info", code: "pdf-fonts-unreported", message: "The selected PDF toolchain did not report embedded font details." }];
            return {
                content: compiled.content,
                toolchain: compiled.toolchain,
                diagnostics: [...latex.diagnostics, ...(compiled.diagnostics || []), ...fontDiagnostics],
                metadata: {
                    schema: "rix.pdf.render@2", pages: compiled.pages || null, profile:latex.metadata.documentClass==="beamer"?"slides":profile,
                    pageSize: latex.metadata.pageSize, slideSize:latex.metadata.slideSize, bookmarks, documentMetadata: metadata,
                    fonts: compiled.fonts || [], packages: latex.metadata.packages,
                    figureAsset: latex.metadata.figureAsset, assetCount: latex.assets.length,
                    publicationPlan: latex.metadata.publicationPlan, documentClass: latex.metadata.documentClass,
                },
            };
        },
    };
}

export function install(api) {
    return installRendererPlugin({ ...api, definition: createDefinition(api.compileLatex) });
}
