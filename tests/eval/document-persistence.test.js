import { expect, test } from "bun:test";
import { Context, createDefaultRegistry, createDefaultSystemContext, parseAndEvaluate, formatValue } from "../../src/index.js";
const runtime = () => ({context:new Context(),registry:createDefaultRegistry(),systemContext:createDefaultSystemContext()});

test("document plugin exposes inert persistence with explicit import diagnostics", () => {
    const result=parseAndEvaluate(`
        .Plugin.Load("document");
        report := .Fragment([.Paragraph([.Strong("Exact"), 1/3]), .Table(["interval"],[[5:4]])]);
        saved := .document.EncodeJSON(report);
        imported := .document.DecodeJSON(saved);
        [.document.EncodeJSON(imported[:value])==saved, imported[:diagnostics].Len(),imported[:schema]];
    `,runtime());
    expect(formatValue(result)).toBe('[1, 0, rix.output.document@1]');
});

test("explicit snapshots detach controls and graphic actions without invoking them", () => {
    const result=parseAndEvaluate(`
        .Plugin.Load("document");
        $$x := 1/2; $$point := [2,3];
        panel := .ControlPanel([.Controls.Slider($$x,0:1,1/10,"x")]);
        graphic := .Graphics.Graphic([10,10],[.Graphics.DragPoint($$point,1)]);
        saved := .document.EncodeJSON(.document.Snapshot(.Fragment([panel,graphic])));
        [.document.DecodeJSON(saved)[:value], $x, $point];
    `,runtime());
    const root=result.values[0];
    expect(root.children[0].interactive).toBe(false);
    expect(root.children[1].children[0].kind).toBe("circle");
    expect(result.values[1].toString()).toBe("1/2");
    expect(formatValue(result.values[2])).toBe("[2, 3]");
});

test("static sheet methods and Matrix semantics survive import", () => {
    const result=parseAndEvaluate(`
        .Plugin.Load("document");
        sheet := .document.DecodeJSON(.document.EncodeJSON(.Sheet([1,2;3,4],{= axes=["row","col"] })))[:value];
        matrix := .document.DecodeJSON(.document.EncodeJSON({:2x2: /Matrix/ 1,2;3,4}))[:value];
        [sheet.At({= row=2,col=1 }),matrix ? :Matrix,matrix*matrix];
    `,runtime());
    expect(result.values[0].toString()).toBe("3");
    expect(result.values[1].toString()).toBe("1");
    expect(result.values[2].data.map(String)).toEqual(["7","10","15","22"]);
});

test("document persistence options are validated and available to browser-safe hosts", () => {
    const options=runtime();
    expect(() => parseAndEvaluate('.Plugin.Load("document"); .document.EncodeJSON(.Paragraph("hello"),{= maxBytes=4 });',options)).toThrow("budget");
    expect(() => parseAndEvaluate('.document.DecodeJSON("{}",{= unknownTags="silently-accept" });',options)).toThrow("unknownTags");
    expect(() => parseAndEvaluate('.document.EncodeJSON(.Paragraph("x"),{= unexpected=1 });',options)).toThrow("Unknown Document JSON option");
});
