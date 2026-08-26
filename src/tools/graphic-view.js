/** Host-side pan, zoom, inspection, selection, drag, and action support for Graphics. */

const MIN_ZOOM = 1 / 8;
const MAX_ZOOM = 64;
const HIT_TOLERANCES = [4, 8, 16, 24];
let graphicViewSequence = 0;

function finiteNumber(value, fallback = 0) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "bigint") return Number(value);
    if (typeof value?.value === "bigint" || typeof value?.value === "number") return Number(value.value);
    if (typeof value?.numerator === "bigint" && typeof value?.denominator === "bigint") {
        return Number(value.numerator) / Number(value.denominator);
    }
    if (typeof value === "string" && /^[-+]?\d+\/\d+$/.test(value.trim())) {
        const [numerator, denominator] = value.split("/").map(Number);
        return denominator === 0 ? fallback : numerator / denominator;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

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
    if (value instanceof Map) return value.get(key) ?? value.get(String(key).toLowerCase()) ?? null;
    if (value?.type === "map" && value.entries instanceof Map) return mapField(value.entries, key);
    return value?.[key] ?? value?.[String(key).toLowerCase()] ?? null;
}

function semanticId(node, path) {
    return stringValue(mapField(node?.style, "hitId"))
        || stringValue(mapField(node?.style, "id"))
        || stringValue(mapField(node?.metadata, "id"))
        || node?.id
        || node?.targetId
        || path.replace(/[^A-Za-z0-9:_.-]+/g, "-");
}

function exactText(value, format) {
    try {
        return String(format(value));
    } catch {
        return String(value);
    }
}

function exactPoint(value, format) {
    const point = sequenceValue(value);
    return point.length >= 2 ? `(${exactText(point[0], format)}, ${exactText(point[1], format)})` : "(unknown)";
}

function nearestPoint(points, scenePoint) {
    if (!scenePoint || !points.length) return points[0] || null;
    let best = null;
    let bestDistance = Infinity;
    for (const point of points) {
        const values = sequenceValue(point);
        if (values.length < 2) continue;
        const dx = finiteNumber(values[0], Infinity) - scenePoint[0];
        const dy = finiteNumber(values[1], Infinity) - scenePoint[1];
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
            best = point;
            bestDistance = distance;
        }
    }
    return best;
}

function graphicNodeAnchor(node) {
    const point = (value) => {
        const values = sequenceValue(value);
        return values.length >= 2 ? [finiteNumber(values[0]), finiteNumber(values[1])] : null;
    };
    if (!node) return null;
    if (node.kind === "circle" || node.kind === "drag_point") return point(node.center);
    if (node.kind === "text_mark") return point(node.position);
    if (node.kind === "rectangle") {
        const origin = point(node.origin);
        const size = point(node.size);
        return origin && size ? [origin[0] + size[0] / 2, origin[1] + size[1] / 2] : null;
    }
    const points = sequenceValue(node.points).map(point).filter(Boolean);
    if (points.length) {
        return [
            points.reduce((sum, entry) => sum + entry[0], 0) / points.length,
            points.reduce((sum, entry) => sum + entry[1], 0) / points.length,
        ];
    }
    return null;
}

/** A deterministic exact-value description for one renderer-neutral scene node. */
export function describeGraphicNode(node, format = String, scenePoint = null) {
    if (!node) return "Graphic background";
    if (node.kind === "path") {
        if (node.commands) return `Path · ${node.commands.length} exact command${node.commands.length === 1 ? "" : "s"}`;
        const points = node.points || [];
        const nearest = nearestPoint(points, scenePoint);
        return `Path · ${points.length} exact point${points.length === 1 ? "" : "s"}${nearest ? ` · nearest ${exactPoint(nearest, format)}` : ""}`;
    }
    if (node.kind === "rectangle") return `Rectangle · exact origin ${exactPoint(node.origin, format)} · exact size ${exactPoint(node.size, format)}`;
    if (node.kind === "circle") return `Circle · exact center ${exactPoint(node.center, format)} · exact radius ${exactText(node.radius, format)}`;
    if (node.kind === "drag_point") return `${node.label || "Draggable point"} · exact position ${exactPoint(node.center, format)} · exact radius ${exactText(node.radius, format)}`;
    if (node.kind === "text_mark") return `Text “${exactText(node.text, format)}” · exact position ${exactPoint(node.position, format)}`;
    if (node.kind === "graphic_action") return `${node.label || "Graphic action"} · action ${node.id}`;
    if (node.kind === "group") return `Group · ${node.children.length} scene node${node.children.length === 1 ? "" : "s"}`;
    if (node.kind === "transform") return `Transform · ${node.children.length} scene node${node.children.length === 1 ? "" : "s"}`;
    if (node.kind === "clip") return `Clipped group · exact bounds ${node.bounds.map((value) => exactText(value, format)).join(", ")}`;
    return `Graphic ${node.kind || "object"}`;
}

function indexGraphicNodes(graphic) {
    const nodes = new Map();
    const visit = (node, path) => {
        if (!node || node.type !== "output") return;
        nodes.set(semanticId(node, path), node);
        for (const [index, child] of (node.children || []).entries()) visit(child, `${path}.${node.kind}[${index + 1}]`);
    };
    for (const [index, child] of (graphic?.children || []).entries()) visit(child, `graphic[${index + 1}]`);
    return nodes;
}

/** A stable catalog for direct, filtered semantic-object navigation. */
export function graphicSelectionCatalog(graphic, format = String) {
    const nodes = indexGraphicNodes(graphic);
    return Object.freeze([...nodes.entries()]
        .filter(([, node]) => node.kind === "drag_point" || node.kind === "graphic_action" || !(node.children || []).length)
        .map(([id, node]) => Object.freeze({
            id: String(id),
            role: String(node.kind || "object"),
            label: describeGraphicNode(node, format),
            anchor: graphicNodeAnchor(node),
        })));
}

/** Filter a semantic catalog without losing its retained deterministic order. */
export function filterGraphicSelectionCatalog(catalog, scope = "all", query = "") {
    const needle = String(query || "").trim().toLocaleLowerCase();
    return Object.freeze(Array.from(catalog || []).filter((entry) => (
        (scope === "all" || entry.role === scope)
        && (!needle || `${entry.id} ${entry.role} ${entry.label}`.toLocaleLowerCase().includes(needle))
    )));
}

