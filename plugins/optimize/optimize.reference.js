/** Historical JavaScript Phase 1 optimizer retained only for parity reference. */

import { Integer, Rational } from "@ratmath/core";
import { entriesFor, field } from "../scene3d/scene3d.js";
import {
    exactMatrix,
    exactRational,
    exactVector,
    matrixTensor,
    vectorTensor,
} from "../linalg/linalg.js";

export const LINEAR_PROGRAM_SCHEMA = "rix.optimize.linear-program@1";
export const OPTIMIZATION_RESULT_SCHEMA = "rix.optimize.result@1";

const int = (value) => new Integer(BigInt(value));
const str = (value) => ({ type: "string", value: String(value) });
const seq = (values) => ({ type: "sequence", values });
const zero = () => new Rational(0n, 1n);
const one = () => new Rational(1n, 1n);

function exposed(value) {
    if (typeof value === "string") return str(value);
    if (typeof value === "number" && Number.isSafeInteger(value)) return int(value);
    if (typeof value === "boolean") return value ? int(1) : null;
    return value;
}

function text(value, fallback = null) {
    if (value?.type === "string") return value.value;
    if (typeof value === "string") return value;
    return fallback;
}

function integer(value, label, fallback) {
    if (value === null || value === undefined) return fallback;
    const result = value instanceof Integer ? Number(value.value)
        : value instanceof Rational && value.denominator === 1n ? Number(value.numerator)
            : Number.isSafeInteger(value) ? value : NaN;
    if (!Number.isSafeInteger(result)) throw new Error(`${label} must be an Integer`);
    return result;
}

function isZero(value) {
    return value.numerator === 0n;
}

function isPositive(value) {
    return value.numerator > 0n;
}

function isNegative(value) {
    return value.numerator < 0n;
}

function dot(left, right) {
    return left.reduce((sum, value, index) => sum.add(value.multiply(right[index])), zero());
}

function linearProgramValue(objective, matrix, bounds, sense, name = null) {
    const value = {
        type: "linear_program",
        schema: LINEAR_PROGRAM_SCHEMA,
        objective: vectorTensor(objective),
        A: matrixTensor(matrix),
        b: vectorTensor(bounds),
        sense,
        variableCount: objective.length,
        constraintCount: matrix.length,
        relation: "<=",
        nonnegative: true,
        name,
        exact: true,
        _ext: new Map([
            ["_type", str("LinearProgram")],
            ["immutable", int(1)],
            ["SOLVE", { type: "method_builtin", name: "Solve", impl: ([self, options]) => solveProgram([self, options]) }],
            ["EVALUATE", { type: "method_builtin", name: "Evaluate", impl: ([self, point]) => evaluateProgram([self, point]) }],
        ]),
    };
    for (const key of ["objective", "A", "b"]) value._ext.set(key, value[key]);
    value._ext.set("sense", str(sense));
    value._ext.set("name", name === null ? null : str(name));
    value._ext.set("variableCount", int(objective.length));
    value._ext.set("variablecount", int(objective.length));
    value._ext.set("constraintCount", int(matrix.length));
    value._ext.set("constraintcount", int(matrix.length));
    return Object.freeze(value);
}

export function createLinearProgram(args) {
    const entries = entriesFor(args, ["objective", "A", "b", "options"], "optimize.LinearProgram");
    const objective = exactVector(field(entries, "objective"), "Linear-program objective");
    const matrix = exactMatrix(field(entries, "A"), "Linear-program constraint matrix");
    const bounds = exactVector(field(entries, "b"), "Linear-program bounds");
    if (matrix[0].length !== objective.length) throw new Error("Linear-program objective length must equal the matrix column count");
    if (matrix.length !== bounds.length) throw new Error("Linear-program bounds length must equal the matrix row count");
    const sense = text(field(entries, "sense"), "max").toLowerCase();
    if (!['max', 'maximize', 'min', 'minimize'].includes(sense)) {
        throw new Error("Linear-program sense must be :max or :min");
    }
    const relation = text(field(entries, "relation"), "<=");
    if (relation !== "<=") throw new Error("Phase 1 linear programs require A*x <= b");
    return linearProgramValue(objective, matrix, bounds, sense.startsWith("min") ? "min" : "max", text(field(entries, "name")));
}

function requireProgram(value) {
    if (value?.type !== "linear_program" || value.schema !== LINEAR_PROGRAM_SCHEMA) {
        throw new Error("Expected an optimize LinearProgram");
    }
    return value;
}

function optimizationResult(program, fields) {
    const result = {
        type: "optimization_result",
        schema: OPTIMIZATION_RESULT_SCHEMA,
        program,
        method: "exactPrimalSimplex",
        exact: true,
        ...fields,
        _ext: new Map([["_type", str("OptimizationResult")], ["immutable", int(1)]]),
    };
    result._ext.set("program", program);
    result._ext.set("method", str(result.method));
    result._ext.set("exact", int(1));
    for (const [name, value] of Object.entries(fields)) {
        result._ext.set(name, exposed(value));
        result._ext.set(name.toLowerCase(), exposed(value));
    }
    return result;
}

