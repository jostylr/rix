/**
 * Host-owned sessions for interactive output values.
 *
 * Renderers dispatch semantic events into a session. The session validates the
 * event, updates its Binding, and publishes a newly-created portable snapshot.
 */

import { createSheet, createSheetSnapshot, isOutputValue } from "../runtime/output.js";
import { isBinding } from "../runtime/binding.js";
import { isFormulaSheet } from "../runtime/formula-sheet.js";
import { isReactiveNode } from "../runtime/reactive-graph.js";
import { Integer, Rational, RationalInterval } from "@ratmath/core";

function sheetSource(widget) {
    if (!isOutputValue(widget) || widget.kind !== "sheet") {
        throw new Error("WidgetSession currently requires a Sheet output value");
    }
    if (isBinding(widget.binding)) return { source: widget.binding, mode: "value" };
    if (isFormulaSheet(widget.formulaSheet)) return { source: widget.formulaSheet, mode: "formula" };
    throw new Error("A Sheet WidgetSession requires a Binding or FormulaSheet");
}

function normalizedIndex(index, shape) {
    if (!Array.isArray(index) || index.length !== shape.length) {
        throw new Error(`Sheet edit index must contain ${shape.length} entries`);
    }
    return index.map((value, axis) => {
        const integer = Number(value);
        if (!Number.isInteger(integer) || integer < 1 || integer > shape[axis]) {
            throw new Error(`Sheet edit index ${value} is out of range on axis ${axis + 1}`);
        }
        return integer;
    });
}

export class WidgetSession {
    constructor(widget, options = {}) {
        const resolved = sheetSource(widget);
        this.source = resolved.source;
        this.editMode = resolved.mode;
        this.binding = this.editMode === "value" ? this.source : null;
        this.formulaSheet = this.editMode === "formula" ? this.source : null;
        this.options = widget.options;
        this.widget = widget;
        this.revision = 0;
        this.onChange = typeof options.onChange === "function" ? options.onChange : null;
        this.disposed = false;
        this._unsubscribe = this.source.subscribe((sourceEvent) => {
            if (this.disposed) return;
            this.revision += 1;
            this.widget = createSheet(this.options
                ? [this.source, { type: "map", entries: this.options }]
                : [this.source]);
            this.onChange?.({
                session: this,
                widget: this.widget,
                revision: this.revision,
                sourceEvent,
                bindingEvent: this.editMode === "value" ? sourceEvent : null,
                formulaEvent: this.editMode === "formula" ? sourceEvent : null,
            });
        });
    }

    dispatch(event) {
        if (this.disposed) throw new Error("Cannot dispatch to a disposed WidgetSession");
        if (!event) throw new Error("Unsupported widget event: missing type");
        if (this.editMode === "formula" && event.type === "sheet:header") {
            this.formulaSheet.setAxisLabel(event.axis, event.coordinate, event.label ?? null);
            return this.widget;
        }
        const index = normalizedIndex(event.index, this.widget.shape);
        if (this.editMode === "value" && event.type === "sheet:set") {
            this.binding.at(...index).set(event.value, {
                source: "widget",
                widgetKind: "sheet",
                index,
            });
        } else if (this.editMode === "formula" && event.type === "sheet:formula") {
            if (typeof event.source === "string") {
                this.formulaSheet.setFormulaSource(
                    index,
                    event.source,
                    event.assignmentMode ?? null,
                );
            } else {
                this.formulaSheet.setFormula(index, event.formula, {
                    source: null,
                    assignmentMode: event.assignmentMode,
                    sourceKind: "widget",
                    widgetKind: "sheet",
                    index,
                });
            }
        } else {
            throw new Error(`Unsupported widget event for ${this.editMode} editor: ${event.type || "missing type"}`);
        }
        return this.widget;
    }

    current() {
        return this.widget;
    }

