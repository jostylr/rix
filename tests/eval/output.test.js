import { describe, expect, test } from "bun:test";
import {
    Context,
    createControlPanelSnapshot,
    formatValue,
    parseAndEvaluate,
    renderControlPanelMarkdown,
    renderControlPanelStaticHtml,
    renderOutputHtml,
    serializeControlPanel,
} from "../../src/index.js";

describe("portable structured output", () => {
    test("Out delegates artifact declarations to the embedding host", () => {
        const context = new Context();
        const artifacts = [];
        context.setEnv("__output_sink__", (artifact) => artifacts.push(artifact));
        const value = parseAndEvaluate('.Out("report.txt", 3/4)', { context });
        expect(formatValue(value)).toBe("3/4");
        expect(artifacts).toHaveLength(1);
        expect(artifacts[0].path).toBe("report.txt");
        expect(formatValue(artifacts[0].value)).toBe("3/4");
        expect(() => parseAndEvaluate('.Out("report.txt", 3/4)'))
            .toThrow("host output sink");
    });

    test("ControlPanel sliders bind directly to $$ identities and retain exact steps", () => {
        const panel = parseAndEvaluate(`
            $$x := 3/2;
            .ControlPanel({=
                title="Parameters",
                description="Exact controls",
                controls=[.Controls.Slider({=
                    target=$$x,
                    interval=0:3,
                    step=1/2,
                    label="x",
                    help="Choose an exact half"
                })]
            })
        `);
        expect(panel.kind).toBe("control_panel");
        expect(panel.controls).toHaveLength(1);
        expect(panel.controls[0]).toMatchObject({
            kind: "control_slider",
            label: "x",
            steps: 6,
            index: 3,
        });
        expect(formatValue(panel.controls[0].step)).toBe("1/2");
        expect(formatValue(panel)).toContain("x: 1..1/2 (0 … 3; step 1/2)");
        const html = renderOutputHtml(panel, formatValue);
        expect(html).toContain('class="rix-output-control-panel"');
        expect(html).toContain('type="range" min="0" max="6" step="1" value="3"');
        expect(html).toContain('data-rix-control-target=');
        expect(html).toContain("Choose an exact half");

        expect(() => parseAndEvaluate(".Controls.Slider(2, 0:10, 1)"))
            .toThrow("reactive $$name identity");
        expect(() => parseAndEvaluate("$$x := 1/3; .Controls.Slider($$x, 0:2, 1/2)"))
            .toThrow("exact slider step");
    });

    test("ControlPanel input, choice, toggle, range, and reset retain exact RiX values", () => {
        const panel = parseAndEvaluate(`
            $$amount := 1/3;
            $$scale := 1;
            $$enabled := 0;
            $$window := 2:5;
            .ControlPanel([
                .Controls.Input($$amount, "amount", "Any RiX expression"),
                .Controls.Choice($$scale, [
                    {= value=1/2, label="half" },
                    {= value=1, label="one" },
                    {= value=2, label="double" }
                ], "scale"),
                .Controls.Toggle($$enabled, 0, 1, "enabled"),
                .Controls.Range($$window, 0:10, 1, "window"),
                .Controls.Reset($$amount, 1/3, "reset amount")
            ], "Exact parameters")
        `);
        expect(panel.controls.map(({ kind }) => kind)).toEqual([
            "control_input",
            "control_choice",
            "control_toggle",
            "control_range",
            "control_reset",
        ]);
        expect(panel.controls[1].index).toBe(1);
        expect(formatValue(panel.controls[1].options[0].value)).toBe("1/2");
        expect(panel.controls[2].index).toBe(0);
        expect(panel.controls[3].indices).toEqual([2, 5]);

        const html = renderOutputHtml(panel, formatValue);
        expect(html).toContain('data-rix-control-kind="input"');
        expect(html).toContain('data-rix-control-kind="choice"');
        expect(html).toContain('data-rix-control-kind="toggle"');
        expect(html).toContain('data-rix-control-kind="range"');
        expect(html).toContain('data-rix-control-kind="reset"');
        expect(html).toContain('<option value="1" selected>one</option>');
        expect(html).toContain('data-rix-control-endpoint="low"');
    });

    test("ControlPanel staged mode renders explicit atomic apply and discard actions", () => {
        const panel = parseAndEvaluate(`
            $$x := 1;
            .ControlPanel({=
                controls=[.Controls.Slider($$x, 0:5, 1, "x")],
                mode=:staged,
                submitLabel="Update view",
                discardLabel="Undo edits"
            })
        `);
        expect(panel).toMatchObject({
            kind: "control_panel",
            mode: "staged",
            submitLabel: "Update view",
            discardLabel: "Undo edits",
            interactive: true,
        });
        const html = renderOutputHtml(panel, formatValue);
        expect(html).toContain('data-rix-control-mode="staged"');
        expect(html).toContain('data-rix-control-submit disabled>Update view</button>');
        expect(html).toContain('data-rix-control-discard disabled>Undo edits</button>');
        expect(html).toContain('aria-live="polite"');
        expect(() => parseAndEvaluate(`
            $$x := 1;
            .ControlPanel({= controls=[.Controls.Slider($$x, 0:5, 1)], mode=:later })
        `)).toThrow("mode must be :immediate or :staged");
    });

    test("ControlPanel snapshots retain exact values and target IDs without runtime handles", () => {
        const panel = parseAndEvaluate(`
            $$x := 3/2;
            .ControlPanel({=
                title="Parameters",
                description="A portable snapshot",
                mode=:staged,
                controls=[.Controls.Slider($$x, 0:3, 1/2, "x")]
            })
        `);
        const snapshot = createControlPanelSnapshot(panel);
        expect(snapshot).toMatchObject({
            kind: "control_panel",
            interactive: false,
            mode: "immediate",
        });
        expect(snapshot.controls[0].target).toBeNull();
        expect(snapshot.controls[0].targetId).toBe(panel.controls[0].targetId);
        expect(formatValue(snapshot.controls[0].value)).toBe("1..1/2");
        expect(snapshot.controls[0].disabled).toBe(true);

        const portable = JSON.parse(serializeControlPanel(panel));
        expect(portable).toMatchObject({
            schema: "rix.control-panel",
            version: 1,
            panel: {
                kind: "control_panel",
                interactive: false,
                controls: [{
                    targetId: panel.controls[0].targetId,
                    value: { type: "rational", numerator: "3", denominator: "2" },
                }],
            },
        });
        expect(JSON.stringify(portable)).not.toContain("validateCandidate");
        expect(JSON.stringify(portable)).not.toContain("ReactiveGraph");

        const html = renderControlPanelStaticHtml(panel, formatValue);
        expect(html).toContain('data-rix-interactive="false"');
        expect(html).toContain('type="range" min="0" max="6" step="1" value="3"');
        expect(html).toContain('aria-label="x" disabled');
        expect(html).not.toContain("data-rix-control-submit");
        const markdown = renderControlPanelMarkdown(panel, formatValue);
        expect(markdown).toContain("### Parameters");
        expect(markdown).toContain("A portable snapshot");
        expect(markdown).toContain("- x: 1..1/2 (0 … 3; step 1/2)");
    });

    test("ControlPanel format maps name displayed fields without changing exact values", () => {
        const panel = parseAndEvaluate(`
            Mixed(x) -> x _> "..";
            Continued(x) -> x _> ".~";
            Decimal(x) -> x _> ".8";
            $$x := 3/2;
            $$window := 1/2:3/2;
            $$choice := 3/2;
            .ControlPanel([
                .Controls.Slider({=
                    target=$$x,
                    interval=0:3,
                    step=1/2,
                    label="mixed x",
                    format={= value=Mixed, low=Decimal, high=Decimal, step=Continued }
                }),
                .Controls.Range({=
                    target=$$window,
                    interval=0:2,
                    step=1/2,
                    label="window",
                    format={= start=Mixed, end=Continued }
                }),
                .Controls.Choice({=
                    target=$$choice,
                    options=[1/2, 3/2],
                    label="notation",
                    format={= value=Continued, option=Mixed }
                }),
                .Controls.Reset({=
                    target=$$x,
                    initial=3/2,
                    label="restore",
                    format={= value=Continued, initial=Mixed }
                })
            ])
        `);
        const [slider, range, choice, reset] = panel.controls;
        expect(slider.value.numerator).toBe(3n);
        expect(slider.value.denominator).toBe(2n);
        expect(formatValue(slider.display.value)).toBe("1..1/2");
        expect(formatValue(slider.display.step)).toBe("0.~2");
        expect(formatValue(range.display.start)).toBe("0..1/2");
        expect(formatValue(range.display.end)).toBe("1.~2");
        expect(choice.displayOptions.map(formatValue)).toEqual(["0..1/2", "1..1/2"]);
        expect(formatValue(reset.display.initial)).toBe("1..1/2");

        const html = renderOutputHtml(panel, formatValue);
        expect(html).toContain("1..1/2");
        expect(html).toContain("0.~2");
        expect(html).toContain("Reset to 1..1/2");
        expect(() => parseAndEvaluate(`
            $$x := 1;
            F(x) -> x;
            .Controls.Input({= target=$$x, format={= typo=F } })
        `)).toThrow("format key 'typo'");
    });

    test("document blocks preserve semantic inline content instead of flattening paragraph children", () => {
        const report = parseAndEvaluate(`
            .Section({=
                level=1,
                id="proof",
                title=[.Text("A "), .Math({= source="x^2 = 2", alt="x squared equals two" })],
                children=[
                    .Paragraph([
                        .Text("Use "), .Emphasis("exact"), .Text(" values and "),
                        .Strong("preserve proof"), .Text(" in "), .Code(".Math"),
                        .Text("; see "), .Link({= href="https://example.test/proof", children="the note" }),
                        .LineBreak(), .Text("before exporting.")
                    ]),
                    .Callout({=
                        kind=:warning,
                        title="No implicit fetch",
                        children=[.Paragraph("Assets remain host-managed.")]
                    }),
                    .Quote({=
                        children=[.Paragraph("Exactness is a useful invariant.")],
                        attribution="RiX design note"
                    }),
                    .CodeBlock({= code="x := 1/2;", language="rix", caption="Exact source", lineNumbers=1 }),
                    .MathBlock({= source="x = \\frac{1}{2}", alt="x equals one half", label="(1)" }),
                    .List({=
                        ordered=1,
                        start=3,
                        items=[
                            .ListItem(.Paragraph("Start with a proof.")),
                            .ListItem({= children=[
                                .Paragraph("Keep its evidence."),
                                .List({= items=[.ListItem(.Paragraph("Keep the source."))] })
                            ]})
                        ]
                    })
                ]
            })
        `);

        expect(report.kind).toBe("section");
        expect(report.children.map(({ kind }) => kind)).toEqual([
            "paragraph", "callout", "quote", "code_block", "math_block", "list",
        ]);
        expect(report.children[1].variant).toBe("warning");
        expect(report.children[5].start).toBe(3);
        const html = renderOutputHtml(report, formatValue);
        expect(html).toContain('<section class="rix-output-section" data-rix-section-level="1" id="proof">');
        expect(html).toContain("<em class=\"rix-output-emphasis\">exact</em>");
        expect(html).toContain("<strong class=\"rix-output-strong\">preserve proof</strong>");
        expect(html).toContain("<code class=\"rix-output-code\">.Math</code>");
        expect(html).toContain('<a class="rix-output-link" href="https://example.test/proof">');
        expect(html).toContain('class="rix-output-callout rix-output-callout-warning"');
        expect(html).toContain("<blockquote class=\"rix-output-quote\">");
        expect(html).toContain('data-language="rix"');
        expect(html).toContain('data-rix-math-notation="tex"');
        expect(html).toContain('<ol class="rix-output-list" start="3">');
        const plain = formatValue(report);
        expect(plain).toContain("[Warning No implicit fetch]");
        expect(plain).toContain("3. Start with a proof.");
        expect(plain).toContain("x equals one half");

        expect(() => parseAndEvaluate('.Paragraph(.Table(["x"], [[1]]))'))
            .toThrow("cannot contain block output table");
        expect(() => parseAndEvaluate('.List({= items=[.Paragraph("not an item")] })'))
            .toThrow("must be a ListItem");
    });

    test("portable assets retain media metadata and provide safe HTML or text fallbacks", () => {
        const media = parseAndEvaluate(`
            imageAsset := .Asset({=
                ref="assets/proof.png",
                mime="image/png",
                width=1200,
                height=800,
                integrity="sha256:abc"
            });
            audioAsset := .Asset({= ref="assets/explanation.ogg", mime="audio/ogg" });
            videoAsset := .Asset({= ref="assets/proof.webm", mime="video/webm" });
            .Fragment([
                .Image({= asset=imageAsset, alt="A proof diagram", width=600, caption="Proof image" }),
                .Audio({= asset=audioAsset, title="Explanation", transcript="The interval is exact." }),
                .Video({= asset=videoAsset, poster=imageAsset, title="Walkthrough", transcript="The presenter explains the proof." })
            ])
        `);
        const [image, audio, video] = media.children;
        expect(image.asset.mime).toBe("image/png");
        expect(image.asset.width).toBe(1200);
        expect(audio.transcript).toHaveLength(1);
        expect(video.poster).toBe(image.asset);
        const html = renderOutputHtml(media, formatValue);
        expect(html).toContain('<img class="rix-output-image" src="assets/proof.png" alt="A proof diagram" width="600" loading="lazy">');
        expect(html).toContain('<audio class="rix-output-audio" controls>');
        expect(html).toContain('<video class="rix-output-video" controls poster="assets/proof.png">');
        expect(html).toContain("Transcript");
        expect(formatValue(media)).toContain("[Image: A proof diagram — assets/proof.png]");
        expect(formatValue(media)).toContain("The presenter explains the proof.");

        expect(() => parseAndEvaluate('.Image(.Asset("assets/a.txt", "text/plain"), "missing image")'))
            .toThrow("requires an image asset");
        expect(() => parseAndEvaluate('.Image(.Asset("assets/a.png", "image/png"), " ")'))
            .toThrow("Image alt requires a nonempty string");
        const unsafe = parseAndEvaluate('.Link({= href="javascript:alert(1)", children="bad" })');
        expect(renderOutputHtml(unsafe, formatValue)).not.toContain("javascript:");
        const remoteImage = parseAndEvaluate('.Image(.Asset("https://example.test/proof.png", "image/png"), "Remote proof")');
        expect(renderOutputHtml(remoteImage, formatValue)).toContain("[Image unavailable: https://example.test/proof.png]");
        expect(renderOutputHtml(remoteImage, formatValue)).not.toContain('src="https://example.test/proof.png"');
    });

    test("Table accepts positional shorthand and keeps its semantic structure", () => {
        const table = parseAndEvaluate('.Table(["x", "F(x)"], [[1, 1], [2, 4]])');
        expect(table.type).toBe("output");
        expect(table.kind).toBe("table");
        expect(table.columns.map((column) => column.label)).toEqual(["x", "F(x)"]);
        expect(formatValue(table)).toContain("F(x)");
        expect(renderOutputHtml(table, formatValue)).toContain("rix-output-table");
    });

    test("Sheet creates a portable tensor view with canonical RiX addresses", () => {
        const sheet = parseAndEvaluate(`
            m := {:2x3: 1, 2, 3; 4, 5, 6};
            .Sheet(m, {= title="Matrix view" })
        `);
        expect(sheet.type).toBe("output");
        expect(sheet.kind).toBe("sheet");
        expect(sheet.sourceKind).toBe("tensor");
        expect(sheet.shape).toEqual([2, 3]);
        expect(sheet.viewAxes).toEqual([1, 2]);
        expect(sheet.columnHeaders).toEqual(["A · 1", "B · 2", "C · 3"]);
        expect(sheet.cells[1][2].address).toBe("grid[2,3]");
        expect(sheet.cells[1][2].displayAddress).toBe("C2");
        expect(formatValue(sheet.cells[1][2].value)).toBe("6");
        expect(sheet.hiddenAxes).toEqual([]);
        expect(sheet.planes).toHaveLength(1);

        const text = formatValue(sheet);
        expect(text).toContain("Sheet: Matrix view · grid · shape 2×3");
        expect(text).toContain("C · 3");

        const html = renderOutputHtml(sheet, formatValue);
        expect(html).toContain('class="rix-output-sheet"');
        expect(html).toContain('data-rix-address="grid[2,3]"');
        expect(html).toContain('data-rix-display-address="C2"');
        expect(html).toContain('data-rix-index="2,3"');
        expect(html).toContain('class="rix-output-sheet-location" aria-live="polite"');
        expect(html).toContain('<th scope="row" data-rix-row="2">2</th>');
        expect(html).toContain('<th scope="col" data-rix-column="3">C · 3</th>');
        expect(html).toContain(">C · 3</th>");
    });

    test("Sheet distinguishes portable snapshots from live Binding views", () => {
        const snapshot = parseAndEvaluate(`
            m := {:1x2: 1, 2};
            .Sheet(m)
        `);
        expect(snapshot.editable).toBe(false);
        expect(snapshot.binding).toBeNull();

        const live = parseAndEvaluate(`
            m := {:1x2: 1, 2};
            .Sheet(.Bind(m))
        `);
        expect(live.editable).toBe(true);
        expect(live.addressBase).toBe("m");
        expect(live.bindingId).toMatch(/^binding-/);
        const html = renderOutputHtml(live, formatValue);
        expect(html).toContain('data-rix-editable="true"');
        expect(html).toContain(`data-rix-binding-id="${live.bindingId}"`);
    });

    test("Sheet selects planes and alternate visible axes from rank-N tensors", () => {
        const depthPlane = parseAndEvaluate(`
            t := {:2x3x2: 1, 2, 3; 4, 5, 6 ;; 7, 8, 9; 10, 11, 12};
            .Sheet(t, {=
                axes=["row", "column", "depth"],
                slice=[_, _, 2],
                address="cube"
            })
        `);
        expect(depthPlane.axes).toEqual(["row", "column", "depth"]);
        expect(depthPlane.slice).toEqual([null, null, 2]);
        expect(depthPlane.hiddenAxes).toEqual([
            { axis: 3, name: "depth", length: 2, selected: 2 },
        ]);
        expect(depthPlane.selectedPlaneKey).toBe("3:2");
        expect(depthPlane.planes.map(({ key }) => key)).toEqual(["3:1", "3:2"]);
        expect(formatValue(depthPlane.planes[0].cells[0][2].value)).toBe("3");
        expect(depthPlane.cells.map((row) => row.map((cell) => formatValue(cell.value)))).toEqual([
            ["7", "8", "9"],
            ["10", "11", "12"],
        ]);
        expect(depthPlane.cells[0][2]).toMatchObject({
            index: [1, 3, 2],
            address: "cube[1,3,2]",
        });
        const depthHtml = renderOutputHtml(depthPlane, formatValue);
        expect(depthHtml).toContain('data-rix-sheet-axis="3"');
        expect(depthHtml).toContain('data-rix-plane-key="3:1"');
        expect(depthHtml).toContain('data-rix-plane-key="3:2" data-rix-slice=",,2"');
        expect(depthHtml).toContain('<option value="2" selected>2</option>');

        const rowDepth = parseAndEvaluate(`
            t := {:2x3x2: 1, 2, 3; 4, 5, 6 ;; 7, 8, 9; 10, 11, 12};
            .Sheet(t, {= viewAxes=[1, 3], slice=[_, 2, _], columnLabels=:numbers })
        `);
        expect(rowDepth.viewAxes).toEqual([1, 3]);
        expect(rowDepth.columnHeaders).toEqual(["1", "2"]);
        expect(rowDepth.cells[1][1].displayAddress).toBe("R2C2");
        expect(rowDepth.cells.map((row) => row.map((cell) => formatValue(cell.value)))).toEqual([
            ["2", "8"],
            ["5", "11"],
        ]);
        expect(rowDepth.cells[1][1].address).toBe("grid[2,2,2]");
    });

    test("Sheet uses cosmetic coordinate labels without changing canonical addresses", () => {
        const sheet = parseAndEvaluate(`
            t := {:2x2x2: 1, 2; 3, 4 ;; 5, 6; 7, 8};
            .Sheet(t, {=
                title="Named tensor",
                axes=["region", "measure", "scenario"],
                axisLabels=[
                    ["North", "South"],
                    ["Revenue", "Cost"],
                    ["Actual", "Forecast"]
                ],
                slice=[_, _, 2]
            })
        `);

        expect(sheet.rowAxis).toEqual({ axis: 1, name: "region" });
        expect(sheet.columnAxis).toEqual({ axis: 2, name: "measure" });
        expect(sheet.rowHeaders).toEqual(["North · 1", "South · 2"]);
        expect(sheet.columnHeaders).toEqual(["Revenue · 1", "Cost · 2"]);
        expect(sheet.hiddenAxes).toEqual([{
            axis: 3,
            name: "scenario",
            length: 2,
            selected: 2,
            labels: ["Actual · 1", "Forecast · 2"],
            selectedLabel: "Forecast",
        }]);
        expect(sheet.cells[1][1]).toMatchObject({
            index: [2, 2, 2],
            coordinateLabels: ["South", "Cost", "Forecast"],
            coordinateLabel: "South / Cost / Forecast",
            address: "grid[2,2,2]",
            displayAddress: "B2",
        });

        const text = formatValue(sheet);
        expect(text).toContain("rows region (axis 1)");
        expect(text).toContain("scenario Forecast (axis 3:2)");
        expect(text).toContain("Revenue");

        const html = renderOutputHtml(sheet, formatValue);
        expect(html).toContain("Rows: region · Columns: measure");
        expect(html).toContain('<option value="2" selected>Forecast · 2</option>');
        expect(html).toContain('data-rix-coordinate-label="South / Cost / Forecast"');
        expect(html).toContain('data-rix-address="grid[2,2,2]"');
        expect(html).toContain('data-rix-display-address="B2"');
    });

    test("Sheet labeled lookup reaches coordinates outside the selected plane", () => {
        const result = parseAndEvaluate(`
            view := .Sheet(
                {:2x2x2: 1, 2; 3, 4 ;; 5, 6; 7, 8},
                {=
                    axes=["region", "measure", "scenario"],
                    axisLabels=[
                        ["North", "South"],
                        ["Revenue", "Cost"],
                        ["Actual", "Forecast"]
                    ],
                    slice=[_, _, 1]
                }
            );
            [
                view.At({= region="South", measure="Cost", scenario="Forecast"}),
                view.Index({= region="North", measure="Revenue", scenario="Actual"})
            ]
        `);
        expect(formatValue(result.values[0])).toBe("8");
        expect(result.values[1].values.map((value) => Number(value.value))).toEqual([1, 1, 1]);
    });

    test("Sheet adapts matrices and rank-1 sequences", () => {
        const matrix = parseAndEvaluate(".Sheet([1, 2; 3, 4])");
        expect(matrix.sourceKind).toBe("matrix");
        expect(matrix.shape).toEqual([2, 2]);
        expect(formatValue(matrix.cells[1][0].value)).toBe("3");

        const vector = parseAndEvaluate('.Sheet([10, 20], {= address="vector", columnLabels=:letters })');
        expect(vector.shape).toEqual([2]);
        expect(vector.viewAxes).toEqual([1]);
        expect(vector.columnHeaders).toEqual(["A"]);
        expect(vector.cells[1][0].address).toBe("vector[2]");
        expect(formatValue(vector.cells[1][0].value)).toBe("20");
    });

    test("Sheet validates view axes, slices, and ragged rows", () => {
        expect(() => parseAndEvaluate(".Sheet({:2x2x2:}, {= viewAxes=[1, 1] })"))
            .toThrow("viewAxes must be distinct");
        expect(() => parseAndEvaluate(".Sheet({:2x2x2:}, {= slice=[_, _, 3] })"))
            .toThrow("out of range");
        expect(() => parseAndEvaluate(".Sheet([[1], [2, 3]])"))
            .toThrow("rows must have equal lengths");
        expect(() => parseAndEvaluate(`
            .Sheet({:2x2: 1, 2; 3, 4}, {= axisLabels=[["only one"], ["a", "b"]] })
        `)).toThrow("axisLabels axis 1 must contain 2 labels");
        expect(() => parseAndEvaluate(`
            .Sheet({:2x2: 1, 2; 3, 4}, {= axisLabels=[["a", "b"]] })
        `)).toThrow("axisLabels must contain 2 axis entries");
    });

    test("Algebra.SyntheticDivision returns a ruled Grid with exact arithmetic", () => {
        const division = parseAndEvaluate(".Algebra.SyntheticDivision(1, [2, -6, 2, -1])");
        expect(division.type).toBe("output");
        expect(division.kind).toBe("grid");
        expect(division.semantic.bottom.map(formatValue)).toEqual(["2", "-4", "-2", "-3"]);
        expect(division.rules[0]).toMatchObject({ kind: "vertical", afterColumn: 2 });
        expect(formatValue(division)).toContain("│");
        const html = renderOutputHtml(division, formatValue);
        expect(html).toContain("rix-grid-rule-top");
        expect(html).toContain('<td>1</td><td class="rix-grid-rule-left">2</td>');
    });

    test("Fragments and slides preserve child output values", () => {
        const deck = parseAndEvaluate(`
            content := .Fragment([.Heading(1, "Results"), .Paragraph("Exact output")]);
            .Slides([.Slide(content, "First")])
        `);
        expect(deck.kind).toBe("slides");
        expect(deck.slides[0].content.kind).toBe("fragment");
        expect(formatValue(deck)).toContain("Slide 1");
        expect(renderOutputHtml(deck, formatValue)).toContain("rix-output-slides");
    });

    test("@ quoted strings interpolate RiX expressions", () => {
        const result = parseAndEvaluate('@"The value is @{2 + 3}."');
        expect(formatValue(result)).toBe("The value is 5.");
    });

    test("@ triple-quoted strings create document Fragments", () => {
        const document = parseAndEvaluate(`
            values := .Table(["x", "x²"], [[1, 1], [2, 4]]);
            @"""
            h1: Square values

            table: A small table #tbl:squares
                @{values}
            """
        `);
        expect(document.kind).toBe("fragment");
        expect(document.children.map((child) => child.kind)).toEqual(["section"]);
        expect(document.children[0].children[0].kind).toBe("figure");
        expect(document.children[0].children[0].content.kind).toBe("table");
        expect(renderOutputHtml(document, formatValue)).toContain("tbl:squares");
    });

    test("document templates lower strict inline syntax, blocks, literal holes, lists, and assets", () => {
        const document = parseAndEvaluate(`
            count := 5;
            diagram := "assets/proof.svg";
            diagramMime := "image/svg+xml";
            @"""
            h1: *Exact* results #results

            p: The **value** is \`x=@{count}\`, $x_@{count}$, [the proof](link: https://example.invalid/proof {title="Read proof"}), and [a tiny diagram](image: assets/tiny.svg {mime=image/svg+xml}). @@{ is literal.

            h2: Details

            quote: Ada Lovelace
                p: *Analysis* is not algebra.

            callout: tip — Keep it exact
                Use intervals.

            code: rix
                answer := @{count}; @@{

            math:
                x_@{count} = 25

            ol:
                - Begin.
                    ul:
                        - Preserve the proof.

            image: @{diagram} {mime=@{diagramMime}, alt="Proof diagram", width=320}
            """
        `);
        const section = document.children[0];
        expect(section.kind).toBe("section");
        expect(section.title[0].kind).toBe("emphasis");
        expect(section.children[0].kind).toBe("paragraph");
        expect(section.children[0].children.map((child) => child.kind)).toContain("strong");
        expect(section.children[0].children.map((child) => child.kind)).toContain("code");
        expect(section.children[0].children.map((child) => child.kind)).toContain("math");
        expect(section.children[0].children.map((child) => child.kind)).toContain("link");
        expect(section.children[0].children.map((child) => child.kind)).toContain("image");
        const details = section.children[1];
        expect(details.kind).toBe("section");
        expect(details.children.map((child) => child.kind)).toEqual(["quote", "callout", "code_block", "math_block", "list", "image"]);
        expect(details.children[2].code).toBe("answer := 5; @{");
        expect(details.children[3].source).toBe("x_5 = 25");
        expect(details.children[4].items[0].children[1].kind).toBe("list");
        expect(details.children[5].alt).toBe("Proof diagram");
        expect(renderOutputHtml(document, formatValue)).toContain("rix-output-callout-tip");
    });

    test("document templates reject malformed inline delimiters and skipped headings", () => {
        const triple = parseAndEvaluate('@"""\np: ***very exact***\n"""');
        expect(triple.children[0].children[0].kind).toBe("strong");
        expect(triple.children[0].children[0].children[0].kind).toBe("emphasis");
        expect(formatValue(triple)).toBe("very exact");
        expect(renderOutputHtml(triple, formatValue)).not.toContain("[object Object]");
        expect(() => parseAndEvaluate('@"""\np: *unclosed\n"""')).toThrow("Unclosed *emphasis*");
        expect(() => parseAndEvaluate('@"""\np: ****ambiguous****\n"""')).toThrow("Runs of four or more asterisks");
        expect(() => parseAndEvaluate('@"""\nh1: One\nh3: Three\n"""')).toThrow("skips a section level");
        expect(() => parseAndEvaluate('@"""\np: [movie](video: clip.mp4 {mime=video/mp4})\n"""')).toThrow("Inline video assets");
    });

    test("the plot plugin produces a portable SVG Graphic", () => {
        const graphic = parseAndEvaluate('.Plugin.Load("plot"); .plot.Polynomial([1, 0, -1], [-2, 2])');
        expect(graphic.kind).toBe("graphic");
        const html = renderOutputHtml(graphic, formatValue);
        expect(html).toContain("<svg");
        expect(html).toContain("<path");
        expect(html).toContain('viewBox="0 0 640 360"');
    });

    test("basic scene primitives compose into safe SVG", () => {
        const graphic = parseAndEvaluate(`
            .Graphics.Graphic([360, 220], [
                .Graphics.Rectangle([0, 0], [360, 220], {= fill="#f8fafc", stroke="#cbd5e1" }),
                .Graphics.Clip([
                    .Graphics.Transform([
                        .Graphics.Group([
                            .Graphics.Circle([80, 80], 45, {= fill="#bfdbfe", stroke="#2563eb", width=2 }),
                            .Graphics.Rectangle([60, 60], [80, 40], {= fill="#fde68a", stroke="#d97706", width=2 }),
                            .Graphics.Text([100, 85], "RiX", {= anchor=:middle, size=18, weight="bold" })
                        ], {= opacity=1 })
                    ], {= translate=[80, 15], rotate=18, origin=[100, 85] })
                ], [20, 20, 320, 160])
            ])
        `);
        expect(graphic.children.map((node) => node.kind)).toEqual(["rectangle", "clip"]);
        const html = renderOutputHtml(graphic, formatValue);
        expect(html).toContain("<defs><clipPath");
        expect(html).toContain("<circle");
        expect(html).toContain("<rect");
        expect(html).toContain("<text");
        expect(html).toContain('transform="translate(80 15) rotate(18 100 85)"');
        expect(html).toContain("RiX</text>");
    });

    test("DragPoint retains a reactive identity and renders portable interaction metadata", () => {
        const graphic = parseAndEvaluate(`
            $$origin := {: 45,55};
            $$point := $origin;
            .Graphics.Graphic([160,100], [
                .Graphics.DragPoint($$point, 9, {= fill="#7c3aed" }, "Move the point")
            ])
        `);
        const handle = graphic.children[0];
        expect(handle.kind).toBe("drag_point");
        expect(handle.target.kind).toBe("computed");
        expect(handle.replacesDependencies).toEqual(["origin"]);
        expect(handle.targetId).toEndWith(":point");
        expect(handle.center.map(formatValue)).toEqual(["45", "55"]);
        const html = renderOutputHtml(graphic, formatValue);
        expect(html).toContain('data-rix-interactive="true"');
        expect(html).toContain('class="rix-output-drag-point"');
        expect(html).toContain(`data-rix-drag-target="${handle.targetId}"`);
        expect(html).toContain('data-rix-position="45,55"');
        expect(html).toContain('aria-label="Move the point"');
        expect(html).toContain('data-rix-replaces-dependencies="origin"');
        expect(html).toContain("Dragging will replace this point’s current reactive dependencies.");
        expect(() => parseAndEvaluate(`
            .Graphics.DragPoint({: 1,2})
        `)).toThrow("must be a ReactiveGraph node");
    });

    test("Graphics.Transform accepts an explicit map specification", () => {
        const graphic = parseAndEvaluate(`
            .Graphics.Graphic([100, 100], [
                .Graphics.Transform({=
                    children = [.Graphics.Circle([10, 10], 5, {= stroke="#000", width=1 })],
                    translate = [20, 30],
                    scale = 2
                })
            ])
        `);
        expect(graphic.children[0].kind).toBe("transform");
        expect(renderOutputHtml(graphic, formatValue)).toContain('transform="translate(20 30) scale(2 2)"');
    });

    test("Graphics owns 2D leaf constructors while the draw plugin supplies conveniences", () => {
        expect(() => parseAndEvaluate(".Group([])")).toThrow("Unknown system capability: GROUP");
        expect(() => parseAndEvaluate(".Graphic([1, 1], [])")).toThrow("Unknown system capability: GRAPHIC");
        expect(parseAndEvaluate(".Graphics.Group([])").kind).toBe("group");
        expect(() => parseAndEvaluate(".draw.Line([0, 0], [10, 10])")).toThrow("available but not loaded");
        const line = parseAndEvaluate('.Plugin.Load("draw"); .draw.Line([0, 0], [10, 10])');
        expect(line.kind).toBe("path");
        expect(parseAndEvaluate('.Plugin.Load("draw"); .draw.Circle([5, 5], 3)').kind).toBe("circle");
    });

    test("the draw plugin accepts map shorthand and rejects malformed styles", () => {
        const line = parseAndEvaluate(`
            .Plugin.Load("draw");
            .draw.Line({=
                from = [1, 2],
                to = [3, 4],
                style = {= stroke = "blue", width = 2 }
            });
        `);
        expect(line.kind).toBe("path");
        expect(line.points).toHaveLength(2);
        expect(line.style.get("stroke")).toEqual({ type: "string", value: "blue" });
        expect(() => parseAndEvaluate('.Plugin.Load("draw"); .draw.Circle([0, 0], 1, "red");'))
            .toThrow("Circle style must be a map");
        expect(() => parseAndEvaluate('.Plugin.Load("draw"); .draw.Line([0, 0], [1, 1], {= }, 4);'))
            .toThrow("draw.Line received too many arguments");
    });

    test("the plot plugin fits polynomial values, handles constants, and validates ranges", () => {
        const fitted = parseAndEvaluate(`
            .Plugin.Load("plot");
            .plot.Polynomial([1, 0, 0], [-2, 2], {= size = [400, 240], margin = 20, samples = 9 });
        `);
        const fittedCurve = fitted.children.at(-1);
        const fittedY = fittedCurve.points.map(([, y]) => y);
        expect(fitted.size.map((value) => value.value)).toEqual([400n, 240n]);
        expect(fittedCurve.points).toHaveLength(9);
        expect(Math.min(...fittedY)).toBeGreaterThanOrEqual(20);
        expect(Math.max(...fittedY)).toBeLessThanOrEqual(220);
        expect(Math.max(...fittedY) - Math.min(...fittedY)).toBeGreaterThan(100);

        const constant = parseAndEvaluate(`
            .Plugin.Load("plot");
            .plot.Polynomial([0, 5], [-1, 1], {= samples = 3 });
        `);
        const constantY = constant.children.at(-1).points.map(([, y]) => y);
        expect(constantY.every(Number.isFinite)).toBe(true);
        expect(new Set(constantY).size).toBe(1);

        expect(() => parseAndEvaluate('.Plugin.Load("plot"); .plot.Polynomial([1, 0], [2, 2]);'))
            .toThrow("Polynomial plot domain must increase");
        expect(() => parseAndEvaluate('.Plugin.Load("plot"); .plot.Polynomial([1, 0], [3, -3]);'))
            .toThrow("Polynomial plot domain must increase");
        expect(() => parseAndEvaluate('.Plugin.Load("plot"); .plot.Polynomial([1, 0], [-1, 1, 2]);'))
            .toThrow("Polynomial plot domain must have a lower and upper bound");
    });

    test("the plot plugin composes labeled series, x-axis ticks, and marked values", () => {
        const plot = parseAndEvaluate(`
            .Plugin.Load("plot");
            .plot.Polynomial([1, 0, -1], [-2, 2], {=
                label="quadratic",
                series=[{= coefficients=[2, 1], label="linear part", stroke="#b45309" }],
                ticks=[{= x=1/2, label="center = 1/2" }],
                marks=[{= point=[1/2, -3/4], label="(1/2, f(1/2) = -3/4)" }]
            })
        `);
        const html = renderOutputHtml(plot, formatValue);
        expect(plot.children.filter(({ kind }) => kind === "circle")).toHaveLength(1);
        expect(html).toContain("quadratic</text>");
        expect(html).toContain("linear part</text>");
        expect(html).toContain("center = 1/2</text>");
        expect(html).toContain("f(1/2) = -3/4)");
    });

    test("Graphics.Path preserves renderer-independent curve and arc commands", () => {
        const graphic = parseAndEvaluate(`
            .Graphics.Graphic([100, 100], [
                .Graphics.Path({=
                    commands = [
                        {= op=:move, to=[0, 0] },
                        {= op=:cubic, control1=[10, 0], control2=[20, 20], to=[30, 10] },
                        {= op=:arc, radius=[8, 6], rotation=0, large=_, sweep=1, to=[40, 20] },
                        {= op=:close }
                    ],
                    style = {= stroke="#000" }
                })
            ])
        `);
        const html = renderOutputHtml(graphic, formatValue);
        expect(html).toContain('d="M0 0 C10 0 20 20 30 10 A8 6 0 0 1 40 20 Z"');
        expect(formatValue(graphic.children[0])).toBe("[Path: 4 commands]");
    });
});
