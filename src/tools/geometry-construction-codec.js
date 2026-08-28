import { formatValueSource } from "../eval/format.js";

export const GEOMETRY_CONSTRUCTION_RECORD_SCHEMA = "rix.geometry.construction-record@1";
export const GEOMETRY_CONSTRUCTION_SOURCE_SCHEMA = "rix.geometry.construction-source@1";

function entries(value) {
    if (value instanceof Map) return value;
    if (value?.type === "map" && value.entries instanceof Map) return value.entries;
    return null;
}

function field(value, key) {
    const map = entries(value);
    if (map) return map.get(key) ?? map.get(key.toLowerCase()) ?? null;
    return value?.[key] ?? value?.[key.toLowerCase()] ?? null;
}

function sequence(value) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.values)) return value.values;
    if (Array.isArray(value?.elements)) return value.elements;
    return [];
}

function text(value) {
    if (typeof value === "string") return value;
    if (value?.type === "string" || value?.type === "symbol") return value.value;
    return value == null ? "" : String(value);
}

function sourceValue(value) {
    if (value?.type === "integer" && typeof value.value === "string") return value.value;
    if (value?.type === "rational" && value.numerator !== undefined) {
        return String(value.denominator) === "1"
            ? String(value.numerator)
            : `${value.numerator}/${value.denominator}`;
    }
    if (text(field(value, "schema")) === "rix.algebraic-real@1") {
        const coefficients = sequence(field(value, "coefficients"));
        const interval = field(value, "interval");
        const rootIndex = field(value, "rootIndex");
        if (coefficients.length && interval != null && rootIndex != null) {
            return `.ar.Root([${coefficients.map(sourceValue).join(",")}],${sourceValue(interval)},${sourceValue(rootIndex)})`;
        }
    }
    if (Array.isArray(value)) return `[${value.map(sourceValue).join(",")}]`;
    return formatValueSource(value);
}

function idSource(value) {
    if (value?.type === "symbol") return sourceValue(value);
    return JSON.stringify(text(value));
}

function pointSource(value, prefix) {
    const x = field(value, "x");
    const y = field(value, "y");
    if (x == null || y == null) return null;
    return `${prefix}Point(${sourceValue(x)},${sourceValue(y)})`;
}

function matrixSource(value) {
    const rows = sequence(value);
    if (!rows.length) return null;
    const normalized = rows.map((row) => sequence(row));
    if (normalized.some((row) => !row.length)) return null;
    return `[${normalized.map((row) => `[${row.map(sourceValue).join(",")}]`).join(",")}]`;
}

function transformSource(value, prefix) {
    const matrix = matrixSource(field(value, "matrix"));
    if (!matrix) return null;
    const kind = text(field(value, "transformKind"));
    return `${prefix}${kind === "projective" ? "Projective" : "Affine"}(${matrix})`;
}

function identifier(value, label) {
    const name = String(value ?? "");
    if (!/^[a-z][A-Za-z0-9_]*$/.test(name)) throw new Error(`${label} must be a lowercase RiX identifier`);
    return name;
}

export function validateGeometryConstructionRecord(record) {
    const diagnostics = [];
    if (text(field(record, "schema")) !== GEOMETRY_CONSTRUCTION_RECORD_SCHEMA) {
        diagnostics.push(Object.freeze({ code: "record-schema", message: `Expected ${GEOMETRY_CONSTRUCTION_RECORD_SCHEMA}` }));
    }
    const nodes = sequence(field(record, "nodes"));
    if (!field(record, "nodes") || (!Array.isArray(field(record, "nodes")) && !Array.isArray(field(record, "nodes")?.values))) {
        diagnostics.push(Object.freeze({ code: "record-nodes", message: "Construction record nodes must be an array" }));
    }
    const ids = new Set();
    for (const [index, node] of nodes.entries()) {
        const id = text(field(node, "id"));
        if (!id) diagnostics.push(Object.freeze({ code: "node-id", index, message: "Construction node requires an id" }));
        else if (ids.has(id)) diagnostics.push(Object.freeze({ code: "duplicate-id", id, index, message: `Duplicate construction id ${id}` }));
        for (const dependency of sequence(field(node, "dependsOn"))) {
            const dependencyId = text(dependency);
            if (!ids.has(dependencyId)) diagnostics.push(Object.freeze({ code: "forward-dependency", id, dependency: dependencyId, index, message: `${id || `Node ${index + 1}`} depends on missing or later node ${dependencyId}` }));
        }
        if (id) ids.add(id);
    }
    return Object.freeze({
        schema: "rix.geometry.construction-validation@1",
        valid: diagnostics.length === 0,
        diagnostics: Object.freeze(diagnostics),
        nodeCount: nodes.length,
    });
}