    cellUpdates(format = (value) => String(value ?? "")) {
        return this.widget.planes.flatMap((plane) => plane.cells.flatMap((row) =>
            row.map((cell) => ({
                address: cell.address,
                text: cell.blank === true ? "" : format(cell.value),
                blank: cell.blank === true,
                formulaSource: cell.formulaSource,
                slotId: cell.slotId,
                assignmentMode: cell.assignmentMode,
                state: cell.state,
                dependencies: cell.dependencies,
                diagnostics: cell.diagnostics,
                diagnosticKind: cell.diagnosticKind,
                diagnosticSource: cell.diagnosticSource,
            }))));
    }

    snapshot() {
        return createSheetSnapshot(this.widget);
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this._unsubscribe?.();
    }
}

function graphicTargets(node, targets = new Map()) {
    if (!isOutputValue(node)) return targets;
    if (node.kind === "drag_point" && isReactiveNode(node.target)) {
        targets.set(node.targetId, node.target);
    }
    for (const child of node.children || []) graphicTargets(child, targets);
    return targets;
}

function exactGraphicCoordinate(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error("Graphic position coordinates must be finite numbers");
    const scale = 1000n;
    const numerator = BigInt(Math.round(number * Number(scale)));
    return numerator % scale === 0n
        ? new Integer(numerator / scale)
        : new Rational(numerator, scale);
}

function graphicPoint(position) {
    if (!Array.isArray(position) || position.length !== 2) {
        throw new Error("Graphic position must contain x and y coordinates");
    }
    return Object.freeze({
        type: "tuple",
        values: Object.freeze(position.map(exactGraphicCoordinate)),
    });
}

export class GraphicWidgetSession {
    constructor(widget, options = {}) {
        if (!isOutputValue(widget) || widget.kind !== "graphic") {
            throw new Error("GraphicWidgetSession requires a Graphic output value");
        }
        this.widget = widget;
        this.editMode = "position";
        this.targets = graphicTargets(widget);
        if (this.targets.size === 0) {
            throw new Error("A Graphic WidgetSession requires at least one DragPoint");
        }
        this.revision = 0;
        this.onChange = typeof options.onChange === "function" ? options.onChange : null;
        this.disposed = false;
        this._unsubscribes = [...new Set(this.targets.values())].map((target) =>
            target.subscribe((sourceEvent) => {
                if (this.disposed) return;
                this.revision += 1;
                this.onChange?.({
                    session: this,
                    widget: this.widget,
                    revision: this.revision,
                    sourceEvent,
                    graphicEvent: sourceEvent,
                });
            }));
    }

    dispatch(event) {
        if (this.disposed) throw new Error("Cannot dispatch to a disposed GraphicWidgetSession");
        if (event?.type !== "graphic:position") {
            throw new Error(`Unsupported Graphic widget event: ${event?.type || "missing type"}`);
        }
        const target = this.targets.get(String(event.targetId || ""));
        if (!target) throw new Error(`Unknown Graphic drag target: ${event.targetId || "missing target"}`);
        const value = graphicPoint(event.position);
        const replacedDependencies = Object.freeze([...target.dependencies]);
        target.replaceValue(value, {
            source: "widget",
            widgetKind: "graphic",
            eventType: "graphic:position",
            targetId: event.targetId,
            inputSource: event.source ?? null,
            replacedDependencies,
        });
        return value;
    }

    current() {
        return this.widget;
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        for (const unsubscribe of this._unsubscribes.splice(0)) unsubscribe?.();
    }
}

function panelControls(panel) {
    if (!isOutputValue(panel) || panel.kind !== "control_panel") {
        throw new Error("ControlPanelWidgetSession requires a ControlPanel output value");
    }
    const controls = new Map();
    for (const control of panel.controls) {
        if (control.kind.startsWith("control_") && isReactiveNode(control.target)) {
            controls.set(control.id, control);
            if (!controls.has(control.targetId)) controls.set(control.targetId, control);
        }
    }
    if (controls.size === 0) {
        throw new Error("A ControlPanel WidgetSession requires at least one reactive control");
    }
    return controls;
}

