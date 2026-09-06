import { hasScopedSymbols, hasExtendedConstants, expressionConstant, expressionOperation, expressionApplication, expressionVariable, expressionDefinition, expandExpression } from "./math-expression.js";
import { mathBudgets, mathBudgetRecord } from "./math-budgets.js";
import { createProviderEvaluation } from "./math-provider-eval.js";
import {
    Integer,
    Rational,
    RationalInterval,
    RationalIntervalSet,
    asRationalIntervalSet,
    rangeAbsoluteValue,
    rangeAdd,
    rangeDivide,
    rangeIntegerPower,
    rangeMultiply,
    rangeNegate,
    rangeSubtract,
} from "@ratmath/core";
import { rangeDiagnosticAction, rangeMathPolicy } from "./range-policy.js";

export const CALCULUS_GRAPH_RANGE_SCHEMA = "rix.numerics.calculus-graph-range@1";
export const CALCULUS_GRAPH_RANGE_CHECKER = "rix.runtime.calculus-graph-range-checker@1";
export const CALCULUS_GRAPH_SIMPLIFICATION_SCHEMA = "rix.calculus.graph-simplification@1";
export const CALCULUS_GRAPH_SIMPLIFICATION_CHECKER = "rix.runtime.calculus-graph-simplification-checker@1";
export const CALCULUS_GRAPH_REWRITE_SCHEMA = "rix.calculus.graph-rewrite@1";
export const CALCULUS_GRAPH_REWRITE_CHECKER = "rix.runtime.calculus-graph-rewrite-checker@1";
export const CALCULUS_DERIVATIVE_SIGN_SCHEMA = "rix.numerics.calculus-derivative-sign@1";
export const CALCULUS_LIPSCHITZ_RANGE_SCHEMA = "rix.numerics.calculus-lipschitz-range@1";
export const CALCULUS_TAYLOR_RANGE_SCHEMA = "rix.numerics.calculus-taylor-range@1";
export const CALCULUS_STRATEGY_RANGE_CHECKER = "rix.runtime.calculus-strategy-range-checker@1";

const text = (value) => ({ type: "string", value: String(value) });
const sequence = (values) => ({ type: "sequence", values });
const map = (entries) => ({
    type: "map",
    entries: new Map(entries.map(([key, value]) => [String(key).toLowerCase(), value])),
});

function mapValue(value, key) {
    if (value && typeof value === "object" && value.type !== "map" && !Array.isArray(value)) {
        if (Object.hasOwn(value, key)) return value[key];
        const lower = String(key).toLowerCase();
        for (const [candidate, entry] of Object.entries(value)) {
            if (candidate.toLowerCase() === lower) return entry;
        }
    }
    if (value?.type !== "map" || !(value.entries instanceof Map)) return undefined;
    const wanted = String(key);
    if (value.entries.has(wanted)) return value.entries.get(wanted);
    const lower = wanted.toLowerCase();
    if (value.entries.has(lower)) return value.entries.get(lower);
    for (const [candidate, entry] of value.entries) {
        if (String(candidate).toLowerCase() === lower) return entry;
    }
    return undefined;
}

function textValue(value) {
    if (typeof value === "string") return value;
    if (value?.type === "string") return value.value;
    return null;
}

function integerValue(value, fallback) {
    if (value instanceof Integer) return value.value;
    if (value instanceof Rational && value.denominator === 1n) return value.numerator;
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
    return fallback;
}

function isExpression(value) {
    if (hasExtendedConstants(value)) throw new Error("Extended mathematical constants require a provider-aware range consumer (not yet implemented)");
    return (value?.type === "map" || (value && typeof value === "object")) &&
        textValue(mapValue(value, "schema")) === "rix.calculus.expression@1";
}

function expressionKind(value) {
    return textValue(mapValue(value, "kind"));
}

function expressionChildren(value, key) {
    const children = mapValue(value, key);
    if (Array.isArray(children)) return children;
    if (!children || children.type !== "sequence" || !Array.isArray(children.values)) {
        throw new Error(`Calculus ${key} must be an Array`);
    }
    return children.values;
}

/** Deterministic identity compatible with Calculus.StructuralKey. */
export function calculusGraphStructuralKey(expression) {
    if (!isExpression(expression)) throw new Error("Expected a Calculus expression graph");
    const kind = expressionKind(expression);
    if (kind === "constant") return `constant(${String(mapValue(expression, "value"))})`;
    if (kind === "variable") return mapValue(expression,'symbolid') ? `scoped(${textValue(mapValue(expression,'symbolid'))})` : `variable(${textValue(mapValue(expression, "name"))})`;
    if (kind === "operator") {
        const operation = textValue(mapValue(expression, "operation"));
        const children = expressionChildren(expression, "operands")
            .map(calculusGraphStructuralKey).join(";");
        return `operator(${operation};${children})`;
    }
    if (kind === "apply") {
        const semanticId = textValue(mapValue(expression, "semanticid"));
        const children = expressionChildren(expression, "arguments")
            .map(calculusGraphStructuralKey).join(";");
        return `apply(${semanticId};${children})`;
    }
    throw new Error(`Unsupported Calculus expression kind ${String(kind)}`);
}

function exactRational(value) {
    if (value instanceof Rational) return value;
    if (value instanceof Integer) return new Rational(value.value);
    if (typeof value === "bigint" || typeof value === "string" ||
        (typeof value === "number" && Number.isSafeInteger(value))) return new Rational(value);
    return null;
}

function graphConstant(value) {
    const rational = exactRational(value);
    if (!rational) throw new Error("nonRationalGraphConstant");
    const exact = rational.denominator === 1n ? new Integer(rational.numerator) : rational;
    return map([['valueKind',text('calculusExpression')],['schema',text('rix.calculus.expression@1')],['kind',text('constant')],['value',exact]]);
}

function graphOperator(operation, operands) {
    return map([['valueKind',text('calculusExpression')],['schema',text('rix.calculus.expression@1')],['kind',text('operator')],['operation',text(operation)],['operands',sequence(operands)]]);
}

function coreGraph(node) {
    if (node?.type==='map' && node._ext) return node;
    const kind=expressionKind(node);
    if (kind==='variable') {
        if (mapValue(node,'symbolid')) throw new Error('Scoped graph identities require runtime symbol values');
        return expressionVariable(textValue(mapValue(node,'name')));
    }
    if (kind==='constant') return expressionConstant(mapValue(node,'value'));
    if (kind==='operator') return expressionOperation(textValue(mapValue(node,'operation')),expressionChildren(node,'operands').map(coreGraph));
    if (kind==='apply') return expressionApplication(textValue(mapValue(node,'semanticid')),textValue(mapValue(node,'name')),expressionChildren(node,'arguments').map(coreGraph));
    throw new Error('Unsupported calculus graph node');
}

function graphApplication(semanticId, name, argumentsValue) {
    return map([['valueKind',text('calculusExpression')],['schema',text('rix.calculus.expression@1')],['kind',text('apply')],['semanticId',text(semanticId)],['name',text(name ?? semanticId)],['arguments',sequence(argumentsValue)]]);
}

function simplificationRule(rule, path, source, expression) {
    return Object.freeze({
        rule,
        path: path.length === 0 ? "$" : `$.${path.join(".")}`,
        sourceGraph: calculusGraphStructuralKey(source),
        targetGraph: calculusGraphStructuralKey(expression),
    });
}

/**
 * Canonically simplify a Calculus graph using only identities that preserve
 * the defined-input set without assumptions.  In particular, this routine
 * never performs cancellation or replaces an evaluated operand with a
 * constant merely because the value would agree where that operand is
 * defined.
 */
export function simplifyCalculusGraph(expression) {
    if (!isExpression(expression)) throw new Error("Expected a Calculus expression graph");
    const rules = [];
    const visit = (node, path) => {
        const kind = expressionKind(node);
        if (kind === "constant" || kind === "variable") return node;
        if (kind === "apply") {
            return graphApplication(
                textValue(mapValue(node, "semanticid")),
                textValue(mapValue(node, "name")),
                expressionChildren(node, "arguments").map((child, index) =>
                    visit(child, [...path, `argument${index}`])),
            );
        }
        if (kind !== "operator") throw new Error(`unsupportedSimplificationGraphKind:${String(kind)}`);
        const operation = textValue(mapValue(node, "operation"));
        const originalOperands = expressionChildren(node, "operands");
        const operands = originalOperands.map((child, index) =>
            visit(child, [...path, `operand${index}`]));
        const rebuilt = graphOperator(operation, operands);
        let target = rebuilt;
        let rule = null;
        if (operation === "negate" && operands.length === 1 &&
            expressionKind(operands[0]) === "operator" &&
            textValue(mapValue(operands[0], "operation")) === "negate") {
            const inner = expressionChildren(operands[0], "operands");
            if (inner.length === 1) {
                target = inner[0];
                rule = "doubleNegation";
            }
        } else if (operands.length === 2) {
            const [left, right] = operands;
            if (operation === "add" && exactGraphValue(left, 0)) {
                target = right;
                rule = "additiveIdentityLeft";
            } else if (operation === "add" && exactGraphValue(right, 0)) {
                target = left;
                rule = "additiveIdentityRight";
            } else if (operation === "subtract" && exactGraphValue(right, 0)) {
                target = left;
                rule = "subtractiveIdentity";
            } else if (operation === "multiply" && exactGraphValue(left, 1)) {
                target = right;
                rule = "multiplicativeIdentityLeft";
            } else if (operation === "multiply" && exactGraphValue(right, 1)) {
                target = left;
                rule = "multiplicativeIdentityRight";
            } else if (operation === "divide" && exactGraphValue(right, 1)) {
                target = left;
                rule = "divisionIdentity";
            } else if (operation === "power" && exactGraphValue(right, 1)) {
                target = left;
                rule = "powerIdentity";
            }
        }
        if (rule) rules.push(simplificationRule(rule, path, rebuilt, target));
        return target;
    };
    const simplified = visit(expression, []);
    const sourceGraph = calculusGraphStructuralKey(expression);
    const targetGraph = calculusGraphStructuralKey(simplified);
    const frozenRules = Object.freeze(rules);
    return Object.freeze({
        schema: CALCULUS_GRAPH_SIMPLIFICATION_SCHEMA,
        operation: "simplify",
        source: expression,
        expression: simplified,
        sourceGraph,
        targetGraph,
        changed: sourceGraph !== targetGraph,
        certified: true,
        rules: frozenRules,
        evidence: Object.freeze({
            kind: "canonicalDomainPreservingSimplification",
            checker: CALCULUS_GRAPH_SIMPLIFICATION_CHECKER,
            rules: frozenRules,
        }),
    });
}

function simplificationRuleFingerprint(value) {
    return [
        textValue(mapValue(value, "rule")),
        textValue(mapValue(value, "path")),
        textValue(mapValue(value, "sourcegraph")),
        textValue(mapValue(value, "targetgraph")),
    ].join("|");
}

