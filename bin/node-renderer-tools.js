/** Node/Bun adapters for renderer plugins that require external toolchains. */

import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function run(command, args, options = {}) {
    const result = spawnSync(command, args, { maxBuffer: 64 * 1024 * 1024, ...options });
    if (result.error?.code === "ENOENT") return null;
    if (result.error) throw result.error;
    if (result.status !== 0) {
        const detail = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : String(result.stderr || "");
        throw new Error(`${command} failed (${result.status}): ${detail.trim() || "no diagnostic output"}`);
    }
    return result;
}

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
    const typeBytes = new TextEncoder().encode(type);
    const result = new Uint8Array(12 + data.length);
    const view = new DataView(result.buffer);
    view.setUint32(0, data.length);
    result.set(typeBytes, 4);
    result.set(data, 8);
    const checksumInput = new Uint8Array(typeBytes.length + data.length);
    checksumInput.set(typeBytes);
    checksumInput.set(data, typeBytes.length);
    view.setUint32(8 + data.length, crc32(checksumInput));
    return result;
}

function pngChunks(content) {
    if (!(content instanceof Uint8Array) || content.length < PNG_SIGNATURE.length
        || PNG_SIGNATURE.some((byte, index) => content[index] !== byte)) {
        throw new Error("Rasterizer returned invalid PNG bytes");
    }
    const chunks = [];
    let offset = PNG_SIGNATURE.length;
    while (offset + 12 <= content.length) {
        const view = new DataView(content.buffer, content.byteOffset + offset, content.length - offset);
        const length = view.getUint32(0);
        const end = offset + 12 + length;
        if (end > content.length) throw new Error("Rasterizer returned a truncated PNG chunk");
        const type = new TextDecoder("ascii").decode(content.subarray(offset + 4, offset + 8));
        chunks.push({ type, bytes: content.slice(offset, end) });
        offset = end;
        if (type === "IEND") break;
    }
    if (chunks.at(-1)?.type !== "IEND") throw new Error("Rasterizer returned PNG bytes without IEND");
    return chunks;
}

function concatenate(parts) {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.length;
    }
    return result;
}

function physicalResolutionChunk(dpi) {
    const data = new Uint8Array(9);
    const pixelsPerMeter = Math.max(1, Math.round(dpi / 0.0254));
    const view = new DataView(data.buffer);
    view.setUint32(0, pixelsPerMeter);
    view.setUint32(4, pixelsPerMeter);
    data[8] = 1;
    return pngChunk("pHYs", data);
}

function internationalTextChunk(keyword, value) {
    const key = new TextEncoder().encode(keyword);
    const text = new TextEncoder().encode(value);
    const data = new Uint8Array(key.length + text.length + 5);
    data.set(key, 0);
    data[key.length] = 0;
    data[key.length + 1] = 0;
    data[key.length + 2] = 0;
    data[key.length + 3] = 0;
    data[key.length + 4] = 0;
    data.set(text, key.length + 5);
    return pngChunk("iTXt", data);
}

export function applyPngPolicy(content, options = {}) {
    const chunks = pngChunks(content);
    const colorProfile = options.colorProfile || "srgb";
    const removed = new Set(["pHYs"]);
    if (colorProfile === "srgb" || colorProfile === "none") {
        for (const type of ["sRGB", "iCCP", "gAMA", "cHRM"]) removed.add(type);
    }
    const additions = [physicalResolutionChunk(options.dpi || 96)];
    if (colorProfile === "srgb") additions.push(pngChunk("sRGB", new Uint8Array([0])));
    for (const [key, value] of Object.entries(options.metadata || {}).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))) {
        additions.push(internationalTextChunk(key, value));
    }
    const retained = chunks.filter(({ type }) => !removed.has(type));
    const parts = [PNG_SIGNATURE];
    for (const chunk of retained) {
        parts.push(chunk.bytes);
        if (chunk.type === "IHDR") parts.push(...additions);
    }
    return concatenate(parts);
}