function sliderValue(control, index) {
    const normalized = Number(index);
    if (!Number.isInteger(normalized) || normalized < 0 || normalized > control.steps) {
        throw new Error(`Control slider index must be between 0 and ${control.steps}`);
    }
    return control.low.add(control.step.multiply(new Integer(BigInt(normalized))));
}

function indexedValue(control, index, values, label) {
    const normalized = Number(index);
    if (!Number.isInteger(normalized) || normalized < 0 || normalized >= values.length) {
        throw new Error(`${label} index must be between 0 and ${values.length - 1}`);
    }
    return values[normalized];
}

function rangeValue(control, indices) {
    if (!Array.isArray(indices) || indices.length !== 2) {
        throw new Error("Control range requires lower and upper indices");
    }
    const low = sliderValue(control, indices[0]);
    const high = sliderValue(control, indices[1]);
    if (low.greaterThan(high)) throw new Error("Control range lower endpoint must not exceed its upper endpoint");
    return new RationalInterval(low, high);
}

function controlValue(control, event) {
    if (control.kind === "control_slider") return sliderValue(control, event.index);
    if (control.kind === "control_choice") {
        return indexedValue(control, event.index, control.options.map((option) => option.value), "Control choice");
    }
    if (control.kind === "control_toggle") {
        return indexedValue(control, event.index, control.values, "Control toggle");
    }
    if (control.kind === "control_range") return rangeValue(control, event.indices);
    if (control.kind === "control_reset") return control.initial;
    if (control.kind === "control_input") {
        if (!("value" in event)) throw new Error("Control input requires an evaluated RiX value");
        return event.value;
    }
    throw new Error(`Unsupported ControlPanel control: ${control.kind}`);
}

export class ControlPanelWidgetSession {
    constructor(widget, options = {}) {
        this.widget = widget;
        this.editMode = "control";
        this.controls = panelControls(widget);
        this.revision = 0;
        this.onChange = typeof options.onChange === "function" ? options.onChange : null;
        this.disposed = false;
        this._unsubscribes = [...new Set([...this.controls.values()].map(({ target }) => target))]
            .map((target) => target.subscribe((sourceEvent) => {
                if (this.disposed) return;
                this.revision += 1;
                this.onChange?.({
                    session: this,
                    widget: this.widget,
                    revision: this.revision,
                    sourceEvent,
                    controlEvent: sourceEvent,
                });
            }));
    }

    dispatch(event) {
        if (this.disposed) throw new Error("Cannot dispatch to a disposed ControlPanelWidgetSession");
        if (event?.type !== "control:set") {
            throw new Error(`Unsupported ControlPanel widget event: ${event?.type || "missing type"}`);
        }
        const control = this.controls.get(String(event.controlId || event.targetId || ""));
        if (!control) throw new Error(`Unknown ControlPanel target: ${event.targetId || "missing target"}`);
        if (event.controlId && event.targetId && String(event.targetId) !== control.targetId) {
            throw new Error("ControlPanel control and target IDs do not match");
        }
        const value = controlValue(control, event);
        const replacedDependencies = Object.freeze([...control.target.dependencies]);
        control.target.replaceValue(value, {
            source: "widget",
            widgetKind: "control_panel",
            controlKind: control.kind,
            eventType: "control:set",
            targetId: control.targetId,
            inputSource: event.source ?? null,
            replacedDependencies,
        });
        return value;
    }

    current() {
        return this.widget;
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        for (const unsubscribe of this._unsubscribes.splice(0)) unsubscribe?.();
    }
}

export function createWidgetSession(widget, options = {}) {
    if (isOutputValue(widget) && widget.kind === "graphic") {
        return new GraphicWidgetSession(widget, options);
    }
    if (isOutputValue(widget) && widget.kind === "control_panel") {
        return new ControlPanelWidgetSession(widget, options);
    }
    return new WidgetSession(widget, options);
}