/** Recompute a canonical graph simplification without trusting its rule trace. */
export function checkCalculusGraphSimplification(candidate) {
    try {
        const evidence = mapValue(candidate, "evidence");
        if (textValue(mapValue(candidate, "schema")) !== CALCULUS_GRAPH_SIMPLIFICATION_SCHEMA ||
            textValue(mapValue(candidate, "operation")) !== "simplify" ||
            textValue(mapValue(evidence, "kind")) !== "canonicalDomainPreservingSimplification" ||
            textValue(mapValue(evidence, "checker")) !== CALCULUS_GRAPH_SIMPLIFICATION_CHECKER) {
            throw new Error("unsupportedGraphSimplificationEvidence");
        }
        const source = mapValue(candidate, "source");
        const expression = mapValue(candidate, "expression");
        if (!isExpression(source) || !isExpression(expression)) {
            throw new Error("malformedGraphSimplification");
        }
        const actual = simplifyCalculusGraph(source);
        if (calculusGraphStructuralKey(expression) !== actual.targetGraph ||
            textValue(mapValue(candidate, "sourcegraph")) !== actual.sourceGraph ||
            textValue(mapValue(candidate, "targetgraph")) !== actual.targetGraph) {
            throw new Error("graphSimplificationMismatch");
        }
        const claimedRules = collectionValues(mapValue(evidence, "rules"));
        if (!claimedRules) throw new Error("malformedGraphSimplificationRules");
        const claimedFingerprints = claimedRules.map(simplificationRuleFingerprint);
        const actualFingerprints = actual.rules.map(simplificationRuleFingerprint);
        if (claimedFingerprints.length !== actualFingerprints.length ||
            claimedFingerprints.some((value, index) => value !== actualFingerprints[index])) {
            throw new Error("graphSimplificationRuleMismatch");
        }
        return Object.freeze({
            accepted: true,
            certified: true,
            checkedBy: CALCULUS_GRAPH_SIMPLIFICATION_CHECKER,
            sourceGraph: actual.sourceGraph,
            targetGraph: actual.targetGraph,
            changed: actual.changed,
            rules: actual.rules,
            expression: actual.expression,
        });
    } catch (error) {
        return Object.freeze({ accepted: false, certified: false, reason: error.message });
    }
}

function operatorMatch(expression, operation, arity = 2) {
    if (!isExpression(expression) || expressionKind(expression) !== "operator" ||
        textValue(mapValue(expression, "operation")) !== operation) return null;
    const operands = expressionChildren(expression, "operands");
    return operands.length === arity ? operands : null;
}

function sameGraph(left, right) {
    return calculusGraphStructuralKey(left) === calculusGraphStructuralKey(right);
}

function expectedRewrite(source, theoremValue) {
    const theorem = textValue(theoremValue)?.toLowerCase();
    if (!theorem) throw new Error("missingGraphRewriteTheorem");
    const binary = (operation) => {
        const parts = operatorMatch(source, operation);
        if (!parts) throw new Error("graphRewriteSourceShapeMismatch");
        return parts;
    };
    let expression;
    let obligations = [];
    if (theorem === "add.commute" || theorem === "multiply.commute") {
        const operation = theorem.split(".")[0];
        const [left, right] = binary(operation);
        expression = graphOperator(operation, [right, left]);
    } else if (theorem === "add.associate" || theorem === "multiply.associate") {
        const operation = theorem.split(".")[0];
        const [leftPair, right] = binary(operation);
        const inner = operatorMatch(leftPair, operation);
        if (!inner) throw new Error("graphRewriteSourceShapeMismatch");
        expression = graphOperator(operation, [inner[0], graphOperator(operation, [inner[1], right])]);
    } else if (theorem === "multiply.distributeleft") {
        const [factor, sum] = binary("multiply");
        const terms = operatorMatch(sum, "add");
        if (!terms) throw new Error("graphRewriteSourceShapeMismatch");
        expression = graphOperator("add", [
            graphOperator("multiply", [factor, terms[0]]),
            graphOperator("multiply", [factor, terms[1]]),
        ]);
    } else if (theorem === "multiply.distributeright") {
        const [sum, factor] = binary("multiply");
        const terms = operatorMatch(sum, "add");
        if (!terms) throw new Error("graphRewriteSourceShapeMismatch");
        expression = graphOperator("add", [
            graphOperator("multiply", [terms[0], factor]),
            graphOperator("multiply", [terms[1], factor]),
        ]);
    } else if (theorem === "divide.cancelself") {
        const [left, right] = binary("divide");
        if (!sameGraph(left, right)) throw new Error("graphRewriteSourceShapeMismatch");
        expression = graphConstant(1);
        obligations = [graphObligation(left, "rewriteCancellationDomain")];
    } else if (theorem === "subtract.cancelself") {
        const [left, right] = binary("subtract");
        if (!sameGraph(left, right)) throw new Error("graphRewriteSourceShapeMismatch");
        expression = graphConstant(0);
        obligations = [Object.freeze({
            kind: "domain", relation: "defined", expression: left,
            reason: "rewriteCancellationDomain",
        })];
    } else if (theorem === "multiply.zero") {
        const [left, right] = binary("multiply");
        const payload = exactGraphValue(left, 0) ? right : exactGraphValue(right, 0) ? left : null;
        if (!payload) throw new Error("graphRewriteSourceShapeMismatch");
        expression = graphConstant(0);
        obligations = [Object.freeze({
            kind: "domain", relation: "defined", expression: payload,
            reason: "discardedOperandMustBeDefined",
        })];
    } else throw new Error(`unsupportedGraphRewriteTheorem:${String(theorem)}`);
    return Object.freeze({ theorem, expression, obligations: Object.freeze(obligations) });
}

/** Build a proposal whose theorem and side conditions can be checked independently. */
export function proposeCalculusGraphRewrite(source, expression, theorem) {
    if (!isExpression(source) || !isExpression(expression)) {
        throw new Error("graphRewriteRequiresExpressionGraphs");
    }
    const expected = expectedRewrite(source, theorem);
    if (!sameGraph(expression, expected.expression)) throw new Error("graphRewriteTargetMismatch");
    const proposal = Object.freeze({
        schema: CALCULUS_GRAPH_REWRITE_SCHEMA,
        operation: "rewrite",
        theorem: expected.theorem,
        source,
        expression,
        sourceGraph: calculusGraphStructuralKey(source),
        targetGraph: calculusGraphStructuralKey(expression),
        obligations: expected.obligations,
        evidence: Object.freeze({
            kind: "checkedAlgebraicRewrite",
            checker: CALCULUS_GRAPH_REWRITE_CHECKER,
            theorem: expected.theorem,
        }),
    });
    return Object.freeze({ ...proposal, checker: checkCalculusGraphRewrite(proposal) });
}

/** Check theorem shape, target graph, and every retained domain side condition. */
export function checkCalculusGraphRewrite(candidate) {
    try {
        const evidence = mapValue(candidate, "evidence");
        if (textValue(mapValue(candidate, "schema")) !== CALCULUS_GRAPH_REWRITE_SCHEMA ||
            textValue(mapValue(candidate, "operation")) !== "rewrite" ||
            textValue(mapValue(evidence, "kind")) !== "checkedAlgebraicRewrite" ||
            textValue(mapValue(evidence, "checker")) !== CALCULUS_GRAPH_REWRITE_CHECKER) {
            throw new Error("unsupportedGraphRewriteEvidence");
        }
        const source = mapValue(candidate, "source");
        const expression = mapValue(candidate, "expression");
        const theorem = textValue(mapValue(candidate, "theorem"));
        if (!isExpression(source) || !isExpression(expression)) throw new Error("malformedGraphRewrite");
        const expected = expectedRewrite(source, theorem);
        if (!sameGraph(expression, expected.expression)) throw new Error("graphRewriteTargetMismatch");
        const claimed = collectionValues(mapValue(candidate, "obligations"));
        if (!claimed || claimed.length !== expected.obligations.length ||
            claimed.some((value, index) =>
                obligationFingerprint(value) !== obligationFingerprint(expected.obligations[index]))) {
            throw new Error("graphRewriteObligationMismatch");
        }
        return Object.freeze({
            accepted: true,
            certified: true,
            checkedBy: CALCULUS_GRAPH_REWRITE_CHECKER,
            theorem: expected.theorem,
            sourceGraph: calculusGraphStructuralKey(source),
            targetGraph: calculusGraphStructuralKey(expression),
            obligations: expected.obligations,
            expression,
        });
    } catch (error) {
        return Object.freeze({ accepted: false, certified: false, reason: error.message });
    }
}

/** Structurally substitute one Calculus variable without algebraic rewriting. */
export function substituteCalculusGraphVariable(expression, variableValue, replacement) {
    if (hasScopedSymbols(expression) || hasScopedSymbols(replacement)) throw new Error('Scoped composition requires the core Substitute API');
    if (!isExpression(expression) || !isExpression(replacement)) {
        throw new Error("Calculus composition requires expression graphs");
    }
    const variable = textValue(variableValue)?.toLowerCase();
    if (!variable) throw new Error("invalidCompositionVariable");
    const visit = (node) => {
        const kind = expressionKind(node);
        if (kind === "constant") return node;
        if (kind === "variable") {
            const name = textValue(mapValue(node, "name"))?.toLowerCase();
            return name === variable ? replacement : node;
        }
        if (kind === "operator") {
            return graphOperator(
                textValue(mapValue(node, "operation")),
                expressionChildren(node, "operands").map(visit),
            );
        }
        if (kind === "apply") {
            return graphApplication(
                textValue(mapValue(node, "semanticid")),
                textValue(mapValue(node, "name")),
                expressionChildren(node, "arguments").map(visit),
            );
        }
        throw new Error(`unsupportedCompositionGraphKind:${String(kind)}`);
    };
    return visit(expression);
}

function exactGraphValue(expression, value) {
    if (!isExpression(expression) || expressionKind(expression) !== "constant") return false;
    const actual = exactRational(mapValue(expression, "value"));
    return actual?.equals(new Rational(value)) === true;
}

function graphNegate(value) {
    return graphOperator("negate", [value]);
}

function graphAdd(left, right) {
    if (exactGraphValue(left, 0)) return right;
    if (exactGraphValue(right, 0)) return left;
    return graphOperator("add", [left, right]);
}

function graphSubtract(left, right) {
    if (exactGraphValue(right, 0)) return left;
    if (exactGraphValue(left, 0)) return graphNegate(right);
    return graphOperator("subtract", [left, right]);
}

function graphMultiply(left, right) {
    if (exactGraphValue(left, 0) || exactGraphValue(right, 0)) return graphConstant(0);
    if (exactGraphValue(left, 1)) return right;
    if (exactGraphValue(right, 1)) return left;
    return graphOperator("multiply", [left, right]);
}

function graphDivide(left, right) {
    if (exactGraphValue(left, 0)) return graphConstant(0);
    if (exactGraphValue(right, 1)) return left;
    return graphOperator("divide", [left, right]);
}

function graphPower(base, exponent) {
    if (exponent === 0n) return graphConstant(1);
    if (exponent === 1n) return base;
    return graphOperator("power", [base, graphConstant(exponent)]);
}

function graphScaledSelfFactor(base, derivative) {
    if (calculusGraphStructuralKey(base) === calculusGraphStructuralKey(derivative)) {
        return graphConstant(1);
    }
    const operands = expressionKind(derivative) === "operator" &&
        textValue(mapValue(derivative, "operation")) === "multiply"
        ? expressionChildren(derivative, "operands")
        : [];
    if (operands.length !== 2) return null;
    const leftScalar = expressionKind(operands[0]) === "constant" ? operands[0] : null;
    const rightScalar = expressionKind(operands[1]) === "constant" ? operands[1] : null;
    if (leftScalar && sameGraph(base, operands[1])) return leftScalar;
    if (rightScalar && sameGraph(base, operands[0])) return rightScalar;
    return null;
}

