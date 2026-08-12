import { expect, test } from "bun:test";
import { enhanceControlPanelViews, enhanceControlShortcuts } from "../../src/tools/control-panel-view.js";

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
        source: "expression",
    });
    expect(value.textContent).toBe("7/9");
    expect(status.textContent).toContain("amount set to 7/9");
});

test("ControlPanel Action button emits a semantic control:action record", () => {
    const listeners = new Map();
    const button = {
        checked: false,
        addEventListener(name, listener) { listeners.set(name, listener); },
        getAttribute(name) { return name === "aria-label" ? "Freeze quadratic" : null; },
    };
    const control = {
        dataset: {
            rixControlTarget: "reactive:frozen",
            rixControlKind: "action",
            rixControlId: "freeze",
        },
        querySelector(selector) {
            return selector === "[data-rix-control-input]" ? button : null;
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
            return { type: "result", text: "1 frozen curve", revision: 3 };
        },
    });

    listeners.get("click")();
    expect(received).toEqual({
        type: "control:action",
        controlId: "freeze",
        targetId: "reactive:frozen",
        source: "action",
    });
    expect(status.textContent).toContain("Freeze quadratic set to 1 frozen curve");
});

test("ControlPanel Hold buttons emit pressed and released indices", () => {
    const pressListeners = new Map();
    const releaseListeners = new Map();
    const press = {
        value: "",
        checked: false,
        addEventListener(name, listener) { pressListeners.set(name, listener); },
        getAttribute(name) { return name === "aria-label" ? "Decimal preview" : null; },
    };
    const release = {
        addEventListener(name, listener) { releaseListeners.set(name, listener); },
    };
    const control = {
        dataset: {
            rixControlTarget: "reactive:preview",
            rixControlKind: "hold",
            rixControlId: "decimal-preview",
        },
        querySelector(selector) {
            if (selector === "[data-rix-control-input]") return press;
            if (selector === "[data-rix-control-hold-release]") return release;
            return null;
        },
    };
    const panel = {
        dataset: {},
        matches: (selector) => selector === ".rix-output-control-panel",
        querySelector: () => null,
        querySelectorAll: (selector) => selector === "[data-rix-control-target]" ? [control] : [],
        dispatchEvent() {},
    };
    const received = [];
    enhanceControlPanelViews(panel, {
        onSet(detail) {
            received.push(detail);
            return { type: "result", text: detail.index === 1 ? "1" : "_", revision: received.length };
        },
    });

    pressListeners.get("click")();
    releaseListeners.get("click")();
    expect(received).toEqual([
        {
            type: "control:set",
            controlId: "decimal-preview",
            targetId: "reactive:preview",
            index: 1,
            source: "hold-keydown",
        },
        {
            type: "control:set",
            controlId: "decimal-preview",
            targetId: "reactive:preview",
            index: 0,
            source: "hold-keyup",
        },
    ]);
});

test("declarative holds commit once on keydown and release after rerender", () => {
    const listeners = new Map();
    let presses = 0;
    let releases = 0;
    const makeControl = () => ({
        dataset: {
            rixControlHold: "ArrowDown",
            rixControlDisabled: "false",
            rixControlReadOnly: "false",
            rixControlId: "decimal-preview",
            rixControlTarget: "reactive:preview",
        },
        closest() { return null; },
        querySelector(selector) {
            if (selector === "[data-rix-control-hold-press]") {
                return { disabled: false, click() { presses += 1; } };
            }
            if (selector === "[data-rix-control-hold-release]") {
                return { disabled: false, click() { releases += 1; } };
            }
            return null;
        },
    });
    let currentControl = makeControl();
    const document = {
        activeElement: null,
        addEventListener(name, listener) { listeners.set(name, listener); },
        removeEventListener(name) { listeners.delete(name); },
    };
    const root = {
        ownerDocument: document,
        querySelectorAll(selector) {
            return selector === "[data-rix-control-hold]" ? [currentControl] : [];
        },
    };
    const dispose = enhanceControlShortcuts(root);
    const event = {
        key: "ArrowDown",
        target: { tagName: "BODY" },
        preventDefault() {},
    };

    listeners.get("keydown")(event);
    listeners.get("keydown")({ ...event, repeat: true });
    expect(presses).toBe(1);
    currentControl = makeControl();
    listeners.get("keyup")(event);
    expect(releases).toBe(1);

    listeners.get("keydown")({ ...event, target: { tagName: "INPUT" } });
    expect(presses).toBe(1);
    dispose();
    expect(listeners.has("keyup")).toBe(false);
});

