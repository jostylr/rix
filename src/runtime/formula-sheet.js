/**
 * Formula-backed RiX sheet model.
 *
 * Unlike Binding, this entity owns deferred formulas and evaluates them in
 * epochs. Reads during an epoch record dependencies and detect cycles instead
 * of falling back to the previously committed value.
 */

import { Integer, Rational } from "@ratmath/core";
import { createReactiveGraph } from "./reactive-graph.js";
import { forEachTensorCell, isTensor } from "./tensor.js";

let nextFormulaSheetId = 1;
export const FORMULA_SHEET_ASSIGNMENT_MODES = Object.freeze(["=", ":=", "~=", "::=", "~~="]);
const ASSIGNMENT_MODES = new Set(FORMULA_SHEET_ASSIGNMENT_MODES);

function text(value, label) {
    const result = value?.type === "string" ? value.value : typeof value === "string" ? value : null;
    if (result === null) throw new Error(`${label} must be a string`);
    return result;
}

function assignmentMode(value = ":=") {
    const mode = text(value, "FormulaSheet assignment mode");
    if (!ASSIGNMENT_MODES.has(mode)) {
        throw new Error(`Unsupported FormulaSheet assignment mode: ${mode}`);
    }
    return mode;
}

function formulaSheetId(value) {
    const id = text(value, "FormulaSheet id");
    if (id.trim().length === 0) throw new Error("FormulaSheet id must not be empty");
    return id;
}

function exactIndex(value, label = "Formula sheet index") {
    if (value instanceof Integer) return Number(value.value);
    if (value instanceof Rational && value.denominator === 1n) return Number(value.numerator);
    if (typeof value === "number" && Number.isInteger(value)) return value;
    if (typeof value === "bigint") return Number(value);
    throw new Error(`${label} must be an integer`);
}

function valuesOf(value, label) {
    if (Array.isArray(value)) return value;
    if (value && ["sequence", "tuple", "array"].includes(value.type)) {
        return value.values || value.elements || [];
    }
    throw new Error(`${label} must be an array, tuple, or sequence`);
}

function requireFormula(formula, index) {
    if (!formula || formula.fn !== "DEFER") {
        throw new Error(
            `FormulaSheet formula [${index.join(",")}] must use deferred syntax @{ ... }`,
        );
    }
    return formula;
}

function normalizeFormulaGrid(value) {
    if (isTensor(value)) {
        const shape = [...value.shape];
        if (shape.length === 0 || shape.some((length) => length === 0)) {
            throw new Error("FormulaSheet requires a non-empty tensor of rank 1 or greater");
        }
        const entries = [];
        forEachTensorCell(value, (formula, index) => {
            entries.push({
                index: Object.freeze([...index]),
                formula: requireFormula(formula, index),
            });
        });
        return { shape, entries };
    }

    const rows = valuesOf(value, "FormulaSheet formulas");
    if (rows.length === 0) throw new Error("FormulaSheet requires at least one row");
    const matrix = rows.map((row, index) => valuesOf(row, `FormulaSheet row ${index + 1}`));
    const columns = matrix[0].length;
    if (columns === 0) throw new Error("FormulaSheet requires at least one column");
    if (!matrix.every((row) => row.length === columns)) {
        throw new Error("FormulaSheet rows must have equal lengths");
    }
    const entries = [];
    for (const [rowIndex, row] of matrix.entries()) {
        for (const [columnIndex, formula] of row.entries()) {
            const index = Object.freeze([rowIndex + 1, columnIndex + 1]);
            entries.push({ index, formula: requireFormula(formula, index) });
        }
    }
    return { shape: [matrix.length, columns], entries };
}

function nodeNameFor(index) {
    return `slot_${index.join("_")}`;
}

function keyFromNodeName(name) {
    return String(name).replace(/^slot_/, "").replaceAll("_", ",");
}

function addressFor(index) {
    return `grid[${index.join(",")}]`;
}

function slotKey(index) {
    return index.join(",");
}

function slotIdFor(sheetId, index) {
    return `${sheetId}:slot:${index.join(":")}`;
}

function normalizeIndex(index, shape) {
    const values = Array.isArray(index)
        ? index
        : (index?.type === "tuple" || index?.type === "sequence")
            ? index.values
            : [index];
    if (values.length !== shape.length) {
        throw new Error(`FormulaSheet rank mismatch: expected ${shape.length} indices, got ${values.length}`);
    }
    return values.map((value, axis) => {
        const integer = exactIndex(value, `FormulaSheet axis ${axis + 1} index`);
        if (integer < 1 || integer > shape[axis]) {
            throw new Error(`FormulaSheet index ${integer} is out of range on axis ${axis + 1}`);
        }
        return integer;
    });
}

function method(name, impl) {
    return { type: "method_builtin", name, impl };
}

