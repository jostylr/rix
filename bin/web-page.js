/** Browser runtime used by `rix --out`. This file is bundled by the CLI. */

import {
    Context,
    PluginCatalog,
    createDefaultRegistry,
    createDefaultSystemContext,
    formatValue,
    mountOutputWidgets,
    parseAndEvaluate,
    parseAndEvaluateAsync,
    renderOutputHtml,
    tokenize,
} from "../src/index.js";
import { install as installFloat } from "../plugins/float/browser-installer.js";
import { install as installArrayJs } from "../examples/plugins/example-array-js/array-js.plugin.rix.js";
import arrayRixSource from "../examples/plugins/example-array-rix/array-rix.plugin.rix";
import { install as installSvg } from "../plugins/render-svg/svg.plugin.rix.js";
import { install as installCanvas } from "../plugins/render-canvas/canvas.plugin.rix.js";
import { install as installTikz } from "../plugins/render-tikz/tikz.plugin.rix.js";
import { install as installMarkdown } from "../plugins/render-markdown/markdown.plugin.rix.js";
import { install as installHtml } from "../plugins/render-html/html.plugin.rix.js";
import { install as installQuarto } from "../plugins/render-quarto/quarto.plugin.rix.js";
import { install as installLatex } from "../plugins/render-latex/latex.plugin.rix.js";
import { install as installPng } from "../plugins/render-png/png.plugin.rix.js";
import { install as installPdf } from "../plugins/render-pdf/pdf.plugin.rix.js";
import { install as installScene3D } from "../plugins/scene3d/scene3d.plugin.rix.js";
import { install as installNd } from "../plugins/nd/nd.plugin.rix.js";
import { install as installGltf } from "../plugins/render-gltf/gltf.plugin.rix.js";

const page = globalThis.__RIX_PAGE__;

function addPlugin(catalog, metadata, installer = null, source = null) {
    catalog.addMetadata(metadata, { kind: metadata.kind, source });
    if (installer) catalog.registerInstaller(metadata.id, installer);
}

function createCatalog() {
    const catalog = new PluginCatalog();
    addPlugin(catalog, {
        id: "float", description: "JavaScript IEEE-754 Float conversion and optional approximate math.",
        kind: "host", mount: "float", exports: ["Float", "Interval", "Round", "Floor", "Ceiling", "Abs", "Sqrt", "Sin", "Cos", "Tan", "Log", "Exp"],
        groups: ["ApproximateMath", "Float"], permissions: [], defaultEnabled: false,
    }, installFloat);
    addPlugin(catalog, {
        id: "example-array-js", description: "Teaching JavaScript plugin demonstrating array helpers.",
        kind: "host", mount: "arrayJs", exports: ["Sum", "Describe", "Reverse"],
        groups: ["Examples"], permissions: [], defaultEnabled: false,
    }, installArrayJs);
    addPlugin(catalog, {
        id: "example-array-rix", description: "Teaching RiX plugin demonstrating array helpers.",
        kind: "rix", mount: "arrayRix", exports: ["arrayRixSum", "arrayRixDescribe", "arrayRixReverse"],
        groups: ["Examples"], permissions: [], defaultEnabled: false,
    }, null, arrayRixSource);
    addPlugin(catalog, {
        id: "scene3d", description: "Exact retained 3D scenes with deterministic wireframe and lit Graphics snapshots.",
        kind: "host", mount: "scene3d", exports: ["Scene", "Group", "Transform", "Mesh", "Polyline", "PointCloud", "Material", "AmbientLight", "DirectionalLight", "PointLight", "PerspectiveCamera", "OrthographicCamera", "Snapshot"],
        groups: ["Scene3D", "Graphics"], permissions: [], provides: ["rix.scene3d@1"], defaultEnabled: false,
    }, installScene3D);
    addPlugin(catalog, {
        id: "nd", description: "Exact n-dimensional geometry with explicit affine and Cayley projection records.",
        kind: "host", mount: "nd", exports: ["Point", "Polyline", "Polytope", "Hypercube", "Projection", "CoordinateProjection", "CayleyRotation", "Compose", "Project", "ToScene3D"],
        groups: ["Geometry", "Scene3D", "Exact"], permissions: [], requires: ["rix.scene3d@1"], defaultEnabled: false,
    }, installNd);
    for (const [id, description, installer, permissions = []] of [
        ["svg", "Portable SVG renderer for core Graphics scenes.", installSvg],
        ["canvas", "Serializable Canvas 2D drawing plans for core Graphics scenes.", installCanvas],
        ["tikz", "Editable TikZ/PGF source renderer for core Graphics scenes.", installTikz],
        ["markdown", "CommonMark-oriented renderer for portable RiX documents.", installMarkdown],
        ["html", "Standalone semantic HTML renderer for portable RiX output trees.", installHtml],
        ["quarto", "Quarto Markdown renderer with front matter and portable figure lowering.", installQuarto],
        ["latex", "Standalone LaTeX renderer for portable RiX documents and figures.", installLatex],
        ["png", "PNG snapshot renderer for core Graphics through a host rasterizer.", installPng, ["process"]],
        ["pdf", "PDF document and figure renderer orchestrated through LaTeX.", installPdf, ["process", "files"]],
        ["gltf", "Browser-safe glTF 2.0 JSON exporter for retained Scene3D values.", installGltf],
    ]) {
        addPlugin(catalog, {
            id, description, kind: "host", mount: id, exports: ["Render"],
            groups: ["Renderers"], permissions, defaultEnabled: false,
        }, installer);
    }
    return catalog;
}

