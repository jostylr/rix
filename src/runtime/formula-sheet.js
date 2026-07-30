/**
 * Formula-backed RiX sheet model.
 *
 * Unlike Binding, this entity owns deferred formulas and evaluates them in
 * epochs. Reads during an epoch record dependencies and detect cycles instead
 * of falling back to the previously committed value.
 */

import { Integer, Rational } from "@ratmath/core";
import { createReactiveGraph } from "./reactive-graph.js";

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

function normalizeFormulaMatrix(value) {
    const rows = valuesOf(value, "FormulaSheet formulas");
    if (rows.length === 0) throw new Error("FormulaSheet requires at least one row");
    const matrix = rows.map((row, index) => valuesOf(row, `FormulaSheet row ${index + 1}`));
    const columns = matrix[0].length;
    if (columns === 0) throw new Error("FormulaSheet requires at least one column");
    if (!matrix.every((row) => row.length === columns)) {
        throw new Error("FormulaSheet rows must have equal lengths");
    }
    for (const [rowIndex, row] of matrix.entries()) {
        for (const [columnIndex, formula] of row.entries()) {
            if (!formula || formula.fn !== "DEFER") {
                throw new Error(
                    `FormulaSheet formula [${rowIndex + 1},${columnIndex + 1}] must use deferred syntax @{ ... }`,
                );
            }
        }
    }
    return matrix;
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
        ["RECALCULATE", method("Recalculate", ([target]) => target.recalculate())],
        ["SLOT", method("Slot", ([target, ...index]) => target.slot(index))],
        ["GRAPH", method("Graph", ([target]) => target.graph)],
        ["_mutable", new Integer(1n)],
    ]);
}

function publicSlot(slot, index) {
    return Object.freeze({
        id: slot.id,
        index: Object.freeze([...index]),
        source: slot.source,
        formula: slot.formula,
        value: slot.value,
        lastGoodValue: slot.lastGoodValue,
        state: slot.state,
        dependencies: Object.freeze([...slot.dependencies].map(keyFromNodeName)),
        diagnostics: Object.freeze([...slot.diagnostics]),
        view: Object.freeze({}),
    });
}

export function isFormulaSheet(value) {
    return Boolean(value && value.type === "formula_sheet" && Array.isArray(value.shape));
}

/**
 * Create a rank-2 formula sheet.
 *
 * options.runFormula(formula, bindings) evaluates one deferred formula inside
 * the caller-provided isolated RiX context.
 */
export function createFormulaSheet(formulasValue, options = {}) {
    const formulas = normalizeFormulaMatrix(formulasValue);
    if (typeof options.runFormula !== "function") {
        throw new Error("FormulaSheet requires a deferred formula evaluator");
    }
    const shape = Object.freeze([formulas.length, formulas[0].length]);
    const channel = new Set();
    const graph = createReactiveGraph({
        id: options.id ? `${options.id}:graph` : undefined,
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
        id: options.id || "formula-sheet",
        shape,
        rank: shape.length,
        graph,
        get epoch() {
            return graph.epoch;
        },
        _ext: formulaSheetMethods(),
        get(index) {
            const normalized = normalizeIndex(index, shape);
            return graph.get(nodeNameFor(normalized));
        },
        getFormula(index) {
            return graph.node(nodeNameFor(normalizeIndex(index, shape))).formula;
        },
        setFormula(index, formula, metadata = null) {
            if (!formula || formula.fn !== "DEFER") {
                throw new Error("FormulaSheet.SetFormula requires deferred syntax @{ ... }");
            }
            const normalized = normalizeIndex(index, shape);
            graph.setFormula(nodeNameFor(normalized), formula, {
                ...metadata,
                source: metadata?.source ?? options.formulaSource?.(formula) ?? null,
                sheetCause: {
                    type: "formula:set",
                    index: Object.freeze(normalized),
                    formula,
                },
            });
            return sheet;
        },
        slot(index) {
            const normalized = normalizeIndex(index, shape);
            return publicSlot(graph.node(nodeNameFor(normalized)), normalized);
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

    for (let row = 1; row <= shape[0]; row += 1) {
        for (let column = 1; column <= shape[1]; column += 1) {
            const index = Object.freeze([row, column]);
            const formula = formulas[row - 1][column - 1];
            graph.addComputed(nodeNameFor(index), formula, {
                source: options.formulaSource?.(formula) ?? null,
                initialize: false,
                evaluator(slotFormula) {
                    return options.runFormula(
                        slotFormula,
                        Object.fromEntries([
                            ...graph.bindings(),
                            ["grid", sheet],
                            ["row", new Integer(BigInt(row))],
                            ["col", new Integer(BigInt(column))],
                            ["index", {
                                type: "tuple",
                                values: [new Integer(BigInt(row)), new Integer(BigInt(column))],
                            }],
                        ]),
                        {
                            reactiveGraph: graph,
                        },
                    );
                },
            });
        }
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
