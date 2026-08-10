import { parse } from "../parser/parser.js";
import { posToLineCol } from "../parser/tokenizer.js";

const ASSIGNMENT_OPERATORS = new Set(["=", ":=", "~=", "::=", "~~="]);
const UPDATE_OPERATORS = new Set(["~=", "~~=", "+=", "-=", "*=", "/=", "//=", "%=", "^=", "**=", "++=", "\\/=", "/\\=", "\\="]);
const COMPARISON_OPERATORS = new Set(["==", "!=", "<", ">", "<=", ">="]);
const LOGICAL_OPERATORS = new Set(["&&", "AND", "||", "OR"]);
const KNOWN_IMMUTABLE_METHODS = new Set(["P", "Polynomial", "R", "RationalFunction"]);
const KNOWN_IMMUTABLE_SYSTEM_CALLS = new Set([
    "IMMUTABLEVALUE", "poly", "polynomial", "p", "ratfun", "rationalFunction",
]);

class LintScope {
    constructor(parent, kind) {
        this.parent = parent;
        this.kind = kind;
        this.bindings = new Map();
    }

    declare(name, details = {}) {
        if (!name || this.bindings.has(name)) return this.bindings.get(name) || null;
        const binding = { name, ...details };
        this.bindings.set(name, binding);
        return binding;
    }

    current(name) {
        return this.bindings.get(name) || null;
    }

    outer(name) {
        let scope = this.parent;
        while (scope) {
            const binding = scope.bindings.get(name);
            if (binding) return { scope, binding };
            scope = scope.parent;
        }
        return null;
    }

    resolve(name) {
        const current = this.current(name);
        return current ? { scope: this, binding: current } : this.outer(name);
    }
}

function statementExpression(node) {
    return node?.type === "Statement" ? node.expression : node;
}

function targetNames(node, names = []) {
    if (!node || typeof node !== "object") return names;
    if (node.type === "UserIdentifier" || node.type === "SystemIdentifier") {
        names.push({ name: node.name, node });
        return names;
    }
    if (node.type === "DestructureName" && node.name) {
        names.push({ name: node.name, node });
        return names;
    }
    for (const key of ["elements", "targets", "items"]) {
        if (Array.isArray(node[key])) {
            for (const child of node[key]) targetNames(child, names);
        }
    }
    return names;
}

function parameterEntries(parameters) {
    if (!parameters || typeof parameters !== "object") return [];
    return [
        ...(parameters.positional || []),
        ...(parameters.keyword || []),
        ...(parameters.conditionals || []),
    ];
}

function parameterDefault(entry) {
    return entry?.holeDefault || entry?.defaultValue || null;
}

function isNumericLiteral(node) {
    return node?.type === "Number";
}

function isKnownImmutableExpression(node) {
    const expression = statementExpression(node);
    if (!expression) return false;
    if (expression.type === "SystemCall") {
        return KNOWN_IMMUTABLE_SYSTEM_CALLS.has(expression.name);
    }
    if (expression.type === "MethodCall") {
        return KNOWN_IMMUTABLE_METHODS.has(expression.method);
    }
    return false;
}

function containsUncertainValue(node, scope, seen = new Set()) {
    if (!node || typeof node !== "object" || seen.has(node)) return false;
    seen.add(node);
    if (node.type === "UndecidedLiteral" || node.type === "HaloContainer") return true;
    if (node.type === "Number" && String(node.value).includes("?")) return true;
    if (node.type === "UserIdentifier") {
        return scope?.resolve(node.name)?.binding?.uncertainValue === true;
    }
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
            if (value.some((child) => containsUncertainValue(child, scope, seen))) return true;
        } else if (value && typeof value === "object" && containsUncertainValue(value, scope, seen)) {
            return true;
        }
    }
    return false;
}

function expressionMayBeUndecided(node, scope) {
    if (!node) return false;
    if (node.type === "UndecidedLiteral") return true;
    if (node.type === "UserIdentifier") {
        return scope.resolve(node.name)?.binding?.decisionMayBeUndecided === true;
    }
    if (node.type === "BinaryOperation" && COMPARISON_OPERATORS.has(node.operator)) {
        return containsUncertainValue(node.left, scope) || containsUncertainValue(node.right, scope);
    }
    return containsUncertainValue(node, scope);
}

function sourceOffset(node) {
    if (!Array.isArray(node?.pos)) return 0;
    return Number.isFinite(node.pos[0]) ? node.pos[0] : 0;
}

function countOuterIdentifiers(node, state = { count: 0, names: new Set(), seen: new Set() }) {
    if (!node || typeof node !== "object" || state.seen.has(node)) return state;
    state.seen.add(node);
    if (node.type === "OuterIdentifier") {
        state.count += 1;
        state.names.add(node.name);
    }
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
            for (const child of value) countOuterIdentifiers(child, state);
        } else if (value && typeof value === "object") {
            countOuterIdentifiers(value, state);
        }
    }
    return state;
}

