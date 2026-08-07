/**
id: pdf
description: PDF document and figure renderer orchestrated through LaTeX.
kind: host
mount: pdf
exports: [Render]
groups: [Renderers]
permissions: [process, files]
provides: [rix.renderer.pdf@1]
targets: [pdf, application/pdf]
snapshot: true
deterministic: false
defaultEnabled: false
**/

import { UnsupportedRenderError } from "../../src/runtime/renderer-registry.js";
import { installRendererPlugin, option, rixString } from "../renderers/common.js";
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
        render({ value, options, format }) {
            if (typeof compileLatex !== "function") {
                throw new UnsupportedRenderError("PDF rendering needs a host LaTeX compiler; this host installed only the portable renderer contract", {
                    code: "pdf-toolchain-unavailable",
                    target: "pdf",
                });
            }
            const latex = renderLatex(value, {
                format,
                standalone: true,
                title: rixString(option(options, "title")),
            });
            const compiled = compileLatex(latex.content, options);
            return {
                content: compiled.content,
                toolchain: compiled.toolchain,
                diagnostics: [...latex.diagnostics, ...(compiled.diagnostics || [])],
                metadata: { pages: compiled.pages || null },
            };
        },
    };
}

export function install(api) {
    return installRendererPlugin({ ...api, definition: createDefinition(api.compileLatex) });
}
