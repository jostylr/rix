import { describe, expect, test } from "bun:test";
import {
    moveSheetSelection,
    parseSheetFormulaClipboard,
    sheetCellDiagnostics,
    sheetCellDependencies,
    sheetDisplayAddress,
    sheetPlaneKey,
} from "../../src/tools/sheet-view.js";

describe("portable Sheet host interaction helpers", () => {
    test("dual and letter headers produce familiar display addresses", () => {
        expect(sheetDisplayAddress("C · 3", "2", 3, 2)).toBe("C2");
        expect(sheetDisplayAddress("AA", "17", 27, 17)).toBe("AA17");
    });

    test("numeric headers use unambiguous R1C1-style display addresses", () => {
        expect(sheetDisplayAddress("3", "2", 3, 2)).toBe("R2C3");
    });

    test("plane keys are stable in tensor-axis order", () => {
        expect(sheetPlaneKey([
            { axis: 4, value: 2 },
            { axis: 3, value: 5 },
        ])).toBe("3:5,4:2");
        expect(sheetPlaneKey([])).toBe("");
    });

    test("arrow movement stays inside the visible sheet", () => {
        expect(moveSheetSelection({ row: 2, column: 2 }, "ArrowRight", 3, 4)).toEqual({ row: 2, column: 3 });
        expect(moveSheetSelection({ row: 1, column: 1 }, "ArrowUp", 3, 4)).toEqual({ row: 1, column: 1 });
        expect(moveSheetSelection({ row: 3, column: 4 }, "ArrowDown", 3, 4)).toEqual({ row: 3, column: 4 });
        expect(moveSheetSelection({ row: 2, column: 3 }, "Home", 3, 4)).toEqual({ row: 2, column: 1 });
        expect(moveSheetSelection({ row: 2, column: 3 }, "End", 3, 4)).toEqual({ row: 2, column: 4 });
        expect(moveSheetSelection({ row: 2, column: 3 }, "Enter", 3, 4)).toBeNull();
    });

    test("formula clipboard text preserves explicit assignment and reference semantics", () => {
        expect(parseSheetFormulaClipboard("~= near[0,-1] + grid[1,1]")).toEqual({
            source: "near[0,-1] + grid[1,1]",
            assignmentMode: "~=",
        });
        expect(parseSheetFormulaClipboard("near[0,-1] * 2")).toEqual({
            source: "near[0,-1] * 2",
            assignmentMode: ":=",
        });
    });

    test("cell diagnostics decode structured and fallback host metadata", () => {
        expect(sheetCellDiagnostics({
            rixState: "error",
            rixDiagnostics: '["bad formula"]',
            rixDiagnosticKind: "parse",
            rixDiagnosticSource: "1 +",
        })).toEqual({
            state: "error",
            diagnostics: ["bad formula"],
            kind: "parse",
            source: "1 +",
        });
        expect(sheetCellDiagnostics({ rixDiagnostics: "unencoded error" }).diagnostics)
            .toEqual(["unencoded error"]);
    });

    test("cell dependencies decode tracked coordinate metadata", () => {
        expect(sheetCellDependencies({ rixDependencies: '["1,1","2,3"]' }))
            .toEqual(["1,1", "2,3"]);
        expect(sheetCellDependencies({ rixDependencies: "not json" })).toEqual([]);
    });
});
