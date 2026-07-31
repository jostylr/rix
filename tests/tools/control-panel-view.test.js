import { expect, test } from "bun:test";
import { enhanceControlPanelViews } from "../../src/tools/control-panel-view.js";

test("ControlPanel range changes emit semantic control:set records", () => {
    const listeners = new Map();
    const input = {
        value: "2",
        addEventListener(name, listener) {
            listeners.set(name, listener);
        },
        getAttribute(name) {
            return name === "aria-label" ? "x" : null;
        },
    };
    const value = { textContent: "2" };
    const control = {
        dataset: { rixControlTarget: "reactive:x" },
        querySelector(selector) {
            if (selector === "[data-rix-control-input]") return input;
            if (selector === "[data-rix-control-value]") return value;
            return null;
        },
    };
    const status = { textContent: "" };
    const panel = {
        dataset: {},
        matches(selector) {
            return selector === ".rix-output-control-panel";
        },
        querySelector(selector) {
            return selector === ".rix-output-control-status" ? status : null;
        },
        querySelectorAll(selector) {
            return selector === "[data-rix-control-target]" ? [control] : [];
        },
        dispatchEvent() {},
    };
    let received = null;
    enhanceControlPanelViews(panel, {
        onSet(detail) {
            received = detail;
            return { type: "result", text: "3/2", revision: 1 };
        },
    });

    input.value = "3";
    listeners.get("input")();
    expect(status.textContent).toContain("position 3");
    listeners.get("change")();
    expect(received).toEqual({
        type: "control:set",
        targetId: "reactive:x",
        index: 3,
        source: "range",
    });
    expect(value.textContent).toBe("3/2");
    expect(status.textContent).toContain("set to 3/2");
});

test("ControlPanel expression input emits source text only when committed", () => {
    const inputListeners = new Map();
    const buttonListeners = new Map();
    const input = {
        value: "7/9",
        checked: false,
        addEventListener(name, listener) { inputListeners.set(name, listener); },
        getAttribute(name) { return name === "aria-label" ? "amount" : null; },
    };
    const button = {
        addEventListener(name, listener) { buttonListeners.set(name, listener); },
    };
    const value = { textContent: "1/2" };
    const control = {
        dataset: { rixControlTarget: "reactive:amount", rixControlKind: "input" },
        querySelector(selector) {
            if (selector === "[data-rix-control-input]") return input;
            if (selector === "[data-rix-control-commit]") return button;
            if (selector === "[data-rix-control-value]") return value;
            return null;
        },
    };
    const status = { textContent: "" };
    const panel = {
        dataset: {},
        matches: (selector) => selector === ".rix-output-control-panel",
        querySelector: (selector) => selector === ".rix-output-control-status" ? status : null,
        querySelectorAll: (selector) => selector === "[data-rix-control-target]" ? [control] : [],
        dispatchEvent() {},
    };
    let received = null;
    enhanceControlPanelViews(panel, {
        onSet(detail) {
            received = detail;
            return { type: "result", text: "7/9", revision: 2 };
        },
    });

    buttonListeners.get("click")();
    expect(received).toEqual({
        type: "control:set",
        targetId: "reactive:amount",
        sourceText: "7/9",
        source: "text",
    });
    expect(value.textContent).toBe("7/9");
    expect(status.textContent).toContain("amount set to 7/9");
});

test("ControlPanel interval range commits both exact-grid indices", () => {
    const listeners = [new Map(), new Map()];
    const inputs = ["2", "5"].map((initial, index) => ({
        value: initial,
        checked: false,
        addEventListener(name, listener) { listeners[index].set(name, listener); },
        getAttribute(name) { return name === "aria-label" ? "window" : null; },
    }));
    const control = {
        dataset: { rixControlTarget: "reactive:window", rixControlKind: "range" },
        querySelector: (selector) => selector === "[data-rix-control-value]" ? { textContent: "2:5" } : null,
        querySelectorAll: (selector) => selector === "[data-rix-control-input]" ? inputs : [],
    };
    const status = { textContent: "" };
    const panel = {
        dataset: {},
        matches: (selector) => selector === ".rix-output-control-panel",
        querySelector: (selector) => selector === ".rix-output-control-status" ? status : null,
        querySelectorAll: (selector) => selector === "[data-rix-control-target]" ? [control] : [],
        dispatchEvent() {},
    };
    let received = null;
    enhanceControlPanelViews(panel, {
        onSet(detail) {
            received = detail;
            return { type: "result", text: "3:6", revision: 1 };
        },
    });
    inputs[0].value = "3";
    inputs[1].value = "6";
    listeners[1].get("change")();
    expect(received).toEqual({
        type: "control:set",
        targetId: "reactive:window",
        indices: [3, 6],
        source: "range",
    });
});
