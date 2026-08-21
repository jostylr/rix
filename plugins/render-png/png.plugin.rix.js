/**
id: png
description: PNG renderer for Graphics and projected Scene3D snapshots through a host rasterizer.
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

import { lowerGraphicSvg } from "../../src/runtime/output.js";
import { UnsupportedRenderError } from "../../src/runtime/renderer-registry.js";
import {
    field, installRendererPlugin, mapEntries, numberValue, option, outputKind,
    plainValue, requireOutput, rixString, sequence, unwrapGraphic,
} from "../renderers/common.js";

const BASE_DPI = 96;

function policyName(value, fallback, allowed, label) {
    const token = value === null || value === undefined
        ? fallback
        : (rixString(value) ?? (typeof value === "string" ? value : null));
    if (token === null) throw new Error(`${label} must be a string`);
    const name = token.toLowerCase();
    if (!allowed.includes(name)) throw new Error(`${label} must be one of ${allowed.join(", ")}`);
    return name;
}

function positiveNumber(value, label) {
    const result = numberValue(value, label);
    if (!(result > 0)) throw new Error(`${label} must be positive`);
    return result;
}

function graphicFigures(value, result = []) {
    const kind = outputKind(value);
    if (kind === "figure") {
        const content = field(value, "content");
        const contentKind = outputKind(content);
        if (["graphic", "scene3d_snapshot"].includes(contentKind)) result.push(value);
        return result;
    }
    if (kind === "fragment") {
        for (const child of field(value, "children", [])) graphicFigures(child, result);
    }
    return result;
}

function selectorValue(value) {
    if (value === null || value === undefined) return null;
    const text = rixString(value);
    if (text !== null) return text;
    const number = numberValue(value, "PNG document figure selector");
    if (!Number.isInteger(number) || number < 1) throw new Error("PNG document figure selector must be a positive integer or figure label");
    return number;
}

function resolveInput(value, options) {
    if (outputKind(value) !== "fragment") return { ...unwrapGraphic(value), documentRegion: null };
    const figures = graphicFigures(value);
    if (figures.length === 0) throw new UnsupportedRenderError("PNG document-region rendering found no graphic Figure", {
        code: "png-document-region-empty", target: "png",
    });
    const selector = selectorValue(option(options, "figure", 1));
    let index;
    if (typeof selector === "string") {
        index = figures.findIndex((figure) => field(figure, "label") === selector);
        if (index < 0) throw new Error(`PNG document figure label '${selector}' was not found`);
    } else {
        index = selector - 1;
        if (index >= figures.length) throw new Error(`PNG document figure ${selector} is outside 1…${figures.length}`);
    }
    const figure = figures[index];
    return {
        ...unwrapGraphic(figure),
        documentRegion: {
            selector,
            figureIndex: index + 1,
            figureCount: figures.length,
            label: field(figure, "label"),
            caption: field(figure, "caption"),
            alt: field(figure, "alt"),
        },
    };
}

function normalizeRegion(value, sourceWidth, sourceHeight) {
    if (value === null || value === undefined) return { x: 0, y: 0, width: sourceWidth, height: sourceHeight, cropped: false };
    const entries = mapEntries(value);
    const values = entries
        ? [field(value, "x"), field(value, "y"), field(value, "width"), field(value, "height")]
        : sequence(value, "PNG region");
    if (values.length !== 4) throw new Error("PNG region must contain x, y, width, and height");
    const [x, y, width, height] = values.map((entry, index) => numberValue(entry, `PNG region ${["x", "y", "width", "height"][index]}`));
    if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > sourceWidth || y + height > sourceHeight) {
        throw new Error("PNG region must be a positive rectangle inside the source Graphic");
    }
    return { x, y, width, height, cropped: x !== 0 || y !== 0 || width !== sourceWidth || height !== sourceHeight };
}

function cropSvg(svg, region) {
    if (!region.cropped) return svg;
    return svg.replace(/<svg\b([^>]*)>/, (root, attributes) => {
        const withoutViewBox = attributes
            .replace(/\sviewBox="[^"]*"/, "")
            .replace(/\swidth="[^"]*"/, "")
            .replace(/\sheight="[^"]*"/, "");
        return `<svg${withoutViewBox} viewBox="${region.x} ${region.y} ${region.width} ${region.height}" width="${region.width}" height="${region.height}">`;
    });
}

function outputDimensions(region, options, dpi, scale) {
    const requestedWidth = option(options, "width");
    const requestedHeight = option(options, "height");
    let width = requestedWidth === null ? null : positiveNumber(requestedWidth, "PNG width");
    let height = requestedHeight === null ? null : positiveNumber(requestedHeight, "PNG height");
    if (width === null && height === null) {
        const pixelFactor = scale * dpi / BASE_DPI;
        width = region.width * pixelFactor;
        height = region.height * pixelFactor;
    } else if (width === null) {
        width = height * region.width / region.height;
    } else if (height === null) {
        height = width * region.height / region.width;
    }
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}

function normalizeMetadata(value) {
    if (value === null || value === undefined) return {};
    const entries = mapEntries(value);
    if (!entries) throw new Error("PNG metadata must be a map");
    if (entries.size > 32) throw new Error("PNG metadata supports at most 32 entries");
    const result = {};
    for (const [rawKey, rawValue] of entries) {
        const key = String(rawKey);
        if (!/^[\x20-\x7e]{1,79}$/.test(key) || key.includes("\0") || key.trim() !== key || key.includes("  ")) {
            throw new Error("PNG metadata keys must be 1–79 printable ASCII characters without leading, trailing, or consecutive spaces");
        }
        const plain = plainValue(rawValue);
        if (!["string", "number", "boolean"].includes(typeof plain) && plain !== null) {
            throw new Error(`PNG metadata '${key}' must be a scalar value`);
        }
        const text = plain === null ? "" : String(plain);
        if (new TextEncoder().encode(text).length > 4096) throw new Error(`PNG metadata '${key}' exceeds 4096 UTF-8 bytes`);
        result[key] = text;
    }
    return result;
}

export function createDefinition(rasterizeSvg = null) {
    return {
        target: "png",
        mime: "image/png",
        extension: "png",
        aliases: ["image/png"],
        inputKinds: ["graphic", "figure", "fragment", "scene3d_snapshot"],
        deterministic: true,
        description: "PNG snapshot renderer for core Graphics through a host rasterizer",
        render({ value, options, format }) {
            if (typeof rasterizeSvg !== "function") {
                throw new UnsupportedRenderError("PNG rendering needs a host SVG rasterizer; this host installed only the portable renderer contract", {
                    code: "png-rasterizer-unavailable",
                    target: "png",
                });
            }
            const { value: graphic, figure, snapshot, documentRegion } = resolveInput(value, options);
            requireOutput(graphic, ["graphic"], "png");
            const scale = positiveNumber(option(options, "scale", 1), "PNG scale");
            const dpi = positiveNumber(option(options, "dpi", BASE_DPI), "PNG DPI");
            const sourceWidth = positiveNumber(graphic.size[0], "Graphic width");
            const sourceHeight = positiveNumber(graphic.size[1], "Graphic height");
            const region = normalizeRegion(option(options, "region"), sourceWidth, sourceHeight);
            const dimensions = outputDimensions(region, options, dpi, scale);
            const background = rixString(option(options, "background"));
            if (option(options, "background") !== null && background === null) throw new Error("PNG background must be a color string");
            const colorProfile = policyName(option(options, "colorProfile", "srgb"), "srgb", ["srgb", "native", "none"], "PNG colorProfile");
            const antialiasing = policyName(option(options, "antialiasing", "on"), "on", ["on", "off"], "PNG antialiasing");
            const embeddedMetadata = normalizeMetadata(option(options, "metadata"));
            const coordinateLowering = lowerGraphicSvg(graphic, format, {
                precision: numberValue(option(options, "precision", 6), "PNG/SVG coordinate precision"),
                rounding: rixString(option(options, "rounding", "nearest")) || option(options, "rounding", "nearest"),
            });
            const svg = cropSvg(coordinateLowering.content, region);
            const rendered = rasterizeSvg(svg, {
                ...dimensions,
                dpi,
                background,
                colorProfile,
                antialiasing,
                metadata: embeddedMetadata,
            });
            return {
                content: rendered.content,
                toolchain: rendered.toolchain,
                diagnostics: [...coordinateLowering.diagnostics, ...(rendered.diagnostics || [])],
                metadata: {
                    width: rendered.width,
                    height: rendered.height,
                    dpi,
                    scale,
                    aspectRatio: rendered.width / rendered.height,
                    sourceSize: { width: sourceWidth, height: sourceHeight },
                    region,
                    background,
                    alphaPolicy: background === null ? "preserve" : "composite",
                    colorProfile,
                    antialiasing,
                    embeddedMetadata,
                    coordinateLowering: coordinateLowering.metadata,
                    ...(figure ? {
                        figure: {
                            label: field(figure, "label"), caption: field(figure, "caption"), alt: field(figure, "alt"),
                        },
                    } : {}),
                    ...(documentRegion ? { documentRegion } : {}),
                    ...(snapshot ? {
                        scene3d: {
                            schema: "rix.scene3d.snapshot@1",
                            source: plainValue(field(snapshot, "source")),
                        },
                    } : {}),
                },
            };
        },
    };
}

export function install(api) {
    return installRendererPlugin({ ...api, definition: createDefinition(api.rasterizeSvg) });
}
