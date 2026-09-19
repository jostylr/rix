/**
id: tikz
description: Editable TikZ/PGF source renderer for core Graphics scenes.
kind: host
mount: tikz
exports: [Render]
groups: [Renderers]
permissions: []
provides: [rix.renderer.tikz@1, rix.tikz.dependencies@1]
schemas: [rix.tikz.dependencies@1]
targets: [tikz, text/x-tikz]
snapshot: true
deterministic: true
defaultEnabled: false
**/

import { installRendererPlugin, option } from "../renderers/common.js";
import { portableFrameValue, selectGraphicFrame } from "../renderers/static-frames.js";
import { renderGraphicTikz } from "./tikz-renderer.js";

export const definition = {
    target: "tikz",
    mime: "text/x-tikz",
    extension: "tikz",
    aliases: ["pgf"],
    inputKinds: ["graphic", "figure", "scene3d_snapshot", "timeline_render", "timeline", "snapshots", "slides", "slide"],
    deterministic: true,
    description: "Editable TikZ/PGF source renderer for core Graphics",
    render({ value, options, format }) {
        const selected = selectGraphicFrame(value, option(options, "frame", 1), { maxFrames: option(options, "maxFrames", 1000) });
        const result = renderGraphicTikz(selected.graphic, format, {
            standalone: boolOption(option(options, "standalone", false)),
            preamble: boolOption(option(options, "preamble", false)),
        });
        const { graphic, ...frame } = selected;
        const retained = portableFrameValue(frame);
        return { ...result, diagnostics: [...result.diagnostics, ...(retained.metadata.snapshot?.diagnostics || [])], metadata: { ...result.metadata, staticFrame: retained } };
    },
};

function boolOption(value) {
    return value?.value === 1n || value === true || value === 1;
}

export function install(api) {
    return installRendererPlugin({ ...api, definition });
}

export { renderGraphicTikz } from "./tikz-renderer.js";