function graphObligation(expression, reason) {
    return Object.freeze({
        kind: "domain",
        relation: "nonzero",
        expression,
        reason,
    });
}

const TRUSTED_SEMANTIC_DERIVATIVES = Object.freeze({
    "rix.function.exp@1": "exp",
    "rix.function.log.real-principal@1": "reciprocal",
    "rix.function.sin@1": "sin",
    "rix.function.cos@1": "cos",
    "rix.function.atan.real-principal@1": "atan",
    "rix.function.sqrt.real-principal@1": "sqrt",
    "rix.function.asin.real-principal@1": "asin",
    "rix.function.log.complex-principal@1": "reciprocal",
});

function graphSemanticObligation(kind, relation, expression, semanticId, reason, fields = {}) {
    return Object.freeze({ kind, relation, expression, semanticId, reason, ...fields });
}

function semanticDerivativeObligations(semanticId, argument) {
    if (semanticId === "rix.function.log.real-principal@1" ||
        semanticId === "rix.function.sqrt.real-principal@1") {
        return [graphSemanticObligation(
            "domain", "positive", argument, semanticId, "realDerivativeDomain",
        )];
    }
    if (semanticId === "rix.function.asin.real-principal@1") {
        return [graphSemanticObligation(
            "domain", "insideOpenUnitInterval", argument, semanticId,
            "inverseDerivativeDomain",
        )];
    }
    if (semanticId === "rix.function.log.complex-principal@1") {
        return [graphSemanticObligation(
            "branch", "offPrincipalLogBranchCut", argument, semanticId,
            "complexPrincipalBranch", { branch: "principal" },
        )];
    }
    return [];
}

function differentiateTrustedSemanticApplication(expression, variable) {
    const semanticId = textValue(mapValue(expression, "semanticid"));
    const rule = TRUSTED_SEMANTIC_DERIVATIVES[semanticId];
    if (!rule) throw new Error(`untrustedSemanticDerivative:${String(semanticId)}`);
    const argumentsValue = expressionChildren(expression, "arguments");
    if (argumentsValue.length !== 1) throw new Error("semanticDerivativeRequiresUnaryApplication");
    const argument = argumentsValue[0];
    const inner = differentiatePrimitiveNode(argument, variable);
    const obligations = [
        ...inner.obligations,
        ...semanticDerivativeObligations(semanticId, argument),
    ];
    if (exactGraphValue(inner.expression, 0)) {
        return { expression: inner.expression, obligations };
    }
    let outer;
    if (rule === "exp") outer = expression;
    else if (rule === "reciprocal") outer = graphDivide(graphConstant(1), argument);
    else if (rule === "sin") outer = graphApplication("rix.function.cos@1", "Cos", [argument]);
    else if (rule === "cos") {
        outer = graphNegate(graphApplication("rix.function.sin@1", "Sin", [argument]));
    } else if (rule === "atan") {
        outer = graphDivide(graphConstant(1), graphAdd(graphConstant(1), graphPower(argument, 2n)));
    }
    else if (rule === "sqrt") {
        outer = graphDivide(graphConstant(1), graphMultiply(graphConstant(2), expression));
    } else {
        const radicand = graphSubtract(graphConstant(1), graphPower(argument, 2n));
        const root = graphApplication(
            "rix.function.sqrt.real-principal@1", "Sqrt", [radicand],
        );
        outer = graphDivide(graphConstant(1), root);
    }
    return { expression: graphMultiply(outer, inner.expression), obligations };
}

function differentiatePrimitiveNode(expression, variable) {
    const kind = expressionKind(expression);
    if (kind === "constant") return { expression: graphConstant(0), obligations: [] };
    if (kind === "variable") {
        const name = rangeVariableKey(expression);
        return { expression: graphConstant(name === variable ? 1 : 0), obligations: [] };
    }
    if (kind === "apply") return differentiateTrustedSemanticApplication(expression, variable);
    if (kind !== "operator") throw new Error(`unsupportedDerivativeGraphKind:${String(kind)}`);
    const operation = textValue(mapValue(expression, "operation"));
    const operands = expressionChildren(expression, "operands");
    if (operation === "negate") {
        if (operands.length !== 1) throw new Error("graphOperatorArity");
        const inner = differentiatePrimitiveNode(operands[0], variable);
        return { expression: graphNegate(inner.expression), obligations: inner.obligations };
    }
    if (operands.length !== 2) throw new Error("graphOperatorArity");
    const [left, right] = operands;
    const leftResult = differentiatePrimitiveNode(left, variable);
    const rightResult = differentiatePrimitiveNode(right, variable);
    const obligations = [...leftResult.obligations, ...rightResult.obligations];
    let derivative;
    if (operation === "add") derivative = graphAdd(leftResult.expression, rightResult.expression);
    else if (operation === "subtract") derivative = graphSubtract(leftResult.expression, rightResult.expression);
    else if (operation === "multiply") derivative = graphAdd(
        graphMultiply(leftResult.expression, right),
        graphMultiply(left, rightResult.expression),
    );
    else if (operation === "divide") {
        derivative = graphDivide(
            graphSubtract(
                graphMultiply(leftResult.expression, right),
                graphMultiply(left, rightResult.expression),
            ),
            graphPower(right, 2n),
        );
        obligations.push(graphObligation(right, "divisionDomain"));
    } else if (operation === "power") {
        const exponent = exactIntegerConstant(right);
        if (exponent === null) throw new Error("graphPowerRequiresIntegerConstant");
        const selfFactor = exponent === 0n
            ? null
            : graphScaledSelfFactor(left, leftResult.expression);
        derivative = exponent === 0n
            ? graphConstant(0)
            : selfFactor
                ? graphMultiply(
                    graphMultiply(graphConstant(exponent), selfFactor),
                    graphPower(left, exponent),
                )
                : graphMultiply(
                    graphMultiply(graphConstant(exponent), graphPower(left, exponent - 1n)),
                    leftResult.expression,
                );
        if (exponent < 0n) obligations.push(graphObligation(left, "negativeIntegerPower"));
        if (exponent === 0n) obligations.push(graphObligation(left, "zeroPowerZeroDomain"));
    } else throw new Error(`unsupportedDerivativeGraphOperator:${String(operation)}`);
    return { expression: derivative, obligations };
}

function collectionValues(value) {
    if (Array.isArray(value)) return value;
    if (value?.type === "sequence" && Array.isArray(value.values)) return value.values;
    return null;
}

function obligationFingerprint(value) {
    const expression = mapValue(value, "expression");
    return [
        textValue(mapValue(value, "kind")),
        textValue(mapValue(value, "relation")),
        calculusGraphStructuralKey(expression),
        textValue(mapValue(value, "reason")),
    ].join("|");
}

/** Independently derive exact primitive derivative stages and obligations. */
export function differentiateCalculusPrimitiveGraphN(expression, variableValues, options = map([])) {
    validateRangeTraversal(expression, options);
    if (!isExpression(expression)) throw new Error("Expected a Calculus expression graph");
    const rawVariables = Array.isArray(variableValues) ? variableValues : [variableValues];
    const variables = rawVariables.map((value) => mapValue(value, "symbolid") ? value : textValue(value)?.toLowerCase());
    const maxOrder = derivativeOrderLimit(options);
    if (hasScopedSymbols(expression) && variables.some(value => !mapValue(value, "symbolid"))) throw new Error("Scoped derivative checking requires symbolic selectors");
    for (const variable of variables) if (mapValue(variable, "symbolid")) rangeVariableKey(variable);
    if (variables.length < 1 || variables.length > maxOrder || variables.some((value) => !value)) {
        throw new Error("invalidDerivativeVariables");
    }
    let current = hasScopedSymbols(expression) ? expandExpression(expression) : expression;
    const obligations = [];
    const derivativeExpressions = [];
    for (const variable of variables) {
        validateRangeTraversal(current, options);
        const result = differentiatePrimitiveNode(current, typeof variable === "string" ? variable : rangeVariableKey(variable));
        validateRangeTraversal(result.expression, options);
        current = result.expression;
        obligations.push(...result.obligations);
        derivativeExpressions.push(current);
    }
    return Object.freeze({
        source: expression,
        expression: current,
        variable: variables.at(-1),
        variables: Object.freeze(variables),
        order: variables.length,
        functionGraph: calculusGraphStructuralKey(expression),
        derivativeGraph: calculusGraphStructuralKey(current),
        derivativeExpressions: Object.freeze(derivativeExpressions),
        obligations: Object.freeze(obligations),
    });
}

/** Independently derive one exact primitive derivative graph and obligations. */
export function differentiateCalculusPrimitiveGraph(expression, variableValue, options) {
    return differentiateCalculusPrimitiveGraphN(expression, [variableValue], options);
}

