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

    test("the LaTeX publication example includes exact synthetic division", () => {
        const directory = temporaryDirectory();
        const outputPath = path.join(directory, "out");
        const sourcePath = path.join(rixRoot, "examples/renderers/synthetic-division-publication.rix");
        const result = spawnSync("bun", [path.join(rixRoot, "bin/rix.js"), `--out=${outputPath}`, sourcePath], {
            cwd: rixRoot,
            encoding: "utf8",
        });
        expect(result.status).toBe(0);
        expect(result.stderr).toBe("");
        const latex = readFileSync(path.join(outputPath, "synthetic-division.tex"), "utf8");
        expect(latex).toContain("\\section{Synthetic division}");
        expect(latex).toContain("\\begin{tabular}{r|rrrr}");
        expect(latex).toContain("2 & 1 & -6 & 11 & -6");
    });

    test("the polynomial transparency fixture remains close across SVG rasterizers", () => {
        const directory = temporaryDirectory();
        const outputPath = path.join(directory, "out");
        const sourcePath = path.join(rixRoot, "examples/renderers/polynomial-transparency.rix");
        const result = spawnSync("bun", [path.join(rixRoot, "bin/rix.js"), `--out=${outputPath}`, sourcePath], {
            cwd: rixRoot,
            encoding: "utf8",
        });
        expect(result.status).toBe(0);
        const svgPath = path.join(outputPath, "polynomial-transparency.svg");
        const svg = readFileSync(svgPath, "utf8");
        expect(svg).toContain('opacity="0.5"');
        expect(svg).toContain("y = x^2");

        if (spawnSync("rsvg-convert", ["--version"]).status !== 0 || spawnSync("magick", ["--version"]).status !== 0) return;
        const rsvgPath = path.join(directory, "rsvg.png");
        const magickPath = path.join(directory, "magick.png");
        expect(spawnSync("rsvg-convert", ["--format=png", "--output", rsvgPath, svgPath]).status).toBe(0);
        expect(spawnSync("magick", [svgPath, magickPath]).status).toBe(0);
        const comparison = spawnSync("magick", ["compare", "-metric", "RMSE", rsvgPath, magickPath, "null:"], { encoding: "utf8" });
        const normalized = Number(comparison.stderr.match(/\(([^)]+)\)/)?.[1]);
        expect(Number.isFinite(normalized)).toBe(true);
        expect(normalized).toBeLessThan(0.1);
    });

    test("the mathematical timeline fixture exports two timed GIF frames", () => {
        if (spawnSync("magick", ["--version"]).status !== 0 || spawnSync("rsvg-convert", ["--version"]).status !== 0) return;
        const directory = temporaryDirectory();
        const outputPath = path.join(directory, "out");
        const sourcePath = path.join(rixRoot, "examples/renderers/two-frame-derivation.rix");
        const result = spawnSync("bun", [path.join(rixRoot, "bin/rix.js"), `--out=${outputPath}`, sourcePath], {
            cwd: rixRoot,
            encoding: "utf8",
        });
        expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
        const gifPath = path.join(outputPath, "two-frame-derivation.gif");
        expect(readFileSync(gifPath).subarray(0, 6).toString("ascii")).toBe("GIF89a");
        const identified = spawnSync("magick", ["identify", "-format", "%n %T %w %h\\n", gifPath], { encoding: "utf8" });
        expect(identified.status).toBe(0);
        expect(identified.stdout.trim().split("\n")).toEqual(["2 100 360 140", "2 100 360 140"]);
    });

    test("Quarto writes external SVG assets and optionally compiles the QMD", () => {
        const directory = temporaryDirectory();
        const outputPath = path.join(directory, "out");
        const sourcePath = path.join(rixRoot, "examples/renderers/quarto-external-assets.rix");
        const result = spawnSync("bun", [path.join(rixRoot, "bin/rix.js"), `--out=${outputPath}`, sourcePath], {
            cwd: rixRoot,
            encoding: "utf8",
        });
        expect(result.status).toBe(0);
        const qmd = readFileSync(path.join(outputPath, "report.qmd"), "utf8");
        expect(qmd).toContain("assets/figure-1.svg");
        expect(readFileSync(path.join(outputPath, "assets/figure-1.svg"), "utf8")).toContain("<svg");

        if (spawnSync("quarto", ["--version"]).status !== 0) return;
        const quartoHome = path.join(directory, "quarto-home");
        const quartoCache = path.join(quartoHome, "quarto-cache");
        const denoCache = path.join(quartoHome, "deno");
        mkdirSync(quartoCache, { recursive: true });
        mkdirSync(denoCache, { recursive: true });
        const compiled = spawnSync("quarto", ["render", "report.qmd", "--to", "html", "--output", "report.html"], {
            cwd: outputPath,
            encoding: "utf8",
            env: {
                ...process.env,
                HOME: quartoHome,
                XDG_CACHE_HOME: path.join(quartoHome, ".cache"),
                QUARTO_CACHE_DIR: quartoCache,
                DENO_DIR: denoCache,
            },
        });
        expect(compiled.status, `${compiled.stdout}\n${compiled.stderr}`).toBe(0);
        expect(readFileSync(path.join(outputPath, "report.html"), "utf8")).toContain("External asset report");
    });

    test("the PDF fixture renders one nonblank letter-size page", () => {
        if (spawnSync("pdflatex", ["--version"]).status !== 0 || spawnSync("pdftoppm", ["-v"]).status !== 0) return;
        const directory = temporaryDirectory();
        const outputPath = path.join(directory, "out");
        const sourcePath = path.join(rixRoot, "examples/renderers/pdf-page-fixture.rix");
        const result = spawnSync("bun", [path.join(rixRoot, "bin/rix.js"), `--out=${outputPath}`, sourcePath], {
            cwd: rixRoot,
            encoding: "utf8",
        });
        expect(result.status).toBe(0);
        const pdfPath = path.join(outputPath, "pdf-page-fixture.pdf");
        expect(readFileSync(pdfPath).subarray(0, 5).toString("ascii")).toBe("%PDF-");
        const pageRoot = path.join(directory, "page");
        expect(spawnSync("pdftoppm", ["-f", "1", "-singlefile", "-r", "36", pdfPath, pageRoot]).status).toBe(0);
        const ppm = readFileSync(`${pageRoot}.ppm`);
        const header = ppm.toString("ascii", 0, Math.min(ppm.length, 128)).match(/^P6\s+(\d+)\s+(\d+)\s+255\s/);
        expect(header).not.toBeNull();
        expect([Number(header[1]), Number(header[2])]).toEqual([306, 396]);
        const pixels = ppm.subarray(header[0].length);
        let ink = 0;
        for (const channel of pixels) if (channel < 245) ink += 1;
        expect(ink / pixels.length).toBeGreaterThan(0.003);
        expect(ink / pixels.length).toBeLessThan(0.3);
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
