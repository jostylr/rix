import { describe, expect, test } from "bun:test";
import { Integer, Rational, Fraction, RationalInterval, CertifiedApproximation } from "@ratmath/core";
import { encodeOutputJSON, decodeOutputJSON, snapshotOutputDocument } from "../../src/runtime/output-json.js";
import * as out from "../../src/runtime/output.js";
import { Context, createDefaultRegistry, createDefaultSystemContext, parseAndEvaluate, formatValue } from "../../src/index.js";
const i = n => new Integer(BigInt(n));
const str = value => ({ type: "string", value });
const map = obj => ({ type: "map", entries: new Map(Object.entries(obj)) });
const runtime = () => ({ context: new Context(), registry: createDefaultRegistry(), systemContext: createDefaultSystemContext() });
const roundTrip = value => decodeOutputJSON(encodeOutputJSON(value)).value;

describe("inert portable document JSON", () => {
    test("round-trips numbered reports, exact values, media and repeated object identity", () => {
        const state = runtime();
        const report = parseAndEvaluate(`
            .Plugin.Load("document");
            asset := .Asset("assets/example.png", "image/png");
            picture := .Image(asset,"A labelled image");
            table := .document.Label("t", .Table(["exact", "interval"], [[1/3,5:4]]));
            .document.Report("Report", [
                .Paragraph([.Strong("Result"), .document.Ref("t")]), table,
                .Figure(.Graphics.Graphic([20,20],[.Graphics.Circle([10,10],1/3)]), "Circle", "c", "Exact circle"),
                picture,picture,.MathBlock("x^2"),.CodeBlock("1/3","rix")
            ]);
        `, state);
        const source = encodeOutputJSON(report), loaded = decodeOutputJSON(source);
        expect(loaded.diagnostics).toEqual([]);
        expect(encodeOutputJSON(loaded.value)).toBe(source);
        expect(out.renderOutputHtml(loaded.value, formatValue)).toBe(out.renderOutputHtml(report, formatValue));
        expect(loaded.value.children.at(-4)).toBe(loaded.value.children.at(-3));
        const interval = loaded.value.children.find(node => node.kind === "table").rows[0][1];
        expect(interval.start.toString()).toBe("5");
        expect(interval.end.toString()).toBe("4");
    });
    test("formal fractions and certified source sharing survive without normalization", () => {
        const source = Symbol("shared source");
        const enclosure = new RationalInterval(new Rational(1n,3n),new Rational(1n,2n));
        const first = new CertifiedApproximation(new Rational(2n,5n), enclosure, { sourceId: source });
        const second = new CertifiedApproximation(new Rational(2n,5n), enclosure, { sourceId: source });
        const values = roundTrip([new Fraction(2n,4n), first, second]);
        expect(values[0].numerator).toBe(2n); expect(values[0].denominator).toBe(4n);
        expect(values[1].sameSource(values[2])).toBe(true);
        expect(values[1].sameSource(first)).toBe(false);
    });
    test("restores all static core block/inline primitives and nested graphic styles", () => {
        const state = runtime();
        const value = parseAndEvaluate(`
            .Fragment([
                .Heading(1,"Title","title"),
                .Section(2,"Subsection",[.Paragraph([.Text("x"),.Emphasis("e"),.Strong("s"),.Code("a"),.Math("b"),.Link("https://example.test","link"),.LineBreak()])]),
                .List([.ListItem([.Paragraph("one")])],1,2),
                .Quote([.Paragraph("quote")],"author"),
                .Callout(:note,[.Paragraph("body")],"note"),
                .Audio(.Asset("audio.ogg","audio/ogg"),"Spoken transcript"),
                .Video(.Asset("video.mp4","video/mp4"),_,"Video transcript"),
                .Grid(["a"],[[1/2]],[]),
                .Slides([.Slide(.Paragraph("slide"),"Slide title")]),
                .Graphics.Graphic([20,20],[
                    .Graphics.Group([.Graphics.Text([1,2],"label")],{= fill="black" }),
                    .Graphics.Transform([.Graphics.Rectangle([0,0],[2,3])],{= translate=[1,2] }),
                    .Graphics.Clip([.Graphics.Path([[0,0],[1,2]])],[0,0,10,10])
                ])
            ]);
        `,state);
        expect(out.renderOutputHtml(roundTrip(value),formatValue)).toBe(out.renderOutputHtml(value,formatValue));
    });
    test("sheet and control snapshots are inert; live widgets are rejected", () => {
        const state = runtime();
        const live = parseAndEvaluate('$$x := 1/2; .ControlPanel([.Controls.Slider($$x,0:1,1/10,"x")],"Panel");',state);
        expect(() => encodeOutputJSON(live)).toThrow("snapshot");
        const snapshot = out.createControlPanelSnapshot(live);
        const loaded = roundTrip(snapshot);
        expect(loaded.controls[0].target).toBe(null);
        expect(out.renderOutputHtml(loaded,formatValue)).toBe(out.renderOutputHtml(snapshot,formatValue));
        const sheet = parseAndEvaluate('.Sheet([1,2;3,4]);',state);
        expect(out.renderOutputHtml(roundTrip(sheet),formatValue)).toBe(out.renderOutputHtml(sheet,formatValue));
        const migrated = decodeOutputJSON(out.serializeControlPanel(live));
        expect(migrated.diagnostics[0].code).toBe("output-json-migrated");
        expect(migrated.value.controls[0].value.toString()).toBe("1/2");
    });
    test("mathematical identities share one strict graph and import fresh", () => {
        const state = runtime(), value = parseAndEvaluate('::x; .Paragraph([::x,::x]);',state);
        const loaded = roundTrip(value);
        expect(loaded.children[0]).toBe(loaded.children[1]);
        expect(loaded.children[0]).not.toBe(value.children[0]);
    });
    test("unknown tags warn visibly, reject strictly, or preserve inert data", () => {
        const doc = JSON.parse(encodeOutputJSON(out.createFragment([[out.createParagraph(["hello"])]])));
        const paragraph = doc.nodes.find(n => n.tag === "output:paragraph");
        paragraph.tag = "output:future-callout";
        const source = JSON.stringify(doc);
        const skipped = decodeOutputJSON(source);
        expect(skipped.diagnostics[0].code).toBe("output-json-unknown-tag");
        expect(out.formatOutputText(skipped.value,formatValue)).toContain("Unsupported output:future-callout");
        expect(() => decodeOutputJSON(source,{unknownTags:"strict-error"})).toThrow("unknown tag");
        const opaque = decodeOutputJSON(source,{unknownTags:"preserve-opaque"});
        const restored = encodeOutputJSON(opaque.value);
        expect(restored).toContain("output:future-callout");
        expect(encodeOutputJSON(decodeOutputJSON(restored,{unknownTags:"preserve-opaque"}).value)).toBe(restored);
    });
    test("rejects cycles, dangling/duplicate references, live values, unsafe fields and work excess", () => {
        const cycle=[]; cycle.push(cycle);
        expect(() => encodeOutputJSON(cycle)).toThrow("cyclic");
        expect(() => encodeOutputJSON({ f(){} })).toThrow("callable");
        expect(() => encodeOutputJSON(Promise.resolve(1))).toThrow("host object");
        let calls=0; const getter={get x(){calls++; return 1;}};
        expect(() => encodeOutputJSON(getter)).toThrow("accessor"); expect(calls).toBe(0);
        const doc=JSON.parse(encodeOutputJSON(out.createParagraph(["text"])));
        const dangling=structuredClone(doc); dangling.root={$ref:"missing"};
        expect(() => decodeOutputJSON(JSON.stringify(dangling))).toThrow("dangling");
        const duplicate=structuredClone(doc); duplicate.nodes.push(duplicate.nodes[0]);
        expect(() => decodeOutputJSON(JSON.stringify(duplicate))).toThrow("duplicate");
        const bad=structuredClone(doc); bad.nodes[0].data=bad.nodes[0].data.filter(([key])=>key!=="children");
        expect(() => decodeOutputJSON(JSON.stringify(bad))).toThrow("required children");
        const polluted=structuredClone(doc); polluted.nodes[0].data.push(["__proto__",null]);
        expect(() => decodeOutputJSON(JSON.stringify(polluted))).toThrow("unsafe key");
        expect(() => encodeOutputJSON([1,2,3],{maxEdges:2})).toThrow("budget");
        expect(() => decodeOutputJSON(JSON.stringify(doc),{maxBytes:10})).toThrow("budget");
        expect(() => encodeOutputJSON(i(12345),{maxDigits:2})).toThrow("oversized");
    });
});