function formulaSheetMethods() {
    return new Map([
        ["GETFORMULA", method("GetFormula", ([target, ...index]) => target.getFormula(index))],
        ["SETFORMULA", method("SetFormula", ([target, ...args]) => {
            if (args.length < 2) throw new Error("FormulaSheet.SetFormula requires indices and a deferred formula");
            const formula = args.at(-1);
            return target.setFormula(args.slice(0, -1), formula);
        })],
        ["GETSOURCE", method("GetSource", ([target, ...index]) => target.getFormulaSource(index))],
        ["SETSOURCE", method("SetSource", ([target, ...args]) => {
            const rank = target.rank;
            if (args.length !== rank + 1 && args.length !== rank + 2) {
                throw new Error(`FormulaSheet.SetSource expects ${rank} indices, source, and optional assignment mode`);
            }
            const index = args.slice(0, rank);
            const source = args[rank];
            const mode = args[rank + 1] ?? ":=";
            return target.setFormulaSource(index, source, mode);
        })],
        ["GETASSIGNMENTMODE", method("GetAssignmentMode", ([target, ...index]) =>
            target.slot(index).assignmentMode)],
        ["RECALCULATE", method("Recalculate", ([target]) => target.recalculate())],
        ["SLOT", method("Slot", ([target, ...index]) => target.slot(index))],
        ["GRAPH", method("Graph", ([target]) => target.graph)],
        ["_mutable", new Integer(1n)],
    ]);
}

function publicSlot(slot, index, metadata) {
    return Object.freeze({
        id: metadata.id,
        reactiveId: slot.id,
        index: Object.freeze([...index]),
        source: metadata.source,
        assignmentMode: metadata.assignmentMode,
        formula: slot.formula,
        value: slot.value,
        lastGoodValue: slot.lastGoodValue,
        state: slot.state,
        dependencies: Object.freeze([...slot.dependencies].map(keyFromNodeName)),
        diagnostics: Object.freeze([...slot.diagnostics]),
        view: metadata.view,
    });
}

export function isFormulaSheet(value) {
    return Boolean(value && value.type === "formula_sheet" && Array.isArray(value.shape));
}

/**
 * Create a formula sheet from a tensor or a rank-2 nested array.
 *
 * options.runFormula(formula, bindings) evaluates one deferred formula inside
 * the caller-provided isolated RiX context.
 */
