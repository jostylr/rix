/** Host-side camera navigation, picking, and exact inspection for Scene3D outputs. */

import {
    createWebGLPlan,
    paintWebGLPlan,
    webGLPlanMatrix,
} from "../../plugins/render-webgl/webgl-plan.js";

const MIN_PITCH = -Math.PI / 2 + 0.015;
const MAX_PITCH = Math.PI / 2 - 0.015;

function sequenceValue(value) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.values)) return value.values;
    return [];
}

function stringValue(value) {
    if (typeof value === "string") return value;
    if (value?.type === "string" || value?.type === "symbol") return value.value;
    return null;
}

function mapField(value, key) {
    if (value instanceof Map) {
        if (value.has(key)) return value.get(key);
        const match = [...value.keys()].find((candidate) => String(candidate).toLowerCase() === String(key).toLowerCase());
        return match === undefined ? null : value.get(match);
    }
    if (value?.type === "map" && value.entries instanceof Map) return mapField(value.entries, key);
    if (value && typeof value === "object") {
        if (Object.hasOwn(value, key)) return value[key];
        const match = Object.keys(value).find((candidate) => candidate.toLowerCase() === String(key).toLowerCase());
        return match === undefined ? null : value[match];
    }
    return null;
}

function cloneCamera(camera) {
    return {
        ...camera,
        position: [...camera.position],
        target: [...camera.target],
        up: [...camera.up],
        orbit: camera.orbit && typeof camera.orbit === "object" ? { ...camera.orbit } : camera.orbit,
    };
}

function subtract(left, right) {
    return left.map((value, index) => value - right[index]);
}

function add(left, right) {
    return left.map((value, index) => value + right[index]);
}

function scale(value, factor) {
    return value.map((entry) => entry * factor);
}

function cross(left, right) {
    return [
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0],
    ];
}

function normalize(value, fallback = [1, 0, 0]) {
    const length = Math.hypot(...value);
    return length > 1e-12 ? value.map((entry) => entry / length) : [...fallback];
}

function sceneBounds(plan) {
    const points = plan.drawCalls.flatMap((call) => call.positions);
    if (!points.length) return { center: [0, 0, 0], radius: 1 };
    const low = [...points[0]];
    const high = [...points[0]];
    for (const point of points.slice(1)) {
        for (let axis = 0; axis < 3; axis += 1) {
            low[axis] = Math.min(low[axis], point[axis]);
            high[axis] = Math.max(high[axis], point[axis]);
        }
    }
    const center = low.map((value, axis) => (value + high[axis]) / 2);
    return {
        center,
        radius: Math.max(1e-6, ...points.map((point) => Math.hypot(...subtract(point, center)))),
    };
}

/** Create or normalize persistent host state for a retained Scene3D scene. */
export function createScene3DViewState(plan, target = {}) {
    if (plan?.schema !== "rix.webgl-plan@1") throw new Error("Scene3D view requires a rix.webgl-plan@1 plan");
    const bounds = sceneBounds(plan);
    if (!target.initialCamera) target.initialCamera = cloneCamera(plan.camera);
    if (!target.camera) target.camera = cloneCamera(target.initialCamera);
    target.bounds = bounds;
    const distance = Math.hypot(...subtract(target.camera.position, target.camera.target));
    target.policy = {
        minDistance: Math.max(target.camera.near * 1.25, bounds.radius / 1000, 1e-6),
        maxDistance: Math.max(bounds.radius * 1000, distance * 32, 1),
    };
    const selectable = new Set(Object.keys(plan.picking || {}));
    const ids = Array.isArray(target.selection?.ids)
        ? [...new Set(target.selection.ids.map(String))].filter((id) => selectable.has(id))
        : [];
    target.selection = { schema: "rix.selection@1", ids, focus: target.selection?.focus ?? ids[0] ?? null };
    target.viewport = {
        schema: "rix.viewport3d@1",
        width: plan.viewport.width,
        height: plan.viewport.height,
        projection: target.camera.projection,
    };
    return target;
}