/** Select the nearest retained object in a requested screen-space direction. */
export function graphicSpatialTarget(catalog, currentId, direction) {
    const vector = {
        left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1],
    }[direction];
    if (!vector) throw new Error("Graphic spatial navigation direction must be left, right, up, or down");
    const entries = Array.from(catalog || []).filter((entry) => Array.isArray(entry.anchor));
    if (!entries.length) return null;
    const current = entries.find((entry) => entry.id === currentId);
    if (!current) {
        return [...entries].sort((left, right) => (
            (left.anchor[0] * vector[0] + left.anchor[1] * vector[1])
            - (right.anchor[0] * vector[0] + right.anchor[1] * vector[1])
            || left.id.localeCompare(right.id)
        ))[0] || null;
    }
    return entries.filter((entry) => entry !== current).map((entry) => {
        const dx = entry.anchor[0] - current.anchor[0];
        const dy = entry.anchor[1] - current.anchor[1];
        const forward = dx * vector[0] + dy * vector[1];
        const sideways = Math.abs(dx * vector[1] - dy * vector[0]);
        return { entry, forward, score: forward + sideways * 4 };
    }).filter((candidate) => candidate.forward > 1e-9)
        .sort((left, right) => left.score - right.score || left.forward - right.forward || left.entry.id.localeCompare(right.entry.id))[0]?.entry || null;
}

function plotInspection(graphic, scenePoint, format) {
    const plot = mapField(graphic?.metadata, "plot");
    const frame = mapField(plot, "frame");
    const view = mapField(plot, "view");
    if (!plot || !frame || !view || !scenePoint) return null;
    const left = finiteNumber(mapField(frame, "left"));
    const right = finiteNumber(mapField(frame, "right"));
    const top = finiteNumber(mapField(frame, "top"));
    const bottom = finiteNumber(mapField(frame, "bottom"));
    if (!(right > left && bottom > top)) return null;
    const xmin = finiteNumber(mapField(view, "xmin"));
    const xmax = finiteNumber(mapField(view, "xmax"));
    const ymin = finiteNumber(mapField(view, "ymin"));
    const ymax = finiteNumber(mapField(view, "ymax"));
    const x = xmin + ((scenePoint[0] - left) / (right - left)) * (xmax - xmin);
    const y = ymax - ((scenePoint[1] - top) / (bottom - top)) * (ymax - ymin);
    const xScale = stringValue(mapField(graphic.metadata, "xScale")) || "linear";
    const yScale = stringValue(mapField(graphic.metadata, "yScale")) || "linear";
    const axisLabel = (axis, scale, value) => `${scale === "linear" ? axis : `${scale}(${axis})`} ≈ ${Number(value.toPrecision(7))}`;

    let nearest = null;
    let nearestDistance = Infinity;
    for (const series of sequenceValue(mapField(plot, "series"))) {
        const data = sequenceValue(mapField(series, "data"));
        const original = sequenceValue(mapField(series, "originalData"));
        for (let index = 0; index < data.length; index += 1) {
            const point = sequenceValue(data[index]);
            if (point.length < 2) continue;
            const sx = left + ((finiteNumber(point[0]) - xmin) / (xmax - xmin)) * (right - left);
            const sy = bottom - ((finiteNumber(point[1]) - ymin) / (ymax - ymin)) * (bottom - top);
            const distance = (sx - scenePoint[0]) ** 2 + (sy - scenePoint[1]) ** 2;
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearest = { point: original[index] || data[index], label: stringValue(mapField(series, "label")) };
            }
        }
    }
    const sample = nearest ? ` · nearest stored sample${nearest.label ? ` “${nearest.label}”` : ""} ${exactPoint(nearest.point, format)}` : "";
    return `${axisLabel("x", xScale, x)}, ${axisLabel("y", yScale, y)}${sample}`;
}

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

/** Create or normalize mutable host state conforming to rix.viewport@1 and rix.selection@1. */
export function createGraphicViewState(width, height, target = {}) {
    const resolvedWidth = finiteNumber(width, 1);
    const resolvedHeight = finiteNumber(height, 1);
    if (!(resolvedWidth > 0 && resolvedHeight > 0)) throw new Error("Graphic viewport dimensions must be positive");
    const previous = target.viewport;
    target.viewport = {
        schema: "rix.viewport@1",
        origin: Array.isArray(previous?.origin) ? [...previous.origin] : [0, 0],
        pan: Array.isArray(previous?.pan) ? [...previous.pan] : [0, 0],
        zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, finiteNumber(previous?.zoom, 1))),
        width: resolvedWidth,
        height: resolvedHeight,
    };
    const ids = Array.isArray(target.selection?.ids) ? [...new Set(target.selection.ids.map(String))] : [];
    target.selection = { schema: "rix.selection@1", ids, focus: target.selection?.focus ?? ids[0] ?? null };
    target.navigation = {
        schema: "rix.graphic-navigation@1",
        scope: typeof target.navigation?.scope === "string" ? target.navigation.scope : "all",
        query: typeof target.navigation?.query === "string" ? target.navigation.query : "",
        hitTolerance: HIT_TOLERANCES.includes(Number(target.navigation?.hitTolerance)) ? Number(target.navigation.hitTolerance) : 8,
    };
    return target;
}

export function graphicViewBox(state) {
    const viewport = state.viewport;
    return Object.freeze({
        x: viewport.origin[0] - viewport.pan[0] / viewport.zoom,
        y: viewport.origin[1] - viewport.pan[1] / viewport.zoom,
        width: viewport.width / viewport.zoom,
        height: viewport.height / viewport.zoom,
    });
}

/** Pan by logical screen-space pixels. Positive deltas move the content right/down. */
export function panGraphicViewport(state, deltaX, deltaY) {
    state.viewport.pan[0] += finiteNumber(deltaX);
    state.viewport.pan[1] += finiteNumber(deltaY);
    return state;
}

/** Zoom while keeping the scene point beneath a logical screen-space anchor fixed. */
export function zoomGraphicViewport(state, factor, anchor = null) {
    const viewport = state.viewport;
    const point = anchor || [viewport.width / 2, viewport.height / 2];
    const oldZoom = viewport.zoom;
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom * finiteNumber(factor, 1)));
    const sceneX = (point[0] - viewport.pan[0]) / oldZoom + viewport.origin[0];
    const sceneY = (point[1] - viewport.pan[1]) / oldZoom + viewport.origin[1];
    viewport.zoom = nextZoom;
    viewport.pan[0] = point[0] - (sceneX - viewport.origin[0]) * nextZoom;
    viewport.pan[1] = point[1] - (sceneY - viewport.origin[1]) * nextZoom;
    return state;
}

export function resetGraphicViewport(state) {
    state.viewport.origin = [0, 0];
    state.viewport.pan = [0, 0];
    state.viewport.zoom = 1;
    return state;
}

function gesturePointer(pointers, id) {
    return pointers.find((pointer) => String(pointer.id) === String(id));
}

/**
 * Apply one retained pointer update. One pointer pans; two pointers pan and
 * pinch around their previous midpoint. Pointer values are client pixels.
 */
