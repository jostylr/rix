import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rixRoot = path.resolve(import.meta.dir, "../..");
const temporaryRoot = path.join(rixRoot, "tmp");
const directories = [];

function temporaryDirectory() {
    mkdirSync(temporaryRoot, { recursive: true });
    const directory = mkdtempSync(path.join(temporaryRoot, "renderer-export-"));
    directories.push(directory);
    return directory;
}

afterEach(() => {
    while (directories.length) rmSync(directories.pop(), { recursive: true, force: true });
});

describe("CLI renderer export", () => {
    test("the exact polynomial example prints quotient, remainder, and synthetic Grid", () => {
        const sourcePath = path.join(rixRoot, "examples/algebra/exact-polynomial.rix");
        const result = spawnSync("bun", [path.join(rixRoot, "bin/rix.js"), sourcePath], {
            cwd: rixRoot,
            encoding: "utf8",
        });
        expect(result.status).toBe(0);
        expect(result.stderr).toBe("");
        expect(result.stdout).toContain("# Exact polynomial division");
        expect(result.stdout).toContain("| quotient  | [1, -4, 3]");
        expect(result.stdout).toContain("2 | 1  -6  11  -6");
    });

    test("the terminal ASCII example prints synthetic division and a small plot", () => {
        const sourcePath = path.join(rixRoot, "examples/renderers/terminal-ascii-report.rix");
        const result = spawnSync("bun", [path.join(rixRoot, "bin/rix.js"), sourcePath], {
            cwd: rixRoot,
            encoding: "utf8",
        });
        expect(result.status).toBe(0);
        expect(result.stderr).toBe("");
        expect(result.stdout).toContain("# Exact terminal report");
        expect(result.stdout).toContain("1 | 2  -6   2  -1");
        expect(result.stdout).toContain("********");
        expect([...result.stdout].every((character) => character === "\n" || (character.codePointAt(0) >= 32 && character.codePointAt(0) <= 126))).toBe(true);
    });

    test("the numbered document example exports resolved Markdown and HTML references", () => {
        const directory = temporaryDirectory();
        const outputPath = path.join(directory, "out");
        const sourcePath = path.join(rixRoot, "examples/documents/numbered-report.rix");
        const result = spawnSync("bun", [path.join(rixRoot, "bin/rix.js"), `--out=${outputPath}`, sourcePath], {
            cwd: rixRoot,
            encoding: "utf8",
        });
        expect(result.status).toBe(0);
        expect(result.stderr).toBe("");
        const markdown = readFileSync(path.join(outputPath, "numbered-report.md"), "utf8");
        const html = readFileSync(path.join(outputPath, "numbered-report.html"), "utf8");
        expect(markdown).toContain("[Table 1](#tbl-values)");
        expect(markdown).toContain("Figure 1\\. A fitted polynomial view");
        expect(html).toContain('href="#fig-curve"');
        expect(html).toContain('id="tbl-values"');
    });

    test("the 4D example exports a Scene3D snapshot and embedded glTF", () => {
        const directory = temporaryDirectory();
        const outputPath = path.join(directory, "out");
        const sourcePath = path.join(rixRoot, "examples/geometry/tesseract.rix");
        const result = spawnSync("bun", [path.join(rixRoot, "bin/rix.js"), `--out=${outputPath}`, sourcePath], {
            cwd: rixRoot,
            encoding: "utf8",
        });
        expect(result.status).toBe(0);
        expect(result.stderr).toBe("");
        expect(readFileSync(path.join(outputPath, "tesseract.svg"), "utf8")).toContain("<svg");
        const gltf = JSON.parse(readFileSync(path.join(outputPath, "tesseract.gltf"), "utf8"));
        expect(gltf.asset.version).toBe("2.0");
        expect(gltf.meshes).toHaveLength(32);
        expect(gltf.buffers[0].uri).toStartWith("data:application/octet-stream;base64,");
    });

    test(".Out selects loaded text/vector renderers by extension", () => {
        const directory = temporaryDirectory();
        const sourcePath = path.join(directory, "report.rix");
        const outputPath = path.join(directory, "out");
        writeFileSync(sourcePath, `/**
plugins: [svg, canvas, terminal-ascii, tikz, markdown, html, quarto, latex, csv]
**/
g := .Graphics.Graphic([120, 80], [
    .Graphics.Circle([60, 40], 24, {= fill="#0c7b7f" }),
    .Graphics.Text([60, 44], "RiX", {= fill="white", anchor="middle" })
]);
doc := .Fragment([.Heading(1, "Renderer export"), .Figure(g, "Portable scene")]);
table := .Table(["name", "value"], [["half", 1/2], ["unknown", _]]);
.Out("scene.svg", g);
.Out("scene.canvas.json", g);
.Out("scene.tikz", g);
.Out("report.md", doc);
.Out("report.html", doc);
.Out("report.qmd", doc);
.Out("report.tex", doc);
.Out("report.txt", doc);
.Out("values.csv", table);
.Out("values.tsv", table);
0;
`, "utf8");
        const result = spawnSync("bun", [path.join(rixRoot, "bin/rix.js"), `--out=${outputPath}`, sourcePath], {
            cwd: rixRoot,
            encoding: "utf8",
        });
        expect(result.status).toBe(0);
        expect(result.stderr).toBe("");
        expect(readFileSync(path.join(outputPath, "scene.svg"), "utf8")).toContain("<svg");
        expect(JSON.parse(readFileSync(path.join(outputPath, "scene.canvas.json"), "utf8")).schema).toBe("rix.canvas-plan@1");
        expect(readFileSync(path.join(outputPath, "scene.tikz"), "utf8")).toContain("\\begin{tikzpicture}");
        expect(readFileSync(path.join(outputPath, "report.md"), "utf8")).toContain("# Renderer export");
        expect(readFileSync(path.join(outputPath, "report.html"), "utf8")).toContain("<!doctype html>");
        expect(readFileSync(path.join(outputPath, "report.qmd"), "utf8")).toStartWith('---\ntitle: "report"\nformat: html');
        expect(readFileSync(path.join(outputPath, "report.tex"), "utf8")).toContain("\\documentclass{article}");
        expect(readFileSync(path.join(outputPath, "report.txt"), "utf8")).toContain("# Renderer export");
        expect(readFileSync(path.join(outputPath, "values.csv"), "utf8")).toBe("name,value\nhalf,1/2\nunknown,\n");
        expect(readFileSync(path.join(outputPath, "values.tsv"), "utf8")).toBe("name\tvalue\nhalf\t1/2\nunknown\t\n");
        expect(existsSync(path.join(outputPath, "assets", "rix-page.js"))).toBe(false);
    });

    test("PNG/PDF adapters emit original binary files when host tools are available", () => {
        const rsvg = spawnSync("rsvg-convert", ["--version"], { encoding: "utf8" });
        const magick = spawnSync("magick", ["--version"], { encoding: "utf8" });
        const pdflatex = spawnSync("pdflatex", ["--version"], { encoding: "utf8" });
        if ((rsvg.status !== 0 && magick.status !== 0) || pdflatex.status !== 0) return;

        const directory = temporaryDirectory();
        const outputPath = path.join(directory, "out");
        const sourcePath = path.join(rixRoot, "examples/renderers/all-formats.rix");
        const result = spawnSync("bun", [path.join(rixRoot, "bin/rix.js"), `--out=${outputPath}`, sourcePath], {
            cwd: rixRoot,
            encoding: "utf8",
        });
        expect(result.status).toBe(0);
        expect(result.stderr).toBe("");
        expect([...readFileSync(path.join(outputPath, "diagram.png")).subarray(0, 8)])
            .toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
        expect(readFileSync(path.join(outputPath, "report.pdf")).subarray(0, 5).toString("ascii"))
            .toBe("%PDF-");
        expect([
            "diagram.svg", "diagram.canvas.json", "diagram.tikz", "diagram.png",
            "report.md", "report.html", "report.qmd", "report.tex", "report.pdf",
        ].every((name) => existsSync(path.join(outputPath, name)))).toBe(true);
    });
});