/** Orbit around the current target. Deltas are radians in yaw and pitch. */
export function orbitScene3DCamera(state, yawDelta, pitchDelta) {
    const offset = subtract(state.camera.position, state.camera.target);
    const radius = Math.max(state.policy.minDistance, Math.hypot(...offset));
    const yaw = Math.atan2(offset[1], offset[0]) + Number(yawDelta || 0);
    const pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, Math.asin(offset[2] / radius) + Number(pitchDelta || 0)));
    const horizontal = radius * Math.cos(pitch);
    state.camera.position = add(state.camera.target, [
        horizontal * Math.cos(yaw),
        horizontal * Math.sin(yaw),
        radius * Math.sin(pitch),
    ]);
    return state;
}

/** Truck the camera and its target in camera-plane world units. */
export function truckScene3DCamera(state, horizontal, vertical) {
    const forward = normalize(subtract(state.camera.target, state.camera.position), [0, 0, -1]);
    const right = normalize(cross(forward, state.camera.up), [1, 0, 0]);
    const up = normalize(cross(right, forward), [0, 0, 1]);
    const delta = add(scale(right, Number(horizontal || 0)), scale(up, Number(vertical || 0)));
    state.camera.position = add(state.camera.position, delta);
    state.camera.target = add(state.camera.target, delta);
    return state;
}

/** Dolly by a multiplicative distance factor, bounded by the scene policy. */
export function dollyScene3DCamera(state, factor) {
    const offset = subtract(state.camera.position, state.camera.target);
    const oldDistance = Math.max(1e-12, Math.hypot(...offset));
    const distance = Math.min(state.policy.maxDistance, Math.max(state.policy.minDistance, oldDistance * Number(factor || 1)));
    state.camera.position = add(state.camera.target, scale(offset, distance / oldDistance));
    if (state.camera.projection === "orthographic") {
        const currentScale = Number(state.camera.scale || state.bounds.radius * 2.2);
        state.camera.scale = Math.max(state.bounds.radius / 1000, currentScale * (distance / oldDistance));
    }
    return state;
}

export function resetScene3DCamera(state) {
    state.camera = cloneCamera(state.initialCamera);
    state.viewport.projection = state.camera.projection;
    return state;
}

export function toggleScene3DProjection(state) {
    if (state.camera.projection === "perspective") {
        state.camera.projection = "orthographic";
        state.camera.scale = Math.max(state.bounds.radius * 2.2, 1e-6);
    } else {
        state.camera.projection = "perspective";
    }
    state.viewport.projection = state.camera.projection;
    return state;
}

/** Project a world point through a WebGL plan matrix into viewport pixels. */
export function projectScene3DPoint(matrix, point, viewport) {
    const source = [...point, 1];
    const clip = [0, 0, 0, 0];
    for (let row = 0; row < 4; row += 1) {
        for (let column = 0; column < 4; column += 1) clip[row] += matrix[column * 4 + row] * source[column];
    }
    if (!(clip[3] > 0)) return { visible: false, screen: null, depth: Infinity };
    const ndc = clip.slice(0, 3).map((value) => value / clip[3]);
    return {
        visible: ndc.every((value) => Math.abs(value) <= 1),
        screen: [viewport.width * (ndc[0] + 1) / 2, viewport.height * (1 - ndc[1]) / 2],
        depth: ndc[2],
    };
}

function segmentDistance(point, start, end) {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length = dx * dx + dy * dy;
    const amount = length ? Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length)) : 0;
    return Math.hypot(point[0] - start[0] - amount * dx, point[1] - start[1] - amount * dy);
}

