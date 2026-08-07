/**
id: gltf
description: Browser-safe glTF 2.0 JSON exporter for retained Scene3D values.
kind: host
mount: gltf
exports: [Render]
groups: [Renderers, Scene3D]
permissions: []
requires: [rix.scene3d@1]
provides: [rix.renderer.gltf@1]
targets: [gltf, model/gltf+json]
snapshot: true
deterministic: true
defaultEnabled: false
**/

import { installRendererPlugin, requireOutput } from "../renderers/common.js";
import { exportSceneGltf } from "./gltf-renderer.js";

export const definition = {
    target: "gltf",
    mime: "model/gltf+json",
    extension: "gltf",
    aliases: ["model/gltf+json"],
    inputKinds: ["scene3d"],
    deterministic: true,
    description: "Browser-safe glTF 2.0 JSON exporter for retained Scene3D values",
    render({ value, options }) {
        requireOutput(value, ["scene3d"], "gltf");
        return exportSceneGltf(value, { pretty: options?.pretty !== false });
    },
};

export function install(api) {
    return installRendererPlugin({ ...api, definition });
}

export { exportSceneGltf } from "./gltf-renderer.js";

