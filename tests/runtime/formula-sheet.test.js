import { describe, expect, test } from "bun:test";
import {
    createSheetSnapshot,
    formatValue,
    parseAndEvaluate,
    renderOutputHtml,
} from "../../src/index.js";

const chainSource = `
    model := .FormulaSheet([
        [@{; 1 }, @{; grid[1,1] + 1 }],
        [@{; grid[1,2] * 2 }, @{; grid[2,1] + 1 }]
    ]);
`;

describe("formula-backed sheets", () => {
    test("evaluate deferred formulas in dependency order", () => {
        const model = parseAndEvaluate(`${chainSource} model`);
        expect(model.type).toBe("formula_sheet");
        expect(model.shape).toEqual([2, 2]);
        expect(model.epoch).toBe(1);
        expect(formatValue(model.get([2, 2]))).toBe("5");
        expect(model.slot([1, 2]).dependencies).toEqual(["1,1"]);
        expect(model.slot([2, 1]).dependencies).toEqual(["1,2"]);
        expect(model.slot([1, 1]).source).toBe("1");
        expect(model.slot([1, 2]).source).toBe("grid[1,1] + 1");
    });

    test("exposes the current row, column, and tuple index", () => {
        const model = parseAndEvaluate(`
            .FormulaSheet([
                [@{; row }, @{; col }],
                [@{; index[1] }, @{; index[1] + index[2] }]
            ])
        `);
        expect(formatValue(model.get([1, 1]))).toBe("1");
        expect(formatValue(model.get([1, 2]))).toBe("2");
        expect(formatValue(model.get([2, 1]))).toBe("2");
        expect(formatValue(model.get([2, 2]))).toBe("4");
    });

    test("accepts tensor notation for rank-2 and higher formula grids", () => {
        const matrix = parseAndEvaluate(`
            .FormulaSheet({:2x2:
                @{1}, @{2};
                @{3}, @{4}
            })
        `);
        expect(matrix.shape).toEqual([2, 2]);
        expect(formatValue(matrix.get([2, 1]))).toBe("3");

        const tensor = parseAndEvaluate(`
            .FormulaSheet({:2x1x2:
                @{1}; @{2}
                ;;
                @{3}; @{4}
            })
        `);
        expect(tensor.shape).toEqual([2, 1, 2]);
        expect(formatValue(tensor.get([2, 1, 2]))).toBe("4");
    });

    test("SetFormula starts a new epoch and recomputes dependents", () => {
        const value = parseAndEvaluate(`
            ${chainSource}
            model.SetFormula(1, 1, @{; 10 });
            model[2,2]
        `);
        expect(formatValue(value)).toBe("23");
    });

    test("publishes successful commits to reactive dependents", () => {
        const model = parseAndEvaluate(`${chainSource} model`);
        const events = [];
        const unsubscribe = model.subscribe((event) => events.push(event));
        const replacement = parseAndEvaluate("@{10}");
        model.setFormula([1, 1], replacement, { source: "10" });

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe("formula:commit");
        expect(events[0].previousEpoch).toBe(1);
        expect(events[0].epoch).toBe(2);
        expect(events[0].cause.source).toBe("10");
        expect(formatValue(model.get([2, 2]))).toBe("23");
        unsubscribe();
    });

    test("self and indirect references report complete cycle paths", () => {
        expect(() => parseAndEvaluate(`
            .FormulaSheet([[@{; grid[1,1] + 1 }]])
        `)).toThrow("Formula cycle: grid[1,1] -> grid[1,1]");

        expect(() => parseAndEvaluate(`
            .FormulaSheet([[
                @{; grid[1,2] },
                @{; grid[1,1] }
            ]])
        `)).toThrow("grid[1,1] -> grid[1,2] -> grid[1,1]");
    });

    test("formulas run in an isolated sheet context", () => {
        expect(() => parseAndEvaluate(`
            outside := 10;
            .FormulaSheet([[@{; outside + 1 }]])
        `)).toThrow("Undefined variable: outside");
        expect(() => parseAndEvaluate(`
            outside := 10;
            .FormulaSheet([[@{; @outside + 1 }]])
        `)).toThrow("cannot access caller bindings");
    });

    test("formulas cannot mutate the sheet during an evaluation epoch", () => {
        expect(() => parseAndEvaluate(`
            .FormulaSheet([[@{; grid.SetFormula(1, 1, @{; 2 }) }]])
        `)).toThrow("cannot change formulas during evaluation");
        expect(() => parseAndEvaluate(`
            .FormulaSheet([[@{; grid.Recalculate() }]])
        `)).toThrow("cannot start a nested recalculation");
    });

    test("failed epochs retain the formula and previous committed value", () => {
        const model = parseAndEvaluate(`${chainSource} model`);
        const previous = model.slot([1, 1]).value;
        const cyclic = parseAndEvaluate("@{; grid[1,1] + 1 }");
        expect(() => model.setFormula([1, 1], cyclic)).toThrow("Formula cycle");
        const slot = model.slot([1, 1]);
        expect(slot.formula).toBe(cyclic);
        expect(slot.value).toBe(previous);
        expect(slot.state).toBe("error");
        expect(slot.diagnostics[0]).toContain("grid[1,1] -> grid[1,1]");
    });

    test("Sheet adapts formula values and can detach a portable snapshot", () => {
        const view = parseAndEvaluate(`
            ${chainSource}
            .Sheet(model, {= title="Formula results" })
        `);
        expect(view.sourceKind).toBe("formula_sheet");
        expect(view.formulaBacked).toBe(true);
        expect(view.editable).toBe(true);
        expect(view.editMode).toBe("formula");
        expect(view.cells[0][1].formulaSource).toBe("grid[1,1] + 1");
        expect(formatValue(view.cells[1][1].value)).toBe("5");
        expect(renderOutputHtml(view, formatValue)).toContain('data-rix-formula-sheet="true"');
        expect(renderOutputHtml(view, formatValue)).toContain('data-rix-formula-epoch="1"');
        expect(renderOutputHtml(view, formatValue)).toContain('data-rix-edit-mode="formula"');
        expect(renderOutputHtml(view, formatValue)).toContain('data-rix-formula-source="grid[1,1] + 1"');

        const snapshot = createSheetSnapshot(view);
        expect(snapshot.formulaBacked).toBe(false);
        expect(snapshot.formulaSheet).toBeNull();
        expect(formatValue(snapshot.cells[1][1].value)).toBe("5");
    });

    test("requires rectangular deferred formulas", () => {
        expect(() => parseAndEvaluate(".FormulaSheet([[1]])")).toThrow("must use deferred syntax");
        expect(() => parseAndEvaluate(".FormulaSheet([[@{; 1 }], [@{; 2 }, @{; 3 }]])")).toThrow("equal lengths");
    });
});