function triangleContains(point, first, second, third) {
    const sign = (a, b, c) => (a[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (a[1] - c[1]);
    const values = [sign(point, first, second), sign(point, second, third), sign(point, third, first)];
    return !(values.some((value) => value < 0) && values.some((value) => value > 0));
}

/** CPU hit testing over stable ids in the executable WebGL plan. */
export function pickScene3DPlan(plan, matrix, screenPoint, tolerance = 8) {
    let best = null;
    const consider = (call, depth, distance = 0) => {
        if (!call.pickId) return;
        if (!best || depth < best.depth || (depth === best.depth && distance < best.distance)) {
            best = { pickId: call.pickId, primitive: call.primitive, depth, distance, call };
        }
    };
    for (const call of plan.drawCalls) {
        if (!call.pickId) continue;
        const points = call.positions.map((point) => projectScene3DPoint(matrix, point, plan.viewport));
        if (call.mode === "points") {
            for (const index of call.indices) {
                const item = points[index];
                if (!item.visible) continue;
                const distance = Math.hypot(screenPoint[0] - item.screen[0], screenPoint[1] - item.screen[1]);
                if (distance <= Math.max(tolerance, call.pointSize / 2)) consider(call, item.depth, distance);
            }
        } else if (call.mode === "lines") {
            for (let index = 0; index + 1 < call.indices.length; index += 2) {
                const first = points[call.indices[index]];
                const second = points[call.indices[index + 1]];
                if (!first.screen || !second.screen) continue;
                const distance = segmentDistance(screenPoint, first.screen, second.screen);
                if (distance <= Math.max(tolerance, call.lineWidth / 2)) consider(call, Math.min(first.depth, second.depth), distance);
            }
        } else {
            for (let index = 0; index + 2 < call.indices.length; index += 3) {
                const triangle = call.indices.slice(index, index + 3).map((item) => points[item]);
                if (triangle.some((item) => !item.screen)) continue;
                if (triangleContains(screenPoint, ...triangle.map((item) => item.screen))) {
                    consider(call, triangle.reduce((sum, item) => sum + item.depth, 0) / 3);
                }
            }
        }
    }
    for (const annotation of plan.annotations) {
        if (!annotation.pickId) continue;
        const item = projectScene3DPoint(matrix, annotation.position, plan.viewport);
        if (!item.visible) continue;
        const distance = Math.hypot(screenPoint[0] - item.screen[0], screenPoint[1] - item.screen[1]);
        if (distance <= tolerance * 1.5) consider({ ...annotation, primitive: annotation.primitive }, item.depth, distance);
    }
    return best;
}

function exactText(value, format) {
    try {
        return String(format(value));
    } catch {
        return String(value);
    }
}

function exactPoint(value, format) {
    return `(${sequenceValue(value).map((coordinate) => exactText(coordinate, format)).join(", ")})`;
}

/** Describe one picked primitive from exact, retained world coordinates. */
export function describeScene3DSelection(scene, pickId, format = String) {
    const primitives = sequenceValue(mapField(mapField(scene, "realized"), "primitives"));
    const primitive = primitives.find((candidate) => stringValue(mapField(candidate, "pickid")) === pickId);
    if (!primitive) return pickId ? `Scene3D object ${pickId}` : "Scene3D background";
    const kind = stringValue(mapField(primitive, "kind")) || "object";
    const label = stringValue(mapField(primitive, "label")) || pickId;
    const points = sequenceValue(mapField(primitive, "points"));
    const coordinates = points.length <= 4
        ? points.map((point) => exactPoint(point, format)).join("; ")
        : `${points.slice(0, 3).map((point) => exactPoint(point, format)).join("; ")}; …`;
    return `${label} · ${kind} · ${points.length} exact world point${points.length === 1 ? "" : "s"}${coordinates ? ` · ${coordinates}` : ""}`;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
}

/** Deterministic current-camera SVG fallback derived from the same WebGL plan. */
export function renderScene3DSvgFallback(plan, matrix = webGLPlanMatrix(plan)) {
    const { width, height } = plan.viewport;
    const project = (point) => projectScene3DPoint(matrix, point, plan.viewport);
    const body = [];
    for (const call of plan.drawCalls) {
        const points = call.positions.map(project);
        const color = `rgb(${call.color.slice(0, 3).map((value) => Math.round(value * 255)).join(" ")})`;
        if (call.mode === "triangles") {
            for (let index = 0; index + 2 < call.indices.length; index += 3) {
                const triangle = call.indices.slice(index, index + 3).map((item) => points[item]);
                if (triangle.some((item) => !item.screen)) continue;
                body.push(`<polygon points="${triangle.map((item) => item.screen.join(",")).join(" ")}" fill="${color}" fill-opacity="${call.color[3]}"${call.pickId ? ` data-rix-semantic-id="${escapeHtml(call.pickId)}"` : ""}/>`);
            }
        } else if (call.mode === "lines") {
            for (let index = 0; index + 1 < call.indices.length; index += 2) {
                const pair = call.indices.slice(index, index + 2).map((item) => points[item]);
                if (pair.some((item) => !item.screen)) continue;
                body.push(`<line x1="${pair[0].screen[0]}" y1="${pair[0].screen[1]}" x2="${pair[1].screen[0]}" y2="${pair[1].screen[1]}" stroke="${color}" stroke-opacity="${call.color[3]}" stroke-width="${call.lineWidth}"/>`);
            }
        } else {
            for (const index of call.indices) {
                const point = points[index];
                if (!point.visible) continue;
                body.push(`<circle cx="${point.screen[0]}" cy="${point.screen[1]}" r="${Math.max(1, call.pointSize / 2)}" fill="${color}" fill-opacity="${call.color[3]}"/>`);
            }
        }
    }
    for (const annotation of plan.annotations) {
        const point = project(annotation.position);
        if (!point.visible) continue;
        body.push(`<text x="${point.screen[0]}" y="${point.screen[1]}" fill="rgb(${annotation.color.map((value) => Math.round(value * 255)).join(" ")})">${escapeHtml(annotation.text || annotation.label || "")}</text>`);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" class="rix-output-scene3d-fallback" viewBox="0 0 ${width} ${height}" role="img" aria-label="Static Scene3D fallback"><rect width="100%" height="100%" fill="rgb(${plan.background.map((value) => Math.round(value * 255)).join(" ")})"/>${body.join("")}</svg>`;
}

function scene3DRoots(root) {
    const roots = [];
    if (root?.matches?.(".rix-output-scene3d")) roots.push(root);
    if (root?.querySelectorAll) roots.push(...root.querySelectorAll(".rix-output-scene3d"));
    return roots;
}

function dispatchSceneEvent(root, detail) {
    const EventConstructor = root.ownerDocument?.defaultView?.CustomEvent;
    if (typeof EventConstructor === "function") root.dispatchEvent(new EventConstructor("rix:scene3d-selection", { bubbles: true, detail }));
}

/** Enhance one or more rendered Scene3D placeholders with WebGL and accessible DOM overlays. */
export function enhanceScene3DViews(root, options = {}) {
    const disposers = scene3DRoots(root).map((container) => {
        const scene = options.scene;
        const format = options.format || String;
        const canvas = container.querySelector?.("canvas[data-rix-scene3d-canvas]");
        const surface = container.querySelector?.(".rix-output-scene3d-surface");
        const overlay = container.querySelector?.(".rix-output-scene3d-annotations");
        const inspector = container.querySelector?.(".rix-output-scene3d-inspector");
        const status = container.querySelector?.(".rix-output-scene3d-status");
        if (!canvas || !surface) return () => {};
        const plan = createWebGLPlan(scene, { width: 640, height: 480 });
        const state = createScene3DViewState(plan, options.state || {});
        let gl = null;
        let matrix = null;
        let pointer = null;
        let fallback = null;
        let disposed = false;
        const listeners = [];
        const listen = (target, name, listener, settings) => {
            target?.addEventListener?.(name, listener, settings);
            listeners.push(() => target?.removeEventListener?.(name, listener, settings));
        };
        const setStatus = (message) => { if (status) status.textContent = message; };
        const syncPlan = () => {
            plan.camera = cloneCamera(state.camera);
            const rect = canvas.getBoundingClientRect?.() || { width: 640, height: 480 };
            const logicalWidth = Math.max(1, Number(rect.width) || 640);
            const logicalHeight = Math.max(1, Number(rect.height) || logicalWidth * 0.75);
            const ratio = Math.min(4, Math.max(1, Number(container.ownerDocument?.defaultView?.devicePixelRatio) || 1));
            const width = Math.round(logicalWidth * ratio);
            const height = Math.round(logicalHeight * ratio);
            if (canvas.width !== width) canvas.width = width;
            if (canvas.height !== height) canvas.height = height;
            plan.viewport = { width, height };
            state.viewport.width = logicalWidth;
            state.viewport.height = logicalHeight;
            return ratio;
        };
        const showFallback = (message) => {
            const ratio = syncPlan();
            matrix = webGLPlanMatrix(plan);
            fallback?.remove?.();
            const holder = container.ownerDocument?.createElement?.("div");
            if (holder) {
                holder.innerHTML = renderScene3DSvgFallback(plan, matrix);
                fallback = holder.firstElementChild;
                if (fallback) surface.appendChild(fallback);
            }
            canvas.hidden = true;
            if (overlay) overlay.hidden = true;
            setStatus(`${message} Static SVG fallback shown at ${Math.round(ratio * 100)}% pixel density.`);
        };
        const select = (pickId, source) => {
            state.selection.ids = pickId ? [pickId] : [];
            state.selection.focus = pickId || null;
            const exact = describeScene3DSelection(scene, pickId, format);
            if (inspector) inspector.textContent = exact;
            const interaction = pickId ? plan.picking[pickId]?.interaction ?? null : null;
            const detail = Object.freeze({ type: "scene3d:selection", selection: { ...state.selection, ids: [...state.selection.ids] }, pickId, exact, interaction, source });
            options.onSelection?.(detail);
            dispatchSceneEvent(container, detail);
        };
        const renderAnnotations = (annotations, ratio) => {
            if (!overlay) return;
            overlay.hidden = false;
            overlay.replaceChildren?.();
            for (const annotation of annotations) {
                if (!annotation.visible || !annotation.screen) continue;
                const label = container.ownerDocument.createElement("button");
                label.type = "button";
                label.className = "rix-output-scene3d-annotation";
                label.textContent = annotation.text || annotation.label || annotation.pickId || "annotation";
                label.style.left = `${annotation.screen[0] / ratio}px`;
                label.style.top = `${annotation.screen[1] / ratio}px`;
                if (annotation.pickId) {
                    label.dataset.rixSemanticId = annotation.pickId;
                    label.addEventListener("click", (event) => {
                        event.stopPropagation();
                        select(annotation.pickId, "annotation");
                    });
                } else label.disabled = true;
                overlay.appendChild(label);
            }
        };
        const repaint = () => {
            if (disposed) return;
            const ratio = syncPlan();
            matrix = webGLPlanMatrix(plan);
            fallback?.remove?.();
            fallback = null;
            if (!gl) {
                try { gl = canvas.getContext?.("webgl2", { antialias: true, alpha: false }) || canvas.getContext?.("webgl", { antialias: true, alpha: false }); } catch { gl = null; }
            }
            if (!gl) {
                showFallback("WebGL is unavailable.");
                return;
            }
            canvas.hidden = false;
            const result = paintWebGLPlan(gl, plan);
            matrix = result.matrix;
            renderAnnotations(result.annotations, ratio);
            setStatus(`${state.camera.projection} projection · drag to orbit · Shift-drag to truck · wheel to dolly`);
            options.onViewport?.({ type: "scene3d:viewport", viewport: { ...state.viewport }, camera: cloneCamera(state.camera) });
        };
        const logicalPoint = (event) => {
            const rect = canvas.getBoundingClientRect();
            const ratioX = plan.viewport.width / Math.max(1, rect.width);
            const ratioY = plan.viewport.height / Math.max(1, rect.height);
            return [(event.clientX - rect.left) * ratioX, (event.clientY - rect.top) * ratioY];
        };
        const cameraStep = () => Math.max(state.bounds.radius, Math.hypot(...subtract(state.camera.position, state.camera.target))) * 0.06;
        const action = (name, source = "toolbar") => {
            if (name === "orbit-left") orbitScene3DCamera(state, -0.12, 0);
            else if (name === "orbit-right") orbitScene3DCamera(state, 0.12, 0);
            else if (name === "orbit-up") orbitScene3DCamera(state, 0, 0.1);
            else if (name === "orbit-down") orbitScene3DCamera(state, 0, -0.1);
            else if (name === "dolly-in") dollyScene3DCamera(state, 0.82);
            else if (name === "dolly-out") dollyScene3DCamera(state, 1.22);
            else if (name === "projection") toggleScene3DProjection(state);
            else if (name === "reset") resetScene3DCamera(state);
            else if (name === "previous" || name === "next") {
                const ids = Object.keys(plan.picking);
                if (ids.length) {
                    const current = ids.indexOf(state.selection.focus);
                    const delta = name === "next" ? 1 : -1;
                    select(ids[(current + delta + ids.length) % ids.length], source);
                }
                return;
            }
            repaint();
        };
        for (const button of container.querySelectorAll?.("[data-rix-scene3d-action]") || []) {
            listen(button, "click", (event) => {
                event.stopPropagation();
                action(button.dataset.rixScene3dAction);
            });
        }
        listen(canvas, "contextmenu", (event) => event.preventDefault());
        listen(canvas, "click", (event) => event.stopPropagation());
        listen(canvas, "pointerdown", (event) => {
            pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false, truck: event.shiftKey || event.button === 2 };
            canvas.setPointerCapture?.(event.pointerId);
            event.preventDefault();
        });
        listen(canvas, "pointermove", (event) => {
            if (!pointer || event.pointerId !== pointer.id) return;
            const dx = event.clientX - pointer.lastX;
            const dy = event.clientY - pointer.lastY;
            pointer.lastX = event.clientX; pointer.lastY = event.clientY;
            pointer.moved ||= Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 4;
            if (pointer.truck) {
                const step = cameraStep() * 0.01;
                truckScene3DCamera(state, -dx * step, dy * step);
            } else orbitScene3DCamera(state, -dx * 0.008, -dy * 0.008);
            repaint();
        });
        listen(canvas, "pointerup", (event) => {
            if (!pointer || event.pointerId !== pointer.id) return;
            if (!pointer.moved && matrix) select(pickScene3DPlan(plan, matrix, logicalPoint(event))?.pickId || null, "pointer");
            canvas.releasePointerCapture?.(event.pointerId);
            pointer = null;
        });
        listen(canvas, "pointercancel", () => { pointer = null; });
        listen(canvas, "wheel", (event) => {
            event.preventDefault();
            dollyScene3DCamera(state, Math.exp(Math.max(-500, Math.min(500, event.deltaY)) * 0.0015));
            repaint();
        }, { passive: false });
        listen(canvas, "dblclick", (event) => { event.preventDefault(); resetScene3DCamera(state); repaint(); });
        listen(canvas, "keydown", (event) => {
            let handled = true;
            if (event.key === "ArrowLeft") event.shiftKey ? truckScene3DCamera(state, -cameraStep(), 0) : orbitScene3DCamera(state, -0.1, 0);
            else if (event.key === "ArrowRight") event.shiftKey ? truckScene3DCamera(state, cameraStep(), 0) : orbitScene3DCamera(state, 0.1, 0);
            else if (event.key === "ArrowUp") event.shiftKey ? truckScene3DCamera(state, 0, cameraStep()) : orbitScene3DCamera(state, 0, 0.08);
            else if (event.key === "ArrowDown") event.shiftKey ? truckScene3DCamera(state, 0, -cameraStep()) : orbitScene3DCamera(state, 0, -0.08);
            else if (event.key === "+" || event.key === "=") dollyScene3DCamera(state, 0.82);
            else if (event.key === "-" || event.key === "_") dollyScene3DCamera(state, 1.22);
            else if (event.key === "Home") resetScene3DCamera(state);
            else if (event.key.toLowerCase() === "p") toggleScene3DProjection(state);
            else if (event.key === "]") { action("next", "keyboard"); return; }
            else if (event.key === "[") { action("previous", "keyboard"); return; }
            else handled = false;
            if (handled) { event.preventDefault(); repaint(); }
        });
        listen(canvas, "webglcontextlost", (event) => { event.preventDefault(); gl = null; showFallback("WebGL context was lost."); });
        listen(canvas, "webglcontextrestored", () => { gl = null; repaint(); });
        const ResizeObserverConstructor = container.ownerDocument?.defaultView?.ResizeObserver;
        const resizeObserver = typeof ResizeObserverConstructor === "function" ? new ResizeObserverConstructor(() => repaint()) : null;
        resizeObserver?.observe(surface);
        repaint();
        if (state.selection.focus) select(state.selection.focus, "restore");
        return () => {
            disposed = true;
            resizeObserver?.disconnect();
            for (const dispose of listeners.splice(0)) dispose();
        };
    });
    return () => { for (const dispose of disposers) dispose(); };
}
