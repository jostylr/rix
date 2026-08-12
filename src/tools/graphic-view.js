/** Host-side interaction for portable Graphic drag handles and actions. */

export function graphicPointFromClient(rect, viewBox, client) {
    const width = Number(rect?.width);
    const height = Number(rect?.height);
    const boxWidth = Number(viewBox?.width);
    const boxHeight = Number(viewBox?.height);
    if (!(width > 0) || !(height > 0) || !(boxWidth > 0) || !(boxHeight > 0)) {
        throw new Error("Graphic drag coordinates require non-empty bounds");
    }
    const x = Number(viewBox.x || 0)
        + ((Number(client.x) - Number(rect.left || 0)) / width) * boxWidth;
    const y = Number(viewBox.y || 0)
        + ((Number(client.y) - Number(rect.top || 0)) / height) * boxHeight;
    return Object.freeze([
        Math.min(Math.max(x, Number(viewBox.x || 0)), Number(viewBox.x || 0) + boxWidth),
        Math.min(Math.max(y, Number(viewBox.y || 0)), Number(viewBox.y || 0) + boxHeight),
    ]);
}

function graphicRoots(root) {
    if (!root) return [];
    const roots = [];
    if (root.matches?.(".rix-output-graphic")) roots.push(root);
    if (root.querySelectorAll) roots.push(...root.querySelectorAll(".rix-output-graphic"));
    return roots;
}

function dispatchGraphicEvent(graphic, name, detail) {
    const EventConstructor = graphic.ownerDocument?.defaultView?.CustomEvent;
    if (typeof EventConstructor !== "function") return;
    graphic.dispatchEvent(new EventConstructor(name, { bubbles: true, detail }));
}

function pointDetail(handle, position, source) {
    return Object.freeze({
        type: "graphic:position",
        targetId: handle.dataset.rixDragTarget,
        position: Object.freeze(position.map(Number)),
        source,
    });
}

function enhanceGraphic(graphic, options) {
    if (graphic.dataset.rixGraphicEnhanced === "true") return;
    graphic.dataset.rixGraphicEnhanced = "true";
    const svg = graphic.querySelector("svg.rix-output-svg");
    const status = graphic.querySelector(".rix-output-graphic-status");
    const handles = [...graphic.querySelectorAll("[data-rix-drag-target]")];
    const actions = [...graphic.querySelectorAll("[data-rix-graphic-action]")];
    if (!svg || (handles.length === 0 && actions.length === 0)) return;

    for (const action of actions) {
        if (typeof options.onAction !== "function") continue;
        const activate = (source) => {
            const detail = Object.freeze({
                type: "graphic:action",
                actionId: action.dataset.rixGraphicAction,
                targetId: action.dataset.rixGraphicTarget,
                source,
            });
            try {
                const result = options.onAction(detail, action, graphic);
                if (result?.type === "error") throw new Error(result.text);
                if (status) status.textContent = `${action.getAttribute("aria-label") || "Scene action"} selected`;
                dispatchGraphicEvent(graphic, "rix-graphic-action", {
                    ...detail,
                    revision: result?.revision ?? null,
                });
                options.onActionCommitted?.(detail, result, action, graphic);
            } catch (error) {
                if (status) status.textContent = error instanceof Error ? error.message : String(error);
            }
        };
        action.addEventListener("click", (event) => {
            event.preventDefault?.();
            event.stopPropagation?.();
            activate("pointer");
        });
        action.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault?.();
            event.stopPropagation?.();
            activate("keyboard");
        });
    }

    if (handles.length === 0 || typeof options.onPosition !== "function") return;

    const setPreview = (handle, position) => {
        handle.setAttribute("cx", String(position[0]));
        handle.setAttribute("cy", String(position[1]));
        handle.dataset.rixPosition = position.join(",");
        if (status) status.textContent = `${handle.getAttribute("aria-label") || "Point"}: ${position.map((value) => Number(value.toFixed(2))).join(", ")}`;
    };

    const commit = (handle, position, source, previous) => {
        const detail = pointDetail(handle, position, source);
        try {
            const result = options.onPosition(detail, handle, graphic);
            if (result?.type === "error") throw new Error(result.text);
            dispatchGraphicEvent(graphic, "rix-graphic-position", {
                ...detail,
                revision: result?.revision ?? null,
            });
            options.onPositionCommitted?.(detail, result, handle, graphic);
            return true;
        } catch (error) {
            setPreview(handle, previous);
            if (status) status.textContent = error instanceof Error ? error.message : String(error);
            return false;
        }
    };

    for (const handle of handles) {
        let pointerId = null;
        let previous = null;
        const current = () => String(handle.dataset.rixPosition || "0,0").split(",").map(Number);
        const fromPointer = (event) => graphicPointFromClient(
            svg.getBoundingClientRect(),
            svg.viewBox?.baseVal || {
                x: 0,
                y: 0,
                width: Number(svg.getAttribute("width")),
                height: Number(svg.getAttribute("height")),
            },
            { x: event.clientX, y: event.clientY },
        );

        handle.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            pointerId = event.pointerId;
            previous = current();
            handle.setPointerCapture?.(pointerId);
            handle.classList.add("rix-output-drag-point-active");
            handle.focus();
        });
        handle.addEventListener("pointermove", (event) => {
            if (event.pointerId !== pointerId) return;
            event.preventDefault();
            event.stopPropagation();
            setPreview(handle, fromPointer(event));
        });
        const finish = (event) => {
            if (event.pointerId !== pointerId) return;
            event.preventDefault();
            event.stopPropagation();
            const position = fromPointer(event);
            const initial = previous || current();
            if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
            pointerId = null;
            previous = null;
            handle.classList.remove("rix-output-drag-point-active");
            setPreview(handle, position);
            commit(handle, position, "pointer", initial);
        };
        handle.addEventListener("pointerup", finish);
        handle.addEventListener("pointercancel", (event) => {
            if (event.pointerId !== pointerId) return;
            const initial = previous || current();
            pointerId = null;
            previous = null;
            handle.classList.remove("rix-output-drag-point-active");
            setPreview(handle, initial);
        });
        handle.addEventListener("click", (event) => event.stopPropagation());
        handle.addEventListener("keydown", (event) => {
            const delta = event.shiftKey ? 10 : 1;
            const position = current();
            if (event.key === "ArrowLeft") position[0] -= delta;
            else if (event.key === "ArrowRight") position[0] += delta;
            else if (event.key === "ArrowUp") position[1] -= delta;
            else if (event.key === "ArrowDown") position[1] += delta;
            else return;
            event.preventDefault();
            event.stopPropagation();
            const box = svg.viewBox?.baseVal || { x: 0, y: 0, width: Number(svg.getAttribute("width")), height: Number(svg.getAttribute("height")) };
            const next = [
                Math.min(Math.max(position[0], box.x), box.x + box.width),
                Math.min(Math.max(position[1], box.y), box.y + box.height),
            ];
            const initial = current();
            setPreview(handle, next);
            commit(handle, next, "keyboard", initial);
        });
    }
}

export function enhanceGraphicViews(root, options = {}) {
    for (const graphic of graphicRoots(root)) enhanceGraphic(graphic, options);
    return root;
}
