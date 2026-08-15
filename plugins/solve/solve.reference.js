/** Phase 1 exact linear-system classification and solving for symbolic specs. */

import { Integer, Rational } from "@ratmath/core";
import { getAttachedSpec, resolveSymbolicRoles } from "../../src/eval/functions/symbolic.js";
import { createShaped, forEachShapedCell } from "../../src/runtime/shaped.js";
import { entriesFor, field } from "../scene3d/scene3d.reference.js";
import { solveLinearValues } from "../linalg/linalg.reference.js";

export const SYSTEM_SOLUTION_SCHEMA = "rix.solve.system-result@1";

const int = (value) => new Integer(BigInt(value));
const str = (value) => ({ type: "string", value: String(value) });
const seq = (values) => ({ type: "sequence", values });
const map = (entries) => ({ type: "map", entries: new Map(entries) });
const zero = () => new Rational(0n, 1n);
const one = () => new Rational(1n, 1n);

function exact(value, label) {
    if (value instanceof Rational) return value;
    if (value instanceof Integer) return new Rational(value.value, 1n);
    throw new Error(`${label} must be an exact Integer or Rational`);
}

function addForms(left, right, sign = 1) {
    const coefficients = new Map(left.coefficients);
    for (const [name, value] of right.coefficients) {
        const contribution = sign === 1 ? value : value.negate();
        coefficients.set(name, (coefficients.get(name) || zero()).add(contribution));
        if (coefficients.get(name).numerator === 0n) coefficients.delete(name);
    }
    return {
        coefficients,
        constant: sign === 1 ? left.constant.add(right.constant) : left.constant.subtract(right.constant),
    };
}

function scaleForm(form, scalar) {
    return {
        coefficients: new Map(Array.from(form.coefficients, ([name, value]) => [name, value.multiply(scalar)])),
        constant: form.constant.multiply(scalar),
    };
}

function isScalarForm(form) {
    return form.coefficients.size === 0;
}

function literalValue(node) {
    if (node?.fn !== "LITERAL") return null;
    try {
        return new Rational(String(node.args[0]));
    } catch {
        return null;
    }
}

function linearForm(node, unknowns, constants) {
    if (!node?.fn) throw new Error("Unsupported empty symbolic expression");
    if (node.fn === "LITERAL") {
        const value = literalValue(node);
        if (!value) throw new Error(`Unsupported numeric literal '${node.args[0]}'`);
        return { coefficients: new Map(), constant: value };
    }
    if (node.fn === "RETRIEVE" || node.fn === "OUTER_RETRIEVE") {
        const name = node.args[0];
        if (unknowns.has(name)) return { coefficients: new Map([[name, one()]]), constant: zero() };
        if (constants.has(name)) return { coefficients: new Map(), constant: constants.get(name) };
        throw new Error(`Linear system needs an exact value for '${name}'`);
    }
    if (node.fn === "NEG") return scaleForm(linearForm(node.args[0], unknowns, constants), new Rational(-1n, 1n));
    if (node.fn === "ADD") return addForms(linearForm(node.args[0], unknowns, constants), linearForm(node.args[1], unknowns, constants));
    if (node.fn === "SUB") return addForms(linearForm(node.args[0], unknowns, constants), linearForm(node.args[1], unknowns, constants), -1);
    if (node.fn === "MUL") {
        const left = linearForm(node.args[0], unknowns, constants);
        const right = linearForm(node.args[1], unknowns, constants);
        if (isScalarForm(left)) return scaleForm(right, left.constant);
        if (isScalarForm(right)) return scaleForm(left, right.constant);
        throw new Error("Nonlinear product found in a Phase 1 linear system");
    }
    if (node.fn === "DIV") {
        const numerator = linearForm(node.args[0], unknowns, constants);
        const denominator = linearForm(node.args[1], unknowns, constants);
        if (!isScalarForm(denominator) || denominator.constant.numerator === 0n) {
            throw new Error("Linear-system division requires a nonzero exact scalar denominator");
        }
        return scaleForm(numerator, denominator.constant.reciprocal());
    }
    if (node.fn === "POW") {
        const exponent = literalValue(node.args[1]);
        if (exponent?.denominator === 1n && exponent.numerator === 1n) return linearForm(node.args[0], unknowns, constants);
        if (exponent?.denominator === 1n && exponent.numerator === 0n) return { coefficients: new Map(), constant: one() };
        throw new Error("Nonlinear power found in a Phase 1 linear system");
    }
    throw new Error(`Unsupported symbolic operation '${node.fn}' in a Phase 1 linear system`);
}

function valuesMap(value) {
    if (value === null || value === undefined) return new Map();
    if (value?.type !== "map" || !(value.entries instanceof Map)) throw new Error("solve values must be a map");
    return new Map(Array.from(value.entries, ([name, entry]) => [String(name), exact(entry, `solve value '${name}'`)]));
}

function tensorVectorValues(value) {
    const result = [];
    forEachShapedCell(value, (entry) => result.push(entry));
    return result;
}

