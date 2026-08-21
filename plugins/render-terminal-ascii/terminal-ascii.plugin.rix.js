/**
id: terminal-ascii
description: Deterministic strict-ASCII fallback with wrapping, pagination, slides, tables, grids, and simple Graphics.
kind: host
mount: terminalAscii
exports: [Render]
groups: [Renderers]
permissions: []
provides: [rix.renderer.terminal-ascii@1]
targets: [terminal-ascii, terminal, ascii, txt, text/plain]
snapshot: true
deterministic: true
defaultEnabled: false
**/

import { installRendererPlugin } from "../renderers/common.js";
import { renderTerminalAscii } from "./terminal-ascii-renderer.js";

export const definition = {
    target: "terminal-ascii",
    mime: "text/plain",
    extension: "txt",
    aliases: ["terminal", "ascii", "txt", "text/plain"],
    inputKinds: ["table", "grid", "fragment", "graphic", "figure", "slide", "slides"],
    deterministic: true,
    description: "Deterministic strict-ASCII terminal fallback for structured output, slides, and simple Graphics",
    render({ value, options, format }) {
        return renderTerminalAscii(value, { options, format });
    },
};

export function install(api) {
    return installRendererPlugin({ ...api, definition, mount: "terminalAscii" });
}

export { renderTerminalAscii } from "./terminal-ascii-renderer.js";
