/**
 * Mount runtime-backed interactions for rendered output trees.
 *
 * This keeps host-specific source evaluation in a callback while sharing the
 * observable/widget mechanics between RiX Web and the notebook.
 */

import { isOutputValue, renderOutputHtml } from "../runtime/output.js";
import { enhanceSheetViews } from "./sheet-view.js";
import { createWidgetSession } from "./widget-session.js";

function childOutputs(value) {
    if (!isOutputValue(value)) return [];
    if (value.kind === "fragment") return value.children;
    if (value.kind === "figure" || value.kind === "slide") return [value.content];
    if (value.kind === "slides") return value.slides;
    return [];
}

function collectSheets(value, sheets = []) {
    if (!isOutputValue(value)) return sheets;
    if (value.kind === "sheet") sheets.push(value);
    else for (const child of childOutputs(value)) collectSheets(child, sheets);
    return sheets;
}

function renderedSheetRoots(root) {
    const roots = [];
    if (root?.matches?.(".rix-output-sheet")) roots.push(root);
    if (root?.querySelectorAll) roots.push(...root.querySelectorAll(".rix-output-sheet"));
    return roots;
}

function editedAddress(widget, index) {
    return `${widget.addressBase}[${index.join(",")}]`;
}

export function mountOutputWidgets(root, value, options = {}) {
    const format = options.format || ((item) => String(item ?? ""));
    const render = options.render || ((item) => renderOutputHtml(item, format));
    const disposers = [];
    let sheetDisposers = [];
    let disposed = false;

    function disposeSheets() {
        for (const dispose of sheetDisposers.splice(0)) dispose();
    }

    function mountSheets(container, outputValue) {
        disposeSheets();
        const sheetValues = collectSheets(outputValue);
        const roots = renderedSheetRoots(container);
        for (const [index, sheet] of sheetValues.entries()) {
            const sheetRoot = roots[index];
            if (!sheetRoot) continue;
            const widgetSession = sheet.editable ? createWidgetSession(sheet) : null;
            if (widgetSession) sheetDisposers.push(() => widgetSession.dispose());
            enhanceSheetViews(sheetRoot, {
                onActivate: options.onActivate,
                onSelection: options.onSelection,
                onPlaneChange: options.onPlaneChange,
                onEdit: widgetSession && typeof options.evaluateEdit === "function"
                    ? (detail) => {
                        try {
                            const evaluated = options.evaluateEdit(detail.source, {
                                mode: widgetSession.editMode,
                                index: detail.index,
                                sheet: widgetSession.current(),
                            });
                            if (evaluated?.type === "error") return evaluated;
                            const valueResult = evaluated?.type === "result" ? evaluated.value : evaluated;
                            widgetSession.dispatch(widgetSession.editMode === "formula"
                                ? {
                                    type: "sheet:formula",
                                    index: detail.index,
                                    formula: valueResult,
                                    source: detail.source,
                                }
                                : {
                                    type: "sheet:set",
                                    index: detail.index,
                                    value: valueResult,
                                });
                            const updates = widgetSession.cellUpdates(format);
                            const edited = updates.find((update) =>
                                update.address === editedAddress(widgetSession.current(), detail.index));
                            return {
                                type: "result",
                                value: valueResult,
                                text: edited?.text ?? format(valueResult),
                                updates,
                                revision: widgetSession.revision,
                            };
                        } catch (error) {
                            return { type: "error", text: error instanceof Error ? error.message : String(error) };
                        }
                    }
                    : null,
            });
        }
    }

    if (value?.kind === "live_view") {
        const selector = `[data-rix-live-view="${String(value.id).replaceAll('"', '\\"')}"]`;
        const liveRoot = root?.matches?.(".rix-output-live-view") ? root : root?.querySelector?.(selector);
        if (liveRoot) {
            mountSheets(liveRoot, value.current);
            const unsubscribe = value.subscribe((event) => {
                if (disposed || event.type !== "live:commit") return;
                liveRoot.innerHTML = render(value.current);
                liveRoot.dataset.rixLiveRevision = String(value.revision);
                mountSheets(liveRoot, value.current);
                options.onLiveChange?.(event, liveRoot);
            });
            disposers.push(unsubscribe);
        }
    } else {
        mountSheets(root, value);
    }

    return () => {
        if (disposed) return;
        disposed = true;
        disposeSheets();
        for (const dispose of disposers.splice(0)) dispose?.();
    };
}