/** Check a Calculus transformation without trusting its visible rule trace. */
function derivativeOrderLimit(options) {
    const raw = mapValue(options, "maxderivativeorder");
    const value = integerValue(raw, raw == null ? 16n : null);
    if (value === null || value < 1n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("maxDerivativeOrder must be a positive safe integer");
    return Number(value);
}

export function checkCalculusDerivativeTransformation(transformation, options = map([])) {
    try {
        if (textValue(mapValue(transformation, "schema")) !== "rix.calculus.transformation@1" ||
            textValue(mapValue(transformation, "operation")) !== "differentiate") {
            throw new Error("notCalculusDerivativeTransformation");
        }
        const source = mapValue(transformation, "source");
        const expression = mapValue(transformation, "expression");
        const variable = mapValue(transformation, "variable");
        const order = integerValue(mapValue(transformation, "order"), 1n);
        if (order < 1n || order > BigInt(derivativeOrderLimit(options))) throw new Error("unsupportedDerivativeOrder");
        const claimedObligations = collectionValues(mapValue(transformation, "obligations"));
        if (!isExpression(source) || !isExpression(expression) || !claimedObligations) {
            throw new Error("malformedDerivativeTransformation");
        }
        const claimedVariables = collectionValues(mapValue(transformation, "variables"));
        const variables = claimedVariables
            ? claimedVariables
            : Array.from({ length: Number(order) }, () => variable);
        if (variables.length !== Number(order) || variables.some((value) => !value)) {
            throw new Error("derivativeOrderVariableMismatch");
        }
        validateRangeTraversal(expression, options);
        const actual = differentiateCalculusPrimitiveGraphN(source, variables, options);
        if (calculusGraphStructuralKey(expression) !== actual.derivativeGraph) {
            throw new Error("derivativeGraphMismatch");
        }
        const claimedFingerprints = claimedObligations.map(obligationFingerprint);
        const actualFingerprints = actual.obligations.map(obligationFingerprint);
        if (claimedFingerprints.length !== actualFingerprints.length ||
            claimedFingerprints.some((value, index) => value !== actualFingerprints[index])) {
            throw new Error("derivativeObligationMismatch");
        }
        return Object.freeze({
            accepted: true,
            certified: true,
            functionGraph: actual.functionGraph,
            derivativeGraph: actual.derivativeGraph,
            variable: actual.variable,
            variables: actual.variables,
            order: actual.order,
            obligations: actual.obligations,
            obligationDescriptors: Object.freeze(actualFingerprints),
            derivativeExpressions: actual.derivativeExpressions,
            source,
            expression,
        });
    } catch (error) {
        return Object.freeze({ accepted: false, certified: false, reason: error.message });
    }
}

function rangeStrictlyBetween(range, low, high) {
    if (range.isEmpty || !range.isBounded) return false;
    return range.components.every((component) =>
        component.low.greaterThan(low) && component.high.lessThan(high));
}

export function derivativeObligationChecks(identity, bindings, options, conventions) {
    return identity.obligations.map((obligation) => {
        if (obligation.reason === "zeroPowerZeroDomain" &&
            conventions.zeroPowerZero === "one") {
            return Object.freeze({
                descriptor: obligationFingerprint(obligation),
                discharged: true,
                reason: "dischargedByZeroPowerZeroConvention",
                convention: "one",
            });
        }
        if (obligation.relation === "offPrincipalLogBranchCut") {
            return Object.freeze({
                descriptor: obligationFingerprint(obligation),
                discharged: false,
                reason: "complexBranchObligationRequiresComplexChecker",
            });
        }
        const result = evaluateCalculusGraphRange(
            obligation.expression,
            bindings,
            options,
            conventions,
        );
        let discharged = false;
        if (result.certified && result.domainStatus === "allDefined") {
            if (obligation.relation === "nonzero") {
                discharged = !result.range.containsValue(Rational.zero);
            } else if (obligation.relation === "positive") {
                discharged = !result.range.isEmpty && result.range.components.every((component) =>
                    component.low !== null && component.low.greaterThan(Rational.zero));
            } else if (obligation.relation === "insideOpenUnitInterval") {
                discharged = rangeStrictlyBetween(
                    result.range, new Rational(-1), Rational.one,
                );
            }
        }
        return Object.freeze({
            descriptor: obligationFingerprint(obligation),
            discharged,
            reason: discharged ? null : (
                ["nonzero", "positive", "insideOpenUnitInterval"].includes(obligation.relation)
                    ? "derivativeObligationNotDischarged"
                    : "unsupportedDerivativeObligation"
            ),
            range: result.range,
            domainStatus: result.domainStatus,
        });
    });
}

/**
 * Check a primitive derivative transformation, enclose its derivative on the
 * requested bindings, discharge carried nonzero obligations, and derive a
 * monotonicity direction when the sign is uniform.
 */
export function evaluateCalculusDerivativeSign(
    transformation,
    bindings,
    options,
    conventions = { zeroPowerZero: "undefined" },
) {
    const identity = checkCalculusDerivativeTransformation(transformation, options);
    if (!identity.accepted) {
        return Object.freeze({
            schema: CALCULUS_DERIVATIVE_SIGN_SCHEMA,
            status: "unknown",
            certified: false,
            monotonicityCertified: false,
            direction: "unknown",
            identity,
            diagnostics: Object.freeze([identity.reason]),
        });
    }
    if (identity.order !== 1) {
        return Object.freeze({
            schema: CALCULUS_DERIVATIVE_SIGN_SCHEMA,
            status: "unknown",
            certified: false,
            monotonicityCertified: false,
            direction: "unknown",
            identity,
            diagnostics: Object.freeze(["derivativeSignRequiresFirstDerivative"]),
        });
    }
    if (mapValue(identity.variable, "symbolid") && bindings?.type === "map") throw new Error("Scoped derivative ranges require identity binding pairs");
    const derivativeExpression = mapValue(transformation, "expression");
    const derivativeRange = evaluateCalculusGraphRange(
        derivativeExpression,
        bindings,
        options,
        conventions,
    );
    const obligationChecks = derivativeObligationChecks(
        identity, bindings, options, conventions,
    );
    const obligationsDischarged = obligationChecks.every((check) => check.discharged);
    const rangeCertified = derivativeRange.certified &&
        derivativeRange.domainStatus === "allDefined" && obligationsDischarged;
    const nonnegative = new RationalIntervalSet({
        low: 0, high: null, lowClosed: true, highClosed: false,
    });
    const nonpositive = new RationalIntervalSet({
        low: null, high: 0, lowClosed: false, highClosed: true,
    });
    const zero = RationalIntervalSet.point(0);
    let direction = "unknown";
    if (rangeCertified && derivativeRange.range.equals(zero)) direction = "constant";
    else if (rangeCertified && nonnegative.contains(derivativeRange.range)) direction = "nondecreasing";
    else if (rangeCertified && nonpositive.contains(derivativeRange.range)) direction = "nonincreasing";
    const variableKey = typeof identity.variable === "string" ? identity.variable : rangeVariableKey(identity.variable);
    const variableDomain = normalizeBindings(bindings).get(variableKey);
    const connectedDomain = variableDomain?.components.length === 1 && !variableDomain.isEmpty;
    if (!connectedDomain) direction = "unknown";
    const monotonicityCertified = direction !== "unknown";
    const diagnostics = [];
    if (!connectedDomain) diagnostics.push("monotonicityRequiresOneConnectedVariableDomain");
    if (!derivativeRange.certified || derivativeRange.domainStatus !== "allDefined") {
        diagnostics.push("derivativeRangeNotTotal");
    }
    if (!obligationsDischarged) diagnostics.push("derivativeObligationNotDischarged");
    if (rangeCertified && !monotonicityCertified) diagnostics.push("derivativeSignNotUniform");
    return Object.freeze({
        schema: CALCULUS_DERIVATIVE_SIGN_SCHEMA,
        status: monotonicityCertified ? "proved" : "inconclusive",
        certified: rangeCertified,
        monotonicityCertified,
        direction,
        functionGraph: identity.functionGraph,
        derivativeGraph: identity.derivativeGraph,
        variable: identity.variable,
        derivativeRange: derivativeRange.range,
        domainStatus: rangeCertified ? "allDefined" : "unresolved",
        identity,
        graphRange: derivativeRange,
        obligationChecks: Object.freeze(obligationChecks),
        conventions: Object.freeze({ zeroPowerZero: conventions.zeroPowerZero }),
        diagnostics: Object.freeze(diagnostics),
    });
}

function exactSymmetricRange(radius) {
    return new RationalIntervalSet({ low: radius.negate(), high: radius });
}

function finiteAbsoluteBound(range) {
    if (range.isEmpty) throw new Error("emptyDerivativeRange");
    const absolute = rangeAbsoluteValue(range).range;
    const hull = absolute.hull();
    const component = hull.components[0];
    if (!component || component.high === null) throw new Error("unboundedDerivativeRange");
    return component.high;
}

function closedStrategyPieces(input, maximum) {
    if (input.isEmpty) return [];
    if (input.components.length > maximum) throw new Error("maxSubintervalsBelowComponentCount");
    if (input.components.some((component) => component.low === null || component.high === null ||
        !component.lowClosed || !component.highClosed)) {
        throw new Error("strategyRequiresClosedBoundedInput");
    }
    const perComponent = Math.max(1, Math.floor(maximum / input.components.length));
    const pieces = [];
    for (const component of input.components) {
        if (perComponent === 1 || component.low.equals(component.high)) {
            pieces.push(new RationalIntervalSet(component));
            continue;
        }
        const width = component.high.subtract(component.low);
        for (let index = 0; index < perComponent; index += 1) {
            const low = component.low.add(width.multiply(
                new Rational(BigInt(index), BigInt(perComponent)),
            ));
            const high = component.low.add(width.multiply(
                new Rational(BigInt(index + 1), BigInt(perComponent)),
            ));
            pieces.push(new RationalIntervalSet({ low, high }));
        }
    }
    return pieces;
}

function strategySetup(transformation, bindings, options, requiredOrder) {
    const identity = checkCalculusDerivativeTransformation(transformation, options);
    if (!identity.accepted) throw new Error(identity.reason);
    if (identity.order !== requiredOrder) throw new Error(`strategyRequiresDerivativeOrder${requiredOrder}`);
    if (mapValue(identity.variable, "symbolid") && bindings?.type === "map") throw new Error("Scoped derivative ranges require identity binding pairs");
    const variableKey = value => typeof value === "string" ? value : rangeVariableKey(value);
    if (identity.variables.some((variable) => variableKey(variable) !== variableKey(identity.variables[0]))) {
        throw new Error("strategyRequiresOneDifferentiationVariable");
    }
    const normalized = normalizeBindings(bindings);
    if (normalized.size !== 1 || !normalized.has(variableKey(identity.variable))) {
        throw new Error("strategyRequiresOneMatchingBinding");
    }
    const input = normalized.get(variableKey(identity.variable));
    const pieces = closedStrategyPieces(input, subdivisionCount(options));
    let optionEntries = [];
    if (options?.type === "map" && options.entries instanceof Map) {
        optionEntries = [...options.entries];
    } else if (options && typeof options === "object") {
        optionEntries = Object.entries(options);
    }
    optionEntries = optionEntries.filter(([key]) =>
        String(key).toLowerCase() !== "maxsubintervals");
    optionEntries.push(["maxSubintervals", new Integer(1n)]);
    return { identity, input, pieces, pieceOptions: map(optionEntries) };
}

function pieceBindings(variable, piece) {
    if (mapValue(variable, "symbolid")) return sequence([{type:"tuple",values:[variable,piece]}]);
    return map([[variable, piece]]);
}

function strategyFailure(schema, strategy, transformation, bindings, options, conventions, reason) {
    return Object.freeze({
        schema,
        strategy,
        status: "unknown",
        certified: false,
        domainStatus: "unresolved",
        range: RationalIntervalSet.empty,
        diagnostics: Object.freeze([reason]),
        partitions: Object.freeze([]),
        evidence: Object.freeze({
            kind: "calculusStrategyRange",
            checker: CALCULUS_STRATEGY_RANGE_CHECKER,
            strategy,
            transformation,
            bindings,
            options,
            conventions,
        }),
    });
}

/** Certified midpoint-value plus first-derivative Lipschitz enclosure. */
export function evaluateCalculusLipschitzRange(
    transformation,
    bindings,
    options = map([]),
    conventions = { zeroPowerZero: "undefined" },
) {
    try {
        const { identity, input, pieces, pieceOptions } = strategySetup(
            transformation, bindings, options, 1,
        );
        const partitions = [];
        for (const piece of pieces) {
            const component = piece.components[0];
            const midpoint = component.low.add(component.high).divide(new Rational(2));
            const radius = component.high.subtract(component.low).divide(new Rational(2));
            const pieceMap = pieceBindings(identity.variable, piece);
            const midpointMap = pieceBindings(identity.variable, RationalIntervalSet.point(midpoint));
            const midpointValue = evaluateCalculusGraphRange(
                identity.source, midpointMap, pieceOptions, conventions,
            );
            const derivativeRange = evaluateCalculusGraphRange(
                identity.expression, pieceMap, pieceOptions, conventions,
            );
            const obligationChecks = derivativeObligationChecks(
                identity, pieceMap, pieceOptions, conventions,
            );
            if (!midpointValue.certified || midpointValue.domainStatus !== "allDefined" ||
                !derivativeRange.certified || derivativeRange.domainStatus !== "allDefined" ||
                obligationChecks.some((check) => !check.discharged)) {
                throw new Error("lipschitzPremiseNotCertified");
            }
            const lipschitzBound = finiteAbsoluteBound(derivativeRange.range);
            const errorRadius = lipschitzBound.multiply(radius);
            const enclosure = rangeAdd(
                midpointValue.range,
                exactSymmetricRange(errorRadius),
            ).range;
            partitions.push(Object.freeze({
                input: piece,
                midpoint,
                radius,
                midpointRange: midpointValue.range,
                derivativeRange: derivativeRange.range,
                lipschitzBound,
                errorRadius,
                enclosure,
                obligationChecks: Object.freeze(obligationChecks),
                work: Object.freeze({
                    midpointNodes: midpointValue.work.nodes,
                    derivativeNodes: derivativeRange.work.nodes,
                }),
            }));
        }
        const range = partitions.reduce(
            (combined, partition) => combined.union(partition.enclosure),
            RationalIntervalSet.empty,
        );
        return Object.freeze({
            schema: CALCULUS_LIPSCHITZ_RANGE_SCHEMA,
            strategy: "lipschitzMidpoint",
            status: "enclosed",
            certified: true,
            domainStatus: "allDefined",
            functionGraph: identity.functionGraph,
            derivativeGraph: identity.derivativeGraph,
            variable: identity.variable,
            input,
            range,
            partitions: Object.freeze(partitions),
            diagnostics: Object.freeze([]),
            work: Object.freeze({
                subintervals: partitions.length,
                nodes: partitions.reduce((sum, partition) => sum +
                    partition.work.midpointNodes + partition.work.derivativeNodes, 0),
            }),
            evidence: Object.freeze({
                kind: "calculusStrategyRange",
                checker: CALCULUS_STRATEGY_RANGE_CHECKER,
                strategy: "lipschitzMidpoint",
                transformation,
                bindings,
                options,
                conventions,
            }),
        });
    } catch (error) {
        return strategyFailure(
            CALCULUS_LIPSCHITZ_RANGE_SCHEMA, "lipschitzMidpoint",
            transformation, bindings, options, conventions, error.message,
        );
    }
}

function curvatureFromRange(range) {
    const zero = RationalIntervalSet.point(0);
    if (range.equals(zero)) return "affine";
    const nonnegative = new RationalIntervalSet({
        low: 0, high: null, lowClosed: true, highClosed: false,
    });
    if (nonnegative.contains(range)) return "convex";
    const nonpositive = new RationalIntervalSet({
        low: null, high: 0, lowClosed: false, highClosed: true,
    });
    if (nonpositive.contains(range)) return "concave";
    return "unknown";
}

/** Certified first-order midpoint Taylor enclosure with a second-derivative remainder. */
export function evaluateCalculusTaylorRange(
    transformation,
    bindings,
    options = map([]),
    conventions = { zeroPowerZero: "undefined" },
) {
    try {
        const { identity, input, pieces, pieceOptions } = strategySetup(
            transformation, bindings, options, 2,
        );
        const firstDerivative = identity.derivativeExpressions[0];
        const partitions = [];
        for (const piece of pieces) {
            const component = piece.components[0];
            const midpoint = component.low.add(component.high).divide(new Rational(2));
            const radius = component.high.subtract(component.low).divide(new Rational(2));
            const pieceMap = pieceBindings(identity.variable, piece);
            const midpointMap = pieceBindings(identity.variable, RationalIntervalSet.point(midpoint));
            const midpointValue = evaluateCalculusGraphRange(
                identity.source, midpointMap, pieceOptions, conventions,
            );
            const midpointDerivative = evaluateCalculusGraphRange(
                firstDerivative, midpointMap, pieceOptions, conventions,
            );
            const secondDerivativeRange = evaluateCalculusGraphRange(
                identity.expression, pieceMap, pieceOptions, conventions,
            );
            const obligationChecks = derivativeObligationChecks(
                identity, pieceMap, pieceOptions, conventions,
            );
            if (!midpointValue.certified || midpointValue.domainStatus !== "allDefined" ||
                !midpointDerivative.certified || midpointDerivative.domainStatus !== "allDefined" ||
                !secondDerivativeRange.certified ||
                secondDerivativeRange.domainStatus !== "allDefined" ||
                obligationChecks.some((check) => !check.discharged)) {
                throw new Error("taylorPremiseNotCertified");
            }
            const secondDerivativeBound = finiteAbsoluteBound(secondDerivativeRange.range);
            const delta = exactSymmetricRange(radius);
            const linearRange = rangeMultiply(midpointDerivative.range, delta).range;
            const halfRadiusSquared = radius.pow(2n).divide(new Rational(2));
            const remainderRange = rangeMultiply(
                secondDerivativeRange.range,
                new RationalIntervalSet({ low: Rational.zero, high: halfRadiusSquared }),
            ).range;
            const remainderRadius = secondDerivativeBound.multiply(halfRadiusSquared);
            const enclosure = rangeAdd(
                rangeAdd(midpointValue.range, linearRange).range,
                remainderRange,
            ).range;
            partitions.push(Object.freeze({
                input: piece,
                midpoint,
                radius,
                midpointRange: midpointValue.range,
                midpointDerivativeRange: midpointDerivative.range,
                secondDerivativeRange: secondDerivativeRange.range,
                secondDerivativeBound,
                linearRange,
                remainderRange,
                remainderRadius,
                curvature: curvatureFromRange(secondDerivativeRange.range),
                enclosure,
                obligationChecks: Object.freeze(obligationChecks),
                work: Object.freeze({
                    midpointNodes: midpointValue.work.nodes,
                    firstDerivativeNodes: midpointDerivative.work.nodes,
                    secondDerivativeNodes: secondDerivativeRange.work.nodes,
                }),
            }));
        }
        const range = partitions.reduce(
            (combined, partition) => combined.union(partition.enclosure),
            RationalIntervalSet.empty,
        );
        const curvatures = [...new Set(partitions.map((partition) => partition.curvature))];
        return Object.freeze({
            schema: CALCULUS_TAYLOR_RANGE_SCHEMA,
            strategy: "secondDerivativeTaylor",
            status: "enclosed",
            certified: true,
            domainStatus: "allDefined",
            functionGraph: identity.functionGraph,
            firstDerivativeGraph: calculusGraphStructuralKey(firstDerivative),
            secondDerivativeGraph: identity.derivativeGraph,
            variable: identity.variable,
            input,
            range,
            curvature: curvatures.length === 1 ? curvatures[0] : "mixed",
            partitions: Object.freeze(partitions),
            diagnostics: Object.freeze([]),
            work: Object.freeze({
                subintervals: partitions.length,
                nodes: partitions.reduce((sum, partition) => sum +
                    partition.work.midpointNodes + partition.work.firstDerivativeNodes +
                    partition.work.secondDerivativeNodes, 0),
            }),
            evidence: Object.freeze({
                kind: "calculusStrategyRange",
                checker: CALCULUS_STRATEGY_RANGE_CHECKER,
                strategy: "secondDerivativeTaylor",
                transformation,
                bindings,
                options,
                conventions,
            }),
        });
    } catch (error) {
        return strategyFailure(
            CALCULUS_TAYLOR_RANGE_SCHEMA, "secondDerivativeTaylor",
            transformation, bindings, options, conventions, error.message,
        );
    }
}

export function checkCalculusStrategyRangeResult(candidate) {
    const evidence = candidate?.evidence;
    if (evidence?.kind !== "calculusStrategyRange" ||
        evidence?.checker !== CALCULUS_STRATEGY_RANGE_CHECKER) {
        return Object.freeze({ accepted: false, certified: false, reason: "unsupportedStrategyEvidence" });
    }
    const evaluate = evidence.strategy === "lipschitzMidpoint"
        ? evaluateCalculusLipschitzRange
        : evidence.strategy === "secondDerivativeTaylor"
            ? evaluateCalculusTaylorRange
            : null;
    if (!evaluate) {
        return Object.freeze({ accepted: false, certified: false, reason: "unsupportedRangeStrategy" });
    }
    const recomputed = evaluate(
        evidence.transformation,
        evidence.bindings,
        evidence.options,
        evidence.conventions,
    );
    const accepted = candidate.range instanceof RationalIntervalSet &&
        candidate.schema === recomputed.schema &&
        candidate.strategy === recomputed.strategy &&
        candidate.certified === recomputed.certified &&
        candidate.domainStatus === recomputed.domainStatus &&
        candidate.range.equals(recomputed.range);
    return Object.freeze({
        accepted,
        certified: accepted && recomputed.certified,
        reason: accepted ? null : "strategyRangeClaimMismatch",
        checkedBy: CALCULUS_STRATEGY_RANGE_CHECKER,
        strategy: recomputed.strategy,
    });
}

function trimPolynomial(coefficients) {
    const result = [...coefficients];
    while (result.length > 1 && result.at(-1).equals(Rational.zero)) result.pop();
    return result;
}

function boundedPolynomial(values, budget) {
    if (values.length > budget.maxterms || values.length - 1 > budget.maxdegree) throw new Error("recognitionDegreeTermBudget");
    for (const value of values) budget.arithmetic.read(value);
    return trimPolynomial(values);
}

function polynomialAdd(left, right, subtract, budget) {
    if (left.length + right.length > budget.maxsumterms) throw new Error("recognitionSumBudget");
    const length = Math.max(left.length, right.length);
    const result = [];
    for (let index = 0; index < length; index += 1) {
        const a = left[index] ?? Rational.zero;
        const b = right[index] ?? Rational.zero;
        result.push(budget.arithmetic.operate(subtract ? "subtract" : "add", [a,b]));
    }
    return boundedPolynomial(result, budget);
}

function polynomialNegate(value) {
    return trimPolynomial(value.map((coefficient) => coefficient.negate()));
}

function polynomialMultiply(left, right, budget) {
    if (left.length * right.length > budget.maxproductpairs) throw new Error("recognitionProductBudget");
    if (left.length + right.length - 1 > budget.maxterms || left.length + right.length - 2 > budget.maxdegree) throw new Error("recognitionDegreeTermBudget");
    const result = Array.from(
        { length: left.length + right.length - 1 },
        () => Rational.zero,
    );
    for (let i = 0; i < left.length; i += 1) {
        for (let j = 0; j < right.length; j += 1) {
            result[i + j] = budget.arithmetic.operate("add", [result[i+j], budget.arithmetic.operate("multiply", [left[i],right[j]])]);
        }
    }
    return boundedPolynomial(result, budget);
}

function polynomialPower(value, exponent, budget) {
    if (exponent > BigInt(budget.maxexponent)) throw new Error("recognitionExponentBudget");
    let power = exponent;
    let factor = value;
    let result = [Rational.one];
    while (power > 0n) {
        if ((power & 1n) === 1n) result = polynomialMultiply(result, factor, budget);
        power >>= 1n;
        if (power > 0n) factor = polynomialMultiply(factor, factor, budget);
    }
    return trimPolynomial(result);
}

function isZeroPolynomial(value) {
    return value.length === 1 && value[0].equals(Rational.zero);
}

function rationalGraphValue(numerator, denominator = [Rational.one], restrictions = [], budget) {
    return {
        numerator: boundedPolynomial(numerator, budget),
        denominator: boundedPolynomial(denominator, budget),
        budget,
        restrictions: [...restrictions],
    };
}

function rationalGraphAdd(left, right, subtract = false) {
    const budget = left.budget;
    return rationalGraphValue(
        polynomialAdd(
            polynomialMultiply(left.numerator, right.denominator, budget),
            polynomialMultiply(right.numerator, left.denominator, budget),
            subtract, budget,
        ),
        polynomialMultiply(left.denominator, right.denominator, budget),
        [...left.restrictions, ...right.restrictions], budget,
    );
}

function rationalGraphMultiply(left, right) {
    const budget = left.budget;
    return rationalGraphValue(
        polynomialMultiply(left.numerator, right.numerator, budget),
        polynomialMultiply(left.denominator, right.denominator, budget),
        [...left.restrictions, ...right.restrictions], budget,
    );
}

function recognizeRationalGraphNode(expression, variable, budget) {
    const kind = expressionKind(expression);
    if (kind === "constant") {
        const value = exactRational(mapValue(expression, "value"));
        if (!value) throw new Error("nonRationalGraphConstant");
        return rationalGraphValue([value], undefined, [], budget);
    }
    if (kind === "variable") {
        const name = rangeVariableKey(expression);
        if (name !== variable) throw new Error(`unexpectedGraphVariable:${String(name)}`);
        return rationalGraphValue([Rational.zero, Rational.one], undefined, [], budget);
    }
    if (kind !== "operator") {
        if (kind === "apply") {
            throw new Error(`semanticApplicationNotPolynomial:${textValue(mapValue(expression, "semanticid"))}`);
        }
        throw new Error(`unsupportedGraphKind:${String(kind)}`);
    }
    const operation = textValue(mapValue(expression, "operation"));
    const operands = expressionChildren(expression, "operands");
    if (operation === "negate") {
        if (operands.length !== 1) throw new Error("graphOperatorArity");
        const value = recognizeRationalGraphNode(operands[0], variable, budget);
        return rationalGraphValue(
            polynomialNegate(value.numerator),
            value.denominator,
            value.restrictions, budget,
        );
    }
    if (operands.length !== 2) throw new Error("graphOperatorArity");
    const left = recognizeRationalGraphNode(operands[0], variable, budget);
    if (operation === "power") {
        const exponent = exactIntegerConstant(operands[1]);
        if (exponent === null) throw new Error("graphPowerRequiresIntegerConstant");
        if (exponent >= 0n) {
            return rationalGraphValue(
                polynomialPower(left.numerator, exponent, budget),
                polynomialPower(left.denominator, exponent, budget),
                exponent === 0n
                    ? [...left.restrictions, `zeroPowerZero:${calculusGraphStructuralKey(operands[0])}`]
                    : left.restrictions, budget,
            );
        }
        if (isZeroPolynomial(left.numerator)) throw new Error("identicallyZeroDenominator");
        return rationalGraphValue(
            polynomialPower(left.denominator, -exponent, budget),
            polynomialPower(left.numerator, -exponent, budget),
            [...left.restrictions, calculusGraphStructuralKey(operands[0])], budget,
        );
    }
    const right = recognizeRationalGraphNode(operands[1], variable, budget);
    if (operation === "add") return rationalGraphAdd(left, right);
    if (operation === "subtract") return rationalGraphAdd(left, right, true);
    if (operation === "multiply") return rationalGraphMultiply(left, right);
    if (operation === "divide") {
        if (isZeroPolynomial(right.numerator)) throw new Error("identicallyZeroDenominator");
        const divisorKnownNonzeroConstant = right.numerator.length === 1 &&
            right.denominator.length === 1 && !right.numerator[0].equals(Rational.zero);
        return rationalGraphValue(
            polynomialMultiply(left.numerator, right.denominator, budget),
            polynomialMultiply(left.denominator, right.numerator, budget),
            [
                ...left.restrictions,
                ...right.restrictions,
                ...(divisorKnownNonzeroConstant ? [] : [calculusGraphStructuralKey(operands[1])]),
            ], budget,
        );
    }
    throw new Error(`unsupportedGraphOperator:${String(operation)}`);
}

/**
 * Recognize an exact univariate polynomial or source-domain-preserving
 * rational function without cancelling denominator restrictions.
 */
export function recognizeCalculusGraph(expression, variableValue, options) {
    const limits = mathBudgets(options);
    validateRangeTraversal(expression, map([["maxdepth",new Integer(BigInt(limits.maxdepth))],["maxwork",new Integer(BigInt(limits.maxvisits))]]));
    if (!isExpression(expression)) {
        return Object.freeze({ recognized: false, reason: "notCalculusExpression" });
    }
    const scoped = hasScopedSymbols(expression) || !!mapValue(variableValue, "symbolid");
    const variable = scoped ? variableValue : textValue(variableValue)?.toLowerCase();
    if (!variable) return Object.freeze({ recognized: false, reason: "invalidPolynomialVariable" });
    try {
        if (scoped && !mapValue(variable, "symbolid")) throw new Error("Scoped recognition requires a symbolic selector");
        const budget = {...limits, arithmetic:createProviderEvaluation(new Set(),limits)};
        const expanded = scoped ? expandExpression(expression) : expression;
        const value = recognizeRationalGraphNode(expanded, scoped ? rangeVariableKey(variable) : variable, budget);
        if (isZeroPolynomial(value.denominator)) {
            return Object.freeze({ recognized: false, reason: "identicallyZeroDenominator" });
        }
        let numerator = value.numerator;
        let denominator = value.denominator;
        if (denominator.length === 1 && !denominator[0].equals(Rational.zero)) {
            const scale = denominator[0].reciprocal();
            numerator = numerator.map((coefficient) => budget.arithmetic.operate("multiply",[coefficient,scale]));
            denominator = [Rational.one];
        }
        const polynomial = denominator.length === 1 && denominator[0].equals(Rational.one) &&
            value.restrictions.length === 0;
        return Object.freeze({
            recognized: true,
            schema: "rix.numerics.calculus-graph-recognition@1",
            kind: polynomial ? "polynomial" : "rationalFunction",
            variable,
            budgets: mathBudgetRecord(limits),
            graphIdentity: calculusGraphStructuralKey(expression),
            numerator: Object.freeze(trimPolynomial(numerator)),
            denominator: Object.freeze(trimPolynomial(denominator)),
            sourceDomainRestrictions: Object.freeze([...new Set(value.restrictions)]),
            cancellationPerformed: false,
        });
    } catch (error) {
        return Object.freeze({
            recognized: false,
            schema: "rix.numerics.calculus-graph-recognition@1",
            reason: error.message,
            graphIdentity: calculusGraphStructuralKey(expression),
        });
    }
}

function normalizeBindings(bindings) {
    if (["array", "sequence", "tuple"].includes(bindings?.type)) {
        const result = new Map();
        for (const pair of bindings.values) {
            if (!["array", "sequence", "tuple"].includes(pair?.type) || pair.values.length !== 2) throw new Error("Scoped graph bindings require (symbol,range) pairs");
            const [symbol, value] = pair.values;
            if (!mapValue(symbol, "symbolid") || expressionKind(symbol) !== "variable") throw new Error("Scoped graph bindings require symbolic identities");
            const key = rangeVariableKey(symbol);
            if (result.has(key)) throw new Error("Duplicate scoped graph binding");
            result.set(key, asRationalIntervalSet(value));
        }
        return result;
    }
    if (!bindings || bindings.type !== "map" || !(bindings.entries instanceof Map)) {
        throw new Error("Calculus graph range bindings must be a Map");
    }
    const result = new Map();
    for (const [name, value] of bindings.entries) {
        try {
            result.set(String(name).toLowerCase(), asRationalIntervalSet(value));
        } catch {
            throw new Error(`Calculus graph binding ${String(name)} must be an exact rational range`);
        }
    }
    return result;
}

function rangeVariableKey(symbol) {
    const id = textValue(mapValue(symbol, "symbolid"));
    if (mapValue(symbol, "symbolid")) {
        if (!id) throw new Error("Invalid scoped graph symbol identity");
        if (expressionDefinition(symbol)) throw new Error("Graph bindings require independent symbols; definitions expand before evaluation");
        if (mapValue(symbol, "bound")) throw new Error("Instantiate bound symbols before graph range evaluation");
        return `scoped:${id}`;
    }
    return textValue(mapValue(symbol, "name"))?.toLowerCase();
}

// Check before recursive structural-key/simplification routines run. Definition
// expansion counts toward the same budget instead of bypassing it.
function validateRangeTraversal(expression, options) {
    const depth = mapValue(options, "maxdepth");
    const limits = mathBudgets(depth === undefined ? null : map([["maxdepth", depth]]));
    const maxVisits = maxNodeCount(options);
    const stack = [[expression, 0]];
    let visits = 0;
    while (stack.length) {
        const [node, level] = stack.pop();
        if (++visits > maxVisits) throw new Error("calculusGraphWorkLimit");
        if (level > limits.maxdepth) throw new Error("calculusGraphDepthLimit");
        const definition = expressionDefinition(node);
        if (definition) { stack.push([definition, level + 1]); continue; }
        const kind = expressionKind(node);
        if (kind === "variable") rangeVariableKey(node);
        const children = kind === "operator" ? expressionChildren(node, "operands")
            : kind === "apply" ? expressionChildren(node, "arguments") : [];
        for (const child of children) stack.push([child, level + 1]);
    }
    return Object.freeze({ maxDepth: limits.maxdepth, maxWork: maxVisits, maxSubintervals: subdivisionCount(options) });
}

function bindingFingerprint(bindings) {
    return [...bindings.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, value]) => `${name}=${value.toString()}`).join(";");
}