export function createFormulaSheet(formulasValue, options = {}) {
    const formulas = normalizeFormulaGrid(formulasValue);
    if (typeof options.runFormula !== "function") {
        throw new Error("FormulaSheet requires a deferred formula evaluator");
    }
    const shape = Object.freeze([...formulas.shape]);
    const id = options.id === null || options.id === undefined
        ? `formula-sheet-${nextFormulaSheetId++}`
        : formulaSheetId(options.id);
    const defaultAssignmentMode = assignmentMode(options.assignmentMode ?? ":=");
    const providedSlotMetadata = options.slotMetadata instanceof Map
        ? options.slotMetadata
        : new Map();
    const slotMetadata = new Map(formulas.entries.map(({ index, formula }) => {
        const provided = providedSlotMetadata.get(slotKey(index)) ?? {};
        const source = provided.source ?? options.formulaSource?.(formula) ?? null;
        const idForSlot = provided.id ?? slotIdFor(id, index);
        if (idForSlot !== slotIdFor(id, index)) {
            throw new Error(`FormulaSheet slot id must be ${slotIdFor(id, index)}`);
        }
        return [slotKey(index), {
            id: idForSlot,
            source,
            assignmentMode: assignmentMode(provided.assignmentMode ?? defaultAssignmentMode),
            view: Object.freeze({ ...(provided.view ?? {}) }),
        }];
    }));
    const channel = new Set();
    const graph = createReactiveGraph({
        id: `${id}:graph`,
        preserveIdentifierCase: true,
        formulaSource: options.formulaSource,
        evaluateFormula(formula) {
            return options.runFormula(
                formula,
                Object.fromEntries([...graph.bindings(), ["grid", sheet]]),
                { reactiveGraph: graph },
            );
        },
        cycleLabel: "Formula cycle",
        reservedNames: ["grid", "row", "col", "index"],
        reservedNameLabel: "FormulaSheet graph node name is reserved",
        labelForNode(name) {
            return addressFor(keyFromNodeName(name).split(","));
        },
        formulaMutationError: "FormulaSheet formulas cannot change formulas during evaluation",
        nestedEpochError: "FormulaSheet formulas cannot start a nested recalculation",
    });
    const sheet = {
        type: "formula_sheet",
        id,
        shape,
        rank: shape.length,
        documentView: Object.freeze({ ...(options.documentView ?? {}) }),
        graph,
        get epoch() {
            return graph.epoch;
        },
        _ext: formulaSheetMethods(),
        get(index) {
            const normalized = normalizeIndex(index, shape);
            return graph.get(nodeNameFor(normalized));
        },
        track() {
            for (const { index } of formulas.entries) {
                graph.get(nodeNameFor(index));
            }
            return sheet;
        },
        getFormula(index) {
            return graph.node(nodeNameFor(normalizeIndex(index, shape))).formula;
        },
        getFormulaSource(index) {
            const normalized = normalizeIndex(index, shape);
            return slotMetadata.get(slotKey(normalized)).source;
        },
        reactiveNode(index) {
            return graph.node(nodeNameFor(normalizeIndex(index, shape)));
        },
        setFormula(index, formula, metadata = null) {
            if (!formula || formula.fn !== "DEFER") {
                throw new Error("FormulaSheet.SetFormula requires deferred syntax @{ ... }");
            }
            const normalized = normalizeIndex(index, shape);
            const record = slotMetadata.get(slotKey(normalized));
            const previousSource = record.source;
            const previousMode = record.assignmentMode;
            const nextSource = metadata?.source ?? options.formulaSource?.(formula) ?? null;
            const nextMode = assignmentMode(metadata?.assignmentMode ?? record.assignmentMode);
            record.source = nextSource;
            record.assignmentMode = nextMode;
            try {
                graph.setFormula(nodeNameFor(normalized), formula, {
                    ...metadata,
                    source: nextSource,
                    assignmentMode: nextMode,
                    sheetCause: {
                        type: "formula:set",
                        index: Object.freeze(normalized),
                        formula,
                        assignmentMode: nextMode,
                    },
                });
            } catch (error) {
                if (graph.node(nodeNameFor(normalized)).formula !== formula) {
                    record.source = previousSource;
                    record.assignmentMode = previousMode;
                }
                throw error;
            }
            return sheet;
        },
        setFormulaSource(index, source, mode = ":=") {
            if (typeof options.compileFormula !== "function") {
                throw new Error("FormulaSheet source editing requires a formula compiler");
            }
            const normalized = normalizeIndex(index, shape);
            const authoritativeSource = text(source, "FormulaSheet formula source");
            const normalizedMode = assignmentMode(mode);
            const formula = options.compileFormula(authoritativeSource);
            return sheet.setFormula(normalized, formula, {
                source: authoritativeSource,
                assignmentMode: normalizedMode,
                sourceKind: "formula-source",
            });
        },
        slot(index) {
            const normalized = normalizeIndex(index, shape);
            return publicSlot(
                graph.node(nodeNameFor(normalized)),
                normalized,
                slotMetadata.get(slotKey(normalized)),
            );
        },
        recalculate(cause = null) {
            graph.recalculate(cause || { type: "formula:recalculate" });
            return sheet;
        },
        subscribe(listener) {
            if (typeof listener !== "function") throw new Error("FormulaSheet subscriber must be a function");
            channel.add(listener);
            return () => channel.delete(listener);
        },
        toString() {
            return `[FormulaSheet ${shape.join("×")} · epoch ${sheet.epoch}]`;
        },
    };

    for (const { index, formula } of formulas.entries) {
        const metadata = slotMetadata.get(slotKey(index));
        graph.addComputed(nodeNameFor(index), formula, {
                source: metadata.source,
                initialize: false,
                evaluator(slotFormula) {
                    const contextualBindings = [
                        ...graph.bindings(),
                        ["grid", sheet],
                        ["index", {
                            type: "tuple",
                            values: index.map((item) => new Integer(BigInt(item))),
                        }],
                    ];
                    if (index[0] !== undefined) {
                        contextualBindings.push(["row", new Integer(BigInt(index[0]))]);
                    }
                    if (index[1] !== undefined) {
                        contextualBindings.push(["col", new Integer(BigInt(index[1]))]);
                    }
                    return options.runFormula(
                        slotFormula,
                        Object.fromEntries(contextualBindings),
                        {
                            reactiveGraph: graph,
                        },
                    );
                },
            });
    }

    graph.subscribe((event) => {
        const metadata = event.cause?.metadata;
        const sheetCause = metadata?.sheetCause
            ? Object.freeze({ ...metadata.sheetCause, source: metadata.source, metadata })
            : event.cause;
        if (event.type === "reactive:error") {
            const formulaEvent = Object.freeze({
                type: "formula:error",
                sheet,
                epoch: sheet.epoch,
                cause: sheetCause,
                error: event.error,
            });
            for (const listener of [...channel]) listener(formulaEvent);
            return;
        }
        const changed = Object.freeze(event.changed
            .filter((name) => name.startsWith("slot_"))
            .map((name) => Object.freeze(keyFromNodeName(name).split(",").map(Number))));
        const formulaEvent = Object.freeze({
            type: "formula:commit",
            sheet,
            previousEpoch: event.previousEpoch,
            epoch: event.epoch,
            changed,
            reactiveChanged: event.changed,
            cause: sheetCause,
        });
        for (const listener of [...channel]) listener(formulaEvent);
    });

    graph.recalculate({ type: "formula:initial" });
    return sheet;
}