export function rasterizeSvg(svg, options = {}) {
    const width = Math.max(1, Math.round(options.width));
    const height = Math.max(1, Math.round(options.height));
    const dpi = Math.max(1, Number(options.dpi || 96));
    const antialiasing = options.antialiasing || "on";
    const rsvgArgs = ["--format=png", `--width=${width}`, `--height=${height}`, `--dpi-x=${dpi}`, `--dpi-y=${dpi}`];
    if (options.background) rsvgArgs.push(`--background-color=${options.background}`);
    if (antialiasing !== "off") {
        const rsvg = run("rsvg-convert", rsvgArgs, { input: svg });
        if (rsvg) {
            return {
                content: applyPngPolicy(new Uint8Array(rsvg.stdout), options),
                toolchain: "rsvg-convert", width, height,
            };
        }
    }

    const magickArgs = ["-density", String(dpi), antialiasing === "off" ? "+antialias" : "-antialias", "svg:-", "-resize", `${width}x${height}!`];
    if (options.background) magickArgs.push("-background", options.background, "-alpha", "remove");
    if (options.colorProfile === "srgb") magickArgs.push("-colorspace", "sRGB");
    if (options.colorProfile === "none") magickArgs.push("+profile", "*");
    magickArgs.push("png:-");
    const magick = run("magick", magickArgs, { input: svg });
    if (magick) {
        return {
            content: applyPngPolicy(new Uint8Array(magick.stdout), options),
            toolchain: "ImageMagick", width, height,
        };
    }
    if (antialiasing === "off") throw new Error("PNG antialiasing=off requires ImageMagick on this host");
    throw new Error("No SVG rasterizer is available (tried rsvg-convert and magick)");
}

export function encodeGifFrames(frames, options = {}) {
    if (!Array.isArray(frames) || frames.length < 2) throw new Error("GIF encoding requires at least two PNG frames");
    const delays = options.delays || frames.map(() => 100);
    if (delays.length !== frames.length) throw new Error("GIF encoding requires one delay per frame");
    const temporaryRoot = path.resolve(process.cwd(), "tmp");
    mkdirSync(temporaryRoot, { recursive: true });
    const directory = mkdtempSync(path.join(temporaryRoot, "rix-gif-"));
    try {
        const files = frames.map((content, index) => {
            const filename = path.join(directory, `frame-${String(index + 1).padStart(4, "0")}.png`);
            writeFileSync(filename, content);
            return filename;
        });
        const args = [];
        for (let index = 0; index < files.length; index += 1) {
            args.push("-delay", String(delays[index]), files[index]);
        }
        if (options.transition === "crossfade" && options.transitionFrames > 0) {
            args.push("-morph", String(options.transitionFrames));
        }
        if (options.dithering === "none") args.push("+dither");
        else if (options.dithering === "ordered") args.push("-ordered-dither", "o8x8");
        else args.push("-dither", "FloydSteinberg");
        if (options.palette === "adaptive") args.push("-colors", "256");
        else if (options.palette === "global") args.push("-coalesce", "-colors", "256");
        args.push("-loop", String(options.loop ?? 0), "-strip", "gif:-");
        const runOptions = {
            env: { ...process.env, SOURCE_DATE_EPOCH: "946684800" },
            maxBuffer: 128 * 1024 * 1024,
        };
        const magick = run("magick", args, runOptions);
        if (magick) return { content: new Uint8Array(magick.stdout), toolchain: "ImageMagick" };
        const convert = run("convert", args, runOptions);
        if (convert) return { content: new Uint8Array(convert.stdout), toolchain: "ImageMagick convert" };
        throw new Error("No GIF encoder is available (tried magick and convert)");
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}

export function compileLatex(source, _options = {}, assets = []) {
    const temporaryRoot = path.resolve(process.cwd(), "tmp");
    mkdirSync(temporaryRoot, { recursive: true });
    const directory = mkdtempSync(path.join(temporaryRoot, "rix-pdf-"));
    const input = path.join(directory, "document.tex");
    const output = path.join(directory, "document.pdf");
    try {
        writeFileSync(input, source, "utf8");
        for (const asset of assets || []) {
            if (!asset?.path || path.isAbsolute(asset.path) || asset.path.split(/[\\/]/).includes("..")) {
                throw new Error("PDF delegated assets require safe relative paths");
            }
            const filename = path.join(directory, asset.path);
            mkdirSync(path.dirname(filename), { recursive: true });
            writeFileSync(filename, asset.content);
        }
        let log = "", passes = 0;
        const needsRerun = text => /Rerun to get|Label\(s\) may have changed|rerunfilecheck Warning/.test(text);
        do {
            const result = run("pdflatex", ["-no-shell-escape", "-interaction=nonstopmode", "-halt-on-error", "document.tex"], {
                cwd: directory, timeout: 30000,
                env: { ...process.env, SOURCE_DATE_EPOCH: "946684800", FORCE_SOURCE_DATE: "1" },
            });
            if (!result || !existsSync(output)) throw new Error("pdflatex is not available on this host");
            log = result.stdout.toString("utf8"); passes += 1;
        } while (passes < 3 && needsRerun(log));
        const diagnostics = [];
        if (needsRerun(log) || /There were undefined (references|citations)/.test(log)) diagnostics.push({level:"warning",code:"pdf-unresolved-references",message:"PDF labels/citations did not settle within the three-pass compilation budget."});
        return { content: new Uint8Array(readFileSync(output)), toolchain: "pdflatex", passes, diagnostics };
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}
