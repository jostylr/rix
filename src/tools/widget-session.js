/**
 * Host-owned sessions for interactive output values.
 *
 * Renderers dispatch semantic events into a session. The session validates the
 * event, updates its Binding, and publishes a newly-created portable snapshot.
 */

import { createSheet, createSheetSnapshot, isOutputValue } from "../runtime/output.js";
import { isBinding } from "../runtime/binding.js";

function sheetBinding(widget) {
    if (!isOutputValue(widget) || widget.kind !== "sheet") {
        throw new Error("WidgetSession currently requires a Sheet output value");
    }
    if (!isBinding(widget.binding)) {
        throw new Error("A Sheet WidgetSession requires .Sheet(.Bind(value))");
    }
    return widget.binding;
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
        this.binding = sheetBinding(widget);
        this.options = widget.options;
        this.widget = widget;
        this.revision = 0;
        this.onChange = typeof options.onChange === "function" ? options.onChange : null;
        this.disposed = false;
        this._unsubscribe = this.binding.subscribe((bindingEvent) => {
            if (this.disposed) return;
            this.revision += 1;
            this.widget = createSheet(this.options ? [this.binding, { type: "map", entries: this.options }] : [this.binding]);
            this.onChange?.({
                session: this,
                widget: this.widget,
                revision: this.revision,
                bindingEvent,
            });
        });
    }

    dispatch(event) {
        if (this.disposed) throw new Error("Cannot dispatch to a disposed WidgetSession");
        if (!event || event.type !== "sheet:set") {
            throw new Error(`Unsupported widget event: ${event?.type || "missing type"}`);
        }
        const index = normalizedIndex(event.index, this.widget.shape);
        this.binding.at(...index).set(event.value, {
            source: "widget",
            widgetKind: "sheet",
            index,
        });
        return this.widget;
    }

    current() {
        return this.widget;
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
