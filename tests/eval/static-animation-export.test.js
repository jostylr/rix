import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { Rational } from "@ratmath/core";
import { Context, RendererRegistry, createDefaultRegistry, createDefaultSystemContext, formatValue, parseAndEvaluate } from "../../src/index.js";
import { definition as tikz } from "../../plugins/render-tikz/tikz.plugin.rix.js";
import { definition as svg } from "../../plugins/render-svg/svg.plugin.rix.js";
import { optimizePathData, optimizeSvgSource } from "../../plugins/render-svg/optimize-svg.js";
import { createDefinition as gif, createFramesDefinition } from "../../plugins/render-gif/gif.plugin.rix.js";
import { createDefinition as png } from "../../plugins/render-png/png.plugin.rix.js";
import { createFrameSerializer, expandGraphicFrames, portableFrameValue } from "../../plugins/renderers/static-frames.js";

function evaluate(source) {
    return parseAndEvaluate(source, { context: new Context(), registry: createDefaultRegistry(), systemContext: createDefaultSystemContext() });
}
const timelineSource = `
    frame := t -> .Figure(.Graphics.Graphic([90,60],[
        .Graphics.Path([[1/3,1/7],[t,1/7],[t,40]],{= stroke="#2563eb",id="trajectory",marker=:arrow }),
        .Graphics.Text([5,50],"Exact trajectory frame")
    ]), "Trajectory sample", "trajectory-figure", "A retained exact trajectory");
    .Timeline.Sequence({= entries=[{: frame,[1/3,2/3] }],frameDurations=[1/3,2/3], title="Retained trajectory",
        markers=[{= frame=2,label="Second sample" }],
        tracks=[.Timeline.Track({= id="captions",kind=:caption,keyframes=[{= frame=1,value="First sample" },{= frame=2,value="Second sample" }] })]
    })
`;