export function updateGraphicGesture(state, previousPointers, nextPointers, rect) {
    const previous = Array.from(previousPointers || []);
    const next = Array.from(nextPointers || []);
    const width = Number(rect?.width);
    const height = Number(rect?.height);
    if (!(width > 0) || !(height > 0)) throw new Error("Graphic gesture requires non-empty bounds");
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
        const anchor = [
            (oldMidpoint[0] - Number(rect.left || 0)) / width * state.viewport.width,
            (oldMidpoint[1] - Number(rect.top || 0)) / height * state.viewport.height,
        ];
        if (oldDistance > 0 && newDistance > 0) zoomGraphicViewport(state, newDistance / oldDistance, anchor);
        panGraphicViewport(
            state,
            (newMidpoint[0] - oldMidpoint[0]) * state.viewport.width / width,
            (newMidpoint[1] - oldMidpoint[1]) * state.viewport.height / height,
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
    panGraphicViewport(state, deltaX * state.viewport.width / width, deltaY * state.viewport.height / height);
    return Object.freeze({ type: "pan", changed: deltaX !== 0 || deltaY !== 0 });
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

function geometryWorkbench(graphic) {
    const workbench = mapField(graphic?.metadata, "workbench");
    return stringValue(mapField(workbench, "schema")) === "rix.geometry.workbench@1" ? workbench : null;
}

function geometryHistory(state) {
    if (!state.geometryHistory) state.geometryHistory = { entries: [], cursor: 0 };
    return state.geometryHistory;
}

function recordGeometryEdit(state, targetId, before, after) {
    if (!Array.isArray(before) || !Array.isArray(after) || before.length !== 2 || after.length !== 2) return;
    if (before.every((value, index) => Number(value) === Number(after[index]))) return;
    const history = geometryHistory(state);
    history.entries.splice(history.cursor);
    history.entries.push(Object.freeze({
        targetId: String(targetId),
        before: Object.freeze(before.map(Number)),
        after: Object.freeze(after.map(Number)),
    }));
    history.cursor = history.entries.length;
}

function portableGeometryValue(value, format, seen = new Set()) {
    if (value === null || value === undefined) return null;
    if (["string", "number", "boolean"].includes(typeof value)) return value;
    if (typeof value === "bigint") return value.toString();
    if (seen.has(value)) return "[cycle]";
    if (Array.isArray(value)) {
        seen.add(value);
        const result = value.map((item) => portableGeometryValue(item, format, seen));
        seen.delete(value);
        return result;
    }
    if (value?.type === "integer") return { type: "integer", value: String(value.value) };
    if (value?.numerator !== undefined && value?.denominator !== undefined) {
        return { type: "rational", numerator: String(value.numerator), denominator: String(value.denominator) };
    }
    if (value?.type === "string" || value?.type === "symbol") return value.value;
    if (Array.isArray(value?.values) || Array.isArray(value?.elements)) {
        return sequenceValue(value).map((item) => portableGeometryValue(item, format, seen));
    }
    const entries = value instanceof Map ? value : value?.type === "map" && value.entries instanceof Map ? value.entries : null;
    if (entries) {
        seen.add(value);
        const result = {};
        for (const [key, item] of [...entries.entries()].sort(([left], [right]) => String(left).localeCompare(String(right)))) {
            if (typeof item === "function" || item?.type === "function") continue;
            result[String(key)] = portableGeometryValue(item, format, seen);
        }
        seen.delete(value);
        return result;
    }
    try {
        return String(format(value));
    } catch {
        return String(value);
    }
}

/** Deterministic JSON projection of a constructor-free geometry record. */
export function serializeGeometryConstructionRecord(record, format = String) {
    return JSON.stringify(portableGeometryValue(record, format), null, 2);
}

function installGeometryWorkbench(graphic, status, options, navigation, actionActivators = new Map()) {
    const workbench = geometryWorkbench(options.graphic);
    const document = graphic.ownerDocument;
    if (!workbench || !document?.createElement) return;
    const nodes = sequenceValue(mapField(workbench, "nodes"));
    const history = geometryHistory(options.state || (options.state = {}));
    const authoring = mapField(workbench, "authoring");
    const authoringEnabled = stringValue(mapField(authoring, "schema")) === "rix.geometry.authoring-policy@1";
    const availableTools = new Set(sequenceValue(mapField(authoring, "tools")).map((tool) => stringValue(tool)));
    const authoringSpecs = sequenceValue(mapField(authoring, "toolSpecs"));
    const specsByTool = new Map(authoringSpecs.map((spec) => [stringValue(mapField(spec, "tool")), spec]));
    let activeTool = "point";
    let selectedObjectIds = [];
    const toolButtons = new Map();
    const treeButtons = [];
    const panel = document.createElement("aside");
    panel.className = "rix-output-geometry-workbench";
    panel.setAttribute("aria-label", "Geometry construction workbench");

    const heading = document.createElement("h3");
    heading.textContent = "Construction";
    panel.append(heading);
    const controls = document.createElement("div");
    controls.className = "rix-output-geometry-controls";
    const undo = makeButton(document, "geometry-undo", "Undo last point movement", "Undo");
    const redo = makeButton(document, "geometry-redo", "Redo point movement", "Redo");
    const exportButton = makeButton(document, "geometry-export", "Export portable construction record", "Export");
    controls.append(undo, redo, exportButton);
    if (authoringEnabled) {
        const activateTool = (tool) => {
            activeTool = tool;
            selectedObjectIds = [];
            for (const candidate of treeButtons) candidate.setAttribute("aria-pressed", "false");
            for (const [name, button] of toolButtons) button.setAttribute("aria-pressed", name === tool ? "true" : "false");
            const spec = specsByTool.get(tool);
            const selectionKind = stringValue(mapField(spec, "selectionKind"));
            const label = stringValue(mapField(spec, "label")) || tool;
            if (selectionKind === "canvas") {
                const actionId = stringValue(mapField(spec, "actionId"));
                const surface = [...graphic.querySelectorAll("[data-rix-graphic-action]")]
                    .find((candidate) => candidate.dataset.rixGraphicAction === actionId);
                surface?.focus?.();
                if (status) status.textContent = "Point tool active. Click empty canvas space, or move the keyboard cursor with arrows and press Enter.";
            } else if (status) {
                const operands = sequenceValue(mapField(spec, "operandLabels")).map((item) => stringValue(item));
                status.textContent = `${label} tool active. Select ${operands[0] || "the first object"} in the construction tree.`;
            }
        };
        const authoringButtons = [];
        for (const tool of availableTools) {
            const spec = specsByTool.get(tool);
            if (!spec) continue;
            const label = stringValue(mapField(spec, "label")) || `${tool[0]?.toUpperCase() || ""}${tool.slice(1)}`;
            const selectionKinds = sequenceValue(mapField(spec, "selectionKinds")).map((kind) => stringValue(kind));
            const title = tool === "point"
                ? "Focus the exact free-point authoring surface"
                : `Create an exact ${label.toLowerCase()} from selected ${selectionKinds.join(" or ")} objects`;
            const button = makeButton(document, `geometry-${tool}-tool`, title, `${label} tool`);
            toolButtons.set(tool, button);
            button.addEventListener("click", () => activateTool(tool));
            authoringButtons.push(button);
        }
        controls.prepend(...authoringButtons);
        activateTool("point");
    }
    panel.append(controls);
    const exported = document.createElement("pre");
    exported.className = "rix-output-geometry-export";
    exported.hidden = true;
    panel.append(exported);

    const properties = document.createElement("output");
    properties.className = "rix-output-geometry-properties";
    properties.setAttribute("aria-live", "polite");
    properties.textContent = `${nodes.length} construction object${nodes.length === 1 ? "" : "s"}.`;
    const tree = document.createElement("ol");
    tree.className = "rix-output-geometry-tree";
    tree.setAttribute("role", "tree");
    for (const node of nodes) {
        const id = stringValue(mapField(node, "id")) || String(mapField(node, "id") ?? "object");
        const kind = stringValue(mapField(node, "kind")) || "value";
        const dependencies = sequenceValue(mapField(node, "dependsOn")).map((item) => stringValue(item) || String(item));
        const free = Boolean(mapField(node, "free"));
        const item = document.createElement("li");
        item.setAttribute("role", "treeitem");
        item.setAttribute("aria-level", "1");
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("aria-pressed", "false");
        button.dataset.rixGeometryObject = id;
        button.textContent = `${id} · ${kind} · ${free ? "free" : "derived"}`;
        const choose = (source = "workbench") => {
            navigation?.selectById(id, source);
            const statusValue = stringValue(mapField(node, "status"));
            const diagnostic = stringValue(mapField(node, "diagnostic"));
            const dependencyText = dependencies.length ? `depends on ${dependencies.join(", ")}` : "no dependencies";
            const exact = mapField(node, "value");
            properties.textContent = [id, kind, free ? "free" : "derived", dependencyText, statusValue, diagnostic, exact === null ? null : `exact ${exactText(exact, options.format || String)}`]
                .filter(Boolean).join(" · ");
            if (authoringEnabled && activeTool !== "point") {
                const spec = specsByTool.get(activeTool);
                const label = stringValue(mapField(spec, "label")) || activeTool;
                const acceptedKinds = sequenceValue(mapField(spec, "selectionKinds")).map((entry) => stringValue(entry));
                const operandLabels = sequenceValue(mapField(spec, "operandLabels")).map((entry) => stringValue(entry));
                const selectionCount = finiteNumber(mapField(spec, "selectionCount"), 0);
                if (!acceptedKinds.includes(kind)) {
                    if (status) status.textContent = `${label} tool requires ${acceptedKinds.join(" or ")} objects; ${id} is ${kind}.`;
                    return;
                }
                if (selectedObjectIds.includes(id)) {
                    selectedObjectIds = selectedObjectIds.filter((selected) => selected !== id);
                } else {
                    selectedObjectIds.push(id);
                }
                button.setAttribute("aria-pressed", selectedObjectIds.includes(id) ? "true" : "false");
                if (selectedObjectIds.length < selectionCount) {
                    const nextOperand = operandLabels[selectedObjectIds.length] || `object ${selectedObjectIds.length + 1}`;
                    if (status) status.textContent = selectedObjectIds.length
                        ? `${id} selected. Choose ${nextOperand} for the ${label.toLowerCase()} tool.`
                        : `${id} deselected. Choose ${operandLabels[0] || "the first object"} for the ${label.toLowerCase()} tool.`;
                    return;
                }
                const actionId = stringValue(mapField(spec, "actionId"));
                const selection = Object.freeze(selectedObjectIds.slice(0, selectionCount));
                selectedObjectIds = [];
                for (const candidate of treeButtons) candidate.setAttribute("aria-pressed", "false");
                actionActivators.get(actionId)?.(source, null, selection);
            }
        };
        button.addEventListener("click", () => choose());
        button.addEventListener("keydown", (event) => {
            const current = treeButtons.indexOf(button);
            let next = null;
            if (event.key === "ArrowDown") next = treeButtons[(current + 1) % treeButtons.length];
            else if (event.key === "ArrowUp") next = treeButtons[(current - 1 + treeButtons.length) % treeButtons.length];
            else if (event.key === "Home") next = treeButtons[0];
            else if (event.key === "End") next = treeButtons.at(-1);
            else if (event.key === "Enter" || event.key === " ") choose("keyboard");
            else return;
            event.preventDefault?.();
            next?.focus?.();
        });
        treeButtons.push(button);
        item.append(button);
        if (dependencies.length) {
            const dependency = document.createElement("small");
            dependency.textContent = ` ← ${dependencies.join(", ")}`;
            item.append(dependency);
        }
        tree.append(item);
    }
    panel.append(tree, properties);
    graphic.append(panel);

    const refreshHistory = () => {
        undo.disabled = authoringEnabled
            ? finiteNumber(mapField(workbench, "historyCount"), 0) === 0
            : history.cursor === 0;
        redo.disabled = authoringEnabled
            ? finiteNumber(mapField(workbench, "redoCount"), 0) === 0
            : history.cursor >= history.entries.length;
    };
    const replay = (direction) => {
        if (authoringEnabled) {
            const key = direction < 0 ? "undoActionId" : "redoActionId";
            const actionId = stringValue(mapField(authoring, key));
            actionActivators.get(actionId)?.(direction < 0 ? "undo" : "redo");
            return;
        }
        const entry = direction < 0 ? history.entries[history.cursor - 1] : history.entries[history.cursor];
        if (!entry || typeof options.onPosition !== "function") return;
        const nextCursor = history.cursor + direction;
        const detail = Object.freeze({
            type: "graphic:position",
            targetId: entry.targetId,
            position: direction < 0 ? entry.before : entry.after,
            source: direction < 0 ? "undo" : "redo",
        });
        const previousCursor = history.cursor;
        history.cursor = nextCursor;
        let result;
        try {
            result = options.onPosition(detail, null, graphic);
            if (result?.type === "error") throw new Error(result.text);
        } catch (error) {
            history.cursor = previousCursor;
            if (status) status.textContent = error instanceof Error ? error.message : String(error);
            return;
        }
        refreshHistory();
        if (status) status.textContent = direction < 0 ? "Point movement undone" : "Point movement redone";
        dispatchGraphicEvent(graphic, "rix-geometry-history", { direction, cursor: history.cursor, targetId: entry.targetId });
    };
    undo.addEventListener("click", () => replay(-1));
    redo.addEventListener("click", () => replay(1));
    exportButton.addEventListener("click", () => {
        const record = mapField(workbench, "construction");
        const text = serializeGeometryConstructionRecord(record, options.format || String);
        exported.textContent = text;
        exported.hidden = false;
        document.defaultView?.navigator?.clipboard?.writeText?.(text).catch?.(() => {});
        dispatchGraphicEvent(graphic, "rix-geometry-export", { schema: "rix.geometry.construction-record@1", record, text });
        if (status) status.textContent = "Portable construction record exported";
    });
    refreshHistory();
}

function closestSemantic(element, svg) {
    for (let current = element; current && current !== svg; current = current.parentElement) {
        if (current.dataset?.rixSemanticId) return current;
    }
    return null;
}

function interactiveElement(element, svg) {
    for (let current = element; current && current !== svg; current = current.parentElement) {
        if (current.dataset?.rixDragTarget || current.dataset?.rixGraphicAction) return current;
    }
    return null;
}

function makeButton(document, command, label, text) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.rixGraphicViewCommand = command;
    button.setAttribute("aria-label", label);
    button.title = label;
    button.textContent = text;
    return button;
}

function makeSelectControl(document, labelText, dataName) {
    const label = document.createElement("label");
    label.className = "rix-output-graphic-toolbar-select";
    const text = document.createElement("span");
    text.textContent = labelText;
    const select = document.createElement("select");
    select.dataset[dataName] = "true";
    select.setAttribute("aria-label", labelText);
    label.append(text, select);
    return { label, select };
}

function graphicPreferencesKey(graphic) {
    const metadata = graphic?.metadata;
    const plot = mapField(metadata, "plot");
    return stringValue(mapField(metadata, "preferencesKey")) || stringValue(mapField(plot, "preferencesKey"));
}

function graphicPreferencesStorage(graphic, options) {
    return options.storage || graphic.ownerDocument?.defaultView?.localStorage || null;
}

function loadGraphicPreferences(graphic, state, options) {
    const key = graphicPreferencesKey(options.graphic);
    const storage = key ? graphicPreferencesStorage(graphic, options) : null;
    if (!key || !storage || state.preferencesLoaded) return { key, storage };
    state.preferencesLoaded = true;
    try {
        const saved = JSON.parse(storage.getItem(`rix.graphics:${key}`) || "null");
        if (saved?.viewport) {
            state.viewport.pan = sequenceValue(saved.viewport.pan).slice(0, 2).map((value) => finiteNumber(value));
            if (state.viewport.pan.length !== 2) state.viewport.pan = [0, 0];
            state.viewport.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, finiteNumber(saved.viewport.zoom, 1)));
        }
        if (saved?.navigation) {
            state.navigation.scope = typeof saved.navigation.scope === "string" ? saved.navigation.scope : state.navigation.scope;
            state.navigation.query = typeof saved.navigation.query === "string" ? saved.navigation.query : state.navigation.query;
            if (HIT_TOLERANCES.includes(Number(saved.navigation.hitTolerance))) state.navigation.hitTolerance = Number(saved.navigation.hitTolerance);
        }
        if (typeof saved?.selection === "string") state.selection = { schema: "rix.selection@1", ids: [saved.selection], focus: saved.selection };
    } catch { /* invalid or unavailable storage is non-fatal */ }
    return { key, storage };
}

