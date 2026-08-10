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

export function rasterizeSvg(svg, options = {}) {
    const width = Math.max(1, Math.round(options.width));
    const height = Math.max(1, Math.round(options.height));
    const rsvgArgs = ["--format=png", `--width=${width}`, `--height=${height}`];
    if (options.background) rsvgArgs.push(`--background-color=${options.background}`);
    const rsvg = run("rsvg-convert", rsvgArgs, { input: svg });
    if (rsvg) return { content: new Uint8Array(rsvg.stdout), toolchain: "rsvg-convert", width, height };

    const magickArgs = ["svg:-", "-resize", `${width}x${height}!`];
    if (options.background) magickArgs.push("-background", options.background, "-alpha", "remove");
    magickArgs.push("png:-");
    const magick = run("magick", magickArgs, { input: svg });
    if (magick) return { content: new Uint8Array(magick.stdout), toolchain: "ImageMagick", width, height };
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

export function compileLatex(source) {
    const temporaryRoot = path.resolve(process.cwd(), "tmp");
    mkdirSync(temporaryRoot, { recursive: true });
    const directory = mkdtempSync(path.join(temporaryRoot, "rix-pdf-"));
    const input = path.join(directory, "document.tex");
    const output = path.join(directory, "document.pdf");
    try {
        writeFileSync(input, source, "utf8");
        const result = run("pdflatex", ["-interaction=nonstopmode", "-halt-on-error", "document.tex"], {
            cwd: directory,
            env: { ...process.env, SOURCE_DATE_EPOCH: "946684800", FORCE_SOURCE_DATE: "1" },
        });
        if (!result || !existsSync(output)) throw new Error("pdflatex is not available on this host");
        return { content: new Uint8Array(readFileSync(output)), toolchain: "pdflatex" };
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}
