import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Context, createDefaultRegistry, createDefaultSystemContext, parseAndEvaluate, formatValue } from "../../src/index.js";
import { bundleOutputDocument, createMemoryAssetStore, decodeOutputBundle, encodeOutputBundle, hashAssetBytes, normalizeAssetReference, resolveAssetManifest } from "../../src/runtime/output-assets.js";
import { createNodeAssetStore } from "../../src/runtime/output-assets-node.js";
import { createNodeHostAdapter } from "../../src/runtime/host-adapter-node.js";
import { createBrowserHostAdapter } from "../../src/runtime/host-adapter.js";
import { renderOutputHtml } from "../../src/runtime/output.js";
import { renderMarkdown, renderLatex } from "../../plugins/renderers/document-renderers.js";

const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XyO9WQAAAABJRU5ErkJggg=="), c => c.charCodeAt(0));
const wav = new Uint8Array(44); wav.set(new TextEncoder().encode("RIFF")); wav.set(new TextEncoder().encode("WAVEfmt "),8);
const evaluate = source => parseAndEvaluate(source, { context: new Context(), registry: createDefaultRegistry(), systemContext: createDefaultSystemContext() });
const doc = () => evaluate(`.Fragment([
    .Image({= asset=.Asset("image.png","image/png"),alt="One pixel",caption="Image caption" }),
    .Audio({= asset=.Asset("audio.wav","audio/wav"),title="Sound",transcript="A quiet sound",caption="Audio caption" }),
    .Video({= asset=.Asset("https://example.org/movie.mp4","video/mp4"),title="Video reference",transcript="Video transcript" })
]);`);
const store = () => createMemoryAssetStore({"image.png":png,"audio.wav":wav});

