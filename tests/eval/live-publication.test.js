import { expect, test } from "bun:test";
import { parseAndEvaluate, formatValue, renderOutputHtml } from "../../src/index.js";
import { prepareLivePublication, createLivePublicationConfig } from "../../src/runtime/live-publication.js";
import { buildLivePublication, buildLiveRuntimeAssets } from "../../src/runtime/live-publication-node.js";

const runtimeAssets = new Map([["rix-page.js", "/* test runtime */"], ["rix-page.css", "body{}"]]);

test("live HTML preserves the static snapshot and packages local scripts with an explicit CSP", async () => {
    const value = parseAndEvaluate('.Paragraph("Exact 1/3 <proof>")');
    const built = await buildLivePublication({ value, source: '.Paragraph("Exact 1/3 <proof>")', sourcePath: "/private/work/proof.rix", title: "<proof>", format: formatValue, runtimeAssets });
    expect(built.content).toContain(`<main id="rix-app" data-rix-static-snapshot="true">${renderOutputHtml(value, formatValue)}</main>`);
    expect(built.content).toContain("Content-Security-Policy");
    expect(built.content).toContain("connect-src &#39;none&#39;");
    expect(built.content).not.toMatch(/<script>[^<]/);
    expect(built.content).not.toContain("needs JavaScript");
    expect(built.content).not.toContain("/private/work");
    expect(built.assets.get("assets/rix-page-config.js")).toContain('"sourcePath":"proof.rix"');
    expect(built.assets.get("assets/rix-page-config.js")).not.toContain("<proof>");
    expect([...built.assets.keys()]).toEqual(["assets/rix-page.js", "assets/rix-page.css", "assets/rix-page-config.js"]);
});

test("publication descriptors are inert, bounded and retain graphics/control protocols", () => {
    const value = parseAndEvaluate('.Graphics.Graphic([100, 100], [.Graphics.Circle([1/3, 2/3], 1/7, {= id="exact-point" })])');
    const prepared = prepareLivePublication(value);
    expect(prepared.descriptor.interactions[0].kind).toBe("graphic");
    expect(JSON.stringify(prepared.descriptor)).not.toMatch(/binding|handler|context|subscribe/);
    let calls = 0;
    const bad = { type: "output", get kind() { calls += 1; return "graphic"; } };
    expect(() => prepareLivePublication(bad)).toThrow("not inert");
    expect(calls).toBe(0);
    expect(() => prepareLivePublication(value, { maxNodes: 1 })).toThrow("budget");
    expect(() => createLivePublicationConfig({ source: "x".repeat(1000001) })).toThrow("1000000");
    expect(() => createLivePublicationConfig({ source: "1", plugins: ["../files"] })).toThrow("plugin list");
});

test("animation lowering caps retained frames while preserving exact first-frame evidence", () => {
    const timeline = parseAndEvaluate('scene = x -> .Paragraph(@"exact @{x}"); .Timeline.Sequence({= entries=[{: scene, [1/3, 2/3, 1]}], duration=3/2 })');
    const prepared = prepareLivePublication(timeline, { maxFrames: 2 });
    expect(prepared.snapshot.frames).toHaveLength(2);
    expect(timeline.frames).toHaveLength(3);
    expect(String(prepared.snapshot.duration)).toBe("1");
    expect(String(timeline.duration)).toBe("3/2");
    expect(renderOutputHtml(prepared.snapshot.frames[0].content, formatValue)).toBe(renderOutputHtml(timeline.frames[0].content, formatValue));
    expect(prepared.diagnostics[0].code).toBe("live-animation-truncated");
    expect(prepared.descriptor.interactions.some((entry) => entry.protocol === "rix.timeline-view@1")).toBe(true);
});

test("the actual browser runtime bundles without Node host grants", async () => {
    const assets = await buildLiveRuntimeAssets();
    expect(assets.get("rix-page.js")).toContain("The static result remains available");
    expect(assets.get("rix-page.css")).toContain(".rix-output-graphic");
});

test("live bundled media keeps portable references without changing exact values or source assets",async()=>{
 const { relocateLivePublicationAssets } = await import("../../src/runtime/live-publication.js");
 const value=parseAndEvaluate('.Fragment([.Paragraph([1/3]),.Image({= asset=.Asset("local.svg","image/svg+xml"),alt="Local image" })])');
 const assetPaths={"local.svg":`assets/${"a".repeat(64)}.svg`};
 const moved=relocateLivePublicationAssets(value,assetPaths);expect(moved.children[1].asset.ref).toBe(assetPaths["local.svg"]);expect(value.children[1].asset.ref).toBe("local.svg");expect(renderOutputHtml(moved,formatValue)).toContain("1/3");
 const page=await buildLivePublication({value,source:"1",assetPaths,runtimeAssets,format:formatValue});expect(page.content).toContain(assetPaths["local.svg"]);expect(page.assets.get("assets/rix-page-config.js")).toContain(assetPaths["local.svg"]);expect(()=>relocateLivePublicationAssets(value,{"local.svg":"https://remote.invalid/x.svg"})).toThrow("media paths");
});
