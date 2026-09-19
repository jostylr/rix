/**
id: gif
description: Deterministic animated GIF rendering from Slides, Timelines, or Snapshots through PNG frames.
kind: host
mount: gif
exports: [Render]
groups: [Renderers]
permissions: [process, files]
requires: [rix.renderer.png@1]
provides: [rix.renderer.gif@1, rix.renderer.gif@2, rix.renderer.gif-frames@1]
schemas: [rix.gif.render@1, rix.gif.render@2, rix.animation-export@1]
targets: [gif, image/gif, gif-frames]
snapshot: true
deterministic: true
defaultEnabled: false
**/

import { Integer } from "@ratmath/core";
import { UnsupportedRenderError } from "../../src/runtime/renderer-registry.js";
import { installRendererPlugin, numberValue, option, rixString, sequence } from "../renderers/common.js";
import { expandGraphicFrames } from "../renderers/static-frames.js";
import { createFrameBundle } from "./frame-bundle.js";

function integerOption(value, label, fallback) {
    if (value === null || value === undefined) return fallback;
    const number = numberValue(value, label);
    if (!Number.isInteger(number) || number < 0) throw new Error(`${label} must be a nonnegative Integer`);
    return number;
}

function positiveSeconds(value, label) {
    const seconds = numberValue(value, label);
    if (!(seconds > 0)) throw new Error(`${label} must be positive`);
    return seconds;
}

function centiseconds(seconds) {
    return Math.max(1, Math.round(seconds * 100));
}

function frameDelays(value, frames, options) {
    const explicit = option(options, "delays");
    if (explicit !== null) {
        const values = sequence(explicit, "GIF delays");
        if (values.length !== frames.length) throw new Error("GIF delays must contain one duration per frame");
        return values.map((entry, index) => centiseconds(positiveSeconds(entry, `GIF delay ${index + 1}`)));
    }
    const durationOption = option(options, "duration");
    const defaultSeconds = durationOption === null ? 1 : positiveSeconds(durationOption, "GIF duration");
    return frames.map((frame, index) => centiseconds(frame.duration === null
        ? defaultSeconds
        : positiveSeconds(frame.duration, `Frame ${index + 1} duration`)));
}

export function createDefinition(encodeGif = null) {
    return {
        target: "gif",
        mime: "image/gif",
        extension: "gif",
        aliases: ["image/gif"],
        inputKinds: ["slides", "timeline", "snapshots"],
        deterministic: true,
        description: "Animated GIF renderer using deterministic PNG frames",
        render(request) {
            if (typeof encodeGif !== "function") {
                throw new UnsupportedRenderError("GIF rendering needs an approved host encoder", {
                    code: "gif-encoder-unavailable",
                    target: "gif",
                });
            }
            const frames = expandGraphicFrames(request.value, { maxFrames: option(request.options, "maxFrames", 1000) });
            if (frames.length < 2) throw new Error("Animated GIF rendering requires at least two frames");
            const delays = frameDelays(request.value, frames, request.options);
            const loop = integerOption(option(request.options, "loop"), "GIF loop", 0);
            const transition = (rixString(option(request.options, "transition", "none")) || "none").toLowerCase();
            if (!["none", "crossfade"].includes(transition)) throw new Error("GIF transition must be none or crossfade");
            const transitionFrames = integerOption(option(request.options, "transitionFrames"), "GIF transitionFrames", transition === "none" ? 0 : 4);
            const dithering = (rixString(option(request.options, "dithering", "floyd-steinberg")) || "floyd-steinberg").toLowerCase();
            if (!["none", "floyd-steinberg", "ordered"].includes(dithering)) throw new Error("GIF dithering must be none, floyd-steinberg, or ordered");
            const palette = (rixString(option(request.options, "palette", "global")) || "global").toLowerCase();
            if (!["global", "local", "adaptive"].includes(palette)) throw new Error("GIF palette must be global, local, or adaptive");
            const pngOptions = {
                width: option(request.options, "width"),
                height: option(request.options, "height"),
                scale: option(request.options, "scale", new Integer(1n)),
                background: option(request.options, "background"),
            };
            const pngFrames = frames.map(({ graphic }) => request.render(graphic, "png", pngOptions));
            const bundle = createFrameBundle(request, frames, delays, { loop, transition, transitionFrames, dithering, palette });
            const encoded = encodeGif(pngFrames.map((result) => result.content), { delays, loop, transition, transitionFrames, dithering, palette });
            return {
                content: encoded.content,
                toolchain: encoded.toolchain,
                assets: [...bundle.assets, { path: `${bundle.prefix}/contact-sheet.html`, mime: "text/html", content: bundle.html.replaceAll(`src="${bundle.prefix}/`, 'src="') }],
                diagnostics: [...bundle.diagnostics, ...(encoded.diagnostics || [])],
                metadata: {
                    schema: "rix.gif.render@2",
                    frameManifest: `${bundle.prefix}/manifest.json`,
                    captionTrack: `${bundle.prefix}/captions.txt`,
                    contactSheet: `${bundle.prefix}/contact-sheet.html`,
                    frameCount: frames.length,
                    delays,
                    loop,
                    width: pngFrames[0]?.metadata?.width ?? null,
                    height: pngFrames[0]?.metadata?.height ?? null,
                    frameToolchains: pngFrames.map((result) => result.toolchain),
                    transition, transitionFrames, dithering, palette,
                    outputFrameCount: transition === "none" ? frames.length : frames.length + (frames.length - 1) * transitionFrames,
                },
            };
        },
    };
}

/** Portable contact sheet remains available when no rasterizer/encoder is installed. */
export function createFramesDefinition() {
    return {
        target: "gif-frames", mime: "text/vnd.rix.animation-frames+html", extension: "frames.html",
        inputKinds: ["slides", "timeline", "snapshots"], deterministic: true,
        description: "Retained animation frames, caption/evidence sidecars, and a static HTML contact sheet",
        render(request) {
            const frames = expandGraphicFrames(request.value, { maxFrames: option(request.options, "maxFrames", 1000) });
            const delays = frameDelays(request.value, frames, request.options);
            const bundle = createFrameBundle(request, frames, delays, { mode: "static", interpolatedFrames: false });
            return { content: bundle.html, mime: "text/html", assets: bundle.assets, diagnostics: bundle.diagnostics,
                metadata: { schema: "rix.animation-export@1", frameCount: frames.length,
                    frameManifest: `${bundle.prefix}/manifest.json`, captionTrack: `${bundle.prefix}/captions.txt` } };
        },
    };
}

export function install(api) {
    api.rendererRegistry.register(createFramesDefinition());
    try { return installRendererPlugin({ ...api, definition: createDefinition(api.encodeGif) }); }
    catch (error) { api.rendererRegistry.unregister("gif-frames"); throw error; }
}
