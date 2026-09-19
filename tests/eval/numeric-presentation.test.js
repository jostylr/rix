import { expect, test } from "bun:test";
import { Context, createDefaultRegistry, createDefaultSystemContext, parseAndEvaluate, formatValue, renderOutputHtml } from "../../src/index.js";
import { formatOutputText, lowerGraphicSvg } from "../../src/runtime/output.js";
import { createCanvasPlan } from "../../plugins/render-canvas/canvas-plan.js";
const runtime = () => ({ context: new Context(), registry: createDefaultRegistry(), systemContext: createDefaultSystemContext() });
const source = `
    .Plugin.Load("document");
    policy := .document.NumericPolicy({= notation=:decimal,decimalPlaces=2 });
    local := .document.Present(7/3,{= fraction=:mixed });
    doc := .document.Present(.Fragment([
        .Paragraph([1/3," and ",local]), .Table(["exact","reversed"],[[1/3,5/3:4/3]]),
        .Grid({= rows=[[1/3,5/3:4/3]],columns=["left","left"] }),
        .Image({= asset=.Asset("assets/local.png","image/png"),alt="example",caption=["value ",1/3] })
    ]),policy);
`;
test("one retained policy reaches text, HTML, Markdown, Quarto and LaTeX with child overrides", () => {
    const state=runtime();
    const doc=parseAndEvaluate(source+"doc;",state);
    expect(formatOutputText(doc,formatValue)).toContain("≈ 0.33 and 2..1/3");
    const html=renderOutputHtml(doc,formatValue);
    expect(html).toContain("≈ 0.33"); expect(html).toContain("2..1/3");
    expect(html).toContain("≈ 1.67:1.33"); expect(html).toContain("value ≈ 0.33");
    const rendered=parseAndEvaluate(`.Plugin.Load("markdown"); .Plugin.Load("quarto"); .Plugin.Load("latex");
        [.markdown.Render(doc).Get("content"),.quarto.Render(doc).Get("content"),.latex.Render(doc).Get("content")];`,state).values.map(v=>v.value);
    expect(rendered[0]).toContain("≈ 0\\.33"); expect(rendered[0]).toContain("2\\.\\.1/3");
    expect(rendered[1]).toContain("≈ 0\\.33"); expect(rendered[2]).toContain("\\ensuremath{\\approx} 0.33");
    for (const content of rendered) expect(content).toContain("1.67:1.33");
    expect(doc.children[1].rows[0][0].toString()).toBe("1/3");
    const roundtrip=parseAndEvaluate(`.document.DecodeJSON(.document.EncodeJSON(doc))[:value];`,state);
    expect(renderOutputHtml(roundtrip,formatValue)).toBe(html);
});
test("render option policy reaches controls and nested graphic labels across SVG, Canvas and TikZ", () => {
    const state=runtime();
    const result=parseAndEvaluate(`
        .Plugin.Load("document");
        $$x := 1/3;
        panel := .document.Present(.document.Snapshot(.ControlPanel([.Controls.Slider($$x,0:1,1/3,"x")],"Values")),{= notation=:decimal,decimalPlaces=2 });
        graphic := .document.Present(.Graphics.Graphic([80,40],[.Graphics.Text([20,20],1/3)]),{= notation=:decimal,decimalPlaces=2 });
        [panel,graphic];`,state).values;
    expect(formatOutputText(result[0],formatValue)).toContain("≈ 0.33");
    expect(renderOutputHtml(result[0],formatValue)).toContain("≈ 0.33");
    expect(lowerGraphicSvg(result[1],formatValue).content).toContain("≈ 0.33");
    expect(JSON.stringify(createCanvasPlan(result[1],formatValue))).toContain("≈ 0.33");
    const tikz=parseAndEvaluate('.Plugin.Load("tikz"); .tikz.Render(graphic).Get("content");',state).value;
    expect(tikz).toContain("\\ensuremath{\\approx} 0.33");
    const rendered=parseAndEvaluate(`.Plugin.Load("markdown"); .markdown.Render(.Paragraph([1/3]), {= numericPolicy={= notation=:scientific,significantDigits=3 } }).Get("content");`,state).value;
    expect(rendered).toContain("≈ 3\\.33E\\-1");
});

 test("numeric policy changes control labels without changing editable source", () => {
    const panel=parseAndEvaluate(`.Plugin.Load("document"); $$x := 1/3;
        .document.Present(.ControlPanel([.Controls.Input($$x,"x")],"Values"), {= notation=:decimal,decimalPlaces=2 });`,runtime());
    const html=renderOutputHtml(panel,formatValue);
    expect(html).toContain('value="1/3"');
    expect(html).toContain('≈ 0.33');
 });
