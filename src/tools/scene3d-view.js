/** Host-side camera navigation, picking, and exact inspection for Scene3D outputs. */

import {
    createWebGLPlan,
    paintWebGLPlan,
    webGLPlanMatrix,
} from "../../plugins/render-webgl/webgl-plan.js";

const MIN_PITCH = -Math.PI / 2 + 0.015;
const MAX_PITCH = Math.PI / 2 - 0.015;
const PICK_TOLERANCES = [4, 8, 16, 24];
let scene3DViewSequence = 0;

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

function realizedScenePrimitives(scene) {
    return sequenceValue(mapField(mapField(scene, "realized"), "primitives"));
}

function scenePrimitiveByPickId(scene, pickId) {
    return realizedScenePrimitives(scene)
        .find((candidate) => stringValue(mapField(candidate, "pickid")) === String(pickId));
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
    target.navigation = {
        schema: "rix.scene3d-navigation@1",
        scope: typeof target.navigation?.scope === "string" ? target.navigation.scope : "all",
        query: typeof target.navigation?.query === "string" ? target.navigation.query : "",
        pickTolerance: PICK_TOLERANCES.includes(Number(target.navigation?.pickTolerance)) ? Number(target.navigation.pickTolerance) : 8,
    };
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

function gesturePointer(pointers, id) {
    return pointers.find((pointer) => String(pointer.id) === String(id));
}

function scene3DCameraStep(state) {
    return Math.max(state.bounds.radius, Math.hypot(...subtract(state.camera.position, state.camera.target))) * 0.06;
}

/**
 * Apply one retained Scene3D pointer update. A single pointer orbits (or trucks
 * when marked); two pointers truck their centroid and pinch-dolly the camera.
 */
export function updateScene3DGesture(state, previousPointers, nextPointers, rect) {
    const previous = Array.from(previousPointers || []);
    const next = Array.from(nextPointers || []);
    const width = Number(rect?.width);
    const height = Number(rect?.height);
    if (!(width > 0) || !(height > 0)) throw new Error("Scene3D gesture requires non-empty bounds");
    const common = previous.filter((pointer) => gesturePointer(next, pointer.id));
    if (!common.length) return Object.freeze({ type: "none", changed: false });
    if (common.length >= 2) {
        const before = common.slice(0, 2);
        const after = before.map((pointer) => gesturePointer(next, pointer.id));
        const midpoint = (points) => [
            (Number(points[0].x) + Number(points[1].x)) / 2,
            (Number(points[0].y) + Number(points[1].y)) / 2,
        ];
        const distance = (points) => Math.hypot(
            Number(points[1].x) - Number(points[0].x),
            Number(points[1].y) - Number(points[0].y),
        );
        const oldMidpoint = midpoint(before);
        const newMidpoint = midpoint(after);
        const oldDistance = distance(before);
        const newDistance = distance(after);
        if (oldDistance > 0 && newDistance > 0) dollyScene3DCamera(state, oldDistance / newDistance);
        const step = scene3DCameraStep(state) * 2 / Math.max(1, Math.min(width, height));
        truckScene3DCamera(
            state,
            -(newMidpoint[0] - oldMidpoint[0]) * step,
            (newMidpoint[1] - oldMidpoint[1]) * step,
        );
        return Object.freeze({
            type: "pinch",
            changed: oldDistance !== newDistance || oldMidpoint[0] !== newMidpoint[0] || oldMidpoint[1] !== newMidpoint[1],
        });
    }
    const before = common[0];
    const after = gesturePointer(next, before.id);
    const deltaX = Number(after.x) - Number(before.x);
    const deltaY = Number(after.y) - Number(before.y);
    if (before.truck || after.truck) {
        const step = scene3DCameraStep(state) * 0.01;
        truckScene3DCamera(state, -deltaX * step, deltaY * step);
        return Object.freeze({ type: "truck", changed: deltaX !== 0 || deltaY !== 0 });
    }
    orbitScene3DCamera(state, -deltaX * 0.008, -deltaY * 0.008);
    return Object.freeze({ type: "orbit", changed: deltaX !== 0 || deltaY !== 0 });
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
    const primitive = scenePrimitiveByPickId(scene, pickId);
    if (!primitive) return pickId ? `Scene3D object ${pickId}` : "Scene3D background";
    const kind = stringValue(mapField(primitive, "kind")) || "object";
    const label = stringValue(mapField(primitive, "label")) || pickId;
    const points = sequenceValue(mapField(primitive, "points"));
    const coordinates = points.length <= 4
        ? points.map((point) => exactPoint(point, format)).join("; ")
        : `${points.slice(0, 3).map((point) => exactPoint(point, format)).join("; ")}; …`;
    return `${label} · ${kind} · ${points.length} exact world point${points.length === 1 ? "" : "s"}${coordinates ? ` · ${coordinates}` : ""}`;
}

/** Direct, exact semantic-object navigation records for a retained 3D scene. */
export function scene3DSelectionCatalog(scene, plan, format = String) {
    return Object.freeze(Object.keys(plan?.picking || {}).map((id) => {
        const primitive = scenePrimitiveByPickId(scene, id);
        const role = stringValue(mapField(primitive, "kind")) || plan.picking[id]?.kind || "object";
        return Object.freeze({
            id,
            role,
            label: describeScene3DSelection(scene, id, format),
        });
    }));
}

function annotationRectangle(screen, text, options) {
    const width = Math.min(options.maxWidth, Math.max(options.minWidth, String(text || "").length * options.characterWidth + 12));
    const height = options.height;
    return {
        left: screen[0] - width / 2,
        right: screen[0] + width / 2,
        top: screen[1] - height / 2,
        bottom: screen[1] + height / 2,
    };
}

function rectanglesOverlap(left, right, gap) {
    return !(
        left.right + gap <= right.left
        || right.right + gap <= left.left
        || left.bottom + gap <= right.top
        || right.bottom + gap <= left.top
    );
}

/** Deterministically displace projected annotations to reduce label overlap. */
export function layoutScene3DAnnotations(annotations, viewport, settings = {}) {
    const options = {
        characterWidth: Number(settings.characterWidth || 7),
        gap: Number(settings.gap || 4),
        height: Number(settings.height || 22),
        maxWidth: Number(settings.maxWidth || 160),
        minWidth: Number(settings.minWidth || 42),
        offset: Number(settings.offset || 30),
    };
    const width = Math.max(1, Number(viewport?.width) || 1);
    const height = Math.max(1, Number(viewport?.height) || 1);
    const candidates = [[0, 0], [0, -1], [0, 1], [1, 0], [-1, 0], [1, -1], [-1, -1], [1, 1], [-1, 1]];
    const occupied = [];
    return annotations.map((annotation) => {
        if (!annotation.visible || !annotation.screen) return Object.freeze({ ...annotation, displaced: false, crowded: false });
        const text = annotation.text || annotation.label || annotation.pickId || "annotation";
        let placement = null;
        for (const [horizontal, vertical] of candidates) {
            const screen = [
                Math.min(width, Math.max(0, annotation.screen[0] + horizontal * options.offset)),
                Math.min(height, Math.max(0, annotation.screen[1] + vertical * options.offset)),
            ];
            const rectangle = annotationRectangle(screen, text, options);
            if (!occupied.some((item) => rectanglesOverlap(rectangle, item, options.gap))) {
                placement = { screen, rectangle, displaced: horizontal !== 0 || vertical !== 0, crowded: false };
                break;
            }
        }
        if (!placement) {
            const screen = [...annotation.screen];
            placement = { screen, rectangle: annotationRectangle(screen, text, options), displaced: false, crowded: true };
        }
        occupied.push(placement.rectangle);
        return Object.freeze({ ...annotation, screen: placement.screen, displaced: placement.displaced, crowded: placement.crowded });
    });
}

/** Apply retained annotation occlusion policies against projected mesh depth. */
export function resolveScene3DAnnotationOcclusion(plan, matrix, annotations, epsilon = 0.00001) {
    const triangles = [];
    for (const call of plan?.drawCalls || []) {
        if (call.mode !== "triangles") continue;
        const points = call.positions.map((point) => projectScene3DPoint(matrix, point, plan.viewport));
        for (let index = 0; index + 2 < call.indices.length; index += 3) {
            const triangle = call.indices.slice(index, index + 3).map((item) => points[item]);
            if (triangle.some((item) => !item.screen)) continue;
            triangles.push({
                primitive: call.primitive,
                points: triangle.map((item) => item.screen),
                depth: triangle.reduce((sum, item) => sum + item.depth, 0) / 3,
            });
        }
    }
    return Object.freeze(Array.from(annotations || []).map((annotation) => {
        const policy = annotation.policy?.occlusion || "show";
        if (policy === "show" || !annotation.visible || !annotation.screen || annotation.depth === null) {
            return Object.freeze({ ...annotation, occluded: false });
        }
        const occluded = triangles.some((triangle) => (
            triangle.primitive !== annotation.primitive
            && triangle.depth < annotation.depth - Number(epsilon)
            && triangleContains(annotation.screen, ...triangle.points)
        ));
        return Object.freeze({
            ...annotation,
            occluded,
            visible: occluded && policy === "hide" ? false : annotation.visible,
        });
    }));
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

function scene3DPreferencesKey(scene) {
    return stringValue(mapField(mapField(scene, "metadata"), "preferencesKey"));
}

function loadScene3DPreferences(container, scene, state, options) {
    const key = scene3DPreferencesKey(scene);
    const storage = options.storage || container.ownerDocument?.defaultView?.localStorage || null;
    if (!key || !storage || state.preferencesLoaded) return { key, storage };
    state.preferencesLoaded = true;
    try {
        const saved = JSON.parse(storage.getItem(`rix.scene3d:${key}`) || "null");
        if (saved?.camera && sequenceValue(saved.camera.position).length === 3 && sequenceValue(saved.camera.target).length === 3) {
            state.camera = cloneCamera({ ...state.camera, ...saved.camera });
            state.viewport.projection = state.camera.projection;
        }
        if (saved?.navigation) {
            state.navigation.scope = typeof saved.navigation.scope === "string" ? saved.navigation.scope : state.navigation.scope;
            state.navigation.query = typeof saved.navigation.query === "string" ? saved.navigation.query : state.navigation.query;
            if (PICK_TOLERANCES.includes(Number(saved.navigation.pickTolerance))) state.navigation.pickTolerance = Number(saved.navigation.pickTolerance);
        }
        if (typeof saved?.selection === "string") state.selection = { schema: "rix.selection@1", ids: [saved.selection], focus: saved.selection };
    } catch { /* invalid or unavailable storage is non-fatal */ }
    return { key, storage };
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
        const toolbar = container.querySelector?.(".rix-output-scene3d-toolbar");
        if (!canvas || !surface) return () => {};
        const plan = createWebGLPlan(scene, { width: 640, height: 480 });
        const state = createScene3DViewState(plan, options.state || {});
        const preferences = loadScene3DPreferences(container, scene, state, options);
        const savePreferences = () => {
            if (!preferences.key || !preferences.storage) return;
            try {
                preferences.storage.setItem(`rix.scene3d:${preferences.key}`, JSON.stringify({
                    camera: cloneCamera(state.camera),
                    selection: state.selection.focus,
                    navigation: { ...state.navigation },
                }));
            } catch { /* unavailable storage is non-fatal */ }
        };
        const catalog = scene3DSelectionCatalog(scene, plan, format);
        const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
        const document = container.ownerDocument;
        const makeSelect = (labelText, dataName) => {
            if (!document?.createElement) return null;
            const label = document.createElement("label");
            label.className = "rix-output-scene3d-toolbar-select";
            const text = document.createElement("span");
            text.textContent = labelText;
            const select = document.createElement("select");
            select.dataset[dataName] = "true";
            select.setAttribute("aria-label", labelText);
            label.append(text, select);
            toolbar?.append(label);
            return select;
        };
        const scopeSelect = toolbar?.querySelector?.("[data-rix-scene3d-selection-scope]")
            || makeSelect("Object type", "rixScene3dSelectionScope");
        const objectSelect = toolbar?.querySelector?.("[data-rix-scene3d-object-select]")
            || makeSelect("3D object", "rixScene3dObjectSelect");
        const searchInput = (() => {
            const existing = toolbar?.querySelector?.("[data-rix-scene3d-search]");
            if (existing || !document?.createElement) return existing;
            const label = document.createElement("label");
            label.className = "rix-output-scene3d-toolbar-search";
            const text = document.createElement("span");
            text.textContent = "Find object";
            const input = document.createElement("input");
            input.type = "search";
            input.dataset.rixScene3dSearch = "true";
            input.setAttribute("aria-label", "Find 3D object");
            label.append(text, input);
            toolbar?.append(label);
            return input;
        })();
        const toleranceSelect = toolbar?.querySelector?.("[data-rix-scene3d-pick-tolerance]")
            || makeSelect("Pick area", "rixScene3dPickTolerance");
        const appendOption = (select, value, text) => {
            if (!select || !document?.createElement) return;
            const option = document.createElement("option");
            option.value = value;
            option.textContent = text;
            select.append(option);
        };
        if (scopeSelect) {
            scopeSelect.replaceChildren?.();
            appendOption(scopeSelect, "all", `All objects (${catalog.length})`);
            const roles = new Map();
            for (const entry of catalog) roles.set(entry.role, (roles.get(entry.role) || 0) + 1);
            for (const [role, count] of [...roles.entries()].sort(([left], [right]) => left.localeCompare(right))) {
                appendOption(scopeSelect, role, `${role.replaceAll("_", " ")} (${count})`);
            }
            if (![...roles.keys(), "all"].includes(state.navigation.scope)) state.navigation.scope = "all";
            scopeSelect.value = state.navigation.scope;
        }
        if (searchInput) searchInput.value = state.navigation.query;
        if (toleranceSelect) {
            toleranceSelect.replaceChildren?.();
            for (const [value, label] of [[4, "Precise"], [8, "Standard"], [16, "Large"], [24, "Extra large"]]) appendOption(toleranceSelect, String(value), label);
            toleranceSelect.value = String(state.navigation.pickTolerance);
        }
        const scopedCatalog = () => {
            const needle = state.navigation.query.trim().toLocaleLowerCase();
            return catalog.filter((entry) => (
                (state.navigation.scope === "all" || entry.role === state.navigation.scope)
                && (!needle || `${entry.id} ${entry.role} ${entry.label}`.toLocaleLowerCase().includes(needle))
            ));
        };
        const refreshObjectOptions = () => {
            if (!objectSelect) return;
            objectSelect.replaceChildren?.();
            const entries = scopedCatalog();
            if (!entries.length) appendOption(objectSelect, "", "No objects in this type");
            for (const [index, entry] of entries.entries()) appendOption(objectSelect, entry.id, `${index + 1}. ${entry.label}`);
            objectSelect.disabled = entries.length === 0;
            if (entries.some((entry) => entry.id === state.selection.focus)) objectSelect.value = state.selection.focus;
        };
        refreshObjectOptions();
        const viewId = canvas.id || `rix-scene3d-${++scene3DViewSequence}`;
        canvas.id = viewId;
        if (inspector) inspector.id ||= `${viewId}-inspector`;
        if (status) status.id ||= `${viewId}-status`;
        inspector?.setAttribute?.("aria-live", "off");
        const descriptions = [inspector?.id, status?.id].filter(Boolean).join(" ");
        if (descriptions) canvas.setAttribute("aria-describedby", descriptions);
        canvas.setAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight ArrowUp ArrowDown + - Home P [ ] /");
        toolbar?.setAttribute?.("aria-controls", viewId);
        let gl = null;
        let matrix = null;
        const pointers = new Map();
        let gestureChanged = false;
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
            setStatus(exact);
            if (objectSelect && scopedCatalog().some((entry) => entry.id === pickId)) objectSelect.value = pickId;
            for (const annotation of overlay?.querySelectorAll?.("[data-rix-semantic-id]") || []) {
                annotation.toggleAttribute?.("aria-current", annotation.dataset.rixSemanticId === pickId);
            }
            const interaction = pickId ? plan.picking[pickId]?.interaction ?? null : null;
            const detail = Object.freeze({ type: "scene3d:selection", selection: { ...state.selection, ids: [...state.selection.ids] }, pickId, exact, interaction, source });
            options.onSelection?.(detail);
            dispatchSceneEvent(container, detail);
            savePreferences();
        };
        const renderAnnotations = (annotations, ratio) => {
            if (!overlay) return;
            overlay.hidden = false;
            overlay.replaceChildren?.();
            const logical = annotations.map((annotation) => ({
                ...annotation,
                screen: annotation.screen ? annotation.screen.map((coordinate) => coordinate / ratio) : null,
            }));
            for (const annotation of layoutScene3DAnnotations(logical, {
                width: plan.viewport.width / ratio,
                height: plan.viewport.height / ratio,
            })) {
                if (!annotation.visible || !annotation.screen) continue;
                const label = container.ownerDocument.createElement("button");
                label.type = "button";
                label.className = "rix-output-scene3d-annotation";
                label.textContent = annotation.text || annotation.label || annotation.pickId || "annotation";
                label.style.left = `${annotation.screen[0]}px`;
                label.style.top = `${annotation.screen[1]}px`;
                label.toggleAttribute("data-rix-annotation-displaced", annotation.displaced);
                label.toggleAttribute("data-rix-annotation-crowded", annotation.crowded);
                label.toggleAttribute("data-rix-annotation-occluded", annotation.occluded);
                if (annotation.occluded && annotation.policy?.occlusion === "fade") label.style.opacity = "0.28";
                if (annotation.pickId) {
                    label.dataset.rixSemanticId = annotation.pickId;
                    label.setAttribute("aria-label", catalogById.get(annotation.pickId)?.label || label.textContent);
                    label.toggleAttribute("aria-current", state.selection.focus === annotation.pickId);
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
            renderAnnotations(resolveScene3DAnnotationOcclusion(plan, matrix, result.annotations), ratio);
            setStatus(`${state.camera.projection} projection · drag to orbit · pinch to dolly and truck · Shift-drag to truck · wheel to dolly`);
            options.onViewport?.({ type: "scene3d:viewport", viewport: { ...state.viewport }, camera: cloneCamera(state.camera) });
            savePreferences();
        };
        const logicalPoint = (event) => {
            const rect = canvas.getBoundingClientRect();
            const ratioX = plan.viewport.width / Math.max(1, rect.width);
            const ratioY = plan.viewport.height / Math.max(1, rect.height);
            return [(event.clientX - rect.left) * ratioX, (event.clientY - rect.top) * ratioY];
        };
        const cameraStep = () => scene3DCameraStep(state);
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
                const ids = scopedCatalog().map((entry) => entry.id);
                if (ids.length) {
                    const current = ids.indexOf(state.selection.focus);
                    const delta = name === "next" ? 1 : -1;
                    select(ids[(current + delta + ids.length) % ids.length], source);
                }
                return;
            }
            repaint();
        };
        listen(scopeSelect, "change", () => {
            state.navigation.scope = scopeSelect.value || "all";
            refreshObjectOptions();
            const count = scopedCatalog().length;
            setStatus(`${count} ${state.navigation.scope === "all" ? "selectable" : state.navigation.scope.replaceAll("_", " ")} object${count === 1 ? "" : "s"} available`);
            savePreferences();
        });
        listen(searchInput, "input", () => {
            state.navigation.query = searchInput.value || "";
            refreshObjectOptions();
            const count = scopedCatalog().length;
            setStatus(`${count} 3D object${count === 1 ? "" : "s"} match “${state.navigation.query}”`);
            savePreferences();
        });
        listen(toleranceSelect, "change", () => {
            state.navigation.pickTolerance = PICK_TOLERANCES.includes(Number(toleranceSelect.value)) ? Number(toleranceSelect.value) : 8;
            setStatus(`3D pick area set to ${state.navigation.pickTolerance} pixels`);
            savePreferences();
        });
        listen(objectSelect, "change", () => select(objectSelect.value || null, "keyboard"));
        for (const button of container.querySelectorAll?.("[data-rix-scene3d-action]") || []) {
            listen(button, "click", (event) => {
                event.stopPropagation();
                action(button.dataset.rixScene3dAction);
            });
        }
        listen(canvas, "contextmenu", (event) => event.preventDefault());
        listen(canvas, "click", (event) => event.stopPropagation());
        listen(canvas, "pointerdown", (event) => {
            pointers.set(event.pointerId, {
                id: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                startX: event.clientX,
                startY: event.clientY,
                moved: false,
                truck: event.shiftKey || event.button === 2,
            });
            if (pointers.size > 1) {
                gestureChanged = true;
                for (const pointer of pointers.values()) pointer.moved = true;
            }
            canvas.setPointerCapture?.(event.pointerId);
            event.preventDefault();
        });
        listen(canvas, "pointermove", (event) => {
            if (!pointers.has(event.pointerId)) return;
            const previous = [...pointers.values()].map((pointer) => ({ ...pointer }));
            const pointer = pointers.get(event.pointerId);
            pointer.x = event.clientX;
            pointer.y = event.clientY;
            pointer.moved ||= Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 4 || pointers.size > 1;
            const result = updateScene3DGesture(state, previous, [...pointers.values()], canvas.getBoundingClientRect());
            gestureChanged ||= result.changed;
            repaint();
            event.preventDefault();
        });
        listen(canvas, "pointerup", (event) => {
            if (!pointers.has(event.pointerId)) return;
            const completed = pointers.get(event.pointerId);
            const wasOnlyPointer = pointers.size === 1;
            pointers.delete(event.pointerId);
            if (wasOnlyPointer && !gestureChanged && !completed.moved && matrix) {
                select(pickScene3DPlan(plan, matrix, logicalPoint(event), state.navigation.pickTolerance)?.pickId || null, "pointer");
            }
            if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture?.(event.pointerId);
            if (!pointers.size) gestureChanged = false;
        });
        listen(canvas, "pointercancel", (event) => {
            pointers.delete(event.pointerId);
            if (!pointers.size) gestureChanged = false;
        });
        listen(canvas, "wheel", (event) => {
            event.preventDefault();
            dollyScene3DCamera(state, Math.exp(Math.max(-500, Math.min(500, event.deltaY)) * 0.0015));
            repaint();
        }, { passive: false });
        listen(canvas, "dblclick", (event) => { event.preventDefault(); resetScene3DCamera(state); repaint(); });
        listen(canvas, "keydown", (event) => {
            let handled = true;
            if (event.key === "/" && searchInput) { event.preventDefault(); searchInput.focus?.(); return; }
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
