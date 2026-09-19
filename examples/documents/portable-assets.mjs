import { Context, createDefaultRegistry, createDefaultSystemContext, parseAndEvaluate, renderGraphicSvg, createMemoryAssetStore, bundleOutputDocument, encodeOutputBundle } from "../../src/index.js";
const runtime = { context: new Context(), registry: createDefaultRegistry(), systemContext: createDefaultSystemContext() };
const graphic = parseAndEvaluate('.Graphics.Graphic([80,60],[.Graphics.Circle([40,30],20)])', runtime);
const output = parseAndEvaluate('.Image({= asset=.Asset("package:demo/circle.svg","image/svg+xml"), alt="A circle centered at (40,30) with radius 20", caption="Generated exact circle" })', runtime);
const store = createMemoryAssetStore({ "package:demo/circle.svg": renderGraphicSvg(graphic) });
const bundle = await bundleOutputDocument(output, { store });
if (bundle.manifest.entries.some(entry => entry.status !== "resolved")) throw new Error(JSON.stringify(bundle.manifest.diagnostics));
process.stdout.write(`${encodeOutputBundle(bundle)}\n`);
