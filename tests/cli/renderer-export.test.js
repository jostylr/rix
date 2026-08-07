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
    test(".Out selects loaded text/vector renderers by extension", () => {
        const directory = temporaryDirectory();
        const sourcePath = path.join(directory, "report.rix");
        const outputPath = path.join(directory, "out");
        writeFileSync(sourcePath, `/**
plugins: [svg, canvas, tikz, markdown, html, quarto, latex]
**/
g := .Graphics.Graphic([120, 80], [
    .Graphics.Circle([60, 40], 24, {= fill="#0c7b7f" }),
    .Graphics.Text([60, 44], "RiX", {= fill="white", anchor="middle" })
]);
doc := .Fragment([.Heading(1, "Renderer export"), .Figure(g, "Portable scene")]);
.Out("scene.svg", g);
.Out("scene.canvas.json", g);
.Out("scene.tikz", g);
.Out("report.md", doc);
.Out("report.html", doc);
.Out("report.qmd", doc);
.Out("report.tex", doc);
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