export function geometryConstructionRecordFromGraph(graph) {
    const schema = text(field(graph, "schema"));
    if (schema !== "rix.geometry.construction-graph@1") {
        throw new Error("Geometry construction source requires a construction graph or construction record");
    }
    return Object.freeze({
        schema: GEOMETRY_CONSTRUCTION_RECORD_SCHEMA,
        nodes: Object.freeze([...sequence(field(graph, "nodes"))]),
        history: Object.freeze([...sequence(field(graph, "history"))]),
        future: Object.freeze([...sequence(field(graph, "future"))]),
        deterministic: true,
    });
}

export function decodeGeometryConstructionRecord(input) {
    let record = input;
    try {
        if (typeof input === "string") record = JSON.parse(input);
    } catch (error) {
        return Object.freeze({
            schema: "rix.geometry.construction-validation@1",
            valid: false,
            record: null,
            diagnostics: Object.freeze([{ code: "record-json", message: error instanceof Error ? error.message : String(error) }]),
            nodeCount: 0,
        });
    }
    const validation = validateGeometryConstructionRecord(record);
    return Object.freeze({ ...validation, record: validation.valid ? record : null });
}

export function encodeGeometryConstructionSource(record, options = {}) {
    if (text(field(record, "schema")) === "rix.geometry.construction-graph@1") {
        record = geometryConstructionRecordFromGraph(record);
    }
    const validation = validateGeometryConstructionRecord(record);
    const graphName = identifier(options.graphName || "graph", "graphName");
    const aliases = options.aliases === true;
    const prefix = aliases ? "" : ".geometry.";
    const maxNodes = Number.isInteger(options.maxNodes) ? options.maxNodes : 1000;
    if (options.style !== undefined && options.style !== "assignments") throw new Error("Geometry construction source style must be assignments");
    if (maxNodes < 1 || maxNodes > 10000) throw new Error("Geometry construction maxNodes must be between 1 and 10000");

    const lines = [`${graphName} := ${prefix}ConstructionGraph([]);`];
    const unsupported = validation.diagnostics.map((diagnostic) => Object.freeze({
        id: diagnostic.id || null,
        reason: diagnostic.message,
    }));
    const nodeStatement = (node) => {
        const id = field(node, "id");
        const dependencies = sequence(field(node, "dependsOn"));
        const recipe = field(node, "recipe");
        const free = Boolean(field(node, "free"));
        const tool = text(field(recipe, "tool") || field(node, "kind"));
        const args = sequence(field(recipe, "arguments")).length
            ? sequence(field(recipe, "arguments"))
            : dependencies;
        const commonOptions = `{= id=${idSource(id)},maxNodes=${maxNodes} }`;
        let statement = null;

        if (free && (tool === "point" || text(field(field(node, "value"), "kind")) === "point")) {
            const target = field(recipe, "target") || field(node, "value");
            const point = pointSource(target, prefix);
            if (point) {
                const snap = field(recipe, "snap");
                const pointOptions = snap == null
                    ? commonOptions
                    : `{= id=${idSource(id)},snap=${sourceValue(snap)},maxNodes=${maxNodes} }`;
                statement = `${graphName} := ${prefix}AddPoint(${graphName},${point},${pointOptions});`;
            }
        } else if (["line", "circle", "intersection", "measurement"].includes(tool) && args.length === 2) {
            const constructor = { line: "AddLine", circle: "AddCircle", intersection: "AddIntersection", measurement: "AddMeasurement" }[tool];
            statement = `${graphName} := ${prefix}${constructor}(${graphName},${idSource(args[0])},${idSource(args[1])},${commonOptions});`;
        } else if (tool === "transform" && args.length === 1) {
            const transform = transformSource(field(recipe, "transform"), prefix);
            if (transform) statement = `${graphName} := ${prefix}AddTransform(${graphName},${idSource(args[0])},${transform},${commonOptions});`;
        }
        return statement;
    };
    const movementStatement = (event) => {
        const operation = text(field(event, "operation"));
        let statement = null;
        if (operation === "drag") {
            const target = pointSource(field(event, "to"), prefix);
            const snap = field(event, "snap");
            if (target) statement = `${graphName} := ${prefix}Drag(${graphName},${idSource(field(event, "id"))},${target},{= snap=${snap == null ? "_" : sourceValue(snap)} });`;
        } else if (operation === "drag_many") {
            const moves = sequence(field(event, "moves"));
            const moveSources = moves.map((move) => {
                const target = pointSource(field(move, "to"), prefix);
                return target ? `{= id=${idSource(field(move, "id"))},target=${target} }` : null;
            });
            if (moveSources.length && moveSources.every(Boolean)) {
                statement = `${graphName} := ${prefix}DragMany(${graphName},[${moveSources.join(",")}]);`;
            }
        } else if (operation === "constrained_drag") {
            const target = pointSource(field(event, "target") || field(event, "to"), prefix);
            const snap = field(event, "snap");
            if (target) statement = `${graphName} := ${prefix}ConstrainedDrag(${graphName},${idSource(field(event, "id"))},${target},{= constraint=${idSource(field(event, "constraint"))},mode=${idSource(field(event, "mode") || "project")},snap=${snap == null ? "_" : sourceValue(snap)} });`;
        }
        return statement;
    };

    if (validation.valid) for (const node of sequence(field(record, "nodes"))) {
        const idText = text(field(node, "id"));
        const statement = nodeStatement(node);
        if (statement) lines.push(statement);
        else unsupported.push(Object.freeze({ id: idText || null, reason: `Unsupported or incomplete construction recipe for ${idText || "unnamed node"}` }));
    }

    if (validation.valid) for (const event of sequence(field(record, "history"))) {
        const operation = text(field(event, "operation"));
        const statement = movementStatement(event);
        if (statement) lines.push(statement);
        else if (["drag", "drag_many", "constrained_drag"].includes(operation)) {
            unsupported.push(Object.freeze({ id: text(field(event, "id")) || null, reason: `Unsupported or incomplete ${operation} history event` }));
        }
    }

    const future = validation.valid ? sequence(field(record, "future")) : [];
    for (const event of [...future].reverse()) {
        const operation = text(field(event, "operation"));
        const statement = operation === "create"
            ? nodeStatement(field(event, "node"))
            : movementStatement(event);
        if (statement) lines.push(statement);
        else unsupported.push(Object.freeze({ id: text(field(event, "id")) || null, reason: `Unsupported or incomplete future ${operation || "construction"} event` }));
    }
    for (let index = 0; index < future.length; index += 1) {
        lines.push(`${graphName} := ${prefix}Undo(${graphName});`);
    }

    const encoded = Object.freeze({
        schema: GEOMETRY_CONSTRUCTION_SOURCE_SCHEMA,
        recordSchema: GEOMETRY_CONSTRUCTION_RECORD_SCHEMA,
        style: "assignments",
        aliases,
        source: lines.join("\n"),
        supported: unsupported.length === 0,
        unsupported: Object.freeze(unsupported),
    });
    if (options.includeWorkbench === true && encoded.supported) {
        return Object.freeze({ ...encoded, source: createGeometryAuthoringProgram(encoded.source, { ...options, graphName }) });
    }
    return encoded;
}

