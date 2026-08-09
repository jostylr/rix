import { describe, expect, test } from "bun:test";
import {
    Context,
    RendererRegistry,
    UnsupportedRenderError,
    createDefaultRegistry,
    createDefaultSystemContext,
    parseAndEvaluate,
} from "../../src/index.js";
import { createDefinition as createPngDefinition } from "../../plugins/render-png/png.plugin.rix.js";
import { definition as quartoDefinition } from "../../plugins/render-quarto/quarto.plugin.rix.js";
import { definition as svgDefinition } from "../../plugins/render-svg/svg.plugin.rix.js";

function runtime() {
    return {
        context: new Context(),
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    };
}

const sceneSource = `
g := .Graphics.Graphic({=
    size=[160, 100],
    metadata={= title="portable scene" },
    children=[
        .Graphics.Path([[10, 80], [80, 20], [150, 80]], {= stroke="#2563eb", width=3, fill="none" }),
        .Graphics.Rectangle([12, 12], [28, 18], {= fill="#be123c" }),
        .Graphics.Circle([120, 35], 12, {= fill="#0c7b7f" }),
        .Graphics.Text([80, 94], "exact", {= anchor="middle", size=12 })
    ]
});
`;

describe("renderer registry", () => {
    test("negotiates canonical targets, MIME aliases, fallbacks, and diagnostics", () => {
        const registry = new RendererRegistry();
        registry.register({
            target: "text", mime: "text/plain", extension: "txt", aliases: ["plain"],
            inputKinds: ["number"],
            render: ({ value }) => ({ content: `${value}\n` }),
        });

        expect(registry.resolve("text/plain")).toBe("text");
        expect(registry.targetForPath("report.TXT")).toBe("text");
        expect(registry.targetForPath("report.TXT", { preserveAlias: true })).toBe("txt");
        expect(registry.render(3, "plain").content).toBe("3\n");
        const fallback = registry.render(3, "missing", { fallback: ["text"] });
        expect(fallback.target).toBe("text");
        expect(fallback.diagnostics.map(({ code }) => code)).toContain("renderer-fallback");
        expect(() => registry.render("no", "text")).toThrow(UnsupportedRenderError);
        expect(() => registry.register({ target: "other", mime: "text/plain", render: () => ({ content: "" }) }))
            .toThrow("alias 'text/plain' is already registered");
    });

    test("plugins expose discovery, generic Render, and inspectable RenderResult maps", () => {
        const options = runtime();
        const result = parseAndEvaluate(`${sceneSource}
            .Plugin.Load("svg");
            rendered := .Render(g, "image/svg+xml", {= alt="An exact diagram" });
            [rendered.Get("target"), rendered.Get("mime"), rendered.Get("encoding"), rendered.Get("content")];
        `, options);
        expect(result.values.slice(0, 3).map(({ value }) => value)).toEqual(["svg", "image/svg+xml", "utf8"]);
        expect(result.values[3].value).toContain("<title>An exact diagram</title>");
        expect(parseAndEvaluate('.Renderer.List()', options).values.map(({ value }) => value)).toEqual(["svg"]);
        expect(parseAndEvaluate('.Renderer.Info("svg").Get("inputs")', options).values.map(({ value }) => value)).toEqual(["graphic", "figure"]);
        expect(parseAndEvaluate('.Plugin.Info("svg").Get("targets")', options).values.map(({ value }) => value))
            .toEqual(["svg", "image/svg+xml"]);
    });

    test("SVG, Canvas, and TikZ traverse the same Graphics scene", () => {
        const options = runtime();
        const result = parseAndEvaluate(`${sceneSource}
            .Plugin.Load("svg"); .Plugin.Load("canvas"); .Plugin.Load("tikz");
            [
                .svg.Render(g).Get("content"),
                .canvas.Render(g).Get("content"),
                .tikz.Render(g).Get("content")
            ];
        `, options);
        expect(result.values[0].value).toContain('<path d="M10 80 L80 20 L150 80"');
        const plan = JSON.parse(result.values[1].value);
        expect(plan.schema).toBe("rix.canvas-plan@1");
        expect(plan.commands.map(([command]) => command)).toEqual(["path2d", "rectangle", "circle", "text"]);
        expect(result.values[2].value).toContain("\\begin{tikzpicture}");
        expect(result.values[2].value).toContain("rectangle");
    });

    test("document renderers preserve structure and report static fallbacks", () => {
        const options = runtime();
        const result = parseAndEvaluate(`${sceneSource}
            doc := .Fragment([
                .Heading(1, "Renderer report", "renderer-report"),
                .Paragraph([.Text("The "), .Strong([.Text("exact")]), .Text(" result is "), .Math("x^2")]),
                .Table(["name", "value"], [["half", 1/2]], {= caption="Values" }),
                .Figure(g, "One portable scene", "portable", "A geometric diagram")
            ]);
            .Plugin.Load("svg"); .Plugin.Load("markdown"); .Plugin.Load("html");
            .Plugin.Load("quarto"); .Plugin.Load("latex");
            [
                .markdown.Render(doc).Get("content"),
                .html.Render(doc, {= title="Test report" }).Get("content"),
                .quarto.Render(doc, {= title="Test report", format="pdf" }).Get("content"),
                .latex.Render(doc).Get("content")
            ];
        `, options);
        expect(result.values[0].value).toContain("# Renderer report {#renderer-report}");
        expect(result.values[0].value).toContain("| name | value |");
        expect(result.values[1].value).toContain("<title>Test report</title>");
        expect(result.values[1].value).toContain("<figure");
        expect(result.values[2].value).toStartWith('---\ntitle: "Test report"\nformat: "pdf"');
        expect(result.values[3].value).toContain("\\documentclass{article}");
        expect(result.values[3].value).toContain("\\begin{tikzpicture}");
    });

    test("binary renderers retain bytes and toolchain metadata", () => {
        const registry = new RendererRegistry();
        registry.register(createPngDefinition((_svg, { width, height }) => ({
            content: new Uint8Array([137, 80, 78, 71]),
            toolchain: "test-rasterizer",
            width,
            height,
        })));
        const options = runtime();
        const graphic = parseAndEvaluate(`${sceneSource} g`, options);
        const result = registry.render(graphic, "png", { scale: 2 }, { format: String });
        expect([...result.content]).toEqual([137, 80, 78, 71]);
        expect(result.toolchain).toBe("test-rasterizer");
        expect(result.metadata).toMatchObject({ width: 320, height: 200 });
    });

    test("Quarto can return stable external SVG or PNG assets", () => {
        const graphic = parseAndEvaluate(`${sceneSource} g`, runtime());
        const svgRegistry = new RendererRegistry();
        svgRegistry.register(svgDefinition);
        svgRegistry.register(quartoDefinition);
        const svg = svgRegistry.render(graphic, "quarto", { assets: "svg", assetDir: "figures" }, { format: String });
        expect(svg.content).toContain("![Figure 1](figures/figure-1.svg)");
        expect(svg.assets).toHaveLength(1);
        expect(svg.assets[0]).toMatchObject({ path: "figures/figure-1.svg", mime: "image/svg+xml" });
        expect(svg.assets[0].content).toContain("<svg");

        const pngRegistry = new RendererRegistry();
        pngRegistry.register(createPngDefinition(() => ({
            content: new Uint8Array([137, 80, 78, 71]), toolchain: "fixture", width: 160, height: 100,
        })));
        pngRegistry.register(quartoDefinition);
        const png = pngRegistry.render(graphic, "quarto", { assets: "png" }, { format: String });
        expect(png.content).toContain("assets/figure-1.png");
        expect([...png.assets[0].content]).toEqual([137, 80, 78, 71]);
    });

    test("unsupported target features fail visibly instead of disappearing", () => {
        const options = runtime();
        expect(() => parseAndEvaluate(`
            .Plugin.Load("tikz");
            g := .Graphics.Graphic([100, 100], [.Graphics.Path({= commands=[
                {= op="move", to=[10, 10] },
                {= op="arc", radius=[20, 20], to=[50, 50] }
            ] })]);
            .tikz.Render(g);
        `, options)).toThrow("endpoint SVG arc commands require geometric conversion");
    });
});
