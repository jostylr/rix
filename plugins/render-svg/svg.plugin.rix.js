/**
id: svg
description: Portable SVG renderer for core Graphics scenes.
kind: host
mount: svg
exports: [Render]
groups: [Renderers]
permissions: []
provides: [rix.renderer.svg@1]
targets: [svg, image/svg+xml]
snapshot: true
deterministic: true
defaultEnabled: false
**/

import { renderGraphicSvg } from "../../src/runtime/output.js";
import { escapeHtml, installRendererPlugin, outputKind, requireOutput, unwrapFigure } from "../renderers/common.js";

export const definition = {
    target: "svg",
    mime: "image/svg+xml",
    extension: "svg",
    aliases: ["image/svg+xml"],
    inputKinds: ["graphic", "figure"],
    deterministic: true,
    description: "Portable SVG renderer for core Graphics scenes",
    render({ value, options, format }) {
        const unwrapped = unwrapFigure(value);
        requireOutput(unwrapped.value, ["graphic"], "svg");
        if (unwrapped.figure && outputKind(unwrapped.figure.content) !== "graphic") {
            requireOutput(unwrapped.figure.content, ["graphic"], "svg");
        }
        const alt = options.alt?.type === "string" ? options.alt.value : options.alt
            || unwrapped.figure?.alt
            || null;
        let content = renderGraphicSvg(unwrapped.value, format);
        if (alt) {
            content = content.replace(
                /<svg ([^>]+)>/,
                `<svg $1 aria-label="${escapeHtml(alt)}"><title>${escapeHtml(alt)}</title>`,
            );
        }
        return { content };
    },
};

export function install(api) {
    return installRendererPlugin({ ...api, definition });
}