function exactIntegerConstant(expression) {
    if (!isExpression(expression) || expressionKind(expression) !== "constant") return null;
    const value = mapValue(expression, "value");
    const integer = integerValue(value, null);
    return integer;
}

function unionDependencies(left, right) {
    return new Set([...left, ...right]);
}

function disjoint(left, right) {
    for (const value of left) if (right.has(value)) return false;
    return true;
}

function concatExclusions(results, local = []) {
    return [...results.flatMap((result) => result.exclusions), ...local];
}

function mergeCoverage(children, localCoverage, localReliable = true) {
    const coverages = children.map((child) => child.coverage);
    if (coverages.includes("unresolved")) return "unresolved";
    if (coverages.includes("noDefinedInputs")) return "noDefinedInputs";
    if (!localReliable && localCoverage !== "allDefined") return "unresolved";
    if (localCoverage === "noDefinedInputs") return "noDefinedInputs";
    if (localCoverage === "partiallyDefined") return "partiallyDefined";
    const partials = coverages.filter((coverage) => coverage === "partiallyDefined").length;
    if (partials === 0) return "allDefined";
    return partials === 1 ? "partiallyDefined" : "unresolved";
}

function operationRecord(operation, operands, exponent = null, zeroPowerZero = "undefined") {
    switch (operation) {
        case "negate": return rangeNegate(operands[0]);
        case "absoluteValue": return rangeAbsoluteValue(operands[0]);
        case "add": return rangeAdd(operands[0], operands[1]);
        case "subtract": return rangeSubtract(operands[0], operands[1]);
        case "multiply": return rangeMultiply(operands[0], operands[1]);
        case "divide": return rangeDivide(operands[0], operands[1]);
        case "integerPower": return rangeIntegerPower(operands[0], exponent, { zeroPowerZero });
        default: throw new Error(`Unsupported exact graph operation ${operation}`);
    }
}

