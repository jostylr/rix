/**
 * Host-side interaction for portable Sheet output.
 *
 * This module adds selection only. It never mutates the Sheet value or its
 * backing RiX data. Hosts may handle activation by inserting the canonical
 * address into an editor or by dispatching a future widget action.
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
    return {
        address: cell.dataset.rixAddress,
        displayAddress: cell.dataset.rixDisplayAddress,
        index,
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
    if (!table || !cells.length) return;

    table.setAttribute("role", "grid");
    table.setAttribute("aria-label", sheet.querySelector(".rix-output-sheet-title")?.textContent || "RiX sheet");
    const rowCount = Math.max(...cells.map((cell) => Number(cell.dataset.rixRow)));
    const columnCount = Math.max(...cells.map((cell) => Number(cell.dataset.rixColumn)));
    const byPosition = new Map(cells.map((cell) => [
        `${cell.dataset.rixRow},${cell.dataset.rixColumn}`,
        cell,
    ]));

    function select(cell, { focus = false, notify = true } = {}) {
        for (const candidate of cells) {
            const selected = candidate === cell;
            candidate.classList.toggle("rix-sheet-cell-selected", selected);
            candidate.setAttribute("aria-selected", String(selected));
            candidate.tabIndex = selected ? 0 : -1;
        }
        const detail = eventDetail(cell);
        sheet.dataset.rixSelectedAddress = detail.address;
        if (location) location.textContent = `${detail.displayAddress} · ${detail.address}`;
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

    for (const [index, cell] of cells.entries()) {
        cell.tabIndex = index === 0 ? 0 : -1;
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
            activate(cell);
        });
        cell.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                activate(cell);
                return;
            }
            if (event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                select(cell, { focus: true });
                return;
            }
            const next = moveSheetSelection(eventDetail(cell), event.key, rowCount, columnCount);
            if (!next) return;
            event.preventDefault();
            event.stopPropagation();
            const target = byPosition.get(`${next.row},${next.column}`);
            if (target) select(target, { focus: true });
        });
    }
}

export function enhanceSheetViews(root, options = {}) {
    for (const sheet of sheetRoots(root)) enhanceSheet(sheet, options);
    return root;
}
