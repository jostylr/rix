/**
id: png
description: PNG snapshot renderer for core Graphics through a host rasterizer.
kind: host
mount: png
exports: [Render]
groups: [Renderers]
permissions: [process]
provides: [rix.renderer.png@1]
targets: [png, image/png]
snapshot: true
deterministic: true
defaultEnabled: false
**/

import { renderGraphicSvg } from "../../src/runtime/output.js";
import { UnsupportedRenderError } from "../../src/runtime/renderer-registry.js";
import { installRendererPlugin, numberValue, option, requireOutput, rixString, unwrapFigure } from "../renderers/common.js";

export function createDefinition(rasterizeSvg = null) {
    return {
        target: "png",
        mime: "image/png",
        extension: "png",
        aliases: ["image/png"],
        inputKinds: ["graphic", "figure"],
        deterministic: true,
        description: "PNG snapshot renderer for core Graphics through a host rasterizer",
        render({ value, options, format }) {
            if (typeof rasterizeSvg !== "function") {
                throw new UnsupportedRenderError("PNG rendering needs a host SVG rasterizer; this host installed only the portable renderer contract", {
                    code: "png-rasterizer-unavailable",
                    target: "png",
                });
            }
            const { value: graphic } = unwrapFigure(value);
            requireOutput(graphic, ["graphic"], "png");
            const scale = option(options, "scale", 1);
            const width = option(options, "width");
            const height = option(options, "height");
            const rendered = rasterizeSvg(renderGraphicSvg(graphic, format), {
                width: width === null ? Math.round(numberValue(graphic.size[0], "Graphic width") * numberValue(scale, "PNG scale")) : numberValue(width, "PNG width"),
                height: height === null ? Math.round(numberValue(graphic.size[1], "Graphic height") * numberValue(scale, "PNG scale")) : numberValue(height, "PNG height"),
                background: rixString(option(options, "background")),
            });
            return {
                content: rendered.content,
                toolchain: rendered.toolchain,
                diagnostics: rendered.diagnostics || [],
                metadata: { width: rendered.width, height: rendered.height },
            };
        },
    };
}

export function install(api) {
    return installRendererPlugin({ ...api, definition: createDefinition(api.rasterizeSvg) });
}