function graphNodeResult(fields) {
    return {
        range: fields.range,
        coverage: fields.coverage,
        exclusions: Object.freeze(fields.exclusions || []),
        certified: fields.certified,
        exactImage: fields.exactImage,
        dependencies: fields.dependencies,
        nodeId: fields.nodeId,
    };
}

function appendTrace(state, rule, key, premises, conclusion, parameters = {}) {
    const id = `n${state.trace.length + 1}`;
    state.trace.push(Object.freeze({ id, rule, key, premises, conclusion, parameters }));
    return id;
}

function exactSetConclusion(result) {
    return Object.freeze({
        type: "rangeEnclosure",
        range: result.range,
        domainCoverage: result.coverage,
        exclusions: result.exclusions,
    });
}

function evaluateSameExpression(operation, child, operandKey, graphKey, state) {
    if (operation === "subtract") {
        const record = rangeMultiply(child.range, Rational.zero);
        const result = graphNodeResult({
            range: record.range,
            coverage: child.coverage,
            exclusions: child.exclusions,
            certified: child.certified,
            exactImage: child.coverage !== "unresolved",
            dependencies: child.dependencies,
            nodeId: null,
        });
        result.nodeId = appendTrace(
            state, "graph.sameInputSubtract", graphKey, [child.nodeId],
            exactSetConclusion(result), { operandIdentity: operandKey },
        );
        return result;
    }

    const excludesZero = !child.range.containsValue(Rational.zero);
    const localReliable = child.exactImage || excludesZero || child.range.isEmpty;
    let record;
    if (localReliable) {
        record = rangeIntegerPower(child.range, 0, { zeroPowerZero: "undefined" });
    } else {
        const nonzero = child.range.intersection([
            { low: null, high: 0, lowClosed: false, highClosed: false },
            { low: 0, high: null, lowClosed: false, highClosed: false },
        ]);
        record = {
            range: nonzero.isEmpty ? RationalIntervalSet.empty : RationalIntervalSet.point(1),
            domain: { coverage: "unresolved", exclusions: [] },
        };
    }
    const coverage = mergeCoverage([child], record.domain.coverage, localReliable);
    const localExclusions = localReliable && child.range.containsValue(Rational.zero)
        ? [{ reason: "divisionByZero", operand: 1, excludedSet: RationalIntervalSet.point(0) }]
        : [];
    const result = graphNodeResult({
        range: record.range,
        coverage,
        exclusions: concatExclusions([child], localExclusions),
        certified: child.certified && coverage !== "unresolved",
        exactImage: localReliable && coverage !== "unresolved",
        dependencies: child.dependencies,
        nodeId: null,
    });
    result.nodeId = appendTrace(
        state, "graph.sameInputDivide", graphKey, [child.nodeId],
        exactSetConclusion(result), { operandIdentity: operandKey },
    );
    return result;
}