export const GeometryConstructionSource = encodeGeometryConstructionSource;

export function createGeometryAuthoringProgram(constructionSource, options = {}) {
    const graphName = identifier(options.graphName || "graph", "graphName");
    const namesPrefix = identifier(options.namesPrefix || "geometryboard", "namesPrefix");
    const bindingName = identifier(options.bindingName || `${namesPrefix}graph`, "bindingName");
    const viewName = `${namesPrefix}view`;
    const sizeName = `${namesPrefix}size`;
    const actionsName = `${namesPrefix}actions`;
    const outputName = `${namesPrefix}output`;
    const actionPrefix = String(options.actionPrefix || "geometry-author");
    const actionId = (name) => JSON.stringify(`${actionPrefix}-${name}`);
    const view = Array.isArray(options.view) ? options.view : [-5, -4, 5, 4];
    const size = Array.isArray(options.size) ? options.size : [720, 520];
    if (view.length !== 4 || size.length !== 2) throw new Error("Geometry authoring view and size must contain four and two entries");
    const viewSource = `[${view.map(sourceValue).join(",")}]`;
    const sizeSource = `[${size.map(sourceValue).join(",")}]`;
    const snap = options.snap === undefined ? "1/4" : sourceValue(options.snap);
    const maxNodes = Number.isInteger(options.maxNodes) ? options.maxNodes : 1000;
    return `${String(constructionSource).trim()}
$$${bindingName} := ${graphName};
${viewName} := ${viewSource}; ${sizeName} := ${sizeSource};
${actionsName} := [
  .Graphics.Action({= id=${actionId("point")},target=$$${bindingName},action=(current,position)->.geometry.AddPoint(current,.geometry.Point(position[1],position[2]),{= snap=${snap},maxNodes=${maxNodes} }),coordinateSystem={= view=${viewName},size=${sizeName} },children=[.Graphics.Rectangle([0,0],${sizeName},{= fill="transparent",stroke="none" })] }),
  .Graphics.Action({= id=${actionId("line")},target=$$${bindingName},action=(current,ids)->.geometry.AddLine(current,ids[1],ids[2],{= maxNodes=${maxNodes} }),children=[] }),
  .Graphics.Action({= id=${actionId("circle")},target=$$${bindingName},action=(current,ids)->.geometry.AddCircle(current,ids[1],ids[2],{= maxNodes=${maxNodes} }),children=[] }),
  .Graphics.Action({= id=${actionId("intersection")},target=$$${bindingName},action=(current,ids)->.geometry.AddIntersection(current,ids[1],ids[2],{= maxNodes=${maxNodes} }),children=[] }),
  .Graphics.Action({= id=${actionId("measurement")},target=$$${bindingName},action=(current,ids)->.geometry.AddMeasurement(current,ids[1],ids[2],{= maxNodes=${maxNodes} }),children=[] }),
  .Graphics.Action({= id=${actionId("transform")},target=$$${bindingName},action=(current,ids)->.geometry.AddTransform(current,ids[1],.geometry.Translate(1,1),{= maxNodes=${maxNodes} }),children=[] }),
  .Graphics.Action({= id=${actionId("constrained-move")},target=$$${bindingName},action=(current,position,ids)->.geometry.ConstrainedDrag(current,ids[1],.geometry.Point(position[1],position[2]),{= constraint=ids[2] }),coordinateSystem={= view=${viewName},size=${sizeName} },children=[] }),
  .Graphics.Action({= id=${actionId("undo")},target=$$${bindingName},action=current->.geometry.Undo(current),children=[] }),
  .Graphics.Action({= id=${actionId("redo")},target=$$${bindingName},action=current->.geometry.Redo(current),children=[] })
];
$$${outputName} := .geometry.AuthoringWorkbench($${bindingName},${actionsName},{= view=${viewName},size=${sizeName},snap=${snap},maxNodes=${maxNodes},actionPrefix=${JSON.stringify(actionPrefix)},transformLabel="Translate (1,1)" });
$${outputName};`;
}
