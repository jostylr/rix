import { describe, expect, test } from "bun:test";
import { formatValue, parseAndEvaluate, renderOutputHtml } from "../../src/index.js";

describe("portable structured output", () => {
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
        expect(formatValue(division)).toContain("│");
        expect(renderOutputHtml(division, formatValue)).toContain("rix-grid-rule-top");
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
        expect(document.children.map((child) => child.kind)).toEqual(["heading", "figure"]);
        expect(document.children[1].content.kind).toBe("table");
        expect(renderOutputHtml(document, formatValue)).toContain("tbl:squares");
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