function evaluateNode(expression, bindings, state) {
    if (state.nodes >= state.maxNodes) throw new Error("calculusGraphWorkLimit");
    const graphKey = calculusGraphStructuralKey(expression);
    const cacheKey = `${graphKey}|${state.bindingKey}`;
    const cached = state.cache.get(cacheKey);
    if (cached) {
        state.reuses += 1;
        return cached;
    }
    state.nodes += 1;

    const kind = expressionKind(expression);
    let result;
    if (kind === "constant") {
        const value = mapValue(expression, "value");
        const range = asRationalIntervalSet(value);
        result = graphNodeResult({
            range, coverage: "allDefined", exclusions: [], certified: true,
            exactImage: true, dependencies: new Set(), nodeId: null,
        });
        result.nodeId = appendTrace(state, "given.constant", graphKey, [], exactSetConclusion(result));
    } else if (kind === "variable") {
        const name = rangeVariableKey(expression);
        if (!name || !bindings.has(name)) throw new Error(`missingGraphBinding:${String(name)}`);
        const range = bindings.get(name);
        result = graphNodeResult({
            range, coverage: "allDefined", exclusions: [], certified: true,
            exactImage: true, dependencies: new Set([name]), nodeId: null,
        });
        result.nodeId = appendTrace(
            state, "given.input", graphKey, [], exactSetConclusion(result), { variable: name },
        );
    } else if (kind === "operator") {
        const operation = textValue(mapValue(expression, "operation"));
        const operands = expressionChildren(expression, "operands");
        if (operation === "negate") {
            if (operands.length !== 1) throw new Error("graphOperatorArity");
            const child = evaluateNode(operands[0], bindings, state);
            const record = operationRecord("negate", [child.range]);
            result = graphNodeResult({
                range: record.range,
                coverage: child.coverage,
                exclusions: child.exclusions,
                certified: child.certified,
                exactImage: child.exactImage,
                dependencies: child.dependencies,
                nodeId: null,
            });
            result.nodeId = appendTrace(
                state, "arith.negate", graphKey, [child.nodeId], exactSetConclusion(result),
                { operands: [child.range] },
            );
        } else {
            if (operands.length !== 2) throw new Error("graphOperatorArity");
            const leftKey = calculusGraphStructuralKey(operands[0]);
            const rightKey = calculusGraphStructuralKey(operands[1]);
            const left = evaluateNode(operands[0], bindings, state);
            const right = evaluateNode(operands[1], bindings, state);
            if ((operation === "subtract" || operation === "divide") && leftKey === rightKey) {
                result = evaluateSameExpression(operation, left, leftKey, graphKey, state);
            } else {
                let coreOperation = operation;
                let exponent = null;
                let operationChildren = [left, right];
                if (operation === "power") {
                    exponent = exactIntegerConstant(operands[1]);
                    if (exponent === null) throw new Error("graphPowerRequiresIntegerConstant");
                    coreOperation = "integerPower";
                    operationChildren = [left];
                } else if (!["add", "subtract", "multiply", "divide"].includes(operation)) {
                    throw new Error(`unsupportedGraphOperator:${String(operation)}`);
                }
                const record = operationRecord(
                    coreOperation,
                    operationChildren.map((child) => child.range),
                    exponent,
                    state.zeroPowerZero,
                );
                const independent = operationChildren.length === 1 ||
                    disjoint(left.dependencies, right.dependencies);
                const inputsExact = operationChildren.every((child) => child.exactImage);
                const localReliable = coreOperation !== "divide" || (inputsExact && independent);
                const coverage = mergeCoverage(
                    operationChildren, record.domain.coverage, localReliable,
                );
                const localExclusions = localReliable ? record.domain.exclusions : [];
                const dependencies = operationChildren.length === 1
                    ? new Set(left.dependencies)
                    : unionDependencies(left.dependencies, right.dependencies);
                const certified = operationChildren.every((child) => child.certified) &&
                    coverage !== "unresolved";
                const exactImage = inputsExact && independent && coverage !== "unresolved";
                result = graphNodeResult({
                    range: record.range,
                    coverage,
                    exclusions: concatExclusions(operationChildren, localExclusions),
                    certified,
                    exactImage,
                    dependencies,
                    nodeId: null,
                });
                result.nodeId = appendTrace(
                    state, `arith.${coreOperation}`, graphKey,
                    operationChildren.map((child) => child.nodeId), exactSetConclusion(result),
                    { operands: operationChildren.map((child) => child.range), exponent },
                );
            }
        }
    } else if (kind === "apply") {
        throw new Error(`unsupportedSemanticApplication:${textValue(mapValue(expression, "semanticid"))}`);
    } else {
        throw new Error(`unsupportedGraphKind:${String(kind)}`);
    }

    state.cache.set(cacheKey, result);
    return result;
}

