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

export function restoreSheetFocus(root, request) {
    if (!request) return false;
    const sheetRoot = renderedSheetRoots(root)[request.sheetIndex];
    if (!sheetRoot) return false;
    const cell = [...sheetRoot.querySelectorAll("td[data-rix-address]")]
        .find((candidate) => candidate.dataset.rixAddress === request.address);
    if (!cell) return false;
    cell.focus();
    return true;
}

export function mountOutputWidgets(root, value, options = {}) {
    const format = options.format || ((item) => String(item ?? ""));
    const render = options.render || ((item) => renderOutputHtml(item, format));
    const disposers = [];
    let sheetDisposers = [];
    let pendingFocusRequest = null;
    let disposed = false;
    let currentValue = value;

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
                onHeaderEdit: widgetSession?.editMode === "formula"
                    ? (detail) => {
                        try {
                            widgetSession.dispatch({ type: "sheet:header", ...detail });
                            return { type: "result", revision: widgetSession.revision };
                        } catch (error) {
                            return {
                                type: "error",
                                text: error instanceof Error ? error.message : String(error),
                            };
                        }
                    }
                    : null,
                onEdit: widgetSession && (
                    widgetSession.editMode === "formula"
                    || typeof options.evaluateEdit === "function"
                )
                    ? (detail) => {
                        try {
                            let valueResult = null;
                            if (widgetSession.editMode !== "formula") {
                                const evaluated = options.evaluateEdit(detail.source, {
                                    mode: widgetSession.editMode,
                                    index: detail.index,
                                    sheet: widgetSession.current(),
                                });
                                if (evaluated?.type === "error") return evaluated;
                                valueResult = evaluated?.type === "result" ? evaluated.value : evaluated;
                            }
                            const focusRequest = {
                                sheetIndex: index,
                                address: editedAddress(widgetSession.current(), detail.index),
                            };
                            pendingFocusRequest = focusRequest;
                            try {
                                if (widgetSession.editMode === "formula") {
                                    widgetSession.dispatch({
                                        type: "sheet:formula",
                                        index: detail.index,
                                        source: detail.source,
                                        assignmentMode: detail.assignmentMode,
                                    });
                                    valueResult = widgetSession.formulaSheet.getFormula(detail.index);
                                } else {
                                    widgetSession.dispatch({
                                        type: "sheet:set",
                                        index: detail.index,
                                        value: valueResult,
                                    });
                                }
                            } finally {
                                if (pendingFocusRequest === focusRequest) pendingFocusRequest = null;
                            }
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
                            return {
                                type: "error",
                                text: error instanceof Error ? error.message : String(error),
                                updates: widgetSession.editMode === "formula"
                                    ? widgetSession.cellUpdates(format)
                                    : undefined,
                                revision: widgetSession.revision,
                            };
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
                const focusRequest = pendingFocusRequest;
                pendingFocusRequest = null;
                liveRoot.innerHTML = render(value.current);
                liveRoot.dataset.rixLiveRevision = String(value.revision);
                mountSheets(liveRoot, value.current);
                restoreSheetFocus(liveRoot, focusRequest);
                options.onLiveChange?.(event, liveRoot);
            });
            disposers.push(unsubscribe);
        }
    } else {
        mountSheets(root, value);
    }

    if (typeof options.observe === "function") {
        const unsubscribe = options.observe((nextValue, event = null) => {
            if (disposed) return;
            const focusRequest = pendingFocusRequest;
            pendingFocusRequest = null;
            currentValue = nextValue;
            root.innerHTML = render(currentValue);
            mountSheets(root, currentValue);
            restoreSheetFocus(root, focusRequest);
            options.onLiveChange?.(event, root);
        });
        disposers.push(unsubscribe);
    }

    return () => {
        if (disposed) return;
        disposed = true;
        disposeSheets();
        for (const dispose of disposers.splice(0)) dispose?.();
    };
}
