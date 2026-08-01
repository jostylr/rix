/** Browser runtime used by `rix --out`. This file is bundled by the CLI. */

import {
    Context,
    PluginCatalog,
    createDefaultRegistry,
    createDefaultSystemContext,
    formatValue,
    mountOutputWidgets,
    parseAndEvaluate,
    renderOutputHtml,
} from "../src/index.js";
import { install as installFloat } from "../plugins/float/browser-installer.js";
import { install as installArrayJs } from "../examples/plugins/example-array-js/array-js.plugin.rix.js";
import arrayRixSource from "../examples/plugins/example-array-rix/array-rix.plugin.rix";

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
    return catalog;
}

function showError(error) {
    const root = document.querySelector("#rix-app");
    root.textContent = error instanceof Error ? error.stack || error.message : String(error);
    root.classList.add("rix-page-error");
}

function run() {
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
    const value = parseAndEvaluate(page.source, { ...runtime, file: page.sourcePath || "<generated-page>", reactiveReads: reads });
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

try {
    run();
} catch (error) {
    showError(error);
}
