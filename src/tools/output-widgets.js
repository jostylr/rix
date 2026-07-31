/**
 * Mount runtime-backed interactions for rendered output trees.
 *
 * This keeps host-specific source evaluation in a callback while sharing the
 * observable/widget mechanics between RiX Web and the notebook.
 */

import { isOutputValue, renderOutputHtml } from "../runtime/output.js";
import { enhanceSheetViews } from "./sheet-view.js";
import { enhanceGraphicViews } from "./graphic-view.js";
import { enhanceControlPanelViews } from "./control-panel-view.js";
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

function collectGraphics(value, graphics = []) {
    if (!isOutputValue(value)) return graphics;
    if (value.kind === "graphic") graphics.push(value);
    else for (const child of childOutputs(value)) collectGraphics(child, graphics);
    return graphics;
}

function collectControlPanels(value, panels = []) {
    if (!isOutputValue(value)) return panels;
    if (value.kind === "control_panel") panels.push(value);
    else for (const child of childOutputs(value)) collectControlPanels(child, panels);
    return panels;
}

function renderedSheetRoots(root) {
    const roots = [];
    if (root?.matches?.(".rix-output-sheet")) roots.push(root);
    if (root?.querySelectorAll) roots.push(...root.querySelectorAll(".rix-output-sheet"));
    return roots;
}

function renderedGraphicRoots(root) {
    const roots = [];
    if (root?.matches?.(".rix-output-graphic")) roots.push(root);
    if (root?.querySelectorAll) roots.push(...root.querySelectorAll(".rix-output-graphic"));
    return roots;
}

