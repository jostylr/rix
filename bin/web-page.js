import { pluginSources } from "../plugins/generated/rix-sources.js";
import { install as installDocument } from "../plugins/document/document.plugin.rix.js";
/** Browser runtime used by `rix --out`. This file is bundled during package preparation. */

import {
    Context,
    PluginCatalog,
    createDefaultRegistry,
    createDefaultSystemContext,
    formatValue,
    mountOutputWidgets,
    parseAndEvaluate,
    parseAndEvaluateObserved,
    parseAndEvaluateObservedAsync,
    renderOutputHtml,
    tokenize,
} from "../src/index.js";
import { install as installFloat } from "../plugins/float/browser-installer.js";
import { install as installArrayJs } from "../examples/plugins/example-array-js/array-js.plugin.rix.js";
const arrayRixSource = pluginSources["../examples/plugins/example-array-rix/array-rix.plugin.rix"];
import { install as installSvg } from "../plugins/render-svg/svg.plugin.rix.js";
import { install as installCanvas } from "../plugins/render-canvas/canvas.plugin.rix.js";
import { install as installTikz } from "../plugins/render-tikz/tikz.plugin.rix.js";
import { install as installMarkdown } from "../plugins/render-markdown/markdown.plugin.rix.js";
import { install as installHtml } from "../plugins/render-html/html.plugin.rix.js";
import { install as installQuarto } from "../plugins/render-quarto/quarto.plugin.rix.js";
import { install as installLatex } from "../plugins/render-latex/latex.plugin.rix.js";
import { install as installPng } from "../plugins/render-png/png.plugin.rix.js";
import { install as installPdf } from "../plugins/render-pdf/pdf.plugin.rix.js";
const scene3dSource = pluginSources['scene3d/scene3d.plugin.rix'];
const ndSource = pluginSources['nd/nd.plugin.rix'];
import { install as installGltf } from "../plugins/render-gltf/gltf.plugin.rix.js";

import { prepareLivePublication, relocateLivePublicationAssets, LIVE_PUBLICATION_SCHEMA } from "../src/runtime/live-publication.js";

const page = globalThis.__RIX_PAGE__;

function addPlugin(catalog, metadata, installer = null, source = null) {
    catalog.addMetadata(metadata, { kind: metadata.kind, source });
    if (installer) catalog.registerInstaller(metadata.id, installer);
}

function createCatalog() {
    const catalog = new PluginCatalog();
    addPlugin(catalog, { id: "document", description: "Portable document publications", kind: "host", mount: "document", exports: ["Report", "Label", "Ref", "Theme", "References", "Bibliography", "Citation", "AssetManifest", "Asset", "Numbering", "Header", "Footer", "Template", "ApplyTemplate", "TargetMarkup", "Snapshot", "EncodeJSON", "DecodeJSON", "NumericPolicy", "Present", "PublicationPlan", "Publish", "Project"], groups: ["Documents"], permissions: [], defaultEnabled: false }, installDocument);
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
        kind: "rix", mount: "scene3d", exports: ["Scene", "Group", "Transform", "Mesh", "Polyline", "PointCloud", "Material", "AmbientLight", "DirectionalLight", "PointLight", "PerspectiveCamera", "OrthographicCamera", "Realize", "Project", "Snapshot"],
        groups: ["Scene3D", "Graphics", "Exact"], permissions: [], provides: ["rix.scene3d@1", "rix.scene3d.realized@1", "rix.scene3d.projected@1"], defaultEnabled: false,
    }, null, scene3dSource);
    addPlugin(catalog, {
        id: "nd", description: "Exact n-dimensional geometry with explicit affine and Cayley projection records.",
        kind: "rix", mount: "nd", exports: ["Point", "Polyline", "Polytope", "Hypercube", "Projection", "CoordinateProjection", "CayleyRotation", "Compose", "Project", "ToScene3D"],
        groups: ["Geometry", "Scene3D", "Exact"], permissions: [], requires: ["rix.scene3d@1"], defaultEnabled: false,
    }, null, ndSource);
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
    let status = document.querySelector("#rix-publication-status");
    if (!status) {
        status = document.createElement("aside"); status.id = "rix-publication-status"; status.setAttribute("role", "status"); document.body.append(status);
    }
    status.textContent = `Live interaction unavailable: ${error?.message || String(error)}. The static result remains available.`;
    status.classList.add("rix-page-error");
}

async function run() {
    if (typeof page?.source !== "string") throw new Error("This RiX page has no retained source.");
    if (page.schema && page.schema !== LIVE_PUBLICATION_SCHEMA) throw new Error("Unsupported live publication schema");
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

    const options = { ...runtime, file: page.sourcePath || "<generated-page>" };
    const tokens = tokenize(page.source);
    const usesAsyncEvaluation = tokens.some((token) => token.value === "{$" || token.value === "{$$"
        || token.value === "|>_" || token.value === "|>!")
        || /\.(?:ForEach|Reduce|Collect|First|Find|Count|Close|Retry)\s*\(/i.test(page.source);
    const observed = usesAsyncEvaluation
        ? await parseAndEvaluateObservedAsync(page.source, options)
        : parseAndEvaluateObserved(page.source, options);
    const root = document.querySelector("#rix-app");
    const format = (item) => formatValue(item, { context });
    const prepared = prepareLivePublication(observed.value, page.descriptor?.limits || {});
    const value = relocateLivePublicationAssets(prepared.snapshot, page.assetPaths || {}), diagnostics = prepared.diagnostics;
    if (root.dataset.rixStaticSnapshot !== "true") root.innerHTML = renderOutputHtml(value, format);
    root.dataset.rixLiveReady = "true";
    if (diagnostics.length) document.querySelector("#rix-publication-status").textContent = diagnostics.map((item) => item.message).join(" ");
    const dispose = mountOutputWidgets(root, value, {
        incrementalSvg: true,
        onSvgUpdate(update) { root.dataset.rixSvgUpdate = update.mode; root.dataset.rixSvgReused = String(update.reused); },
        format,
        evaluateControl(sourceText) {
            return parseAndEvaluate(sourceText, runtime);
        },
        observe: observed.observe
            ? (listener) => observed.observe((value, event) => listener(relocateLivePublicationAssets(prepareLivePublication(value, page.descriptor?.limits || {}).snapshot, page.assetPaths || {}), event))
            : null,
    });
    window.addEventListener("pagehide", () => { dispose(); observed.dispose(); }, { once: true });
}

run().catch(showError);