describe("portable asset manifests and bundles", () => {
    test("resolves dimensions, hashes/deduplicates bytes and preserves inert external references", async () => {
        const digest = await hashAssetBytes(png);
        const host = createMemoryAssetStore({"one.png":png,[`sha256:${digest}`]:png});
        const result = await resolveAssetManifest([{ref:"one.png",mime:"image/png"},{ref:`sha256:${digest}`,mime:"image/png"},{ref:"https://example.org/movie.mp4",mime:"video/mp4"}],{store:host});
        expect(result.files.size).toBe(1); expect(result.totalBytes).toBe(png.length);
        expect(result.entries[0]).toMatchObject({status:"resolved",width:1,height:1,digest});
        expect(result.entries[1].ref).toBe(result.entries[0].ref);
        expect(result.entries[2].status).toBe("reference");
        expect(result.diagnostics[0]).toMatchObject({code:"asset-external-inert",source:"$.assets[2]"});
        const both = await resolveAssetManifest([{ref:"x",mime:"application/json"},{ref:"x",mime:"text/plain"}],{store:createMemoryAssetStore({x:"{}"})});
        expect(both.files.size).toBe(1);
    });
    test("bundle round trip retains captions/transcripts, media names, and relative asset dimensions", async () => {
        const bundle = await bundleOutputDocument(doc(),{store:store()});
        const wire = encodeOutputBundle(bundle), restored = await decodeOutputBundle(wire);
        expect(encodeOutputBundle(restored)).toBe(wire);
        expect(restored.files.size).toBe(2);
        const html = renderOutputHtml(restored.document,formatValue);
        expect(html).toContain('width="1" height="1" loading="lazy"');
        expect(html).toContain('controls preload="none" aria-label="Sound"');
        expect(html).toContain('href="https://example.org/movie.mp4"');
        expect(html).not.toContain('src="https://');
        for (const rendered of [html,renderMarkdown(restored.document,{format:formatValue}).content,renderLatex(restored.document,{format:formatValue}).content]) {
            expect(rendered).toContain("Image caption"); expect(rendered).toContain("A quiet sound"); expect(rendered).toContain("Audio caption"); expect(rendered).toContain("Video transcript");
        }
    });
    test("document.AssetManifest entries use the same resolver", async () => {
        const report = evaluate(`.Plugin.Load("document"); assets := .document.AssetManifest([{= id="image",path="image.png",mime="image/png",alt="Pixel" }]); .document.Report("Assets",[.Paragraph("Report")],{= assets=assets });`);
        const bundle = await bundleOutputDocument(report,{store:store()});
        expect(bundle.files.size).toBe(1);
        expect(bundle.document.documentAssets.entries.get("assets").values[0].entries.get("path").value).toMatch(/^assets\//);
        await decodeOutputBundle(encodeOutputBundle(bundle));
    });
    test("path traversal, URL schemes, encoded paths and missing entries never read host files", async () => {
        const refs=["../x","/private/x","file:///x","data:image/png,abc","a/../b","a\\b","%2e%2e/x","package:p/../x","https://user:pass@example.org/x"];
        let reads=0;
        const result=await resolveAssetManifest(refs.map(ref=>({ref,mime:"image/png"})),{store:{readAsset(){reads++;return png;}}});
        expect(reads).toBe(0); expect(result.entries.every(entry=>entry.status==="unavailable")).toBe(true);
        expect(result.diagnostics.every(entry=>entry.source.startsWith("$.assets["))).toBe(true);
        expect(()=>normalizeAssetReference("a//b")).toThrow();
        const missing=await resolveAssetManifest([{ref:"missing.png",mime:"image/png"}],{store:store()});
        expect(missing.diagnostics[0].code).toBe("asset-missing");
    });
    test("MIME, dimensions, declared sizes, integrity and total budgets reject unsafe payloads", async () => {
        const cases=[ [{mime:"image/jpeg"}, {}, "asset-mime-mismatch"], [{mime:"image/avif"},{},"asset-mime-unsupported"], [{width:2},{},"asset-dimension-mismatch"], [{bytes:1},{},"asset-size-mismatch"], [{integrity:"sha256:wrong"},{},"asset-hash-mismatch"], [{},{maxAssetBytes:1},"asset-byte-limit"], [{},{maxTotalBytes:1},"asset-total-limit"] ];
        for(const [fields,options,code] of cases){const result=await resolveAssetManifest([{ref:"image.png",mime:"image/png",...fields}],{store:store(),...options});expect(result.diagnostics[0].code).toBe(code);expect(result.files.size).toBe(0);}
        await expect(resolveAssetManifest([], {maxAssets:Infinity})).rejects.toThrow();
        await expect(resolveAssetManifest([{},{}], {maxAssets:1})).rejects.toThrow();
    });
    test("active/external SVG is rejected and static SVG carries dimensions", async () => {
        for(const svg of ['<svg width="1" height="1"><script>x</script></svg>','<svg width="1" height="1"><image href="https://example.org/a"/></svg>','<svg width="1" height="1"><style>@import "a"</style></svg>']){
            const result=await resolveAssetManifest([{ref:"x.svg",mime:"image/svg+xml"}],{store:createMemoryAssetStore({"x.svg":svg})});expect(result.diagnostics[0].code).toBe("asset-svg-active");
        }
        const result=await resolveAssetManifest([{ref:"x.svg",mime:"image/svg+xml"}],{store:createMemoryAssetStore({"x.svg":'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 3"><rect width="2" height="3"/></svg>'})});expect(result.entries[0]).toMatchObject({width:2,height:3});
    });
    test("finite read/authorization timeout aborts unresolved host callbacks", async () => {
        let signal;
        const slow={readAsset(_ref,options){signal=options.signal;return new Promise(()=>{});}};
        const result=await resolveAssetManifest([{ref:"x.png",mime:"image/png"}],{store:slow,maxReadMs:10});
        expect(result.diagnostics[0].code).toBe("asset-read-timeout"); expect(signal.aborted).toBe(true);
        const auth=await resolveAssetManifest([{ref:"https://example.org/x",mime:"image/png"}],{authorizeExternal:()=>new Promise(()=>{}),store:slow,maxReadMs:10});
        expect(auth.diagnostics[0].code).toBe("asset-read-timeout");
    });
    test("external fetch requires explicit host authorization and reader", async () => {
        let calls=0; const host={readExternalAsset:async()=>{calls++;return png;}};
        const assets=[{ref:"https://example.org/x.png",mime:"image/png"}];
        await resolveAssetManifest(assets,{store:host}); expect(calls).toBe(0);
        await resolveAssetManifest(assets,{store:host,authorizeExternal:()=>false}); expect(calls).toBe(0);
        const result=await resolveAssetManifest(assets,{store:host,authorizeExternal:()=>true});expect(calls).toBe(1);expect(result.files.size).toBe(1);
    });
    test("import rejects tampering, undeclared files, MIME substitutions and dangling document assets without I/O", async () => {
        const bundle=await bundleOutputDocument(doc(),{store:store()}); const source=encodeOutputBundle(bundle);
        const change=async mutate=>{const data=JSON.parse(source);mutate(data);await expect(decodeOutputBundle(JSON.stringify(data))).rejects.toThrow();};
        await change(data=>data.files[0].content="AA==");
        await change(data=>data.files[0].path="../secret");
        await change(data=>data.manifest.entries[0].mime="image/jpeg");
        await change(data=>data.manifest.entries.splice(0,1));
        await change(data=>data.manifest.totalBytes++);
        await change(data=>{const image=data.document.nodes.find(node=>node.tag==="output:asset");image.data.find(([key])=>key==="mime")[1]="image/jpeg";});
        await change(data=>data.schema="rix.output.bundle@2");
        const previousFetch=globalThis.fetch;globalThis.fetch=()=>{throw new Error("No network allowed");};
        try { await decodeOutputBundle(source); }finally{globalThis.fetch=previousFetch;}
    });
    test("Node roots/packages/content indexes preserve host grants and reject symlink escape", async () => {
        const tmp=fileURLToPath(new URL("../../../tmp/",import.meta.url));mkdirSync(tmp,{recursive:true});const root=mkdtempSync(path.join(tmp,"assets-"));
        try {
            mkdirSync(path.join(root,"granted"));writeFileSync(path.join(root,"granted","x.png"),png);writeFileSync(path.join(root,"outside.png"),png);symlinkSync(path.join(root,"outside.png"),path.join(root,"granted","escape.png"));
            const digest=await hashAssetBytes(png);const host=createNodeAssetStore({roots:[path.join(root,"granted")],packages:{figures:path.join(root,"granted")},contentPaths:{[`sha256:${digest}`]:"x.png"}});
            for(const ref of ["x.png","package:figures/x.png",`sha256:${digest}`]) expect(await host.readAsset(ref)).toEqual(png);
            await expect(host.readAsset("escape.png")).rejects.toThrow("granted root");
            await expect(createNodeHostAdapter().readAsset("x.png")).rejects.toThrow("granted roots");
            await expect(createBrowserHostAdapter().readAsset("x.png")).rejects.toThrow("granted store");
        }finally{rmSync(root,{recursive:true,force:true});}
    });
});
