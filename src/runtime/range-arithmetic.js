import {
    Integer,
    Rational,
    RationalInterval,
    RationalIntervalSet,
    checkRangeOperationResult,
    rangeAbsoluteValue,
    rangeAdd,
    rangeDivide,
    rangeIntegerPower,
    rangeMultiply,
    rangeNegate,
    rangeReciprocal,
    rangeSubtract,
} from "@ratmath/core";
import { rangeDiagnosticAction, rangeMathPolicy } from "./range-policy.js";

const text = (value) => ({ type: "string", value: String(value) });
const bool = (value) => value ? new Integer(1n) : null;
const sequence = (values) => ({ type: "sequence", values });
const map = (entries) => ({ type: "map", entries: new Map(entries) });

function portableValue(value) {
    if (value === null || value === undefined) return null;
    if (value instanceof Integer || value instanceof Rational ||
        value instanceof RationalInterval || value instanceof RationalIntervalSet) return value;
    if (typeof value === "bigint") return new Integer(value);
    if (typeof value === "number" && Number.isSafeInteger(value)) return new Integer(BigInt(value));
    if (typeof value === "string") return text(value);
    if (typeof value === "boolean") return bool(value);
    if (Array.isArray(value)) return sequence(value.map(portableValue));
    if (typeof value === "object") {
        return map(Object.entries(value).map(([key, entry]) => [key, portableValue(entry)]));
    }
    return text(value);
}

function exclusionMap(exclusion) {
    return map([
        ["reason", text(exclusion.reason)],
        ["operand", new Integer(BigInt(exclusion.operand))],
        ["excludedSet", exclusion.excludedSet],
    ]);
}

function evidenceMap(record, check, diagnostics) {
    const domainEntries = [
        ["coverage", text(record.domain.coverage)],
        ["exclusions", sequence(record.domain.exclusions.map(exclusionMap))],
    ];
    if (record.domain.definedInput) domainEntries.push(["definedInput", record.domain.definedInput]);
    return map([
        ["schema", text("rix.numerics.range-operation-result@1")],
        ["operation", text(record.operation)],
        ["operands", sequence([...record.operands])],
        ["parameters", portableValue(record.parameters)],
        ["range", new RationalIntervalSet(record.range)],
        ["domain", map(domainEntries)],
        ["certified", bool(check.accepted)],
        ["evidenceLevel", text(check.accepted ? "checkedEvidence" : "heuristic")],
        ["evidence", portableValue(record.evidence)],
        ["checker", portableValue(check)],
        ["diagnostics", sequence(diagnostics.map(text))],
    ]);
}

export function isRangeArithmeticOperand(value) {
    return value instanceof RationalIntervalSet || value instanceof RationalInterval ||
        value instanceof Rational || value instanceof Integer;
}

function operationRecord(operation, args, policy) {
    switch (operation) {
        case "add": return rangeAdd(args[0], args[1]);
        case "subtract": return rangeSubtract(args[0], args[1]);
        case "multiply": return rangeMultiply(args[0], args[1]);
        case "divide": return rangeDivide(args[0], args[1]);
        case "negate": return rangeNegate(args[0]);
        case "absoluteValue": return rangeAbsoluteValue(args[0]);
        case "reciprocal": return rangeReciprocal(args[0]);
        case "integerPower": return rangeIntegerPower(args[0], args[1], {
            zeroPowerZero: policy.zeroPowerZero,
        });
        default: throw new Error(`Unknown exact range operation: ${operation}`);
    }
}

export function executeRangeOperation(operation, args, context) {
    const policy = rangeMathPolicy(context);
    const record = operationRecord(operation, args, policy);
    const check = checkRangeOperationResult(record, {
        operation,
        operands: record.operands,
        parameters: record.parameters,
    });
    if (!check.accepted) throw new Error(`Exact range checker rejected ${operation}: ${check.reason}`);

    const diagnostics = record.domain.exclusions.map((entry) => entry.reason);
    if (record.domain.coverage !== "allDefined") diagnostics.push(record.domain.coverage);
    const metadata = evidenceMap(record, check, diagnostics);
    const result = new RationalIntervalSet(record.range);
    result._ext = new Map([["rangeEvidence", metadata]]);

    const throwing = diagnostics.find((category) =>
        rangeDiagnosticAction(policy, category) === "throw");
    if (throwing) {
        const error = new Error(`Range arithmetic ${operation} encountered ${throwing}`);
        error.rangeEvidence = metadata;
        throw error;
    }
    return result;
}

export function rangeEvidence(value) {
    return value?._ext instanceof Map ? value._ext.get("rangeEvidence") ?? null : null;
}