function showError(error) {
    const root = document.querySelector("#rix-app");
    if (error instanceof Error) {
        const message = error.message || error.name || "RiX page error";
        const stack = error.stack || "";
        root.textContent = stack.includes(message) ? stack : [message, stack].filter(Boolean).join("\n\n");
    } else {
        root.textContent = String(error);
    }
    root.classList.add("rix-page-error");
}

async function run() {
    if (!page?.source) throw new Error("This RiX page has no embedded source.");
    const context = new Context();
    const registry = createDefaultRegistry();
    const pluginCatalog = createCatalog();
    const systemContext = createDefaultSystemContext({ pluginCatalog });
    const runtime = { context, registry, systemContext };
    context.setEnv("__output_sink__", () => {});
    // Establish the RiX plugin-loader callback before explicit CLI preloads.
    parseAndEvaluate("", runtime);
    for (const id of page.plugins || []) {
        pluginCatalog.load(id, {
            ...runtime,
            loadRix: context.getEnv("__plugin_load_rix__"),
        });
    }

    const reads = new Set();
    const options = { ...runtime, file: page.sourcePath || "<generated-page>", reactiveReads: reads };
    const tokens = tokenize(page.source);
    const usesAsyncEvaluation = tokens.some((token) => token.value === "{$" || token.value === "{$$"
        || token.value === "|>_" || token.value === "|>!")
        || /\.(?:ForEach|Reduce|Collect|First|Find|Count|Close|Retry)\s*\(/i.test(page.source);
    const value = usesAsyncEvaluation
        ? await parseAndEvaluateAsync(page.source, options)
        : parseAndEvaluate(page.source, options);
    const root = document.querySelector("#rix-app");
    const format = (item) => formatValue(item, { context });
    root.innerHTML = renderOutputHtml(value, format);
    const source = [...reads].find((item) => typeof item?.subscribe === "function") || null;
    mountOutputWidgets(root, value, {
        format,
        evaluateControl(sourceText) {
            return parseAndEvaluate(sourceText, runtime);
        },
        observe: source
            ? (listener) => source.subscribe((event) => listener(source.peek(), event))
            : null,
    });
}

run().catch(showError);