function renderedControlPanelRoots(root) {
    const roots = [];
    if (root?.matches?.(".rix-output-control-panel")) roots.push(root);
    if (root?.querySelectorAll) roots.push(...root.querySelectorAll(".rix-output-control-panel"));
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

export function restoreGraphicFocus(root, request) {
    if (!request) return false;
    const graphicRoot = renderedGraphicRoots(root)[request.graphicIndex];
    if (!graphicRoot) return false;
    const handle = [...graphicRoot.querySelectorAll("[data-rix-drag-target]")]
        .find((candidate) => candidate.dataset.rixDragTarget === request.targetId);
    if (!handle) return false;
    handle.focus();
    return true;
}

export function restoreControlPanelFocus(root, request) {
    if (!request) return false;
    const panelRoot = renderedControlPanelRoots(root)[request.panelIndex];
    if (!panelRoot) return false;
    if (request.status) {
        const status = panelRoot.querySelector?.(".rix-output-control-status");
        if (status) status.textContent = request.status;
    }
    if (request.action) {
        const action = panelRoot.querySelector?.(`[data-rix-control-${request.action}]`);
        if (!action) return false;
        action.focus();
        return true;
    }
    const control = [...panelRoot.querySelectorAll("[data-rix-control-target]")]
        .find((candidate) => candidate.dataset.rixControlTarget === request.targetId);
    const input = request.endpoint
        ? [...(control?.querySelectorAll?.("[data-rix-control-endpoint]") || [])]
            .find((candidate) => candidate.dataset.rixControlEndpoint === request.endpoint)
        : control?.querySelector?.("[data-rix-control-input]");
    if (!input) return false;
    input.focus();
    return true;
}

function restoreOutputFocus(root, request) {
    if (request?.kind === "graphic") return restoreGraphicFocus(root, request);
    if (request?.kind === "control_panel") return restoreControlPanelFocus(root, request);
    return restoreSheetFocus(root, request);
}

export function mountOutputWidgets(root, value, options = {}) {
    const format = options.format || ((item) => String(item ?? ""));
    const render = options.render || ((item) => renderOutputHtml(item, format));
    const disposers = [];
    let widgetDisposers = [];
    let pendingFocusRequest = null;
    let disposed = false;
    let currentValue = value;

    function disposeWidgets() {
        for (const dispose of widgetDisposers.splice(0)) dispose();
    }

    function mountWidgets(container, outputValue) {
        disposeWidgets();
        const sheetValues = collectSheets(outputValue);
        const roots = renderedSheetRoots(container);
        for (const [index, sheet] of sheetValues.entries()) {
            const sheetRoot = roots[index];
            if (!sheetRoot) continue;
            const widgetSession = sheet.editable ? createWidgetSession(sheet) : null;
            if (widgetSession) widgetDisposers.push(() => widgetSession.dispose());
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
                                kind: "sheet",
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
        const graphicValues = collectGraphics(outputValue);
        const graphicRoots = renderedGraphicRoots(container);
        for (const [index, graphic] of graphicValues.entries()) {
            const graphicRoot = graphicRoots[index];
            if (!graphicRoot || graphicRoot.dataset.rixInteractive !== "true") continue;
            let widgetSession;
            try {
                widgetSession = createWidgetSession(graphic);
            } catch {
                continue;
            }
            widgetDisposers.push(() => widgetSession.dispose());
            enhanceGraphicViews(graphicRoot, {
                onPosition(detail) {
                    const focusRequest = {
                        kind: "graphic",
                        graphicIndex: index,
                        targetId: detail.targetId,
                    };
                    pendingFocusRequest = focusRequest;
                    try {
                        const valueResult = widgetSession.dispatch(detail);
                        return {
                            type: "result",
                            value: valueResult,
                            revision: widgetSession.revision,
                        };
                    } catch (error) {
                        return {
                            type: "error",
                            text: error instanceof Error ? error.message : String(error),
                            revision: widgetSession.revision,
                        };
                    } finally {
                        if (pendingFocusRequest === focusRequest) pendingFocusRequest = null;
                    }
                },
                onPositionCommitted: options.onGraphicPosition,
            });
        }
        const panelValues = collectControlPanels(outputValue);
        const panelRoots = renderedControlPanelRoots(container);
        for (const [index, panel] of panelValues.entries()) {
            const panelRoot = panelRoots[index];
            if (!panelRoot) continue;
            let widgetSession;
            try {
                widgetSession = createWidgetSession(panel);
            } catch {
                continue;
            }
            widgetDisposers.push(() => widgetSession.dispose());
            enhanceControlPanelViews(panelRoot, {
                onSet(detail) {
                    const focusRequest = {
                        kind: "control_panel",
                        panelIndex: index,
                        targetId: detail.targetId,
                        endpoint: detail.endpoint ?? null,
                    };
                    pendingFocusRequest = focusRequest;
                    try {
                        let event = detail;
                        if (typeof detail.sourceText === "string") {
                            const evaluate = options.evaluateControl || options.evaluateEdit;
                            if (typeof evaluate !== "function") {
                                throw new Error("This host cannot evaluate RiX control input");
                            }
                            const evaluated = evaluate(detail.sourceText, {
                                mode: "control",
                                panel: widgetSession.current(),
                                targetId: detail.targetId,
                            });
                            if (evaluated?.type === "error") return evaluated;
                            const inputValue = evaluated?.type === "result" ? evaluated.value : evaluated;
                            event = { ...detail, value: inputValue };
                        }
                        const staged = panel.mode === "staged";
                        const valueResult = staged
                            ? widgetSession.stage(event)
                            : widgetSession.dispatch(event);
                        if (!staged) {
                            focusRequest.status = `Control value set to ${format(valueResult)}`;
                            restoreControlPanelFocus(container, focusRequest);
                        }
                        return {
                            type: "result",
                            value: valueResult,
                            text: format(valueResult),
                            revision: widgetSession.revision,
                            staged,
                        };
                    } catch (error) {
                        return {
                            type: "error",
                            text: error instanceof Error ? error.message : String(error),
                            revision: widgetSession.revision,
                        };
                    } finally {
                        if (pendingFocusRequest === focusRequest) pendingFocusRequest = null;
                    }
                },
                onSubmit: panel.mode === "staged"
                    ? () => {
                        const count = widgetSession.stagedChanges().length;
                        const focusRequest = {
                            kind: "control_panel",
                            panelIndex: index,
                            action: "submit",
                            status: `${count} staged ${count === 1 ? "change" : "changes"} applied atomically`,
                        };
                        pendingFocusRequest = focusRequest;
                        try {
                            const values = widgetSession.commit();
                            return {
                                type: "result",
                                values,
                                revision: widgetSession.revision,
                            };
                        } catch (error) {
                            return {
                                type: "error",
                                text: error instanceof Error ? error.message : String(error),
                                revision: widgetSession.revision,
                            };
                        } finally {
                            if (pendingFocusRequest === focusRequest) pendingFocusRequest = null;
                        }
                    }
                    : null,
                onDiscard: panel.mode === "staged"
                    ? () => ({
                        type: "result",
                        count: widgetSession.clearStage(),
                        revision: widgetSession.revision,
                    })
                    : null,
                onSetCommitted: options.onControlSet,
                onSubmitted: options.onControlSubmit,
                onDiscarded: options.onControlDiscard,
            });
        }
    }

    if (value?.kind === "live_view") {
        const selector = `[data-rix-live-view="${String(value.id).replaceAll('"', '\\"')}"]`;
        const liveRoot = root?.matches?.(".rix-output-live-view") ? root : root?.querySelector?.(selector);
        if (liveRoot) {
            mountWidgets(liveRoot, value.current);
            const unsubscribe = value.subscribe((event) => {
                if (disposed || event.type !== "live:commit") return;
                const focusRequest = pendingFocusRequest;
                pendingFocusRequest = null;
                liveRoot.innerHTML = render(value.current);
                liveRoot.dataset.rixLiveRevision = String(value.revision);
                mountWidgets(liveRoot, value.current);
                restoreOutputFocus(liveRoot, focusRequest);
                options.onLiveChange?.(event, liveRoot);
            });
            disposers.push(unsubscribe);
        }
    } else {
        mountWidgets(root, value);
    }

    if (typeof options.observe === "function") {
        const unsubscribe = options.observe((nextValue, event = null) => {
            if (disposed) return;
            const focusRequest = pendingFocusRequest;
            pendingFocusRequest = null;
            currentValue = nextValue;
            root.innerHTML = render(currentValue);
            mountWidgets(root, currentValue);
            restoreOutputFocus(root, focusRequest);
            options.onLiveChange?.(event, root);
        });
        disposers.push(unsubscribe);
    }

    return () => {
        if (disposed) return;
        disposed = true;
        disposeWidgets();
        for (const dispose of disposers.splice(0)) dispose?.();
    };
}