function systemResult(spec, roles, equations, linearResult) {
    const values = linearResult.particular ? tensorVectorValues(linearResult.particular) : [];
    const solution = linearResult.particular
        ? map(roles.outputs.map((name, index) => [name, values[index]]))
        : null;
    const result = {
        type: "system_solution",
        schema: SYSTEM_SOLUTION_SCHEMA,
        status: linearResult.status,
        classification: "linearEqualities",
        exact: true,
        spec,
        unknowns: seq(roles.outputs.map(str)),
        solution,
        solutionVector: linearResult.particular,
        equations,
        linearResult,
        _ext: new Map([["_type", str("SystemSolution")], ["immutable", int(1)]]),
    };
    result._ext.set("status", str(result.status));
    result._ext.set("classification", str(result.classification));
    result._ext.set("unknowns", result.unknowns);
    result._ext.set("solution", solution);
    result._ext.set("solutionVector", result.solutionVector);
    result._ext.set("solutionvector", result.solutionVector);
    result._ext.set("linearResult", linearResult);
    result._ext.set("linearresult", linearResult);
    result._ext.set("equations", int(equations));
    return result;
}

function defineConstants(spec, unknowns, constants) {
    let pending = spec.statements.filter((statement) => statement.kind === "define" && !unknowns.has(statement.target));
    let progressed = true;
    while (pending.length && progressed) {
        progressed = false;
        pending = pending.filter((statement) => {
            try {
                const form = linearForm(statement.expr, unknowns, constants);
                if (!isScalarForm(form)) return true;
                constants.set(statement.target, form.constant);
                progressed = true;
                return false;
            } catch {
                return true;
            }
        });
    }
    return pending;
}

export function classifySystem(args) {
    const spec = getAttachedSpec(args[0]);
    if (!spec) throw new Error("solve.Classify expects a symbolic specification");
    const operations = spec.statements.map((statement) => statement.kind === "define" ? "define" : statement.expr?.fn || "unknown");
    const hasInequality = operations.some((operation) => ["LT", "LTE", "GT", "GTE"].includes(operation));
    const hasEquality = operations.includes("EQ") || operations.includes("define");
    return map([
        ["kind", str(hasInequality ? "constrainedSystem" : hasEquality ? "equalitySystem" : "expression")],
        ["linearCandidate", hasInequality ? null : int(1)],
        ["operations", seq(operations.map(str))],
    ]);
}

export function solveSystem(args) {
    const entries = entriesFor(args, ["spec", "options"], "solve.System");
    const spec = getAttachedSpec(field(entries, "spec"));
    if (!spec) throw new Error("solve.System expects a symbolic specification");
    const resolved = resolveSymbolicRoles(spec, field(entries, "roles"));
    const outputs = resolved.outputs.length ? resolved.outputs : resolved.unassigned;
    if (outputs.length === 0) throw new Error("solve.System needs output roles or unassigned symbols to solve for");
    const roles = { ...resolved, outputs };
    const unknowns = new Set(outputs);
    const constants = valuesMap(field(entries, "values"));
    const unresolvedDefinitions = defineConstants(spec, unknowns, constants);
    const equations = [];

    for (const statement of spec.statements) {
        let equation = null;
        if (statement.kind === "define" && unknowns.has(statement.target)) {
            equation = {
                fn: "SUB",
                args: [{ fn: "RETRIEVE", args: [statement.target] }, statement.expr],
            };
        } else if (statement.kind === "constraint") {
            if (statement.expr?.fn !== "EQ") {
                throw new Error(`Phase 1 solve.System supports exact equalities, not '${statement.expr?.fn || "unknown"}'`);
            }
            equation = { fn: "SUB", args: [statement.expr.args[0], statement.expr.args[1]] };
        }
        if (equation) equations.push(linearForm(equation, unknowns, constants));
    }

    if (unresolvedDefinitions.length) {
        throw new Error(`Unresolved symbolic definitions: ${unresolvedDefinitions.map((statement) => statement.target).join(", ")}`);
    }
    if (equations.length === 0) throw new Error("solve.System found no equations");
    const matrixRows = equations.map((equation) => outputs.map((name) => equation.coefficients.get(name) || zero()));
    const bounds = equations.map((equation) => equation.constant.negate());
    const matrixValue = createShaped([matrixRows.length, outputs.length], matrixRows.flat());
    const vectorValue = createShaped([bounds.length], bounds);
    return systemResult(spec, roles, equations.length, solveLinearValues(matrixValue, vectorValue));
}

export function solveLinear(args) {
    const linearResult = solveLinearValues(args[0], args[1]);
    const result = {
        type: "system_solution",
        schema: SYSTEM_SOLUTION_SCHEMA,
        status: linearResult.status,
        classification: "linearMatrix",
        exact: true,
        solution: linearResult.particular,
        linearResult,
        _ext: new Map([["_type", str("SystemSolution")], ["immutable", int(1)]]),
    };
    result._ext.set("status", str(result.status));
    result._ext.set("classification", str(result.classification));
    result._ext.set("solution", result.solution);
    result._ext.set("linearResult", linearResult);
    result._ext.set("linearresult", linearResult);
    return result;
}

export const helpers = new Map([
    ["Classify", classifySystem],
    ["Linear", solveLinear],
    ["System", solveSystem],
]);
