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
    const editLabel = editForm?.querySelector("[data-rix-edit-label]");
    const editStatus = editForm?.querySelector("[data-rix-edit-status]");
    let selectedCell = null;
    if (editForm && typeof options.onEdit === "function") editForm.hidden = false;
    if (!table || !cells.length) return;

    table.setAttribute("role", "grid");
    table.setAttribute("aria-label", sheet.querySelector(".rix-output-sheet-title")?.textContent || "RiX sheet");
    const activeCells = () => cells.filter((cell) => !cell.closest("tbody")?.hidden);

    function select(cell, { focus = false, notify = true } = {}) {
        for (const candidate of cells) {
            const selected = candidate === cell;
            candidate.classList.toggle("rix-sheet-cell-selected", selected);
            candidate.setAttribute("aria-selected", String(selected));
            candidate.tabIndex = selected ? 0 : -1;
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
        if (editInput) editInput.value = cell.dataset.rixFormulaSource ?? cell.textContent.trim();
        if (editLabel) {
            editLabel.textContent = [
                detail.coordinateLabel,
                detail.displayAddress,
                detail.address,
            ].filter(Boolean).join(" · ");
        }
        if (editStatus) editStatus.textContent = "";
        if (focus) cell.focus();
        if (notify) {
            options.onSelection?.(detail, cell, sheet);
            dispatchSheetEvent(sheet, "rix-sheet-select", detail);
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
            select(cell, { focus: true });
        });
        cell.addEventListener("dblclick", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (beginEdit(cell)) return;
            activate(cell);
        });
        cell.addEventListener("keydown", (event) => {
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
            if (target) select(target, { focus: true });
        });
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
        editForm.addEventListener("submit", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!selectedCell) {
                if (editStatus) editStatus.textContent = "Choose a cell first";
                return;
            }
            if (typeof options.onEdit !== "function") {
                if (editStatus) editStatus.textContent = "This host opened the live view read-only";
                return;
            }
            const detail = { ...eventDetail(selectedCell), source: editInput?.value ?? "" };
            try {
                const result = options.onEdit(detail, selectedCell, sheet);
                if (result?.type === "error") throw new Error(result.text);
                if (result && typeof result.then === "function") {
                    throw new Error("Asynchronous Sheet edits are not supported by this host");
                }
                if (Array.isArray(result?.updates)) {
                    for (const update of result.updates) {
                        const candidate = cells.find((cell) => cell.dataset.rixAddress === update.address);
                        if (!candidate) continue;
                        candidate.textContent = update.text;
                        if (typeof update.formulaSource === "string") {
                            candidate.dataset.rixFormulaSource = update.formulaSource;
                        }
                    }
                } else {
                    selectedCell.textContent = result?.text ?? detail.source;
                }
                if (editStatus) editStatus.textContent = "Saved";
                options.onEditCommitted?.(detail, result, selectedCell, sheet);
                dispatchSheetEvent(sheet, "rix-sheet-edit", {
                    ...detail,
                    revision: result?.revision ?? null,
                });
                selectedCell.focus();
            } catch (error) {
                if (editStatus) editStatus.textContent = error.message || String(error);
            }
        });
    }
}

export function enhanceSheetViews(root, options = {}) {
    for (const sheet of sheetRoots(root)) enhanceSheet(sheet, options);
    return root;
}
