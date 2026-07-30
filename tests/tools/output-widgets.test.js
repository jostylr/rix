import { expect, test } from "bun:test";
import { restoreSheetFocus } from "../../src/tools/output-widgets.js";

function fakeSheet(addresses) {
    const cells = addresses.map((address) => ({
        dataset: { rixAddress: address },
        focused: false,
        focus() {
            this.focused = true;
        },
    }));
    return {
        cells,
        querySelectorAll(selector) {
            return selector === "td[data-rix-address]" ? cells : [];
        },
    };
}

test("LiveView remount focus follows the edited sheet and canonical address", () => {
    const first = fakeSheet(["grid[1,1]", "grid[1,2]"]);
    const second = fakeSheet(["other[1,1]"]);
    const root = {
        matches() {
            return false;
        },
        querySelectorAll(selector) {
            return selector === ".rix-output-sheet" ? [first, second] : [];
        },
    };

    expect(restoreSheetFocus(root, { sheetIndex: 0, address: "grid[1,2]" })).toBe(true);
    expect(first.cells[0].focused).toBe(false);
    expect(first.cells[1].focused).toBe(true);
    expect(second.cells[0].focused).toBe(false);
});

test("LiveView remount focus safely ignores a removed sheet or coordinate", () => {
    const root = {
        matches() {
            return false;
        },
        querySelectorAll() {
            return [];
        },
    };

    expect(restoreSheetFocus(root, { sheetIndex: 0, address: "grid[1,1]" })).toBe(false);
    expect(restoreSheetFocus(root, null)).toBe(false);
});
