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

    test("resolves complete labeled coordinates without changing numeric identity", () => {
        const result = parseAndEvaluate(`
            model := .FormulaSheet(
                {:2x2:
                    @{10}, @{20};
                    @{30}, @{40}
                },
                {= view={=
                    axes=["region", "measure"],
                    axisLabels=[["North", "South"], ["Revenue", "Cost"]]
                }}
            );
            [
                model.At({= region="South", measure="Cost"}),
                model.Index({= region="North", measure="Cost"})
            ]
        `);
        expect(formatValue(result.values[0])).toBe("40");
        expect(result.values[1].values.map((value) => Number(value.value))).toEqual([1, 2]);

        const slot = parseAndEvaluate(`
            model := .FormulaSheet(
                {:2x1: @{10}; @{20}},
                {= view={= axes=["region", "measure"], axisLabels=[["North", "South"], ["Revenue"]] }}
            );
            model.SlotAt({= region="South", measure="Revenue"})
        `);
        expect(slot.id).toEndWith(":slot:2:1");

        expect(() => parseAndEvaluate(`
            model := .FormulaSheet(
                {:1x2: @{1}, @{2}},
                {= view={= axes=["row", "kind"], axisLabels=[_, ["same", "same"]] }}
            );
            model.At({= row=1, kind="same"})
        `)).toThrow("coordinate label is ambiguous");
        expect(() => parseAndEvaluate(`
            model := .FormulaSheet(
                {:1x1: @{1}},
                {= view={= axes=["row", "kind"], axisLabels=[_, ["only"]] }}
            );
            model.At({= row=1})
        `)).toThrow("is missing kind");
    });

    test("near resolves rank-N relative reads and records dependencies", () => {
        const model = parseAndEvaluate(`
            .FormulaSheet({:2x2:
                @{10}, @{ near[0,-1] + 1 };
                @{ near[-1,0] * 2 }, @{ near[0,-1] + near[-1,0] }
            })
        `);
        expect(formatValue(model.get([2, 2]))).toBe("31");
        expect(model.slot([2, 2]).dependencies).toEqual(["2,1", "1,2"]);
        expect(() => parseAndEvaluate(`
            .FormulaSheet({:1x1: @{ near[0,-1] }})
        `)).toThrow("near[0,-1] from grid[1,1] is out of range on axis 2");
        expect(() => parseAndEvaluate(`
            .FormulaSheet({:1x1: @{ near[0,0] }})
        `)).toThrow("Formula cycle: grid[1,1] -> grid[1,1]");
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

    test("stable slot IDs keep authoritative source separate from assignment mode", () => {
        const model = parseAndEvaluate(`
            model := .FormulaSheet(
                {:1x2: @{2}, @{ grid[1,1] + 1 }},
                {= id="budget", assignmentMode="~=" }
            );
            model.SetSource(1, 1, "10", ":=");
            model
        `);

        expect(model.id).toBe("budget");
        expect(model.slot([1, 1]).id).toBe("budget:slot:1:1");
        expect(model.slot([1, 1]).reactiveId).toBe("budget:graph:slot_1_1");
        expect(model.slot([1, 1]).source).toBe("10");
        expect(model.slot([1, 1]).assignmentMode).toBe(":=");
        expect(model.slot([1, 2]).assignmentMode).toBe("~=");
        expect(formatValue(model.get([1, 2]))).toBe("11");
        expect(model.getFormulaSource([1, 1])).toBe("10");

        model.setFormulaSource([1, 1], "::= 12");
        expect(model.slot([1, 1]).source).toBe("12");
        expect(model.slot([1, 1]).assignmentMode).toBe("::=");
        expect(() => model.setFormulaSource([1, 1], "~= 13", ":="))
            .toThrow("source begins with ~=, but assignment mode is :=");

        const other = parseAndEvaluate(".FormulaSheet({:1x1: @{1}})");
        expect(other.id).not.toBe(model.id);
        expect(other.slot([1, 1]).id).toStartWith(`${other.id}:slot:`);
        expect(() => parseAndEvaluate(
            '.FormulaSheet({:1x1: @{1}}, {= assignmentMode="+=" })',
        )).toThrow("Unsupported FormulaSheet assignment mode");
        expect(() => parseAndEvaluate(
            '.FormulaSheet({:1x1: @{1}}, {= id=" " })',
        )).toThrow("id must not be empty");
        expect(() => parseAndEvaluate(
            '.FormulaSheet({:1x1: @{1}}, {= view="not a map" })',
        )).toThrow("FormulaSheet view must be a map");

        const systemFormula = parseAndEvaluate(`
            model := .FormulaSheet({:1x1: @{0}});
            model.SetSource(1, 1, ".Abs(-3)");
            model[1,1]
        `);
        expect(formatValue(systemFormula)).toBe("3");
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
        expect(view.cells[0][1].slotId).toBe(`${view.formulaSheet.id}:slot:1:2`);
        expect(view.cells[0][1].assignmentMode).toBe(":=");
        expect(formatValue(view.cells[1][1].value)).toBe("5");
        expect(renderOutputHtml(view, formatValue)).toContain('data-rix-formula-sheet="true"');
        expect(renderOutputHtml(view, formatValue)).toContain('data-rix-formula-epoch="1"');
        expect(renderOutputHtml(view, formatValue)).toContain('data-rix-edit-mode="formula"');
        expect(renderOutputHtml(view, formatValue)).toContain('data-rix-formula-source="grid[1,1] + 1"');
        expect(renderOutputHtml(view, formatValue)).toContain('data-rix-slot-id="');
        expect(renderOutputHtml(view, formatValue)).toContain('data-rix-assignment-mode=":="');
        expect(renderOutputHtml(view, formatValue)).toContain('data-rix-edit-assignment-mode');
        expect(renderOutputHtml(view, formatValue)).toContain('data-rix-edit-value');

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