function importLocalName(spec) {
    return spec?.local || spec?.name || spec?.target || null;
}

function assignmentDetails(node) {
    const expression = statementExpression(node);
    if (expression?.type !== "BinaryOperation") return null;
    if (!ASSIGNMENT_OPERATORS.has(expression.operator) && !UPDATE_OPERATORS.has(expression.operator)) return null;
    return expression;
}

function declarationNodes(nodes, options = {}) {
    const result = [];
    const scan = (raw) => {
        const node = statementExpression(raw);
        if (!node) return;
        const assignment = assignmentDetails(node);
        if (assignment && !UPDATE_OPERATORS.has(assignment.operator)) {
            for (const target of targetNames(assignment.left)) {
                result.push({ ...target, initializer: assignment.right, declaration: assignment });
            }
            return;
        }
        if (node.type === "FunctionDefinition" || node.type === "FunctionVariantDefinition") {
            const name = node.name?.name || node.name?.value || node.name;
            if (name) result.push({ name, node: node.name || node, initializer: node, declaration: node });
            return;
        }
        if (node.type === "SequenceExpression") {
            for (const child of node.expressions || []) scan(child);
            return;
        }
        if (options.shareBlocks && node.type === "BlockContainer") {
            for (const child of node.elements || []) scan(child);
        }
    };
    for (const node of nodes || []) scan(node);
    return result;
}

