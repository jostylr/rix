/**
id: tikz
description: Editable TikZ/PGF source renderer for core Graphics scenes.
kind: host
mount: tikz
exports: [Render]
groups: [Renderers]
permissions: []
provides: [rix.renderer.tikz@1]
targets: [tikz, text/x-tikz]
snapshot: true
deterministic: true
defaultEnabled: false
**/

import { installRendererPlugin, option, requireOutput, unwrapFigure } from "../renderers/common.js";
import { renderGraphicTikz } from "./tikz-renderer.js";

export const definition = {
    target: "tikz",
    mime: "text/x-tikz",
    extension: "tikz",
    aliases: ["pgf"],
    inputKinds: ["graphic", "figure"],
    deterministic: true,
    description: "Editable TikZ/PGF source renderer for core Graphics",
    render({ value, options, format }) {
        const { value: graphic } = unwrapFigure(value);
        requireOutput(graphic, ["graphic"], "tikz");
        return renderGraphicTikz(graphic, format, { standalone: boolOption(option(options, "standalone", false)) });
    },
};

function boolOption(value) {
    return value?.value === 1n || value === true || value === 1;
}

export function install(api) {
    return installRendererPlugin({ ...api, definition });
}

export { renderGraphicTikz } from "./tikz-renderer.js";