test("unknown records cannot hide cyclic or dangling reference payloads", () => {
    const doc={schema:"rix.output.document@1",root:{$ref:"n0"},nodes:[{id:"n0",tag:"future",data:[["x",{$ref:"n0"}]]}],mathematics:null};
    expect(()=>decodeOutputJSON(JSON.stringify(doc))).toThrow("cyclic");
    doc.nodes[0].data[0][1].$ref="missing";
    expect(()=>decodeOutputJSON(JSON.stringify(doc))).toThrow("dangling");
});

test("wire depth budgets and type accessors are enforced before inspection", () => {
    let value=null; for(let n=0;n<25;n++) value=[value];
    expect(()=>encodeOutputJSON(value,{maxDepth:10})).toThrow("depth budget");
    let reads=0;
    expect(()=>encodeOutputJSON({get type(){reads++;return "output";}})).toThrow("accessor");
    expect(reads).toBe(0);
    let deep=null; for(let n=0;n<150;n++) deep=[deep];
    expect(()=>snapshotOutputDocument(deep)).toThrow("snapshot work/depth budget");
});

test("materialized timelines and narration tracks remain inert and retain exact timing", () => {
    const value=parseAndEvaluate(`
        scene := n -> .Graphics.Graphic([10,10],[.Graphics.Circle([n,3],1)]);
        .Timeline.Sequence({= entries=[{: scene,[1,2] }], duration=1/3,
            tracks=[.Timeline.Track({= kind=:caption,id="captions",keyframes=[{= frame=1,value="First"},{= frame=2,value="Second"}] })] });
    `,runtime());
    const loaded=roundTrip(value);
    expect(loaded.duration.toString()).toBe("1/3");
    expect(loaded.frames.length).toBe(2);
    expect(loaded.tracks[0].keyframes[1].value.value).toBe("Second");
    expect(out.renderOutputHtml(loaded,formatValue)).toBe(out.renderOutputHtml(value,formatValue));
});
