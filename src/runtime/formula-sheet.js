/**
 * Formula-backed RiX sheet model.
 *
 * Unlike Binding, this entity owns deferred formulas and evaluates them in
 * epochs. Reads during an epoch record dependencies and detect cycles instead
 * of falling back to the previously committed value.
 */

import { Integer, Rational } from "@ratmath/core";

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

function keyFor(index) {
    return index.join(",");
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
        ["_mutable", new Integer(1n)],
    ]);
}

function publicSlot(slot) {
    return Object.freeze({
        id: slot.id,
        index: Object.freeze([...slot.index]),
        formula: slot.formula,
        value: slot.value,
        lastGoodValue: slot.lastGoodValue,
        state: slot.state,
        dependencies: Object.freeze([...slot.dependencies]),
        diagnostics: Object.freeze([...slot.diagnostics]),
        view: slot.view,
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
    const slots = new Map();
    for (let row = 1; row <= shape[0]; row += 1) {
        for (let column = 1; column <= shape[1]; column += 1) {
            const index = Object.freeze([row, column]);
            const key = keyFor(index);
            slots.set(key, {
                id: options.id ? `${options.id}:${key}` : `formula-slot:${key}`,
                index,
                formula: formulas[row - 1][column - 1],
                value: null,
                lastGoodValue: null,
                state: "dirty",
                dependencies: new Set(),
                diagnostics: [],
                view: Object.freeze({}),
            });
        }
    }

    let activeEpoch = null;
    const sheet = {
        type: "formula_sheet",
        id: options.id || "formula-sheet",
        shape,
        rank: shape.length,
        epoch: 0,
        _ext: formulaSheetMethods(),
        get(index) {
            const normalized = normalizeIndex(index, shape);
            const key = keyFor(normalized);
            if (activeEpoch) return activeEpoch.evaluate(key);
            const slot = slots.get(key);
            if (slot.state === "error") {
                throw new Error(slot.diagnostics[0] || `Formula ${addressFor(normalized)} has an error`);
            }
            return slot.value;
        },
        getFormula(index) {
            return slots.get(keyFor(normalizeIndex(index, shape))).formula;
        },
        setFormula(index, formula) {
            if (activeEpoch) {
                throw new Error("FormulaSheet formulas cannot change formulas during evaluation");
            }
            if (!formula || formula.fn !== "DEFER") {
                throw new Error("FormulaSheet.SetFormula requires deferred syntax @{ ... }");
            }
            const slot = slots.get(keyFor(normalizeIndex(index, shape)));
            slot.formula = formula;
            slot.state = "dirty";
            slot.diagnostics = [];
            sheet.recalculate();
            return sheet;
        },
        slot(index) {
            return publicSlot(slots.get(keyFor(normalizeIndex(index, shape))));
        },
        recalculate() {
            if (activeEpoch) {
                throw new Error("FormulaSheet formulas cannot start a nested recalculation");
            }
            const states = new Map([...slots].map(([key]) => [key, "dirty"]));
            const values = new Map();
            const dependencies = new Map([...slots].map(([key]) => [key, new Set()]));
            const stack = [];
            let currentKey = null;

            const epoch = {
                evaluate(key) {
                    if (!slots.has(key)) throw new Error(`Unknown formula slot: ${key}`);
                    if (currentKey && currentKey !== key) dependencies.get(currentKey).add(key);
                    if (states.get(key) === "clean") return values.get(key);
                    if (states.get(key) === "evaluating") {
                        const cycleStart = stack.indexOf(key);
                        const cycle = [...stack.slice(cycleStart), key]
                            .map((cycleKey) => addressFor(slots.get(cycleKey).index));
                        throw new Error(`Formula cycle: ${cycle.join(" -> ")}`);
                    }

                    states.set(key, "evaluating");
                    stack.push(key);
                    const previousKey = currentKey;
                    currentKey = key;
                    const slot = slots.get(key);
                    try {
                        const [row, column] = slot.index;
                        const value = options.runFormula(slot.formula, {
                            grid: sheet,
                            row: new Integer(BigInt(row)),
                            col: new Integer(BigInt(column)),
                            index: {
                                type: "tuple",
                                values: [new Integer(BigInt(row)), new Integer(BigInt(column))],
                            },
                        });
                        values.set(key, value);
                        states.set(key, "clean");
                        return value;
                    } finally {
                        currentKey = previousKey;
                        stack.pop();
                    }
                },
            };

            activeEpoch = epoch;
            try {
                for (const key of slots.keys()) epoch.evaluate(key);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                for (const [key, state] of states) {
                    const slot = slots.get(key);
                    slot.state = state === "evaluating" ? "error" : "dirty";
                    slot.diagnostics = state === "evaluating" ? [message] : [];
                }
                throw error;
            } finally {
                activeEpoch = null;
            }

            sheet.epoch += 1;
            for (const [key, slot] of slots) {
                slot.value = values.get(key);
                slot.lastGoodValue = values.get(key);
                slot.state = "clean";
                slot.dependencies = dependencies.get(key);
                slot.diagnostics = [];
            }
            return sheet;
        },
        toString() {
            return `[FormulaSheet ${shape.join("×")} · epoch ${sheet.epoch}]`;
        },
    };
    return sheet.recalculate();
}
