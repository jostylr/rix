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
