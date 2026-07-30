/**
 * Host-owned sessions for interactive output values.
 *
 * Renderers dispatch semantic events into a session. The session validates the
 * event, updates its Binding, and publishes a newly-created portable snapshot.
 */

import { createSheet, createSheetSnapshot, isOutputValue } from "../runtime/output.js";
import { isBinding } from "../runtime/binding.js";
import { isFormulaSheet } from "../runtime/formula-sheet.js";

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
            if (sourceEvent?.type === "formula:error") {
                this.onChange?.({
                    session: this,
                    widget: this.widget,
                    revision: this.revision,
                    sourceEvent,
                    bindingEvent: null,
                    formulaEvent: sourceEvent,
                });
                return;
            }
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
        const index = normalizedIndex(event.index, this.widget.shape);
        if (this.editMode === "value" && event.type === "sheet:set") {
            this.binding.at(...index).set(event.value, {
                source: "widget",
                widgetKind: "sheet",
                index,
            });
        } else if (this.editMode === "formula" && event.type === "sheet:formula") {
            this.formulaSheet.setFormula(index, event.formula, {
                source: event.source ?? null,
                sourceKind: "widget",
                widgetKind: "sheet",
                index,
            });
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
                text: format(cell.value),
                formulaSource: cell.formulaSource,
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

export function createWidgetSession(widget, options = {}) {
    return new WidgetSession(widget, options);
}
