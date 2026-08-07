/**
 * Host-side interaction for portable Sheet output.
 *
 * This module owns DOM interaction only. Selection and plane changes work for
 * every Sheet. A live Sheet delegates edits to the host's onEdit callback,
 * which can route a semantic event through WidgetSession.
 */

export function sheetDisplayAddress(columnHeader, rowHeader, columnIndex, rowIndex) {
    const header = String(columnHeader ?? "").trim();
    const row = String(rowHeader ?? rowIndex);
    const spreadsheetColumn = header.match(/^([A-Z]+)(?:\s*·\s*\d+)?$/)?.[1];
    return spreadsheetColumn ? `${spreadsheetColumn}${row}` : `R${rowIndex}C${columnIndex}`;
}

export function moveSheetSelection(position, key, rowCount, columnCount) {
    const current = {
        row: Math.min(Math.max(Number(position?.row) || 1, 1), Math.max(rowCount, 1)),
        column: Math.min(Math.max(Number(position?.column) || 1, 1), Math.max(columnCount, 1)),
    };
    if (key === "ArrowUp") current.row -= 1;
    else if (key === "ArrowDown") current.row += 1;
    else if (key === "ArrowLeft") current.column -= 1;
    else if (key === "ArrowRight") current.column += 1;
    else if (key === "Home") current.column = 1;
    else if (key === "End") current.column = columnCount;
    else return null;
    return {
        row: Math.min(Math.max(current.row, 1), Math.max(rowCount, 1)),
        column: Math.min(Math.max(current.column, 1), Math.max(columnCount, 1)),
    };
}

export function sheetPlaneKey(selections) {
    return [...selections]
        .sort((left, right) => Number(left.axis) - Number(right.axis))
        .map(({ axis, value }) => `${Number(axis)}:${Number(value)}`)
        .join(",");
}

export const RIXCEL_FORMULA_CLIPBOARD_TYPE = "application/x-rixcel-formula";
export const RIXCEL_FORMULA_BLOCK_CLIPBOARD_TYPE = "application/x-rixcel-formula-block";

export function parseSheetFormulaClipboard(text, fallbackAssignmentMode = ":=") {
    const source = String(text ?? "");
    const match = source.match(/^\s*(::=|~~=|:=|~=|=)\s*([\s\S]+)$/u);
    return Object.freeze({
        source: match ? match[2] : source,
        assignmentMode: match?.[1] ?? fallbackAssignmentMode,
    });
}

export function parseSheetFormulaBlock(text, fallbackAssignmentMode = ":=") {
    const rows = String(text ?? "").replace(/\r\n?/gu, "\n").split("\n");
    if (rows.at(-1) === "") rows.pop();
    return Object.freeze(rows.map((row) => Object.freeze(
        row.split("\t").map((cell) => parseSheetFormulaClipboard(cell, fallbackAssignmentMode)),
    )));
}

export function sheetFormulaFill(block, direction = "down") {
    if (!Array.isArray(block) || block.length === 0 || !block.every((row) => Array.isArray(row))) {
        throw new Error("Formula fill requires a non-empty rectangular block");
    }
    const width = block[0].length;
    if (width === 0 || !block.every((row) => row.length === width)) {
        throw new Error("Formula fill requires a non-empty rectangular block");
    }
    if (direction === "down") {
        return Object.freeze(block.map((_row, row) => Object.freeze(
            block[0].map((formula) => Object.freeze({ ...formula })),
        )));
    }
    if (direction === "right") {
        return Object.freeze(block.map((row) => Object.freeze(
            row.map(() => Object.freeze({ ...row[0] })),
        )));
    }
    throw new Error(`Unsupported formula fill direction: ${direction}`);
}

