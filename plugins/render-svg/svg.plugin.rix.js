/**
id: svg
description: Portable SVG renderer with outward-safe exact and certified coordinate lowering.
kind: host
mount: svg
exports: [Render]
groups: [Renderers]
permissions: []
provides: [rix.renderer.svg@1, rix.renderer.svg@2, rix.svg.coordinate-lowering@1, rix.viewport@1, rix.selection@1]
schemas: [rix.svg.coordinate-lowering@1, rix.viewport@1, rix.selection@1]
targets: [svg, image/svg+xml]
snapshot: true
deterministic: true
defaultEnabled: false
**/

import { lowerGraphicSvg } from "../../src/runtime/output.js";
import { escapeHtml, installRendererPlugin, numberValue, option, outputKind, requireOutput, rixString, unwrapFigure } from "../renderers/common.js";
import { createSelection, createViewport } from "../renderers/interaction.js";

export const definition = {
    target: "svg",
    mime: "image/svg+xml",
    extension: "svg",
    aliases: ["image/svg+xml"],
    inputKinds: ["graphic", "figure"],
    deterministic: true,
    description: "Portable SVG renderer with outward-safe exact and certified coordinate lowering",
    render({ value, options, format }) {
        const unwrapped = unwrapFigure(value);
        requireOutput(unwrapped.value, ["graphic"], "svg");
        if (unwrapped.figure && outputKind(unwrapped.figure.content) !== "graphic") {
            requireOutput(unwrapped.figure.content, ["graphic"], "svg");
        }
        const alt = rixString(option(options, "alt")) || option(options, "alt")
            || unwrapped.figure?.alt
            || null;
        const rawPrecision = option(options, "precision", 6);
        const precision = numberValue(rawPrecision, "SVG coordinate precision");
        const rounding = rixString(option(options, "rounding", "nearest")) || option(options, "rounding", "nearest");
        const fontPolicy = rixString(option(options, "fontPolicy", "system")) || option(options, "fontPolicy", "system");
        const lowered = lowerGraphicSvg(unwrapped.value, format, { precision, rounding, fontPolicy });
        const viewport = createViewport(options, numberValue(unwrapped.value.size[0], "SVG width"), numberValue(unwrapped.value.size[1], "SVG height"));
        const selection = createSelection(options);
        let { content } = lowered;
        content = content.replace("<svg ", `<svg data-rix-viewport="${viewport.schema}" data-rix-selection="${escapeHtml(selection.ids.join(","))}" `);
        if (alt) {
            content = content.replace(
                /<svg ([^>]+)>/,
                `<svg $1 aria-label="${escapeHtml(alt)}"><title>${escapeHtml(alt)}</title>`,
            );
        }
        return { content, diagnostics: lowered.diagnostics, metadata: { coordinateLowering: lowered.metadata, viewport, selection } };
    },
};

export function install(api) {
    return installRendererPlugin({ ...api, definition });
}