function installNavigation(graphic, svg, status, options) {
    if (typeof svg.addEventListener !== "function") return null;
    const width = finiteNumber(options.graphic?.size?.[0] ?? svg.getAttribute?.("width"), 1);
    const height = finiteNumber(options.graphic?.size?.[1] ?? svg.getAttribute?.("height"), 1);
    const state = createGraphicViewState(width, height, options.state || {});
    if (!options.state) options.state = state;
    const preferences = loadGraphicPreferences(graphic, state, options);
    const savePreferences = () => {
        if (!preferences.key || !preferences.storage) return;
        try {
            preferences.storage.setItem(`rix.graphics:${preferences.key}`, JSON.stringify({
                viewport: { pan: [...state.viewport.pan], zoom: state.viewport.zoom },
                selection: state.selection.focus,
                navigation: { ...state.navigation },
            }));
        } catch { /* unavailable storage is non-fatal */ }
    };
    const nodes = indexGraphicNodes(options.graphic);
    const document = graphic.ownerDocument;
    let inspector = graphic.querySelector?.(".rix-output-graphic-inspector") || null;
    let toolbar = graphic.querySelector?.(".rix-output-graphic-toolbar") || null;
    if (document?.createElement && !toolbar) {
        toolbar = document.createElement("div");
        toolbar.className = "rix-output-graphic-toolbar";
        toolbar.setAttribute("role", "toolbar");
        toolbar.setAttribute("aria-label", "Graphic view controls");
        for (const spec of [
            ["previous", "Select previous mathematical object", "← object"],
            ["next", "Select next mathematical object", "object →"],
            ["zoom-out", "Zoom out", "−"],
            ["zoom-in", "Zoom in", "+"],
            ["reset", "Reset pan and zoom", "Reset"],
        ]) toolbar.append(makeButton(document, ...spec));
        const scopeControl = makeSelectControl(document, "Object type", "rixGraphicSelectionScope");
        const objectControl = makeSelectControl(document, "Mathematical object", "rixGraphicObjectSelect");
        const searchLabel = document.createElement("label");
        searchLabel.className = "rix-output-graphic-toolbar-search";
        const searchText = document.createElement("span");
        searchText.textContent = "Find object";
        const search = document.createElement("input");
        search.type = "search";
        search.dataset.rixGraphicSearch = "true";
        search.setAttribute("aria-label", "Find mathematical object");
        searchLabel.append(searchText, search);
        const toleranceControl = makeSelectControl(document, "Hit area", "rixGraphicHitTolerance");
        for (const [value, label] of [[4, "Precise"], [8, "Standard"], [16, "Large"], [24, "Extra large"]]) {
            const option = document.createElement("option");
            option.value = String(value);
            option.textContent = label;
            toleranceControl.select.append(option);
        }
        toolbar.append(scopeControl.label, searchLabel, objectControl.label, toleranceControl.label);
        graphic.insertBefore?.(toolbar, svg);
    }
    if (document?.createElement && !inspector) {
        inspector = document.createElement("output");
        inspector.className = "rix-output-graphic-inspector";
        inspector.setAttribute("aria-live", "off");
        inspector.textContent = "Pointer coordinates and exact selected values appear here.";
        graphic.append?.(inspector);
    }

    const viewId = svg.id || `rix-graphic-${++graphicViewSequence}`;
    svg.id = viewId;
    if (inspector) inspector.id ||= `${viewId}-inspector`;
    if (status) status.id ||= `${viewId}-status`;
    const descriptions = [inspector?.id, status?.id].filter(Boolean).join(" ");
    if (descriptions) svg.setAttribute("aria-describedby", descriptions);
    svg.setAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight ArrowUp ArrowDown Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown + - Home [ ] /");
    toolbar?.setAttribute?.("aria-controls", viewId);

    const semanticElements = [...(svg.querySelectorAll?.("[data-rix-semantic-id]") || [])];
    const selectable = semanticElements.filter((element) => (
        element.dataset?.rixDragTarget
        || element.dataset?.rixGraphicAction
        || !element.querySelector?.("[data-rix-semantic-id]")
    ));
    const catalog = new Map(graphicSelectionCatalog(options.graphic, options.format || String).map((entry) => [entry.id, entry]));
    const scopeSelect = toolbar?.querySelector?.("[data-rix-graphic-selection-scope]") || null;
    const objectSelect = toolbar?.querySelector?.("[data-rix-graphic-object-select]") || null;
    const searchInput = toolbar?.querySelector?.("[data-rix-graphic-search]") || null;
    const toleranceSelect = toolbar?.querySelector?.("[data-rix-graphic-hit-tolerance]") || null;
    const scopedSelectable = () => selectable.filter((element) => {
        const scope = state.navigation.scope;
        const entry = catalog.get(element.dataset.rixSemanticId);
        const needle = state.navigation.query.trim().toLocaleLowerCase();
        return (scope === "all" || entry?.role === scope)
            && (!needle || `${entry?.id || ""} ${entry?.role || ""} ${entry?.label || ""}`.toLocaleLowerCase().includes(needle));
    });
    const appendOption = (select, value, text) => {
        if (!select || !document?.createElement) return;
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        select.append(option);
    };
    if (scopeSelect && !scopeSelect.options?.length) {
        appendOption(scopeSelect, "all", `All objects (${selectable.length})`);
        const roles = new Map();
        for (const element of selectable) {
            const role = catalog.get(element.dataset.rixSemanticId)?.role || "object";
            roles.set(role, (roles.get(role) || 0) + 1);
        }
        for (const [role, count] of [...roles.entries()].sort(([left], [right]) => left.localeCompare(right))) {
            appendOption(scopeSelect, role, `${role.replaceAll("_", " ")} (${count})`);
        }
        if (![...roles.keys(), "all"].includes(state.navigation.scope)) state.navigation.scope = "all";
        scopeSelect.value = state.navigation.scope;
    }
    if (searchInput) searchInput.value = state.navigation.query;
    if (toleranceSelect) toleranceSelect.value = String(state.navigation.hitTolerance);
    const refreshObjectOptions = () => {
        if (!objectSelect) return;
        objectSelect.replaceChildren?.();
        const values = scopedSelectable();
        if (!values.length) appendOption(objectSelect, "", "No objects in this type");
        for (const [index, element] of values.entries()) {
            const id = element.dataset.rixSemanticId;
            const entry = catalog.get(id);
            appendOption(objectSelect, id, `${index + 1}. ${entry?.label || id}`);
        }
        objectSelect.disabled = values.length === 0;
        if (values.some((element) => element.dataset.rixSemanticId === state.selection.focus)) {
            objectSelect.value = state.selection.focus;
        }
    };
    refreshObjectOptions();
    const viewBoxText = () => {
        const box = graphicViewBox(state);
        return `${box.x} ${box.y} ${box.width} ${box.height}`;
    };
    const applyViewport = () => {
        svg.setAttribute("viewBox", viewBoxText());
        graphic.dataset.rixGraphicZoom = String(state.viewport.zoom);
        if (inspector && !inspector.dataset.rixPointerActive) inspector.textContent = `Zoom ${Math.round(state.viewport.zoom * 100)}%`;
    };
    const announceViewport = (source) => {
        const detail = Object.freeze({ type: "graphic:viewport", viewport: {
            ...state.viewport,
            origin: Object.freeze([...state.viewport.origin]),
            pan: Object.freeze([...state.viewport.pan]),
        }, source });
        if (status) status.textContent = `Graphic view at ${Math.round(state.viewport.zoom * 100)}% zoom`;
        dispatchGraphicEvent(graphic, "rix-graphic-viewport", detail);
        options.onViewport?.(detail, graphic);
        savePreferences();
    };
    const clearClasses = (name) => semanticElements.forEach((element) => element.classList?.remove(name));
    const describe = (element, scenePoint = null) => {
        const node = nodes.get(element?.dataset?.rixSemanticId);
        return describeGraphicNode(node, options.format || String, scenePoint);
    };
    const setSelection = (element, source, scenePoint = null) => {
        clearClasses("rix-output-semantic-selected");
        const id = element?.dataset?.rixSemanticId || null;
        if (element) element.classList?.add("rix-output-semantic-selected");
        state.selection.ids = id ? [id] : [];
        state.selection.focus = id;
        if (objectSelect && scopedSelectable().some((candidate) => candidate.dataset.rixSemanticId === id)) objectSelect.value = id;
        for (const textObject of graphic.querySelectorAll?.("[data-rix-graphics-text-object]") || []) {
            textObject.toggleAttribute?.("aria-current", textObject.dataset.rixGraphicsTextObject === id);
        }
        const exact = element ? describe(element, scenePoint) : "Selection cleared";
        const plot = plotInspection(options.graphic, scenePoint, options.format || String);
        const message = plot ? `${exact} · ${plot}` : exact;
        if (inspector) inspector.textContent = message;
        if (status) status.textContent = message;
        const detail = Object.freeze({ type: "graphic:selection", selection: {
            schema: "rix.selection@1", ids: Object.freeze([...state.selection.ids]), focus: state.selection.focus,
        }, exact: message, source });
        dispatchGraphicEvent(graphic, "rix-graphic-selection", detail);
        options.onSelection?.(detail, element, graphic);
        savePreferences();
    };
    const cycleSelection = (step) => {
        const values = scopedSelectable();
        if (!values.length) return;
        const current = values.findIndex((element) => element.dataset.rixSemanticId === state.selection.focus);
        const next = current < 0 ? (step > 0 ? 0 : values.length - 1) : (current + step + values.length) % values.length;
        setSelection(values[next], "keyboard");
    };
    const spatialSelection = (direction) => {
        const entries = filterGraphicSelectionCatalog([...catalog.values()], state.navigation.scope, state.navigation.query);
        const target = graphicSpatialTarget(entries, state.selection.focus, direction);
        if (target) selectById(target.id, "spatial-keyboard");
    };
    const selectById = (id, source = "workbench", focus = true) => {
        const element = semanticElements.find((candidate) => candidate.dataset?.rixSemanticId === String(id));
        if (!element) return false;
        setSelection(element, source);
        if (focus) element.focus?.();
        return true;
    };
    for (const element of semanticElements) {
        if (state.selection.ids.includes(element.dataset.rixSemanticId)) element.classList?.add("rix-output-semantic-selected");
    }
    applyViewport();

    scopeSelect?.addEventListener?.("change", () => {
        state.navigation.scope = scopeSelect.value || "all";
        refreshObjectOptions();
        const count = scopedSelectable().length;
        if (status) status.textContent = `${count} ${state.navigation.scope === "all" ? "mathematical" : state.navigation.scope.replaceAll("_", " ")} object${count === 1 ? "" : "s"} available`;
        savePreferences();
    });
    searchInput?.addEventListener?.("input", () => {
        state.navigation.query = searchInput.value || "";
        refreshObjectOptions();
        const count = scopedSelectable().length;
        if (status) status.textContent = `${count} mathematical object${count === 1 ? "" : "s"} match “${state.navigation.query}”`;
        savePreferences();
    });
    toleranceSelect?.addEventListener?.("change", () => {
        state.navigation.hitTolerance = HIT_TOLERANCES.includes(Number(toleranceSelect.value)) ? Number(toleranceSelect.value) : 8;
        if (status) status.textContent = `Pointer hit area set to ${state.navigation.hitTolerance} pixels`;
        savePreferences();
    });
    objectSelect?.addEventListener?.("change", () => selectById(objectSelect.value, "keyboard", false));

    toolbar?.addEventListener?.("click", (event) => {
        const command = event.target?.dataset?.rixGraphicViewCommand;
        if (!command) return;
        if (command === "previous") return cycleSelection(-1);
        if (command === "next") return cycleSelection(1);
        if (command === "zoom-in") zoomGraphicViewport(state, 1.5);
        else if (command === "zoom-out") zoomGraphicViewport(state, 1 / 1.5);
        else if (command === "reset") resetGraphicViewport(state);
        applyViewport();
        announceViewport("keyboard");
    });

    const pointers = new Map();
    let gestureChanged = false;
    const pointerPoint = (event) => graphicPointFromClient(svg.getBoundingClientRect(), graphicViewBox(state), { x: event.clientX, y: event.clientY });
    svg.addEventListener("pointerdown", (event) => {
        if (interactiveElement(event.target, svg)) return;
        event.preventDefault?.();
        pointers.set(event.pointerId, {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            startX: event.clientX,
            startY: event.clientY,
            moved: false,
            target: closestSemantic(event.target, svg),
        });
        if (pointers.size > 1) {
            gestureChanged = true;
            for (const pointer of pointers.values()) pointer.moved = true;
        }
        svg.setPointerCapture?.(event.pointerId);
        svg.classList?.add("rix-output-svg-panning");
    });
    svg.addEventListener("pointermove", (event) => {
        if (pointers.has(event.pointerId)) {
            const previous = [...pointers.values()].map((pointer) => ({ ...pointer }));
            const pointer = pointers.get(event.pointerId);
            const dx = event.clientX - pointer.x;
            const dy = event.clientY - pointer.y;
            if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 3 || pointers.size > 1) pointer.moved = true;
            if (pointer.moved) {
                pointer.x = event.clientX;
                pointer.y = event.clientY;
                const result = updateGraphicGesture(state, previous, [...pointers.values()], svg.getBoundingClientRect());
                gestureChanged ||= result.changed;
                applyViewport();
                event.preventDefault?.();
            }
            return;
        }
        const scenePoint = pointerPoint(event);
        const element = closestSemantic(event.target, svg);
        clearClasses("rix-output-semantic-hover");
        element?.classList?.add("rix-output-semantic-hover");
        if (inspector) {
            inspector.dataset.rixPointerActive = "true";
            const object = element ? `${describe(element, scenePoint)} · ` : "";
            const plot = plotInspection(options.graphic, scenePoint, options.format || String);
            inspector.textContent = plot || `${object}pointer ≈ (${Number(scenePoint[0].toPrecision(7))}, ${Number(scenePoint[1].toPrecision(7))})`;
        }
    });
    const finishPointer = (event, cancelled = false) => {
        if (!pointers.has(event.pointerId)) return;
        const completed = pointers.get(event.pointerId);
        const wasOnlyPointer = pointers.size === 1;
        pointers.delete(event.pointerId);
        if (!pointers.size) svg.classList?.remove("rix-output-svg-panning");
        if (svg.hasPointerCapture?.(event.pointerId)) svg.releasePointerCapture(event.pointerId);
        if (!cancelled && wasOnlyPointer && !gestureChanged && !completed.moved) {
            let target = completed.target;
            if (!target) {
                const candidates = scopedSelectable().map((element) => {
                    const bounds = element.getBoundingClientRect?.();
                    if (!bounds) return null;
                    const dx = Math.max(bounds.left - event.clientX, 0, event.clientX - bounds.right);
                    const dy = Math.max(bounds.top - event.clientY, 0, event.clientY - bounds.bottom);
                    return { element, distance: Math.hypot(dx, dy) };
                }).filter(Boolean).sort((left, right) => left.distance - right.distance);
                if (candidates[0]?.distance <= state.navigation.hitTolerance) target = candidates[0].element;
            }
            setSelection(target, "pointer", pointerPoint(event));
        }
        if (!pointers.size) {
            if (!cancelled && (gestureChanged || completed.moved)) announceViewport("pointer");
            gestureChanged = false;
        }
    };
    svg.addEventListener("pointerup", (event) => finishPointer(event));
    svg.addEventListener("pointercancel", (event) => finishPointer(event, true));
    svg.addEventListener("pointerleave", () => {
        if (pointers.size) return;
        clearClasses("rix-output-semantic-hover");
        if (inspector) delete inspector.dataset.rixPointerActive;
    });
    let wheelAnnouncement = null;
    svg.addEventListener("wheel", (event) => {
        event.preventDefault?.();
        const rect = svg.getBoundingClientRect();
        const anchor = [
            (event.clientX - rect.left) / rect.width * state.viewport.width,
            (event.clientY - rect.top) / rect.height * state.viewport.height,
        ];
        zoomGraphicViewport(state, Math.exp(-finiteNumber(event.deltaY) * 0.002), anchor);
        applyViewport();
        clearTimeout(wheelAnnouncement);
        wheelAnnouncement = setTimeout(() => announceViewport("pointer"), 180);
    }, { passive: false });
    svg.addEventListener("dblclick", (event) => {
        if (interactiveElement(event.target, svg)) return;
        event.preventDefault?.();
        resetGraphicViewport(state);
        applyViewport();
        announceViewport("pointer");
    });
    svg.addEventListener("keydown", (event) => {
        if (event.defaultPrevented) return;
        if (event.key === "/" && searchInput) {
            event.preventDefault?.();
            searchInput.focus?.();
            return;
        }
        if (event.altKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
            event.preventDefault?.();
            spatialSelection(event.key.replace("Arrow", "").toLocaleLowerCase());
            return;
        }
        const amount = event.shiftKey ? 0.25 : 0.1;
        if (event.key === "ArrowLeft") panGraphicViewport(state, state.viewport.width * amount, 0);
        else if (event.key === "ArrowRight") panGraphicViewport(state, -state.viewport.width * amount, 0);
        else if (event.key === "ArrowUp") panGraphicViewport(state, 0, state.viewport.height * amount);
        else if (event.key === "ArrowDown") panGraphicViewport(state, 0, -state.viewport.height * amount);
        else if (["+", "=", "Add"].includes(event.key)) zoomGraphicViewport(state, 1.5);
        else if (["-", "_", "Subtract"].includes(event.key)) zoomGraphicViewport(state, 1 / 1.5);
        else if (event.key === "Home") resetGraphicViewport(state);
        else if (event.key === "[") {
            event.preventDefault?.();
            cycleSelection(event.shiftKey ? -10 : -1);
            return;
        } else if (event.key === "]") {
            event.preventDefault?.();
            cycleSelection(event.shiftKey ? 10 : 1);
            return;
        }
        else return;
        event.preventDefault?.();
        applyViewport();
        announceViewport("keyboard");
    });
    return Object.freeze({ selectById, cycleSelection, spatialSelection });
}

