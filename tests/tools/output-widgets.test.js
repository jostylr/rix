import { expect, test } from "bun:test";
import {
    mountOutputWidgets,
    restoreControlPanelFocus,
    restoreGraphicFocus,
    restoreSheetFocus,
} from "../../src/tools/output-widgets.js";
import { formatValue, parseAndEvaluate } from "../../src/index.js";

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

test("reactive ControlPanel remount focus follows the target identity", () => {
    const inputs = ["graph:x", "graph:y"].map(() => ({
        focused: false,
        focus() {
            this.focused = true;
        },
    }));
    const controls = ["graph:x", "graph:y"].map((targetId, index) => ({
        dataset: { rixControlTarget: targetId },
        querySelector(selector) {
            return selector === "[data-rix-control-input]" ? inputs[index] : null;
        },
    }));
    const panel = {
        querySelectorAll(selector) {
            return selector === "[data-rix-control-target]" ? controls : [];
        },
    };
    const root = {
        matches() {
            return false;
        },
        querySelectorAll(selector) {
            return selector === ".rix-output-control-panel" ? [panel] : [];
        },
    };

    expect(restoreControlPanelFocus(root, {
        panelIndex: 0,
        targetId: "graph:y",
    })).toBe(true);
    expect(inputs[0].focused).toBe(false);
    expect(inputs[1].focused).toBe(true);
});

test("reactive range remount focus follows the edited endpoint", () => {
    const endpoints = ["low", "high"].map((endpoint) => ({
        dataset: { rixControlEndpoint: endpoint },
        focused: false,
        focus() { this.focused = true; },
    }));
    const control = {
        dataset: { rixControlTarget: "graph:window" },
        querySelectorAll(selector) {
            return selector === "[data-rix-control-endpoint]" ? endpoints : [];
        },
    };
    const panel = {
        querySelectorAll(selector) {
            return selector === "[data-rix-control-target]" ? [control] : [];
        },
    };
    const root = {
        matches() { return false; },
        querySelectorAll(selector) {
            return selector === ".rix-output-control-panel" ? [panel] : [];
        },
    };

    expect(restoreControlPanelFocus(root, {
        panelIndex: 0,
        targetId: "graph:window",
        endpoint: "high",
    })).toBe(true);
    expect(endpoints[0].focused).toBe(false);
    expect(endpoints[1].focused).toBe(true);
});

test("staged submit remount restores its action focus and live announcement", () => {
    const status = { textContent: "" };
    const submit = {
        focused: false,
        focus() { this.focused = true; },
    };
    const panel = {
        querySelector(selector) {
            if (selector === ".rix-output-control-status") return status;
            if (selector === "[data-rix-control-submit]") return submit;
            return null;
        },
        querySelectorAll() { return []; },
    };
    const root = {
        matches() { return false; },
        querySelectorAll(selector) {
            return selector === ".rix-output-control-panel" ? [panel] : [];
        },
    };

    expect(restoreControlPanelFocus(root, {
        panelIndex: 0,
        action: "submit",
        status: "2 staged changes applied atomically",
    })).toBe(true);
    expect(submit.focused).toBe(true);
    expect(status.textContent).toBe("2 staged changes applied atomically");
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

test("ControlPanel input uses host RiX evaluation before replacing the reactive identity", () => {
    const panelValue = parseAndEvaluate(`
        $$amount := 1/2;
        .ControlPanel([.Controls.Input($$amount, "amount")])
    `);
    const inputListeners = new Map();
    const buttonListeners = new Map();
    const input = {
        value: "7/9",
        checked: false,
        addEventListener(name, listener) { inputListeners.set(name, listener); },
        getAttribute(name) { return name === "aria-label" ? "amount" : null; },
        focus() {},
    };
    const button = { addEventListener(name, listener) { buttonListeners.set(name, listener); } };
    const displayed = { textContent: "1/2" };
    const controlValue = panelValue.controls[0];
    const control = {
        dataset: {
            rixControlKind: "input",
            rixControlId: controlValue.id,
            rixControlTarget: controlValue.targetId,
        },
        querySelector(selector) {
            if (selector === "[data-rix-control-input]") return input;
            if (selector === "[data-rix-control-commit]") return button;
            if (selector === "[data-rix-control-value]") return displayed;
            return null;
        },
        querySelectorAll() { return []; },
    };
    const status = { textContent: "" };
    const root = {
        dataset: {},
        matches(selector) { return selector === ".rix-output-control-panel"; },
        querySelector(selector) {
            if (selector === ".rix-output-control-status") return status;
            return null;
        },
        querySelectorAll(selector) {
            if (selector === "[data-rix-control-target]") return [control];
            return [];
        },
        dispatchEvent() {},
    };
    let evaluation = null;
    const dispose = mountOutputWidgets(root, panelValue, {
        format: formatValue,
        evaluateEdit(source, context) {
            evaluation = { source, context };
            return { type: "result", value: parseAndEvaluate(source) };
        },
    });

    buttonListeners.get("click")();
    expect(evaluation.source).toBe("7/9");
    expect(evaluation.context.mode).toBe("control");
    expect(formatValue(controlValue.target.get())).toBe("7/9");
    expect(displayed.textContent).toBe("7/9");
    dispose();
});

test("ControlPanel Action button reaches its reactive target through the mounted browser widget", () => {
    const panelValue = parseAndEvaluate(`
        $$frozen := [];
        .ControlPanel([.Controls.Action({=
            id="freeze",
            target=$$frozen,
            label="Freeze quadratic",
            action=versions -> versions ++ [3/2]
        })])
    `);
    const listeners = new Map();
    const button = {
        checked: false,
        addEventListener(name, listener) { listeners.set(name, listener); },
        getAttribute(name) { return name === "aria-label" ? "Freeze quadratic" : null; },
        focus() {},
    };
    const controlValue = panelValue.controls[0];
    const control = {
        dataset: {
            rixControlKind: "action",
            rixControlId: controlValue.id,
            rixControlTarget: controlValue.targetId,
        },
        querySelector(selector) {
            return selector === "[data-rix-control-input]" ? button : null;
        },
        querySelectorAll() { return []; },
    };
    const status = { textContent: "" };
    const root = {
        dataset: {},
        matches(selector) { return selector === ".rix-output-control-panel"; },
        querySelector(selector) {
            return selector === ".rix-output-control-status" ? status : null;
        },
        querySelectorAll(selector) {
            return selector === "[data-rix-control-target]" ? [control] : [];
        },
        dispatchEvent() {},
    };
    const dispose = mountOutputWidgets(root, panelValue, { format: formatValue });

    listeners.get("click")();
    expect(formatValue(controlValue.target.get())).toBe("[1..1/2]");
    expect(status.textContent).toContain("Freeze quadratic set to [1..1/2]");
    dispose();
});