describe("static scene and animation export", () => {
    test("TikZ rejects nonfinite radius and scale before rational factorization", () => {
        const registry = new RendererRegistry(); registry.register(tikz);
        // The core constructor rejects zero denominators, but host subclasses
        // can still expose one through the public accessor used by exporters.
        class NonfiniteRational extends Rational { get denominator() { return 0n; } }
        const infinity = new NonfiniteRational(1n, 1n);
        const circle = {type:"output",kind:"circle",center:[0,0],radius:infinity,style:null};
        const graphic = {type:"output",kind:"graphic",size:[10,10],children:[circle]};
        expect(() => registry.render(graphic,"tikz")).toThrow("radius must be finite");
        const transform = {type:"output",kind:"transform",scale:infinity,children:[],style:null};
        expect(() => registry.render({...graphic,children:[transform]},"tikz")).toThrow("must be finite");
    });

    test("frame budgets reject oversize sequences before reading or rendering frames", () => {
        const registry = new RendererRegistry();
        registry.register(tikz); registry.register(createFramesDefinition());
        registry.register(gif(() => { throw new Error("encoder must not run"); }));
        const frames = Array(1001);
        Object.defineProperty(frames,0,{get:() => { throw new Error("frame must not be read"); }});
        const oversized = {type:"output",kind:"slides",slides:frames};
        for (const target of ["tikz","gif","gif-frames"]) {
            expect(() => registry.render(oversized,target)).toThrow("maxFrames is 1000");
            expect(() => registry.render(oversized,target,{maxFrames:10001})).toThrow("within 1…10000");
            expect(() => registry.render(oversized,target,{maxFrames:1.5})).toThrow("within 1…10000");
        }
        const graphic={type:"output",kind:"graphic",size:[10,10],children:[]};
        expect(expandGraphicFrames({type:"output",kind:"slides",slides:Array(1001).fill({content:graphic})},{maxFrames:1001})).toHaveLength(1001);
        expect(() => expandGraphicFrames(graphic,{maxFrames:0})).toThrow("within 1…10000");
    });

    test("evidence serialization has depth, aggregate-node and cycle limits before lowering", () => {
        let nested={}; for(let i=0;i<65;i+=1) nested={child:nested};
        expect(() => portableFrameValue(nested)).toThrow("exceeds depth 64");
        expect(() => portableFrameValue(Array(100000).fill(0))).toThrow("exceeds 100000 nodes");
        const serialize=createFrameSerializer(); serialize(Array(60000).fill(0));
        expect(() => serialize(Array(40000).fill(0))).toThrow("exceeds 100000 nodes");
        const cyclic={}; cyclic.self=cyclic;
        const graphic={type:"output",kind:"graphic",size:[10,10],children:[]};
        const snapshot={type:"scene3d_snapshot",schema:"rix.scene3d.snapshot@1",value:graphic,source:cyclic};
        const registry=new RendererRegistry(); registry.register(tikz); registry.register(createFramesDefinition());
        expect(() => registry.render(snapshot,"tikz")).toThrow("cannot contain cycles");
        expect(() => registry.render({type:"output",kind:"snapshots",snapshots:[{content:snapshot}]},"gif-frames")).toThrow("cannot contain cycles");
        graphic.children.push(graphic);
        expect(() => registry.render(graphic,"tikz")).toThrow("cannot contain cycles");
        const staticDrag = {type:"output",kind:"drag_point",center:[1,2],radius:1,style:null,target:cyclic,targetId:"point",label:"Retained point"};
        const retained=registry.render({...graphic,children:[staticDrag]},"tikz");
        expect(retained.content).toContain("circle[radius=1pt]");
        expect(retained.diagnostics.map(({code}) => code)).toContain("tikz-static-drag-point");
    });
    test("TikZ accepts versioned lit snapshots and preserves projection evidence", () => {
        const snapshot = evaluate(`
            .Plugin.Load("scene3d");
            scene := .scene3d.Scene([
                .scene3d.Mesh([[0,0,0],[1,0,0],[0,1,0]],[[1,2,3]],{= color="#2563eb",id="triangle" })
            ],{= lights=[.scene3d.AmbientLight("#ffffff",1)] });
            .scene3d.Snapshot(scene,{= size=[120,80],mode=:lit })
        `);
        const registry = new RendererRegistry(); registry.register(tikz);
        const result = registry.render(snapshot, "tikz", {}, { format: formatValue });
        expect(result.content).toContain("\\begin{tikzpicture}");
        expect(result.metadata.staticFrame.metadata.snapshot).toMatchObject({
            schema: "rix.scene3d.snapshot@1", resolved: "1",
            source: { schema: "rix.scene3d@1", mode: "lit" },
        });
        expect(result.metadata.staticFrame.metadata.snapshot.projected.schema).toBe("rix.scene3d.projected@1");
        snapshot.entries.set("schema", { type: "string", value: "rix.scene3d.snapshot@99" });
        expect(() => registry.render(snapshot,"tikz")).toThrow("unsupported Scene3D snapshot schema");
    });

    test("TikZ selects retained timeline frames and emits reduced exact coordinates", () => {
        const timeline = evaluate(timelineSource);
        // TikZ markers use their own mark vocabulary; preserve the same vertices.
        timeline.frames.forEach((frame) => frame.content.content.children[0].style.set("marker", { type: "string", value: "circle" }));
        const registry = new RendererRegistry(); registry.register(tikz);
        const result = registry.render(timeline,"tikz",{frame:2},{format:formatValue});
        expect(result.content).toContain("({1/3},{1/7})");
        expect(result.content).toContain("({2/3},40)");
        expect(result.content).not.toContain("0.333333");
        expect(result.metadata.staticFrame).toMatchObject({ frame: 2, frameCount: 2, duration: "2/3", metadata: { state: "2/3", caption: "Trajectory sample" } });
        expect(() => registry.render(timeline,"tikz",{frame:3})).toThrow("within 1…2");
    });

    test("GIF sidecars keep per-frame timing, captions, exact state, tracks and Graphics", () => {
        const registry = new RendererRegistry();
        registry.register(png(() => ({content:new Uint8Array([1]),width:90,height:60,toolchain:"fixture-rasterizer"})));
        let encoder;
        registry.register(gif((_frames,options) => { encoder=options; return {content:new Uint8Array([71,73,70]),toolchain:"fixture-encoder"}; }));
        const timeline = evaluate(timelineSource);
        const result = registry.render(timeline,"gif",{}, {format:formatValue});
        const manifest = JSON.parse(result.assets.find((asset) => asset.path === result.metadata.frameManifest).content);
        expect(encoder.delays).toEqual([33,67]);
        expect(manifest.frames.map(({start,delay,requestedDuration,state}) => [start,delay,requestedDuration,state])).toEqual([[0,33,"1/3","1/3"],[33,67,"2/3","2/3"]]);
        expect(manifest.frames[1].tracks[0]).toMatchObject({kind:"caption",value:"Second sample",sourceFrame:2});
        expect(manifest.frames[0].graphics.children[0].points[0]).toEqual(["1/3","1/7"]);
        expect(result.assets.find((asset) => asset.path === result.metadata.captionTrack).content).toContain("Trajectory sample");
        expect(result.assets.find((asset) => asset.path === result.metadata.contactSheet).content).toContain('src="frame-0001.svg"');
        expect(result.assets).toEqual(registry.render(timeline,"gif",{}, {format:formatValue}).assets);
    });

    test("portable contact sheets work without an encoder and retain exact override durations", () => {
        const registry = new RendererRegistry(); registry.register(createFramesDefinition()); registry.register(gif());
        const timeline = evaluate(timelineSource);
        const result = registry.render(timeline,"gif-frames",{delays:[0.125,0.25]}, {format:formatValue});
        expect(result.mime).toBe("text/html");
        expect(result.content).toContain("<ol>");
        expect(result.assets.filter(({mime}) => mime === "image/svg+xml")).toHaveLength(2);
        const manifest = JSON.parse(result.assets.find(({mime}) => mime === "application/json").content);
        expect(manifest.frames.map(({delay,requestedDuration}) => [delay,requestedDuration])).toEqual([[13,0.125],[25,0.25]]);
        expect(() => registry.render(timeline,"gif")).toThrow("approved host encoder");
        const value = evaluate('.Plugin.Load("gif"); frame := .Graphics.Graphic([10,10],[]); .Render(.Slides([.Slide(frame)]),"gif-frames").Get("mime")');
        expect(value.value).toBe("text/html");
    });

    test("SVG optimization preserves vertices, IDs, styles, exact evidence and diagnostics", () => {
        const graphic = evaluate('.Graphics.Graphic([20,20],[.Graphics.Path([[1/3,1/7],[2/3,1/7],[2/3,10]],{= id="route",stroke="#123456",marker=:arrow })])');
        const registry = new RendererRegistry(); registry.register(svg);
        const original = registry.render(graphic,"svg",{}, {format:formatValue});
        const optimized = registry.render(graphic,"svg",{optimize:true}, {format:formatValue});
        expect(optimized.content.length).toBeLessThan(original.content.length);
        expect(optimized.content).toContain('id="route"');
        expect(optimized.content).toContain('stroke="#123456"');
        expect(optimized.content).toContain('data-rix-semantic-id="route"');
        expect(optimized.content).toContain("H0.666667V10");
        expect(optimized.metadata.coordinateLowering).toEqual(original.metadata.coordinateLowering);
        expect(optimized.diagnostics).toEqual(original.diagnostics);
        for (const tag of ["desc","metadata"]) {
            const children = original.content.match(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`,"g")) || [];
            for (const child of children) expect(optimized.content).toContain(child);
        }
        if (spawnSync("rsvg-convert",["--version"]).status === 0) {
            const raster = (content) => spawnSync("rsvg-convert",["--format=png"],{input:content});
            const before=raster(original.content), after=raster(optimized.content);
            expect(before.status).toBe(0); expect(after.status).toBe(0);
            expect(before.stdout.equals(after.stdout)).toBe(true);
        }
        expect(optimizePathData("M0 0 L0 0 L0 4 Z")).toBe("M0 0H0V4Z");
        expect(optimizePathData("M1e-10 0 L2 3")).toBe("M1e-10 0 L2 3");
        const definitions = '<svg><defs><linearGradient id="a" gradientTransform="rotate(0 .5 .5)"><stop offset="0" stop-color="red"/></linearGradient><linearGradient id="b" gradientTransform="rotate(0 .5 .5)"><stop offset="0" stop-color="red"/></linearGradient></defs><rect fill="url(#b)"/></svg>';
        const compact = optimizeSvgSource(definitions);
        expect(compact.content).toContain('<linearGradient id="b" href="#a"/>');
        expect(compact.content).toContain('fill="url(#b)"');
        expect(compact.metadata.gradients).toBe(1);
    });
});