test("declarative shortcuts click matching actions but leave editable fields alone", () => {
    const listeners = new Map();
    let clicks = 0;
    const button = { disabled: false, click() { clicks += 1; } };
    const control = {
        dataset: {
            rixControlShortcut: "ArrowLeft",
            rixControlDisabled: "false",
            rixControlReadOnly: "false",
        },
        closest() { return null; },
        querySelector(selector) { return selector === "[data-rix-control-input]" ? button : null; },
    };
    const document = {
        activeElement: null,
        addEventListener(name, listener) { listeners.set(name, listener); },
        removeEventListener(name) { listeners.delete(name); },
    };
    const root = {
        ownerDocument: document,
        querySelectorAll(selector) { return selector === "[data-rix-control-shortcut]" ? [control] : []; },
    };
    const dispose = enhanceControlShortcuts(root);
    let prevented = false;
    listeners.get("keydown")({
        key: "ArrowLeft",
        target: { tagName: "BODY" },
        preventDefault() { prevented = true; },
    });
    expect(clicks).toBe(1);
    expect(prevented).toBe(true);

    listeners.get("keydown")({ key: "ArrowLeft", target: { tagName: "INPUT" } });
    listeners.get("keydown")({ key: "ArrowDown", target: { tagName: "BODY" } });
    expect(clicks).toBe(1);

    const secondControl = {
        ...control,
        querySelector() { return { disabled: false, click() { clicks += 10; } }; },
    };
    const secondRoot = {
        ownerDocument: document,
        querySelectorAll() { return [secondControl]; },
    };
    const disposeSecond = enhanceControlShortcuts(secondRoot);
    listeners.get("keydown")({ key: "ArrowLeft", target: { tagName: "BODY" } });
    expect(clicks).toBe(1);
    disposeSecond();
    dispose();
    expect(listeners.has("keydown")).toBe(false);
});

test("ControlPanel interval range commits both exact-grid indices", () => {
    const listeners = [new Map(), new Map()];
    const inputs = ["2", "5"].map((initial, index) => ({
        value: initial,
        checked: false,
        dataset: { rixControlEndpoint: index === 0 ? "low" : "high" },
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
        endpoint: "high",
        source: "range",
    });
});

test("read-only controls block local interaction before semantic dispatch", () => {
    const listeners = new Map();
    const input = {
        value: "2",
        addEventListener(name, listener) { listeners.set(name, listener); },
        getAttribute() { return "locked"; },
    };
    const control = {
        dataset: {
            rixControlTarget: "reactive:locked",
            rixControlKind: "slider",
            rixControlReadOnly: "true",
        },
        querySelector: (selector) => selector === "[data-rix-control-input]" ? input : null,
    };
    const panel = {
        dataset: {},
        matches: (selector) => selector === ".rix-output-control-panel",
        querySelector: () => null,
        querySelectorAll: (selector) => selector === "[data-rix-control-target]" ? [control] : [],
        dispatchEvent() {},
    };
    let calls = 0;
    enhanceControlPanelViews(panel, { onSet: () => { calls += 1; } });
    let prevented = false;
    listeners.get("click")({ preventDefault: () => { prevented = true; } });
    expect(prevented).toBe(true);
    expect(listeners.has("change")).toBe(false);
    expect(calls).toBe(0);
});

test("staged panels restore discarded values and submit staged edits together", () => {
    const inputListeners = new Map();
    const submitListeners = new Map();
    const discardListeners = new Map();
    const input = {
        value: "2",
        checked: false,
        addEventListener(name, listener) { inputListeners.set(name, listener); },
        getAttribute(name) { return name === "aria-label" ? "x" : null; },
    };
    const value = { textContent: "2" };
    const control = {
        dataset: { rixControlTarget: "reactive:x", rixControlKind: "slider" },
        querySelector(selector) {
            if (selector === "[data-rix-control-input]") return input;
            if (selector === "[data-rix-control-value]") return value;
            return null;
        },
    };
    const submit = {
        disabled: true,
        addEventListener(name, listener) { submitListeners.set(name, listener); },
    };
    const discard = {
        disabled: true,
        addEventListener(name, listener) { discardListeners.set(name, listener); },
    };
    const status = { textContent: "" };
    const panel = {
        dataset: { rixControlMode: "staged" },
        matches: (selector) => selector === ".rix-output-control-panel",
        querySelector(selector) {
            if (selector === ".rix-output-control-status") return status;
            if (selector === "[data-rix-control-submit]") return submit;
            if (selector === "[data-rix-control-discard]") return discard;
            return null;
        },
        querySelectorAll: (selector) => selector === "[data-rix-control-target]" ? [control] : [],
        dispatchEvent() {},
    };
    const stages = [];
    let submitted = 0;
    let discarded = 0;
    enhanceControlPanelViews(panel, {
        onSet(detail) {
            stages.push(detail);
            return { type: "result", text: "5", staged: true, revision: 0 };
        },
        onSubmit() {
            submitted += 1;
            return { type: "result", revision: 1 };
        },
        onDiscard() {
            discarded += 1;
            return { type: "result", count: 1, revision: 0 };
        },
    });

    input.value = "5";
    inputListeners.get("change")();
    expect(stages).toHaveLength(1);
    expect(value.textContent).toBe("5");
    expect(submit.disabled).toBe(false);
    expect(discard.disabled).toBe(false);
    discardListeners.get("click")();
    expect(discarded).toBe(1);
    expect(input.value).toBe("2");
    expect(value.textContent).toBe("2");
    expect(submit.disabled).toBe(true);

    input.value = "5";
    inputListeners.get("change")();
    submitListeners.get("click")();
    expect(submitted).toBe(1);
    expect(submit.disabled).toBe(true);
    expect(status.textContent).toContain("applied atomically");

    input.value = "4";
    inputListeners.get("change")();
    discardListeners.get("click")();
    expect(input.value).toBe("5");
    expect(value.textContent).toBe("5");
});
