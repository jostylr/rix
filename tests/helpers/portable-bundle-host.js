import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Context, createDefaultRegistry, createDefaultSystemContext, parseAndEvaluate } from "../../src/index.js";
import { createMemoryAssetStore } from "../../src/runtime/output-assets.js";
import { rasterizeSvg } from "../../bin/node-renderer-tools.js";

export const fixturePng = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XyO9WQAAAABJRU5ErkJggg=="), c => c.charCodeAt(0));
export const fixtureWav = (() => {
    const data = new Uint8Array(46), view = new DataView(data.buffer);
    data.set(new TextEncoder().encode("RIFF")); view.setUint32(4,38,true);
    data.set(new TextEncoder().encode("WAVEfmt "),8); view.setUint32(16,16,true);
    view.setUint16(20,1,true); view.setUint16(22,1,true); view.setUint32(24,8000,true);
    view.setUint32(28,16000,true); view.setUint16(32,2,true); view.setUint16(34,16,true);
    data.set(new TextEncoder().encode("data"),36); view.setUint32(40,2,true); return data;
})();
export const fixtureSource = `.Fragment([
    .Paragraph(["Exact source: ",1/3]),
    .Image({= asset=.Asset("generated.png","image/png"),alt="Generated raster",caption="A generated image" }),
    .Image({= asset=.Asset("local.png","image/png"),alt="Local image",caption="A local image" }),
    .Audio({= asset=.Asset("voice.wav","audio/wav"),title="Narration",transcript="A spoken explanation" }),
    .Video({= asset=.Asset("https://example.org/video.mp4","video/mp4"),title="Video reference",transcript="A video explanation" })
]);`;
export function fixtureDocument() {
    return parseAndEvaluate(fixtureSource, { context: new Context(), registry: createDefaultRegistry(), systemContext: createDefaultSystemContext() });
}

/** Actually move an export directory, remove its source directory, and import using an empty host. */
export function testPortableBundleHost(name, createHost) {
    for (const generated of [false, true]) {
        const rasterizer = Bun.which("rsvg-convert") || Bun.which("magick");
        test.skipIf(generated && !rasterizer)(`${name}: ${generated ? "generated raster" : "media"} bundle survives a moved offline directory`, async () => {
            const tmp = fileURLToPath(new URL("../../../tmp/", import.meta.url)); mkdirSync(tmp,{recursive:true});
            const root = mkdtempSync(path.join(tmp,"portable-assets-"));
            const source = path.join(root,"source"), original = path.join(root,"export"), moved = path.join(root,"moved");
            mkdirSync(source); mkdirSync(original);
            const previousFetch = globalThis.fetch;
            try {
                const raster = generated ? rasterizeSvg('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="6"><rect width="8" height="6" fill="red"/></svg>',{width:8,height:6}).content : fixturePng;
                writeFileSync(path.join(source,"local.png"),fixturePng);
                const grant = createMemoryAssetStore({"generated.png":raster,"local.png":new Uint8Array(readFileSync(path.join(source,"local.png"))),"voice.wav":fixtureWav});
                const exported = await createHost({assetStore:grant}).exportOutputBundle(fixtureDocument());
                expect(exported.files.size).toBe(generated ? 3 : 2);
                expect(exported.manifest.entries.filter(entry=>entry.status==="reference")).toHaveLength(1);
                writeFileSync(path.join(original,"document.rix-output.json"),exported.json);
                renameSync(original,moved); rmSync(source,{recursive:true});
                let reads=0;
                const emptyHost=createHost({assetStore:{readAsset(){reads++;throw new Error("No original asset grant");}}});
                globalThis.fetch=()=>{throw new Error("Offline: network unavailable");};
                const loaded=await emptyHost.importOutputBundle(readFileSync(path.join(moved,"document.rix-output.json"),"utf8"));
                expect(reads).toBe(0); expect(loaded.html).toBe(exported.html);
                expect(loaded.html).toContain("A spoken explanation"); expect(loaded.html).toContain("A video explanation");
                expect(loaded.html).not.toContain('src="http'); expect(loaded.html).not.toContain(source);
                expect(loaded.document.children[0].children[1].toString()).toBe("1/3");
                for(const [relative,data] of loaded.files){const target=path.join(moved,relative);mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,data);}
                writeFileSync(path.join(moved,"document.html"),loaded.html);
                const sources=[...loaded.html.matchAll(/(?:src|poster)="([^"]+)"/g)].map(match=>match[1]);
                expect(sources).toHaveLength(3);
                for(const relative of sources){expect(relative).toMatch(/^assets\/[a-f0-9]{64}\.(?:png|wav)$/);expect(new Uint8Array(readFileSync(path.join(moved,relative)))).toEqual(loaded.files.get(relative));}
            }finally{globalThis.fetch=previousFetch;rmSync(root,{recursive:true,force:true});}
        });
    }
}