export function analyzeRix(source, options = {}) {
    const file = options.file || "<input>";
    const ast = options.ast || parse(source, options.systemLookup, {
        operatorDefinitions: options.operatorDefinitions,
        operatorOwner: options.operatorOwner || null,
        file,
    });
    const diagnostics = [];
    const scopes = [];
    const emitted = new Set();

    const emit = (code, severity, node, message, hint = null, extra = {}) => {
        const offset = sourceOffset(node);
        const key = `${code}:${offset}:${message}`;
        if (emitted.has(key)) return;
        emitted.add(key);
        const { line, col } = posToLineCol(source, offset);
        diagnostics.push({
            code,
            severity,
            message,
            hint,
            file,
            line,
            column: col,
            offset,
            ...extra,
        });
    };

    const recordScope = (node, scope, role = "value") => {
        if (!node || !["UserIdentifier", "SystemIdentifier", "OuterIdentifier"].includes(node.type)) return;
        const outerAccess = node.type === "OuterIdentifier";
        const resolved = role === "declaration"
            ? { scope, binding: scope.current(node.name) }
            : outerAccess
                ? (scope.current(node.name) ? { scope, binding: scope.current(node.name) } : scope.outer(node.name))
                : scope.resolve(node.name);
        const offset = sourceOffset(node);
        const { line, col } = posToLineCol(source, offset);
        let status = "unresolved";
        let recommendation = null;
        if (role === "mapKey") status = "literal-key";
        else if (role === "declaration") status = "declaration";
        else if (outerAccess && scope.current(node.name)) {
            status = "spurious-outer";
            recommendation = node.name;
        } else if (!outerAccess && !scope.current(node.name) && scope.outer(node.name) && role !== "callee") {
            status = "capture-required";
            recommendation = `@${node.name}`;
        } else if (resolved?.scope === scope) status = "current";
        else if (resolved) status = role === "callee" ? "callable-outer" : "captured-outer";
        scopes.push({
            name: node.name,
            access: outerAccess ? "outer" : "bare",
            role,
            status,
            owner: resolved?.scope?.kind || null,
            recommendation,
            file,
            line,
            column: col,
            offset,
        });
    };

    const declareAll = (scope, nodes, declarationOptions = {}) => {
        for (const declaration of declarationNodes(nodes, declarationOptions)) {
            const outer = scope.outer(declaration.name);
            const binding = scope.declare(declaration.name, {
                node: declaration.node,
                initializer: declaration.initializer,
                immutable: isKnownImmutableExpression(declaration.initializer),
                uncertainValue: containsUncertainValue(declaration.initializer, scope),
                decisionMayBeUndecided: expressionMayBeUndecided(declaration.initializer, scope),
            });
            if (binding && outer && ["block", "loop", "system", "async"].includes(scope.kind)) {
                emit(
                    "RX1302",
                    "warning",
                    declaration.node,
                    `Local '${declaration.name}' shadows a binding in the enclosing ${outer.scope.kind} scope.`,
                    `Use '${declaration.name}' for the local binding and '@${declaration.name}' for the enclosing binding.`,
                );
            }
        }
    };

    const declareImports = (scope, node) => {
        for (const spec of node?.imports || []) {
            const name = importLocalName(spec);
            if (name) scope.declare(name, { node: spec, imported: true });
        }
    };

    const decisionBinding = (node, scope) => {
        if (node?.type !== "UserIdentifier") return null;
        return scope.resolve(node.name)?.binding || null;
    };

    const warnNumericDecision = (node, scope, construct) => {
        const binding = decisionBinding(node, scope);
        if (!isNumericLiteral(node) && !binding?.numericDefault) return;
        const name = node?.name ? ` '${node.name}'` : "";
        emit(
            "RX1101",
            "warning",
            node,
            `Numeric value${name} is used directly as ${construct}; 0 is truthy in RiX.`,
            "Use '_' for a decided negative value, or compare the number explicitly.",
        );
    };

    const warnCaptureDensity = (branch) => {
        if (branch?.type !== "BlockContainer") return;
        const captures = countOuterIdentifiers(branch);
        if (captures.count < 5 && captures.names.size < 4) return;
        emit(
            "RX2001",
            "info",
            branch,
            `Lazy branch captures ${captures.names.size} enclosing bindings across ${captures.count} references.`,
            "Consider extracting the branch into a helper with explicit parameters.",
            { captures: [...captures.names].sort() },
        );
    };

    const visitParameters = (parameters, functionScope, outerScope, visit) => {
        for (const entry of parameterEntries(parameters)) {
            const fallback = parameterDefault(entry);
            functionScope.declare(entry.name, {
                node: entry,
                parameter: true,
                numericDefault: isNumericLiteral(fallback),
                uncertainValue: containsUncertainValue(fallback, outerScope),
            });
            if (fallback) visit(fallback, outerScope, { role: "value" });
        }
    };

    const visitFunction = (node, parentScope, visit) => {
        const functionScope = new LintScope(parentScope, "function");
        visitParameters(node.parameters, functionScope, parentScope, visit);
        const body = node.body;
        if (body?.type === "BlockContainer") {
            declareImports(functionScope, body);
            declareAll(functionScope, body.elements, { shareBlocks: false });
            for (const element of body.elements || []) visit(element, functionScope, { role: "value" });
        } else {
            visit(body, functionScope, { role: "value" });
        }
    };

    const visit = (rawNode, scope, state = {}) => {
        const node = statementExpression(rawNode);
        if (!node || typeof node !== "object") return;

        if (node.type === "UserIdentifier") {
            recordScope(node, scope, state.role || "value");
            if (state.role === "declaration" || state.role === "mapKey" || state.role === "callee") return;
            if (!scope.current(node.name) && scope.outer(node.name)) {
                emit(
                    "RX1001",
                    "warning",
                    node,
                    `'${node.name}' belongs to an enclosing scope and is not captured here.`,
                    `Use '@${node.name}', or import it explicitly in the block header.`,
                );
            }
            return;
        }

        if (node.type === "SystemIdentifier") {
            recordScope(node, scope, state.role || "value");
            if (
                state.role !== "declaration"
                && state.role !== "mapKey"
                && state.role !== "callee"
                && !scope.current(node.name)
                && scope.outer(node.name)
            ) {
                emit(
                    "RX1001",
                    "warning",
                    node,
                    `'${node.name}' belongs to an enclosing scope and is not captured here.`,
                    `Use '@${node.name}' for a value reference. Direct calls may keep the bare callable name.`,
                );
            }
            return;
        }

        if (node.type === "OuterIdentifier") {
            recordScope(node, scope, state.role || "value");
            if (scope.current(node.name)) {
                emit(
                    "RX1002",
                    "warning",
                    node,
                    `'@${node.name}' requests an outer binding, but '${node.name}' belongs to the current ${scope.kind} scope.`,
                    `Remove '@' and use '${node.name}'.`,
                );
            }
            return;
        }

        if (node.type === "FunctionDefinition" || node.type === "FunctionVariantDefinition" || node.type === "FunctionLambda") {
            visitFunction(node, scope, visit);
            return;
        }

        if (node.type === "BlockContainer" || node.type === "SystemContainer" || node.type === "AsyncContainer") {
            if (state.sharedScope) {
                declareImports(scope, node);
                declareAll(scope, node.elements, { shareBlocks: false });
                for (const element of node.elements || []) visit(element, scope, { role: "value" });
                return;
            }
            const kind = node.type === "BlockContainer" ? "block" : node.type === "SystemContainer" ? "system" : "async";
            const child = new LintScope(scope, kind);
            declareImports(child, node);
            declareAll(child, node.elements, { shareBlocks: false });
            for (const element of node.elements || []) visit(element, child, { role: "value" });
            return;
        }

        if (node.type === "LoopContainer") {
            const loopScope = new LintScope(scope, "loop");
            declareImports(loopScope, node);
            declareAll(loopScope, node.elements, { shareBlocks: true });
            const condition = node.elements?.[1];
            if (condition) {
                warnNumericDecision(condition, loopScope, "a loop condition");
                if (expressionMayBeUndecided(condition, loopScope)) {
                    emit(
                        "RX1102",
                        "warning",
                        condition,
                        "Loop condition may be undecided; the loop will return '?' instead of continuing or terminating.",
                        "Resolve or refine the decision before entering the loop.",
                    );
                }
            }
            for (const element of node.elements || []) {
                visit(element, loopScope, { role: "value", sharedScope: element?.type === "BlockContainer" });
            }
            return;
        }

        if (node.type === "TernaryOperation") {
            warnNumericDecision(node.condition, scope, "a conditional decision");
            if (!node.undecidedExpression && expressionMayBeUndecided(node.condition, scope)) {
                emit(
                    "RX1102",
                    "warning",
                    node.condition,
                    "Conditional decision may be undecided, but the expression has no '??' branch.",
                    "Add '?? fallback' or deliberately propagate the undecided result.",
                );
            }
            visit(node.condition, scope, { role: "value" });
            for (const branch of [node.trueExpression, node.nullExpression, node.undecidedExpression]) {
                warnCaptureDensity(branch);
                visit(branch, scope, { role: "value" });
            }
            return;
        }

        if (node.type === "CaseContainer") {
            for (const element of node.elements || []) {
                if (element?.type === "BinaryOperation" && element.operator === "?") {
                    warnNumericDecision(element.left, scope, "a case decision");
                    visit(element.left, scope, { role: "value" });
                    visit(element.right, scope, { role: "value" });
                } else {
                    visit(element, scope, { role: "value" });
                }
            }
            return;
        }

        if (node.type === "FunctionCall") {
            visit(node.function, scope, { role: "callee" });
            for (const value of Object.values(node.arguments || {})) {
                if (Array.isArray(value)) for (const argument of value) visit(argument, scope, { role: "value" });
                else if (value && typeof value === "object") {
                    for (const argument of Object.values(value)) visit(argument, scope, { role: "value" });
                }
            }
            return;
        }

        if (node.type === "MapEntry") {
            visit(node.key, scope, { role: "mapKey" });
            visit(node.value, scope, { role: "value" });
            return;
        }

        if (node.type === "BinaryOperation") {
            const assignment = ASSIGNMENT_OPERATORS.has(node.operator) || UPDATE_OPERATORS.has(node.operator);
            if (assignment) {
                if (UPDATE_OPERATORS.has(node.operator)) {
                    const target = node.left;
                    const resolved = target?.type === "OuterIdentifier"
                        ? scope.outer(target.name)
                        : target?.name ? scope.resolve(target.name) : null;
                    if (resolved?.binding?.immutable) {
                        emit(
                            "RX1201",
                            "warning",
                            target,
                            `Identity-preserving update '${node.operator}' targets '${target.name}', whose value appears immutable.`,
                            "Use an appropriate rebind/copy assignment, or carry immutable values inside a mutable state holder.",
                        );
                    }
                    visit(node.left, scope, { role: "value" });
                } else {
                    visit(node.left, scope, { role: "declaration" });
                }
                visit(node.right, scope, { role: "value" });
                return;
            }
            if (LOGICAL_OPERATORS.has(node.operator)) {
                warnNumericDecision(node.left, scope, "a logical operand");
                warnNumericDecision(node.right, scope, "a logical operand");
            }
            visit(node.left, scope, { role: "value" });
            visit(node.right, scope, { role: "value" });
            return;
        }

        if (node.type === "UnaryOperation") {
            if (node.operator === "!" || node.operator === "NOT") {
                warnNumericDecision(node.operand, scope, "a logical operand");
            }
            visit(node.operand, scope, { role: "value" });
            return;
        }

        for (const [key, value] of Object.entries(node)) {
            if (["pos", "original", "systemInfo", "metadata"].includes(key)) continue;
            if (Array.isArray(value)) {
                for (const child of value) visit(child, scope, { role: "value" });
            } else if (value && typeof value === "object") {
                visit(value, scope, { role: "value" });
            }
        }
    };

    const root = new LintScope(null, "root");
    declareAll(root, ast, { shareBlocks: false });
    for (const node of ast) visit(node, root, { role: "value" });

    diagnostics.sort((left, right) => left.offset - right.offset || left.code.localeCompare(right.code));
    scopes.sort((left, right) => left.offset - right.offset || left.name.localeCompare(right.name));
    return { diagnostics, scopes };
}

export function lintRix(source, options = {}) {
    return analyzeRix(source, options).diagnostics;
}

export function explainRixScopes(source, options = {}) {
    return analyzeRix(source, options).scopes;
}

export function formatLintDiagnostic(diagnostic) {
    const location = `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}`;
    const first = `${location} ${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}`;
    return diagnostic.hint ? `${first}\n  hint: ${diagnostic.hint}` : first;
}
