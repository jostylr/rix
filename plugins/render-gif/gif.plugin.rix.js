/**
id: gif
description: Deterministic animated GIF rendering from Slides, Timelines, or Snapshots through PNG frames.
kind: host
mount: gif
exports: [Render]
groups: [Renderers]
permissions: [process, files]
requires: [rix.renderer.png@1]
provides: [rix.renderer.gif@1]
targets: [gif, image/gif]
snapshot: true
deterministic: true
defaultEnabled: false
**/

import { Integer } from "@ratmath/core";
import { UnsupportedRenderError } from "../../src/runtime/renderer-registry.js";
import { field, installRendererPlugin, numberValue, option, sequence } from "../renderers/common.js";

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

function outputKind(value) {
    return value?.type === "output" ? value.kind : value?.type || typeof value;
}

function frameContent(value, label) {
    let current = value;
    if (["slide", "timeline_render", "snapshot"].includes(outputKind(current))) current = current.content;
    if (outputKind(current) === "object" && current?.content) current = current.content;
    if (outputKind(current) === "fragment" && Array.isArray(current.children) && current.children.length === 1) {
        current = current.children[0];
    }
    const kind = outputKind(current);
    if (!(["graphic", "figure"].includes(kind))) {
        throw new UnsupportedRenderError(`${label} must resolve to one Graphic or graphic Figure; received ${kind}`, {
            code: "gif-frame-layout-unsupported",
            target: "gif",
        });
    }
    return current;
}

function expandFrames(value) {
    const kind = outputKind(value);
    if (kind === "slides") {
        return value.slides.map((slide, index) => ({
            content: frameContent(slide, `Slide ${index + 1}`),
            duration: field(slide.metadata, "duration"),
        }));
    }
    if (kind === "timeline") {
        return value.frames.map((frame, index) => ({
            content: frameContent(frame, `Timeline frame ${index + 1}`),
            duration: null,
        }));
    }
    if (kind === "snapshots") {
        return value.snapshots.map((frame, index) => ({
            content: frameContent(frame, `Snapshot ${index + 1}`),
            duration: null,
        }));
    }
    throw new UnsupportedRenderError(`gif accepts Slides, Timeline, or Snapshots; received ${kind}`, { target: "gif" });
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
    const timelineSeconds = outputKind(value) === "timeline" && value.duration !== null
        ? positiveSeconds(value.duration, "Timeline duration") / frames.length
        : null;
    return frames.map((frame, index) => centiseconds(frame.duration === null
        ? timelineSeconds ?? defaultSeconds
        : positiveSeconds(frame.duration, `Slide ${index + 1} duration`)));
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
            const frames = expandFrames(request.value);
            if (frames.length < 2) throw new Error("Animated GIF rendering requires at least two frames");
            const delays = frameDelays(request.value, frames, request.options);
            const loop = integerOption(option(request.options, "loop"), "GIF loop", 0);
            const pngOptions = {
                width: option(request.options, "width"),
                height: option(request.options, "height"),
                scale: option(request.options, "scale", new Integer(1n)),
                background: option(request.options, "background"),
            };
            const pngFrames = frames.map(({ content }) => request.render(content, "png", pngOptions));
            const encoded = encodeGif(pngFrames.map((result) => result.content), { delays, loop });
            return {
                content: encoded.content,
                toolchain: encoded.toolchain,
                diagnostics: encoded.diagnostics || [],
                metadata: {
                    schema: "rix.gif.render@1",
                    frameCount: frames.length,
                    delays,
                    loop,
                    width: pngFrames[0]?.metadata?.width ?? null,
                    height: pngFrames[0]?.metadata?.height ?? null,
                    frameToolchains: pngFrames.map((result) => result.toolchain),
                },
            };
        },
    };
}

export function install(api) {
    return installRendererPlugin({ ...api, definition: createDefinition(api.encodeGif) });
}
