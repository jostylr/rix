/**
id: canvas
description: Serializable Canvas 2D drawing plans for core Graphics scenes.
kind: host
mount: canvas
exports: [Render]
groups: [Renderers]
permissions: []
provides: [rix.renderer.canvas@1]
targets: [canvas, application/vnd.rix.canvas+json]
snapshot: true
deterministic: true
defaultEnabled: false
**/

import { createCanvasPlan } from "./canvas-plan.js";
import { installRendererPlugin, requireOutput, unwrapFigure } from "../renderers/common.js";

export const definition = {
    target: "canvas",
    mime: "application/vnd.rix.canvas+json",
    extension: "canvas.json",
    aliases: ["canvas2d", "application/vnd.rix.canvas+json"],
    inputKinds: ["graphic", "figure"],
    deterministic: true,
    description: "Serializable CanvasRenderingContext2D plan for core Graphics",
    render({ value, format }) {
        const { value: graphic } = unwrapFigure(value);
        requireOutput(graphic, ["graphic"], "canvas");
        const plan = createCanvasPlan(graphic, format);
        return {
            content: `${JSON.stringify({ ...plan, diagnostics: undefined })}\n`,
            diagnostics: plan.diagnostics,
            metadata: { width: plan.width, height: plan.height, schema: plan.schema },
        };
    },
};

export function install(api) {
    return installRendererPlugin({ ...api, definition });
}

export { createCanvasPlan, paintCanvasPlan } from "./canvas-plan.js";
