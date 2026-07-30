import { describe, expect, test } from "bun:test";
import { moveSheetSelection, sheetDisplayAddress } from "../../src/tools/sheet-view.js";

describe("portable Sheet host interaction helpers", () => {
    test("dual and letter headers produce familiar display addresses", () => {
        expect(sheetDisplayAddress("C · 3", "2", 3, 2)).toBe("C2");
        expect(sheetDisplayAddress("AA", "17", 27, 17)).toBe("AA17");
    });

    test("numeric headers use unambiguous R1C1-style display addresses", () => {
        expect(sheetDisplayAddress("3", "2", 3, 2)).toBe("R2C3");
    });

    test("arrow movement stays inside the visible sheet", () => {
        expect(moveSheetSelection({ row: 2, column: 2 }, "ArrowRight", 3, 4)).toEqual({ row: 2, column: 3 });
        expect(moveSheetSelection({ row: 1, column: 1 }, "ArrowUp", 3, 4)).toEqual({ row: 1, column: 1 });
        expect(moveSheetSelection({ row: 3, column: 4 }, "ArrowDown", 3, 4)).toEqual({ row: 3, column: 4 });
        expect(moveSheetSelection({ row: 2, column: 3 }, "Home", 3, 4)).toEqual({ row: 2, column: 1 });
        expect(moveSheetSelection({ row: 2, column: 3 }, "End", 3, 4)).toEqual({ row: 2, column: 4 });
        expect(moveSheetSelection({ row: 2, column: 3 }, "Enter", 3, 4)).toBeNull();
    });
});
