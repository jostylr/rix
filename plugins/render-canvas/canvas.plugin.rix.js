/**
id: canvas
description: Serializable Canvas 2D drawing plans for Graphics and projected Scene3D snapshots.
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
import { field, installRendererPlugin, plainValue, requireOutput, unwrapGraphic } from "../renderers/common.js";

export const definition = {
    target: "canvas",
    mime: "application/vnd.rix.canvas+json",
    extension: "canvas.json",
    aliases: ["canvas2d", "application/vnd.rix.canvas+json"],
    inputKinds: ["graphic", "figure", "scene3d_snapshot"],
    deterministic: true,
    description: "Serializable CanvasRenderingContext2D plan for core Graphics",
    render({ value, format }) {
        const { value: graphic, snapshot } = unwrapGraphic(value);
        requireOutput(graphic, ["graphic"], "canvas");
        const plan = createCanvasPlan(graphic, format);
        if (snapshot) {
            plan.scene3d = {
                schema: "rix.scene3d.snapshot@1",
                source: plainValue(field(snapshot, "source")),
                picking: plainValue(field(snapshot, "picking")),
            };
            plan.diagnostics.push({
                level: "info",
                code: "scene3d-canvas-snapshot",
                message: "Scene3D camera projection was resolved by the portable snapshot before Canvas lowering.",
            });
        }
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