function pivot(tableau, pivotRow, pivotColumn) {
    const pivotValue = tableau[pivotRow][pivotColumn];
    tableau[pivotRow] = tableau[pivotRow].map((value) => value.divide(pivotValue));
    for (let row = 0; row < tableau.length; row++) {
        if (row === pivotRow || isZero(tableau[row][pivotColumn])) continue;
        const factor = tableau[row][pivotColumn];
        tableau[row] = tableau[row].map((value, column) =>
            value.subtract(factor.multiply(tableau[pivotRow][column])));
    }
}

export function solveProgram(args) {
    const program = requireProgram(args[0]);
    const options = args[1]?.type === "map" ? args[1].entries : new Map();
    const maxIterations = integer(field(options, "maxIterations"), "Simplex maxIterations", 10000);
    if (maxIterations < 1) throw new Error("Simplex maxIterations must be positive");
    const objective = exactVector(program.objective);
    const matrix = exactMatrix(program.A);
    const bounds = exactVector(program.b);
    if (bounds.some(isNegative)) {
        throw new Error("Phase 1 simplex requires nonnegative b so x=0 is an initial feasible point");
    }

    const effectiveObjective = program.sense === "min" ? objective.map((value) => value.negate()) : objective;
    const variableCount = objective.length;
    const constraintCount = matrix.length;
    const totalColumns = variableCount + constraintCount;
    const tableau = matrix.map((row, rowIndex) => [
        ...row,
        ...Array.from({ length: constraintCount }, (_, column) => column === rowIndex ? one() : zero()),
        bounds[rowIndex],
    ]);
    tableau.push([
        ...effectiveObjective.map((value) => value.negate()),
        ...Array.from({ length: constraintCount }, () => zero()),
        zero(),
    ]);
    const basis = Array.from({ length: constraintCount }, (_, index) => variableCount + index);
    let iterations = 0;

    while (iterations < maxIterations) {
        const objectiveRow = tableau[constraintCount];
        const entering = objectiveRow.slice(0, totalColumns).findIndex(isNegative);
        if (entering < 0) break;
        let leaving = -1;
        let bestRatio = null;
        for (let row = 0; row < constraintCount; row++) {
            const coefficient = tableau[row][entering];
            if (!isPositive(coefficient)) continue;
            const ratio = tableau[row][totalColumns].divide(coefficient);
            if (bestRatio === null || ratio.compareTo(bestRatio) < 0
                || (ratio.compareTo(bestRatio) === 0 && basis[row] < basis[leaving])) {
                bestRatio = ratio;
                leaving = row;
            }
        }
        if (leaving < 0) {
            return optimizationResult(program, {
                status: "unbounded",
                solution: null,
                objectiveValue: null,
                iterations,
                enteringVariable: int(entering + 1),
                tableau: matrixTensor(tableau),
                diagnostics: seq([str("No leaving row exists for the selected improving direction")]),
            });
        }
        pivot(tableau, leaving, entering);
        basis[leaving] = entering;
        iterations += 1;
    }

    if (iterations >= maxIterations && tableau[constraintCount].slice(0, totalColumns).some(isNegative)) {
        return optimizationResult(program, {
            status: "iterationLimit",
            solution: null,
            objectiveValue: null,
            iterations,
            tableau: matrixTensor(tableau),
            diagnostics: seq([str("Simplex iteration limit reached")]),
        });
    }

    const solution = Array.from({ length: variableCount }, () => zero());
    basis.forEach((column, row) => {
        if (column < variableCount) solution[column] = tableau[row][totalColumns];
    });
    const slacks = bounds.map((bound, row) =>
        bound.subtract(matrix[row].reduce((sum, value, column) => sum.add(value.multiply(solution[column])), zero())));
    return optimizationResult(program, {
        status: "optimal",
        solution: vectorTensor(solution),
        objectiveValue: dot(objective, solution),
        slacks: vectorTensor(slacks),
        feasible: slacks.every((value) => !isNegative(value)),
        iterations,
        basis: seq(basis.map((column) => int(column + 1))),
        tableau: matrixTensor(tableau),
        diagnostics: seq([]),
    });
}

export function evaluateProgram(args) {
    const program = requireProgram(args[0]);
    const point = exactVector(args[1], "Linear-program point");
    if (point.length !== program.variableCount) throw new Error("Point dimension does not match the LinearProgram");
    const matrix = exactMatrix(program.A);
    const bounds = exactVector(program.b);
    const lhs = matrix.map((row) => dot(row, point));
    const feasible = point.every((value) => !isNegative(value))
        && lhs.every((value, row) => value.compareTo(bounds[row]) <= 0);
    return {
        type: "optimization_evaluation",
        objectiveValue: dot(exactVector(program.objective), point),
        feasible,
        lhs: vectorTensor(lhs),
        slacks: vectorTensor(bounds.map((bound, row) => bound.subtract(lhs[row]))),
    };
}

function solveConvenience(args, sense) {
    const program = createLinearProgram([...args.slice(0, 3), {
        type: "map",
        entries: new Map([["sense", str(sense)]])
    }]);
    return solveProgram([program, args[3]]);
}

export const helpers = new Map([
    ["LinearProgram", createLinearProgram],
    ["Solve", solveProgram],
    ["Evaluate", evaluateProgram],
    ["Maximize", (args) => solveConvenience(args, "max")],
    ["Minimize", (args) => solveConvenience(args, "min")],
]);