function subdivisionCount(options) {
    const raw = mapValue(options, "maxsubintervals");
    const value = integerValue(raw, raw == null ? 1n : null);
    if (value === null || value < 1n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("maxSubintervals must be a positive safe integer");
    return Number(value);
}

function maxNodeCount(options) {
    const raw = mapValue(options, "maxwork") ?? mapValue(options, "maxnodes");
    const value = integerValue(raw, raw == null ? 10_000n : null);
    if (value === null || value < 1n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("maxWork must be a positive safe integer");
    return Number(value);
}

function subdivideRange(set, maximum) {
    if (maximum <= 1 || set.isEmpty) return [set];
    const components = set.components;
    if (components.some((component) => component.low === null || component.high === null)) {
        return components.map((component) => new RationalIntervalSet(component));
    }
    const perComponent = Math.max(1, Math.floor(maximum / components.length));
    const pieces = [];
    for (const component of components) {
        if (perComponent === 1 || component.low.equals(component.high)) {
            pieces.push(new RationalIntervalSet(component));
            continue;
        }
        const width = component.high.subtract(component.low);
        for (let index = 0; index < perComponent; index += 1) {
            const low = component.low.add(width.multiply(new Rational(BigInt(index), BigInt(perComponent))));
            const high = component.low.add(width.multiply(new Rational(BigInt(index + 1), BigInt(perComponent))));
            pieces.push(new RationalIntervalSet({
                low,
                high,
                lowClosed: index === 0 ? component.lowClosed : true,
                highClosed: index === perComponent - 1 ? component.highClosed : false,
            }));
        }
    }
    return pieces;
}

function aggregateCoverage(results) {
    if (results.some((result) => result.coverage === "unresolved")) return "unresolved";
    const defined = results.filter((result) => result.coverage !== "noDefinedInputs");
    if (defined.length === 0) return "noDefinedInputs";
    if (defined.length !== results.length || results.some((result) =>
        result.coverage === "partiallyDefined")) return "partiallyDefined";
    return "allDefined";
}

function evaluateWithBindings(expression, bindings, options, conventions) {
    const state = {
        cache: new Map(),
        trace: [],
        nodes: 0,
        reuses: 0,
        maxNodes: maxNodeCount(options),
        bindingKey: bindingFingerprint(bindings),
        zeroPowerZero: conventions.zeroPowerZero,
    };
    const result = evaluateNode(expression, bindings, state);
    return { result, state };
}

function checkedSimplificationRequested(options) {
    const value = mapValue(options, "checkedsimplify");
    if (value === true) return true;
    if (integerValue(value, 0n) !== 0n) return true;
    return ["checked", "true", "yes"].includes(textValue(value)?.toLowerCase());
}

function rangeResult(expression, sourceBindings, options, conventions = { zeroPowerZero: "undefined" }) {
    const budgets = validateRangeTraversal(expression, options);
    const scoped = hasScopedSymbols(expression);
    if (scoped && sourceBindings?.type === "map") throw new Error("Scoped graph range evaluation requires identity binding pairs, not name maps");
    const bindings = normalizeBindings(sourceBindings);
    const expanded = scoped ? expandExpression(expression) : expression;
    const simplification = checkedSimplificationRequested(options)
        ? simplifyCalculusGraph(expanded)
        : null;
    const evaluationExpression = simplification?.expression ?? expanded;
    const maximumPieces = subdivisionCount(options);
    let partitions = [bindings];
    if (bindings.size === 1 && maximumPieces > 1) {
        const [[name, input]] = bindings.entries();
        partitions = subdivideRange(input, maximumPieces).map((piece) => new Map([[name, piece]]));
    }

    const evaluated = [];
    let totalNodes = 0;
    let totalReuses = 0;
    const trace = [];
    for (const partition of partitions) {
        try {
            const piece = evaluateWithBindings(evaluationExpression, partition, options, conventions);
            evaluated.push(piece.result);
            totalNodes += piece.state.nodes;
            totalReuses += piece.state.reuses;
            trace.push(Object.freeze({
                bindings: partition,
                root: piece.result.nodeId,
                nodes: Object.freeze(piece.state.trace),
            }));
        } catch (error) {
            return Object.freeze({
                schema: CALCULUS_GRAPH_RANGE_SCHEMA,
                functionId: calculusGraphStructuralKey(expression),
                expression,
                evaluationExpression,
                simplification,
                budgets,
                bindings,
                range: RationalIntervalSet.empty,
                status: "unknown",
                certified: false,
                domainStatus: "unresolved",
                exactImage: false,
                goalMet: false,
                diagnostics: Object.freeze([error.message]),
                work: Object.freeze({ nodes: totalNodes, reuses: totalReuses, subintervals: partitions.length }),
                evidence: Object.freeze({
                    kind: "calculusGraphEvaluation",
                    checker: CALCULUS_GRAPH_RANGE_CHECKER,
                    expression,
                    evaluationExpression,
                    simplification,
                    bindings: sourceBindings,
                    options,
                    conventions,
                    trace: Object.freeze(trace),
                }),
            });
        }
    }

    const range = evaluated.reduce(
        (combined, piece) => combined.union(piece.range), RationalIntervalSet.empty,
    );
    const domainStatus = aggregateCoverage(evaluated);
    const certified = evaluated.every((piece) => piece.certified) && domainStatus !== "unresolved";
    const exactImage = evaluated.every((piece) => piece.exactImage) && domainStatus !== "unresolved";
    const exclusions = evaluated.flatMap((piece) => piece.exclusions);
    return Object.freeze({
        schema: CALCULUS_GRAPH_RANGE_SCHEMA,
        functionId: calculusGraphStructuralKey(expression),
        expression,
        evaluationExpression,
        simplification,
        budgets,
        bindings,
        range,
        status: certified ? "enclosed" : "unknown",
        certified,
        domainStatus,
        exactImage,
        goalMet: certified,
        diagnostics: Object.freeze(certified ? [] : ["calculusGraphRangeUnresolved"]),
        exclusions: Object.freeze(exclusions),
        work: Object.freeze({ nodes: totalNodes, reuses: totalReuses, subintervals: partitions.length }),
        evidence: Object.freeze({
            kind: "calculusGraphEvaluation",
            checker: CALCULUS_GRAPH_RANGE_CHECKER,
            expression,
            evaluationExpression,
            simplification,
            bindings: sourceBindings,
            options,
            conventions,
            trace: Object.freeze(trace),
        }),
    });
}

export function evaluateCalculusGraphRange(
    expression,
    bindings,
    options = map([]),
    conventions = { zeroPowerZero: "undefined" },
) {
    return rangeResult(expression, bindings, options, conventions);
}

export function checkCalculusGraphRangeResult(candidate) {
    const evidence = candidate?.evidence;
    if (candidate?.schema !== CALCULUS_GRAPH_RANGE_SCHEMA ||
        evidence?.kind !== "calculusGraphEvaluation" ||
        evidence?.checker !== CALCULUS_GRAPH_RANGE_CHECKER) {
        return Object.freeze({ accepted: false, certified: false, reason: "unsupportedGraphRangeEvidence" });
    }
    const recomputed = rangeResult(evidence.expression, evidence.bindings, evidence.options, evidence.conventions);
    const accepted = candidate.functionId === recomputed.functionId &&
        candidate.range.equals(recomputed.range) &&
        candidate.domainStatus === recomputed.domainStatus &&
        candidate.certified === recomputed.certified &&
        candidate.exactImage === recomputed.exactImage;
    return Object.freeze({
        accepted,
        certified: accepted && recomputed.certified,
        reason: accepted ? null : "graphRangeClaimMismatch",
        checkedBy: CALCULUS_GRAPH_RANGE_CHECKER,
        functionId: recomputed.functionId,
        domainStatus: recomputed.domainStatus,
    });
}

function portable(value) {
    if (value === undefined || value === null || value === false) return null;
    if (value === true) return new Integer(1n);
    if (value instanceof Integer || value instanceof Rational ||
        value instanceof RationalInterval || value instanceof RationalIntervalSet) return value;
    if (typeof value === "bigint") return new Integer(value);
    if (typeof value === "number" && Number.isSafeInteger(value)) return new Integer(BigInt(value));
    if (typeof value === "string") return text(value);
    if (Array.isArray(value)) return sequence(value.map(portable));
    if (value instanceof Set) return sequence([...value].map(portable));
    if (value instanceof Map) return map([...value].map(([key, entry]) => [key, portable(entry)]));
    if (["map", "sequence", "array", "tuple", "string"].includes(value?.type)) return value;
    if (typeof value === "object") {
        return map(Object.entries(value).map(([key, entry]) => [key, portable(entry)]));
    }
    return text(value);
}

export function calculusGraphRangeValue(expression, bindings, options, context) {
    const policy = rangeMathPolicy(context);
    const conventions = Object.freeze({ zeroPowerZero: policy.zeroPowerZero });
    const result = evaluateCalculusGraphRange(expression, bindings, options, conventions);
    const check = checkCalculusGraphRangeResult(result);
    const interval = result.range.toRationalInterval();
    const value = map([
        ["valueKind", text("calculusGraphRange")],
        ["schema", text(result.schema)],
        ["functionId", text(result.functionId)],
        ["expression", expression],
        ["evaluationExpression", result.evaluationExpression],
        ["simplification", portable(result.simplification)],
        ["bindings", bindings],
        ["status", text(result.status)],
        ["range", result.range],
        ["interval", interval],
        ["certified", portable(check.certified)],
        ["domainStatus", text(result.domainStatus)],
        ["exactImage", portable(result.exactImage)],
        ["goalMet", portable(result.goalMet)],
        ["evidenceLevel", text(check.certified ? "checkedEvidence" : "heuristic")],
        ["work", portable(result.work)],
        ["budgets", portable(result.budgets)],
        ["diagnostics", portable(result.diagnostics)],
        ["exclusions", portable(result.exclusions || [])],
        ["evidence", portable(result.evidence)],
        ["checker", portable(check)],
    ]);
    if (check.certified) {
        result.range._ext = new Map([["rangeEvidence", map([
            ["schema", text(result.schema)],
            ["functionId", text(result.functionId)],
            ["domainStatus", text(result.domainStatus)],
            ["evidence", portable(result.evidence)],
            ["checker", portable(check)],
        ])]]);
    }
    const diagnosticCategories = [
        ...(result.exclusions || []).map((entry) => entry.reason),
        ...(result.domainStatus === "allDefined" ? [] : [result.domainStatus]),
    ];
    const throwing = diagnosticCategories.find((category) =>
        rangeDiagnosticAction(policy, category) === "throw");
    if (throwing) {
        const error = new Error(`Calculus graph range encountered ${throwing}`);
        error.rangeEvidence = value;
        throw error;
    }
    return value;
}

export function calculusGraphRangeCheckValue(value) {
    if (value?.type !== "map") {
        return portable({ accepted: false, certified: false, reason: "notCalculusGraphRange" });
    }
    const evidence = mapValue(value, "evidence");
    const expression = mapValue(evidence, "expression");
    const bindings = mapValue(evidence, "bindings");
    const options = mapValue(evidence, "options") ?? map([]);
    const conventionValue = mapValue(evidence, "conventions");
    const zeroPowerZero = textValue(mapValue(conventionValue, "zeropowerzero")) ?? "undefined";
    if (textValue(mapValue(value, "schema")) !== CALCULUS_GRAPH_RANGE_SCHEMA ||
        textValue(mapValue(evidence, "kind")) !== "calculusGraphEvaluation" ||
        textValue(mapValue(evidence, "checker")) !== CALCULUS_GRAPH_RANGE_CHECKER ||
        !isExpression(expression) || !["map", "array", "sequence", "tuple"].includes(bindings?.type)) {
        return portable({
            accepted: false,
            certified: false,
            reason: "unsupportedGraphRangeEvidence",
            checkedBy: CALCULUS_GRAPH_RANGE_CHECKER,
        });
    }
    const recomputed = evaluateCalculusGraphRange(expression, bindings, options, { zeroPowerZero });
    const range = mapValue(value, "range");
    const accepted = range instanceof RationalIntervalSet &&
        textValue(mapValue(value, "functionid")) === recomputed.functionId &&
        range.equals(recomputed.range) &&
        textValue(mapValue(value, "domainstatus")) === recomputed.domainStatus &&
        (mapValue(value, "certified") instanceof Integer) === recomputed.certified &&
        (mapValue(value, "exactimage") instanceof Integer) === recomputed.exactImage;
    return portable({
        accepted,
        certified: accepted && recomputed.certified,
        reason: accepted ? null : "graphRangeClaimMismatch",
        checkedBy: CALCULUS_GRAPH_RANGE_CHECKER,
        functionId: recomputed.functionId,
        domainStatus: recomputed.domainStatus,
    });
}

export function calculusGraphRecognitionValue(expression, variable, options) {
    return portable(recognizeCalculusGraph(expression, variable, options));
}

/** RiX adapter for canonical, domain-preserving graph simplification. */
export function calculusGraphSimplificationValue(expression) {
    const result = simplifyCalculusGraph(expression);
    return portable({ ...result, expression:coreGraph(result.expression), checker: checkCalculusGraphSimplification(result) });
}

/** RiX adapter for independent graph-simplification checking. */
export function calculusGraphSimplificationCheckValue(value) {
    return portable(checkCalculusGraphSimplification(value));
}

/** RiX adapter for a theorem-named Symbolic rewrite proposal. */
export function calculusGraphRewriteValue(source, expression, theorem) {
    return portable(proposeCalculusGraphRewrite(source, expression, theorem));
}

/** RiX adapter for independent theorem and side-condition checking. */
export function calculusGraphRewriteCheckValue(value) {
    return portable(checkCalculusGraphRewrite(value));
}

/** RiX adapter for the independently recomputed primitive derivative check. */
export function calculusDerivativeCheckValue(transformation, options) {
    return portable(checkCalculusDerivativeTransformation(transformation, options));
}

/** RiX adapter for generic checked derivative-sign reasoning. */
export function calculusDerivativeSignValue(transformation, bindings, options, context) {
    const conventions = rangeMathPolicy(context);
    const result = evaluateCalculusDerivativeSign(
        transformation,
        bindings,
        options,
        { zeroPowerZero: conventions.zeroPowerZero },
    );
    return portable(result);
}

function calculusStrategyValue(evaluate, transformation, bindings, options, context) {
    const policy = rangeMathPolicy(context);
    const conventions = Object.freeze({ zeroPowerZero: policy.zeroPowerZero });
    const result = evaluate(transformation, bindings, options, conventions);
    const check = checkCalculusStrategyRangeResult(result);
    const value = portable({ ...result, checker: check });
    if (check.certified && result.range instanceof RationalIntervalSet) {
        result.range._ext = new Map([["rangeEvidence", portable({
            schema: result.schema,
            strategy: result.strategy,
            domainStatus: result.domainStatus,
            evidence: result.evidence,
            checker: check,
        })]]);
    }
    return value;
}

/** RiX adapter for the checked Lipschitz midpoint strategy. */
export function calculusLipschitzRangeValue(transformation, bindings, options, context) {
    return calculusStrategyValue(
        evaluateCalculusLipschitzRange, transformation, bindings, options, context,
    );
}

/** RiX adapter for the checked second-derivative Taylor strategy. */
export function calculusTaylorRangeValue(transformation, bindings, options, context) {
    return calculusStrategyValue(
        evaluateCalculusTaylorRange, transformation, bindings, options, context,
    );
}
