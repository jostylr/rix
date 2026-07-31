import { expect, test } from "bun:test";
import {
    mountOutputWidgets,
    restoreGraphicFocus,
    restoreSheetFocus,
} from "../../src/tools/output-widgets.js";

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

test("reactive Graphic remount focus follows the drag target identity", () => {
    const handles = ["graph:other", "graph:point"].map((targetId) => ({
        dataset: { rixDragTarget: targetId },
        focused: false,
        focus() {
            this.focused = true;
        },
    }));
    const graphic = {
        querySelectorAll(selector) {
            return selector === "[data-rix-drag-target]" ? handles : [];
        },
    };
    const root = {
        matches() {
            return false;
        },
        querySelectorAll(selector) {
            return selector === ".rix-output-graphic" ? [graphic] : [];
        },
    };

    expect(restoreGraphicFocus(root, {
        graphicIndex: 0,
        targetId: "graph:point",
    })).toBe(true);
    expect(handles[0].focused).toBe(false);
    expect(handles[1].focused).toBe(true);
    expect(restoreGraphicFocus(root, {
        graphicIndex: 0,
        targetId: "graph:missing",
    })).toBe(false);
});

test("a host-observed reactive output remounts and disposes its subscription", () => {
    let notify = null;
    let unsubscribed = false;
    const root = {
        innerHTML: "<span>first</span>",
        matches() {
            return false;
        },
        querySelectorAll() {
            return [];
        },
    };
    const dispose = mountOutputWidgets(root, "first", {
        render: (value) => `<span>${value}</span>`,
        observe(listener) {
            notify = listener;
            return () => {
                unsubscribed = true;
            };
        },
    });

    notify("second");
    expect(root.innerHTML).toBe("<span>second</span>");
    dispose();
    expect(unsubscribed).toBe(true);
    notify("third");
    expect(root.innerHTML).toBe("<span>second</span>");
});