export function sheetCellDiagnostics(dataset = {}) {
    let diagnostics = [];
    if (dataset.rixDiagnostics) {
        try {
            const parsed = JSON.parse(dataset.rixDiagnostics);
            if (Array.isArray(parsed)) diagnostics = parsed.map(String);
        } catch {
            diagnostics = [String(dataset.rixDiagnostics)];
        }
    }
    return Object.freeze({
        state: dataset.rixState ?? null,
        diagnostics: Object.freeze(diagnostics),
        kind: dataset.rixDiagnosticKind ?? null,
        source: dataset.rixDiagnosticSource ?? null,
    });
}

export function sheetCellDependencies(dataset = {}) {
    if (!dataset.rixDependencies) return Object.freeze([]);
    try {
        const parsed = JSON.parse(dataset.rixDependencies);
        return Object.freeze(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch {
        return Object.freeze([]);
    }
}

function diagnosticStatus(diagnostic) {
    if (!diagnostic.diagnostics.length) return "";
    const kind = diagnostic.kind
        ? `${diagnostic.kind[0].toUpperCase()}${diagnostic.kind.slice(1)} error: `
        : "Error: ";
    return `${kind}${diagnostic.diagnostics.join("; ")}`;
}

function dependencyStatus(dependencies, address = "grid") {
    if (!dependencies.length) return "";
    const addressBase = String(address).replace(/\[[^\]]*\]$/u, "") || "grid";
    return `Depends on: ${dependencies.map((dependency) =>
        `${addressBase}[${dependency}]`).join(", ")}`;
}

function sheetRoots(root) {
    if (!root) return [];
    const roots = [];
    if (root.matches?.(".rix-output-sheet")) roots.push(root);
    if (root.querySelectorAll) roots.push(...root.querySelectorAll(".rix-output-sheet"));
    return roots;
}

function eventDetail(cell) {
    const index = String(cell.dataset.rixIndex || "")
        .split(",")
        .filter(Boolean)
        .map(Number);
    const slice = String(cell.closest("tbody")?.dataset.rixSlice || "")
        .split(",")
        .map((item) => item === "" ? null : Number(item));
    const diagnostic = sheetCellDiagnostics(cell.dataset);
    const dependencies = sheetCellDependencies(cell.dataset);
    return {
        address: cell.dataset.rixAddress,
        displayAddress: cell.dataset.rixDisplayAddress,
        coordinateLabel: cell.dataset.rixCoordinateLabel ?? null,
        coordinateLabels: cell.dataset.rixCoordinateLabels
            ? JSON.parse(cell.dataset.rixCoordinateLabels)
            : [],
        slotId: cell.dataset.rixSlotId ?? null,
        assignmentMode: cell.dataset.rixAssignmentMode ?? null,
        index,
        slice,
        row: Number(cell.dataset.rixRow),
        column: Number(cell.dataset.rixColumn),
        state: diagnostic.state,
        diagnostics: diagnostic.diagnostics,
        diagnosticKind: diagnostic.kind,
        diagnosticSource: diagnostic.source,
        dependencies,
    };
}

function dispatchSheetEvent(sheet, name, detail) {
    const EventConstructor = sheet.ownerDocument?.defaultView?.CustomEvent;
    if (typeof EventConstructor !== "function") return;
    sheet.dispatchEvent(new EventConstructor(name, { bubbles: true, detail }));
}

function enhanceSheet(sheet, options) {
    if (sheet.dataset.rixSheetEnhanced === "true") return;
    sheet.dataset.rixSheetEnhanced = "true";

    const table = sheet.querySelector("table");
    const location = sheet.querySelector(".rix-output-sheet-location");
    const cells = [...sheet.querySelectorAll("td[data-rix-address]")];
    const planeBodies = [...sheet.querySelectorAll("tbody[data-rix-plane-key]")];
    const planeSelectors = [...sheet.querySelectorAll("select[data-rix-sheet-axis]")];
    const editForm = sheet.querySelector(".rix-output-sheet-editor");
    const editInput = editForm?.querySelector("[data-rix-edit-source]");
    const editAssignmentMode = editForm?.querySelector("[data-rix-edit-assignment-mode]");
    const editLabel = editForm?.querySelector("[data-rix-edit-label]");
    const editValue = editForm?.querySelector("[data-rix-edit-value]");
    const editStatus = editForm?.querySelector("[data-rix-edit-status]");
    const editableHeaders = [...sheet.querySelectorAll(
        "th[data-rix-header-axis][data-rix-header-coordinate]",
    )];
    let selectedCell = null;
    let selectionAnchor = null;
    let selectedCells = [];
    let editPending = false;
    if (editForm && typeof options.onEdit === "function") editForm.hidden = false;
    if (!table || !cells.length) return;

    table.setAttribute("role", "grid");
    table.setAttribute("aria-label", sheet.querySelector(".rix-output-sheet-title")?.textContent || "RiX sheet");
    const activeCells = () => cells.filter((cell) => !cell.closest("tbody")?.hidden);

    function updateCellTitle(cell) {
        const detail = eventDetail(cell);
        const base = [detail.coordinateLabel, detail.displayAddress, detail.address]
            .filter(Boolean)
            .join(" · ");
        const dependencies = dependencyStatus(detail.dependencies, detail.address);
        const status = diagnosticStatus(sheetCellDiagnostics(cell.dataset));
        cell.title = [base, dependencies, status].filter(Boolean).join(" · ");
    }

    function applyCellUpdates(updates) {
        for (const update of updates) {
            const candidate = cells.find((cell) => cell.dataset.rixAddress === update.address);
            if (!candidate) continue;
            candidate.textContent = update.text;
            if (update.blank) candidate.dataset.rixBlank = "true";
            else delete candidate.dataset.rixBlank;
            if (typeof update.formulaSource === "string") {
                candidate.dataset.rixFormulaSource = update.formulaSource;
            }
            if (typeof update.assignmentMode === "string") {
                candidate.dataset.rixAssignmentMode = update.assignmentMode;
            }
            if (update.dependencies?.length) {
                candidate.dataset.rixDependencies = JSON.stringify(update.dependencies);
            } else {
                delete candidate.dataset.rixDependencies;
            }
            if (update.state === "error" || update.diagnostics?.length) {
                candidate.dataset.rixState = "error";
                candidate.dataset.rixDiagnostics = JSON.stringify(update.diagnostics || []);
                if (update.diagnosticKind) {
                    candidate.dataset.rixDiagnosticKind = update.diagnosticKind;
                } else {
                    delete candidate.dataset.rixDiagnosticKind;
                }
                if (typeof update.diagnosticSource === "string") {
                    candidate.dataset.rixDiagnosticSource = update.diagnosticSource;
                } else {
                    delete candidate.dataset.rixDiagnosticSource;
                }
                candidate.setAttribute("aria-invalid", "true");
            } else {
                delete candidate.dataset.rixState;
                delete candidate.dataset.rixDiagnostics;
                delete candidate.dataset.rixDiagnosticKind;
                delete candidate.dataset.rixDiagnosticSource;
                candidate.removeAttribute("aria-invalid");
            }
            updateCellTitle(candidate);
        }
    }

    function selectionFor(cell, extend) {
        if (!extend || !selectionAnchor || selectionAnchor.closest("tbody") !== cell.closest("tbody")) {
            selectionAnchor = cell;
            return [cell];
        }
        const rowStart = Math.min(Number(selectionAnchor.dataset.rixRow), Number(cell.dataset.rixRow));
        const rowEnd = Math.max(Number(selectionAnchor.dataset.rixRow), Number(cell.dataset.rixRow));
        const columnStart = Math.min(Number(selectionAnchor.dataset.rixColumn), Number(cell.dataset.rixColumn));
        const columnEnd = Math.max(Number(selectionAnchor.dataset.rixColumn), Number(cell.dataset.rixColumn));
        return [...cell.closest("tbody").querySelectorAll("td[data-rix-address]")].filter((candidate) => {
            const row = Number(candidate.dataset.rixRow);
            const column = Number(candidate.dataset.rixColumn);
            return row >= rowStart && row <= rowEnd && column >= columnStart && column <= columnEnd;
        });
    }

    function selectedFormulaBlock() {
        const rows = [...new Set(selectedCells.map((cell) => Number(cell.dataset.rixRow)))].sort((a, b) => a - b);
        const columns = [...new Set(selectedCells.map((cell) => Number(cell.dataset.rixColumn)))].sort((a, b) => a - b);
        return rows.map((row) => columns.map((column) => {
            const cell = selectedCells.find((candidate) =>
                Number(candidate.dataset.rixRow) === row
                && Number(candidate.dataset.rixColumn) === column);
            return {
                source: cell?.dataset.rixFormulaSource ?? "_",
                assignmentMode: cell?.dataset.rixAssignmentMode || ":=",
            };
        }));
    }

    function select(cell, { focus = false, notify = true, extend = false } = {}) {
        selectedCells = selectionFor(cell, extend);
        const selectedSet = new Set(selectedCells);
        for (const candidate of cells) {
            const selected = selectedSet.has(candidate);
            candidate.classList.toggle("rix-sheet-cell-selected", selected);
            candidate.setAttribute("aria-selected", String(selected));
            candidate.tabIndex = candidate === cell ? 0 : -1;
        }
        const detail = eventDetail(cell);
        selectedCell = cell;
        sheet.dataset.rixSelectedAddress = detail.address;
        if (location) {
            location.textContent = [
                detail.coordinateLabel,
                detail.displayAddress,
                detail.address,
            ].filter(Boolean).join(" · ");
        }
        const diagnostic = sheetCellDiagnostics(cell.dataset);
        if (editInput) {
            editInput.value = diagnostic.source
                ?? cell.dataset.rixFormulaSource
                ?? cell.textContent.trim();
        }
        if (editAssignmentMode) {
            editAssignmentMode.value = cell.dataset.rixAssignmentMode || ":=";
        }
        if (editLabel) {
            editLabel.textContent = [
                detail.coordinateLabel,
                detail.displayAddress,
                detail.address,
            ].filter(Boolean).join(" · ");
        }
        if (editValue) {
            editValue.textContent = diagnostic.state === "error"
                ? `Last good value: ${cell.textContent.trim()}`
                : `Exact value: ${cell.textContent.trim()}`;
        }
        if (editStatus) {
            editStatus.textContent = diagnosticStatus(diagnostic)
                || dependencyStatus(detail.dependencies, detail.address);
        }
        if (focus) cell.focus();
        if (notify) {
            const selection = selectedCells.map(eventDetail);
            options.onSelection?.({ ...detail, selection }, cell, sheet);
            dispatchSheetEvent(sheet, "rix-sheet-select", { ...detail, selection });
        }
        return detail;
    }

    function activate(cell) {
        const detail = select(cell, { focus: true });
        options.onActivate?.(detail, cell, sheet);
        dispatchSheetEvent(sheet, "rix-sheet-activate", detail);
    }

    function beginEdit(cell) {
        if (!editInput || typeof options.onEdit !== "function") return false;
        select(cell, { focus: false });
        editInput.focus();
        editInput.select();
        return true;
    }

    function pasteInto(cell, clipboardData) {
        if (!editInput || typeof options.onEdit !== "function") return false;
        let formula = null;
        const encoded = clipboardData?.getData?.(RIXCEL_FORMULA_CLIPBOARD_TYPE);
        if (encoded) {
            try {
                const value = JSON.parse(encoded);
                if (typeof value.source === "string") {
                    formula = {
                        source: value.source,
                        assignmentMode: value.assignmentMode || ":=",
                    };
                }
            } catch {
                formula = null;
            }
        }
        formula ??= parseSheetFormulaClipboard(
            clipboardData?.getData?.("text/plain") ?? "",
            ":=",
        );
        select(cell, { focus: false });
        editInput.value = formula.source;
        if (editAssignmentMode) editAssignmentMode.value = formula.assignmentMode;
        editForm.requestSubmit();
        return true;
    }

    async function applyFormulaBlock(originCell, block, kind = "paste") {
        if (typeof options.onBatchEdit !== "function" || !Array.isArray(block) || !block.length) return false;
        const bodyCells = [...originCell.closest("tbody").querySelectorAll("td[data-rix-address]")];
        const originRow = Number(originCell.dataset.rixRow);
        const originColumn = Number(originCell.dataset.rixColumn);
        const edits = [];
        for (const [rowOffset, row] of block.entries()) {
            for (const [columnOffset, formula] of row.entries()) {
                const target = bodyCells.find((candidate) =>
                    Number(candidate.dataset.rixRow) === originRow + rowOffset
                    && Number(candidate.dataset.rixColumn) === originColumn + columnOffset);
                if (!target) continue;
                edits.push({
                    ...eventDetail(target),
                    source: formula.source,
                    assignmentMode: formula.assignmentMode || ":=",
                });
            }
        }
        if (!edits.length) return false;
        const result = await options.onBatchEdit({ type: kind, edits }, originCell, sheet);
        if (result?.type === "error") throw new Error(result.text);
        if (Array.isArray(result?.updates)) applyCellUpdates(result.updates);
        dispatchSheetEvent(sheet, `rix-sheet-${kind}`, { edits, revision: result?.revision ?? null });
        return true;
    }

    function changePlane() {
        const selections = planeSelectors.map((selector) => ({
            axis: Number(selector.dataset.rixSheetAxis),
            value: Number(selector.value),
            label: selector.selectedOptions?.[0]?.textContent ?? null,
        }));
        const key = sheetPlaneKey(selections);
        for (const body of planeBodies) body.hidden = body.dataset.rixPlaneKey !== key;
        sheet.dataset.rixSelectedPlane = key;
        const body = planeBodies.find((candidate) => !candidate.hidden);
        if (!body) return;
        const detail = {
            key,
            slice: String(body.dataset.rixSlice || "").split(",").map((item) => item === "" ? null : Number(item)),
            selections,
        };
        const first = body.querySelector("td[data-rix-address]");
        if (first) select(first, { focus: true });
        options.onPlaneChange?.(detail, sheet);
        dispatchSheetEvent(sheet, "rix-sheet-plane-change", detail);
    }

    const initiallyActive = new Set(activeCells());
    let firstActive = true;
    for (const cell of cells) {
        cell.tabIndex = initiallyActive.has(cell) && firstActive ? 0 : -1;
        if (initiallyActive.has(cell)) firstActive = false;
        cell.setAttribute("aria-selected", "false");
        cell.addEventListener("focus", () => {
            if (sheet.dataset.rixSelectedAddress !== cell.dataset.rixAddress) select(cell);
        });
        cell.addEventListener("click", (event) => {
            event.stopPropagation();
            select(cell, { focus: true, extend: event.shiftKey });
        });
        cell.addEventListener("dblclick", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (beginEdit(cell)) return;
            activate(cell);
        });
        cell.addEventListener("copy", (event) => {
            const source = cell.dataset.rixFormulaSource;
            if (!event.clipboardData || source === undefined) return;
            const block = selectedFormulaBlock();
            const plain = block.map((row) => row.map((formula) =>
                `${formula.assignmentMode} ${formula.source}`).join("\t")).join("\n");
            event.clipboardData.setData(
                "text/plain",
                plain,
            );
            event.clipboardData.setData(RIXCEL_FORMULA_BLOCK_CLIPBOARD_TYPE, JSON.stringify({ cells: block }));
            event.clipboardData.setData(RIXCEL_FORMULA_CLIPBOARD_TYPE, JSON.stringify({
                source,
                assignmentMode: cell.dataset.rixAssignmentMode || ":=",
            }));
            event.preventDefault();
            dispatchSheetEvent(sheet, "rix-sheet-copy", eventDetail(cell));
        });
        cell.addEventListener("paste", async (event) => {
            let block = null;
            const encoded = event.clipboardData?.getData?.(RIXCEL_FORMULA_BLOCK_CLIPBOARD_TYPE);
            if (encoded) {
                try {
                    const parsed = JSON.parse(encoded);
                    if (Array.isArray(parsed.cells)) block = parsed.cells;
                } catch {
                    block = null;
                }
            }
            block ??= parseSheetFormulaBlock(event.clipboardData?.getData?.("text/plain") ?? "");
            if (block.length > 1 || block[0]?.length > 1) {
                if (!options.onBatchEdit) return;
                event.preventDefault();
                event.stopPropagation();
                try {
                    await applyFormulaBlock(cell, block, "paste");
                } catch (error) {
                    if (editStatus) editStatus.textContent = error.message || String(error);
                }
                return;
            }
            if (!pasteInto(cell, event.clipboardData)) return;
            event.preventDefault();
            event.stopPropagation();
            dispatchSheetEvent(sheet, "rix-sheet-paste", eventDetail(cell));
        });
        cell.addEventListener("keydown", (event) => {
            if ((event.metaKey || event.ctrlKey) && (event.key === "d" || event.key === "r")) {
                if (selectedCells.length > 1 && options.onBatchEdit) {
                    event.preventDefault();
                    event.stopPropagation();
                    const block = sheetFormulaFill(selectedFormulaBlock(), event.key === "d" ? "down" : "right");
                    const origin = selectedCells.reduce((best, candidate) => (
                        Number(candidate.dataset.rixRow) < Number(best.dataset.rixRow)
                        || (candidate.dataset.rixRow === best.dataset.rixRow
                            && Number(candidate.dataset.rixColumn) < Number(best.dataset.rixColumn))
                            ? candidate : best
                    ));
                    applyFormulaBlock(origin, block, "fill").catch((error) => {
                        if (editStatus) editStatus.textContent = error.message || String(error);
                    });
                }
                return;
            }
            if (event.key === "F2") {
                event.preventDefault();
                event.stopPropagation();
                if (beginEdit(cell)) return;
            }
            if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                if (beginEdit(cell)) return;
                activate(cell);
                return;
            }
            if (event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                select(cell, { focus: true });
                return;
            }
            const bodyCells = [...cell.closest("tbody").querySelectorAll("td[data-rix-address]")];
            const rowCount = Math.max(...bodyCells.map((candidate) => Number(candidate.dataset.rixRow)));
            const columnCount = Math.max(...bodyCells.map((candidate) => Number(candidate.dataset.rixColumn)));
            const next = moveSheetSelection(eventDetail(cell), event.key, rowCount, columnCount);
            if (!next) return;
            event.preventDefault();
            event.stopPropagation();
            const target = bodyCells.find((candidate) =>
                Number(candidate.dataset.rixRow) === next.row
                && Number(candidate.dataset.rixColumn) === next.column);
            if (target) select(target, { focus: true, extend: event.shiftKey });
        });
    }
    if (typeof options.onHeaderEdit === "function") {
        for (const header of editableHeaders) {
            let editing = false;
            const display = (label) => label
                ? `${label} · ${header.dataset.rixHeaderCoordinate}`
                : header.dataset.rixHeaderFallback;
            const beginHeaderEdit = () => {
                if (editing) return;
                editing = true;
                header.dataset.rixHeaderPrevious = header.dataset.rixHeaderLabel || "";
                header.textContent = header.dataset.rixHeaderLabel || "";
                header.contentEditable = "true";
                header.focus();
                const selection = header.ownerDocument?.defaultView?.getSelection?.();
                const range = header.ownerDocument?.createRange?.();
                if (selection && range) {
                    range.selectNodeContents(header);
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            };
            const finishHeaderEdit = (commit) => {
                if (!editing) return;
                editing = false;
                header.contentEditable = "false";
                const previous = header.dataset.rixHeaderPrevious || "";
                const label = commit ? header.textContent.trim() : previous;
                if (commit) {
                    const detail = {
                        axis: Number(header.dataset.rixHeaderAxis),
                        coordinate: Number(header.dataset.rixHeaderCoordinate),
                        label,
                    };
                    try {
                        const result = options.onHeaderEdit(detail, header, sheet);
                        if (result?.type === "error") throw new Error(result.text);
                        for (const candidate of editableHeaders.filter((item) =>
                            item.dataset.rixHeaderAxis === header.dataset.rixHeaderAxis
                            && item.dataset.rixHeaderCoordinate === header.dataset.rixHeaderCoordinate)) {
                            candidate.dataset.rixHeaderLabel = label;
                            candidate.textContent = label
                                ? `${label} · ${candidate.dataset.rixHeaderCoordinate}`
                                : candidate.dataset.rixHeaderFallback;
                        }
                        dispatchSheetEvent(sheet, "rix-sheet-header-edit", detail);
                    } catch {
                        header.dataset.rixHeaderLabel = previous;
                    }
                }
                header.textContent = display(header.dataset.rixHeaderLabel || "");
                delete header.dataset.rixHeaderPrevious;
            };
            header.addEventListener("dblclick", (event) => {
                event.preventDefault();
                event.stopPropagation();
                beginHeaderEdit();
            });
            header.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    event.stopPropagation();
                    if (editing) finishHeaderEdit(true);
                    else beginHeaderEdit();
                } else if (event.key === "Escape" && editing) {
                    event.preventDefault();
                    event.stopPropagation();
                    finishHeaderEdit(false);
                }
            });
            header.addEventListener("blur", () => finishHeaderEdit(true));
        }
    }
    for (const selector of planeSelectors) selector.addEventListener("change", changePlane);
    if (editForm) {
        editForm.addEventListener("click", (event) => event.stopPropagation());
        editInput?.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                editForm.requestSubmit();
            } else if (event.key === "Escape" && selectedCell) {
                event.preventDefault();
                event.stopPropagation();
                selectedCell.focus();
            }
        });
        editForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (editPending) return;
            if (!selectedCell) {
                if (editStatus) editStatus.textContent = "Choose a cell first";
                return;
            }
            if (typeof options.onEdit !== "function") {
                if (editStatus) editStatus.textContent = "This host opened the live view read-only";
                return;
            }
            const submittedCell = selectedCell;
            const detail = {
                ...eventDetail(submittedCell),
                source: editInput?.value ?? "",
                ...(editAssignmentMode ? { assignmentMode: editAssignmentMode.value } : {}),
            };
            const submitButton = editForm.querySelector('button[type="submit"]');
            try {
                editPending = true;
                editForm.setAttribute("aria-busy", "true");
                if (submitButton) submitButton.disabled = true;
                if (editStatus) editStatus.textContent = "Evaluating…";
                const result = await options.onEdit(detail, submittedCell, sheet);
                if (Array.isArray(result?.updates)) {
                    applyCellUpdates(result.updates);
                } else if (result?.type === "error") {
                    throw new Error(result.text);
                } else {
                    submittedCell.textContent = result?.text ?? detail.source;
                }
                if (result?.type === "error") throw new Error(result.text);
                const exact = submittedCell.textContent.trim();
                if (editValue) editValue.textContent = `Exact value: ${exact}`;
                if (editStatus) editStatus.textContent = "Saved";
                options.onEditCommitted?.(detail, result, submittedCell, sheet);
                dispatchSheetEvent(sheet, "rix-sheet-edit", {
                    ...detail,
                    revision: result?.revision ?? null,
                });
                submittedCell.focus();
            } catch (error) {
                const diagnostic = sheetCellDiagnostics(submittedCell.dataset);
                if (editValue && diagnostic.state === "error") {
                    editValue.textContent = `Last good value: ${submittedCell.textContent.trim()}`;
                }
                if (editStatus) {
                    editStatus.textContent = diagnosticStatus(diagnostic)
                        || error.message
                        || String(error);
                }
            } finally {
                editPending = false;
                editForm.removeAttribute("aria-busy");
                if (submitButton) submitButton.disabled = false;
            }
        });
    }
}

export function enhanceSheetViews(root, options = {}) {
    for (const sheet of sheetRoots(root)) enhanceSheet(sheet, options);
    return root;
}
