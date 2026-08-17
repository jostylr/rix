/**
id: webgl
description: Browser-safe executable WebGL plans for retained Scene3D values.
kind: host
mount: webgl
exports: [Render]
groups: [Renderers, Scene3D]
permissions: []
requires: [rix.scene3d@1]
provides: [rix.renderer.webgl@1, rix.webgl-plan@1]
schemas: [rix.webgl-plan@1]
targets: [webgl, application/vnd.rix.webgl+json]
snapshot: true
deterministic: true
defaultEnabled: false
**/

import { installRendererPlugin, requireOutput } from "../renderers/common.js";
import { createWebGLPlan } from "./webgl-plan.js";

export const definition = {
    target: "webgl",
    mime: "application/vnd.rix.webgl+json",
    extension: "webgl.json",
    aliases: ["application/vnd.rix.webgl+json"],
    inputKinds: ["scene3d"],
    deterministic: true,
    description: "Browser-safe executable WebGL plan for retained Scene3D values",
    render({ value, options }) {
        requireOutput(value, ["scene3d"], "webgl");
        const plan = createWebGLPlan(value, options);
        return {
            content: `${JSON.stringify({ ...plan, diagnostics: undefined })}\n`,
            diagnostics: plan.diagnostics,
            metadata: {
                schema: plan.schema,
                drawCalls: plan.drawCalls.length,
                annotations: plan.annotations.length,
            },
        };
    },
};

export function install(api) {
    return installRendererPlugin({ ...api, definition });
}

export { createWebGLPlan, paintWebGLPlan } from "./webgl-plan.js";
