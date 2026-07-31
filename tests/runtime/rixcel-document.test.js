import { describe, expect, test } from "bun:test";
import {
    RIXCEL_FORMAT,
    RIXCEL_VERSION,
    createSheet,
    exportRixCelDocument,
    formatValue,
    parseAndEvaluate,
    parseRixCelDocument,
    stringifyRixCelDocument,
} from "../../src/index.js";

describe("RiXCel documents", () => {
    test("round-trips authoritative rank-N formula source through RiX capabilities", () => {
        const result = parseAndEvaluate(`
            original := .FormulaSheet(
                {:2x1x2:
                    @{2}; @{5}
                    ;;
                    @{20}; @{21}
                },
                {=
                    id="cube",
                    assignmentMode="~=",
                    view={=
                        title="Named cube",
                        axes=["region", "measure", "scenario"],
                        axisLabels=[
                            ["North", "South"],
                            ["Value"],
                            ["Actual", "Forecast"]
                        ],
                        viewAxes=[1, 2],
                        slice=[_, _, 2]
                    }
                }
            );
            original.SetSource(1, 1, 1, "10", ":=");
            original.SetSource(1, 1, 2, "grid[1,1,1] + 3", "~=");
            original.SetSource(2, 1, 1, "grid[1,1,2] * 4", "~=");
            original.SetSource(2, 1, 2, "grid[2,1,1] + 1", "~=");
            saved := .RiXCelExport(original);
            restored := .RiXCelImport(saved);
            {: saved, restored }
        `);
        const [saved, restored] = result.values;
        const document = JSON.parse(saved.value);

        expect(document.format).toBe(RIXCEL_FORMAT);
        expect(document.version).toBe(RIXCEL_VERSION);
        expect(document.id).toBe("cube");
        expect(document.shape).toEqual([2, 1, 2]);
        expect(document.view).toEqual({
            title: "Named cube",
            axes: ["region", "measure", "scenario"],
            axisLabels: [
                ["North", "South"],
                ["Value"],
                ["Actual", "Forecast"],
            ],
            viewAxes: [1, 2],
            slice: [null, null, 2],
        });
        expect(document.slots.map((slot) => slot.id)).toEqual([
            "cube:slot:1:1:1",
            "cube:slot:1:1:2",
            "cube:slot:2:1:1",
            "cube:slot:2:1:2",
        ]);
        expect(document.slots[0].source).toBe("10");
        expect(document.slots[0].assignmentMode).toBe(":=");
        expect(document.slots[1].assignmentMode).toBe("~=");

        expect(restored.id).toBe("cube");
        expect(restored.shape).toEqual([2, 1, 2]);
        expect(restored.slot([1, 1, 2]).dependencies).toEqual(["1,1,1"]);
        expect(restored.slot([2, 1, 1]).dependencies).toEqual(["1,1,2"]);
        expect(formatValue(restored.get([2, 1, 2]))).toBe("53");
        expect(restored.getFormulaSource([1, 1, 1])).toBe("10");
        expect(restored.slot([1, 1, 1]).assignmentMode).toBe(":=");
        const restoredSheet = createSheet([restored]);
        expect(restoredSheet.title).toBe("Named cube");
        expect(restoredSheet.rowHeaders).toEqual(["North", "South"]);
        expect(restoredSheet.columnHeaders).toEqual(["Value"]);
        expect(restoredSheet.hiddenAxes[0].selectedLabel).toBe("Forecast");
    });

    test("migrates the code/op/style draft and recompiles it", () => {
        const draft = {
            kind: "rixcel",
            version: 0,
            id: "legacy",
            shape: [1, 2],
            slots: [
                { index: [1, 1], code: "5", op: "::=", style: { emphasis: true } },
                { index: [1, 2], code: "grid[1,1] * 3" },
            ],
        };
        const migrated = parseRixCelDocument(draft);

        expect(migrated).toEqual({
            format: "rixcel",
            version: 1,
            id: "legacy",
            shape: [1, 2],
            view: {},
            slots: [
                {
                    id: "legacy:slot:1:1",
                    index: [1, 1],
                    source: "5",
                    assignmentMode: "::=",
                    view: { emphasis: true },
                },
                {
                    id: "legacy:slot:1:2",
                    index: [1, 2],
                    source: "grid[1,1] * 3",
                    assignmentMode: ":=",
                    view: {},
                },
            ],
        });

        const jsonLiteral = `""${JSON.stringify(draft)}""`;
        const restored = parseAndEvaluate(`.RiXCelImport(${jsonLiteral})`);
        expect(formatValue(restored.get([1, 2]))).toBe("15");
        expect(restored.slot([1, 1]).view).toEqual({ emphasis: true });
    });

    test("host APIs export canonical JSON without runtime caches", () => {
        const sheet = parseAndEvaluate(`
            .FormulaSheet(
                {:1x2: @{7}, @{ grid[1,1] + 1 }},
                {= id="host-api" }
            )
        `);
        const document = exportRixCelDocument(sheet);
        const json = stringifyRixCelDocument(document, { space: 0 });

        expect(document.slots[1].source).toBe("grid[1,1] + 1");
        expect(document.slots[1]).not.toHaveProperty("value");
        expect(document.slots[1]).not.toHaveProperty("dependencies");
        expect(document.slots[1]).not.toHaveProperty("formula");
        expect(JSON.parse(json)).toEqual(document);
    });

    test("rejects incomplete, aliased, malformed, and future documents", () => {
        const base = {
            format: "rixcel",
            version: 1,
            id: "bad",
            shape: [1, 2],
            view: {},
            slots: [
                {
                    id: "bad:slot:1:1",
                    index: [1, 1],
                    source: "1",
                    assignmentMode: ":=",
                    view: {},
                },
                {
                    id: "bad:slot:1:2",
                    index: [1, 2],
                    source: "2",
                    assignmentMode: ":=",
                    view: {},
                },
            ],
        };

        expect(() => parseRixCelDocument({ ...base, slots: base.slots.slice(0, 1) }))
            .toThrow("must contain exactly 2 dense slots");
        expect(() => parseRixCelDocument({
            ...base,
            slots: [base.slots[0], { ...base.slots[1], index: [1, 1] }],
        })).toThrow("duplicates coordinate");
        expect(() => parseRixCelDocument({
            ...base,
            slots: [{ ...base.slots[0], id: "somewhere-else" }, base.slots[1]],
        })).toThrow('must equal "bad:slot:1:1"');
        expect(() => parseRixCelDocument({
            ...base,
            slots: [{ ...base.slots[0], assignmentMode: "+=" }, base.slots[1]],
        })).toThrow("assignmentMode");
        expect(() => parseRixCelDocument({
            ...base,
            view: {
                axes: ["row", "column"],
                axisLabels: [["too", "many"], ["left", "right"]],
            },
        })).toThrow("$.view.axisLabels[0]");
        expect(() => parseRixCelDocument({ ...base, version: 2 }))
            .toThrow("Unsupported RiXCel document version 2");
        expect(() => parseRixCelDocument("{ definitely not JSON"))
            .toThrow("Invalid RiXCel JSON");

        const invalidSource = {
            ...base,
            slots: [
                base.slots[0],
                { ...base.slots[1], source: "1 +" },
            ],
        };
        const invalidLiteral = `""${JSON.stringify(invalidSource)}""`;
        expect(() => parseAndEvaluate(`.RiXCelImport(${invalidLiteral})`))
            .toThrow("RiXCel source for grid[1,2] did not compile");
    });
});