function enhanceGraphic(graphic, options) {
    if (graphic.dataset.rixGraphicEnhanced === "true") return;
    graphic.dataset.rixGraphicEnhanced = "true";
    const svg = graphic.querySelector("svg.rix-output-svg");
    let status = graphic.querySelector(".rix-output-graphic-status");
    const document = graphic.ownerDocument;
    if (!status && document?.createElement) {
        status = document.createElement("output");
        status.className = "rix-output-graphic-status";
        status.setAttribute("aria-live", "polite");
        status.textContent = "Graphic ready. Drag to pan, pinch to zoom, or use the toolbar and keyboard to explore.";
        graphic.append?.(status);
    }
    const handles = [...graphic.querySelectorAll("[data-rix-drag-target]")];
    const actions = [...graphic.querySelectorAll("[data-rix-graphic-action]")];
    if (!svg) return;

    const navigation = installNavigation(graphic, svg, status, options);
    const actionActivators = new Map();

    for (const action of actions) {
        if (typeof options.onAction !== "function") continue;
        const positioned = action.dataset.rixGraphicPositioned === "true";
        const current = () => String(action.dataset.rixPosition || "0,0").split(",").map(Number);
        const activate = (source, position = positioned ? current() : null, payload = null) => {
            const detail = Object.freeze({
                type: "graphic:action",
                actionId: action.dataset.rixGraphicAction,
                targetId: action.dataset.rixGraphicTarget,
                source,
                ...(positioned ? { position: Object.freeze(position.map(Number)) } : {}),
                ...(payload === null ? {} : { payload }),
            });
            try {
                const result = options.onAction(detail, action, graphic);
                if (result?.type === "error") throw new Error(result.text);
                if (status) status.textContent = `${action.getAttribute("aria-label") || "Scene action"} selected`;
                dispatchGraphicEvent(graphic, "rix-graphic-action", { ...detail, revision: result?.revision ?? null });
                options.onActionCommitted?.(detail, result, action, graphic);
            } catch (error) {
                if (status) status.textContent = error instanceof Error ? error.message : String(error);
            }
        };
        actionActivators.set(action.dataset.rixGraphicAction, activate);
        action.addEventListener("click", (event) => {
            event.preventDefault?.();
            event.stopPropagation?.();
            const position = positioned
                ? graphicPointFromClient(
                    svg.getBoundingClientRect(),
                    svg.viewBox?.baseVal || graphicViewBox(options.state),
                    { x: event.clientX, y: event.clientY },
                )
                : null;
            if (positioned) action.dataset.rixPosition = position.join(",");
            activate("pointer", position);
        });
        action.addEventListener("keydown", (event) => {
            if (positioned && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
                const delta = event.shiftKey ? 10 : 1;
                const position = current();
                if (event.key === "ArrowLeft") position[0] -= delta;
                else if (event.key === "ArrowRight") position[0] += delta;
                else if (event.key === "ArrowUp") position[1] -= delta;
                else position[1] += delta;
                const box = svg.viewBox?.baseVal || graphicViewBox(options.state);
                const next = [
                    Math.min(Math.max(position[0], box.x), box.x + box.width),
                    Math.min(Math.max(position[1], box.y), box.y + box.height),
                ];
                action.dataset.rixPosition = next.join(",");
                event.preventDefault?.();
                event.stopPropagation?.();
                if (status) status.textContent = `Point-tool cursor ${next.map((value) => Number(value.toFixed(2))).join(", ")}. Press Enter to create.`;
                return;
            }
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault?.();
            event.stopPropagation?.();
            activate("keyboard");
        });
    }
    installGeometryWorkbench(graphic, status, options, navigation, actionActivators);

    if (handles.length === 0 || typeof options.onPosition !== "function") return;

    const setPreview = (handle, position) => {
        handle.setAttribute("cx", String(position[0]));
        handle.setAttribute("cy", String(position[1]));
        handle.dataset.rixPosition = position.join(",");
        if (status) status.textContent = `${handle.getAttribute("aria-label") || "Point"}: ${position.map((value) => Number(value.toFixed(2))).join(", ")}`;
    };

    const commit = (handle, position, source, previous) => {
        const detail = pointDetail(handle, position, source);
        const workbenchEdit = geometryWorkbench(options.graphic) && source !== "undo" && source !== "redo";
        const history = workbenchEdit ? geometryHistory(options.state || (options.state = {})) : null;
        const historyBackup = history ? { entries: [...history.entries], cursor: history.cursor } : null;
        if (workbenchEdit) recordGeometryEdit(options.state, detail.targetId, previous, position);
        try {
            const result = options.onPosition(detail, handle, graphic);
            if (result?.type === "error") throw new Error(result.text);
            dispatchGraphicEvent(graphic, "rix-graphic-position", { ...detail, revision: result?.revision ?? null });
            options.onPositionCommitted?.(detail, result, handle, graphic);
            return true;
        } catch (error) {
            if (history && historyBackup) {
                history.entries.splice(0, history.entries.length, ...historyBackup.entries);
                history.cursor = historyBackup.cursor;
            }
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
            svg.viewBox?.baseVal || graphicViewBox(options.state),
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
            const box = svg.viewBox?.baseVal || graphicViewBox(options.state);
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
