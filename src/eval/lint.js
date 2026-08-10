import { parse } from "../parser/parser.js";
import { posToLineCol } from "../parser/tokenizer.js";

export const RIX_LINT_LEVELS = Object.freeze({
    essential: 1,
    standard: 2,
    thorough: 3,
    pedantic: 4,
});

export const RIX_LINT_PROFILES = Object.freeze({
    default: ["core", "syntax"],
    plugin: ["core", "syntax", "plugin"],
    reactive: ["core", "syntax", "reactive"],
    math: ["core", "syntax", "math"],
    teaching: ["core", "syntax", "math", "reactive", "teaching"],
    pedantic: ["core", "syntax", "math", "reactive", "plugin", "teaching", "style"],
    all: ["core", "syntax", "math", "reactive", "plugin", "teaching", "style"],
});

export const RIX_LINT_RULES = Object.freeze({
    RX1001: { level: 1, profiles: ["core"], title: "Missing outer capture" },
    RX1002: { level: 1, profiles: ["core"], title: "Spurious outer capture" },
    RX1003: { level: 1, profiles: ["core"], title: "Unresolved explicit capture" },
    RX1101: { level: 1, profiles: ["core", "teaching"], title: "Numeric decision" },
    RX1102: { level: 1, profiles: ["core"], title: "Undecided result is not handled" },
    RX1201: { level: 1, profiles: ["core"], title: "Immutable identity update" },
    RX1202: { level: 2, profiles: ["core", "teaching"], title: "Mutable value alias" },
    RX1203: { level: 2, profiles: ["core", "teaching"], title: "Ignored non-mutating result" },
    RX1302: { level: 2, profiles: ["core"], title: "Shadowed binding" },
    RX1303: { level: 1, profiles: ["core"], title: "Path-dependent initialization" },
    RX1401: { level: 2, profiles: ["core"], title: "Loop condition cannot change" },
    RX1402: { level: 1, profiles: ["core"], title: "Duplicate loop progress" },
    RX1403: { level: 3, profiles: ["core"], title: "Loop-local closure capture" },
    RX1501: { level: 3, profiles: ["core"], title: "Non-tail self recursion" },
    RX1601: { level: 1, profiles: ["reactive"], title: "Untracked reactive snapshot" },
    RX1602: { level: 3, profiles: ["reactive"], title: "Reactive identity read" },
    RX1603: { level: 1, profiles: ["reactive"], title: "Unpublished reactive mutation" },
    RX1604: { level: 1, profiles: ["reactive"], title: "Reactive dependency cycle" },
    RX1701: { level: 1, profiles: ["syntax", "teaching"], title: "Lowercase call-like multiplication" },
    RX1702: { level: 1, profiles: ["syntax", "teaching"], title: "Zero index in a one-based collection" },
    RX1703: { level: 2, profiles: ["syntax", "teaching"], title: "Collection or string decision" },
    RX1704: { level: 3, profiles: ["style"], title: "Dense nested conditional" },
    RX1705: { level: 3, profiles: ["teaching", "style"], title: "Block introduces capture boundary" },
    RX1706: { level: 4, profiles: ["teaching", "style"], title: "Function value reference" },
    RX1801: { level: 2, profiles: ["math", "teaching"], title: "Exact division versus truncation" },
    RX1802: { level: 3, profiles: ["math", "teaching"], title: "Fraction equality policy" },
    RX1803: { level: 3, profiles: ["math"], title: "Exactness discarded" },
    RX1804: { level: 1, profiles: ["math"], title: "Unchecked divisor" },
    RX1805: { level: 1, profiles: ["math", "plugin"], title: "Polynomial division dependency" },
    RX1806: { level: 1, profiles: ["math", "plugin"], title: "Unbounded refinement" },
    RX1901: { level: 1, profiles: ["plugin"], title: "Plugin header contract" },
    RX1902: { level: 2, profiles: ["plugin"], title: "Plugin export contract" },
    RX1903: { level: 1, profiles: ["plugin"], title: "Plugin mount contract" },
    RX1904: { level: 1, profiles: ["plugin"], title: "Unsatisfied plugin dependency" },
    RX1905: { level: 1, profiles: ["plugin"], title: "Plugin capability collision" },
    RX1906: { level: 1, profiles: ["plugin"], title: "RiX plugin host dependency" },
    RX1907: { level: 2, profiles: ["plugin"], title: "Plugin schema contract" },
    RX1908: { level: 2, profiles: ["plugin"], title: "Mutation naming contract" },
    RX1909: { level: 3, profiles: ["plugin"], title: "Plugin initialization idempotence" },
    RX1910: { level: 2, profiles: ["plugin"], title: "Capability group mismatch" },
    RX2001: { level: 3, profiles: ["style"], title: "Capture-dense lazy branch" },
    RX2002: { level: 4, profiles: ["style"], title: "Suppression lacks a reason" },
});

const ASSIGNMENT_OPERATORS = new Set(["=", ":=", "~=", "::=", "~~="]);
const UPDATE_OPERATORS = new Set(["~=", "~~=", "+=", "-=", "*=", "/=", "//=", "%=", "^=", "**=", "++=", "\\/=", "/\\=", "\\="]);
const COMPARISON_OPERATORS = new Set(["==", "!=", "<", ">", "<=", ">="]);
const LOGICAL_OPERATORS = new Set(["&&", "AND", "||", "OR"]);
const KNOWN_IMMUTABLE_METHODS = new Set(["P", "Polynomial", "R", "RationalFunction"]);
const KNOWN_IMMUTABLE_SYSTEM_CALLS = new Set([
    "IMMUTABLEVALUE", "poly", "polynomial", "p", "ratfun", "rationalFunction",
]);
const KNOWN_MUTABLE_NODE_TYPES = new Set(["Array", "ArrayContainer", "MapContainer", "SetContainer", "TensorContainer"]);
const KNOWN_PURE_COLLECTION_METHODS = new Set([
    "ADD", "APPEND", "CONCAT", "DROP", "DROPLAST", "FILTER", "FLATMAP", "MAP", "PREPEND",
    "PUSH", "REVERSE", "SET", "SLICE", "SORT", "TAKE", "UNIQUE", "WITH",
]);
const DIVISION_OPERATORS = new Set(["/", "//", "%", "/%"]);

function normalizeLintLevel(value = "standard") {
    if (Number.isInteger(value) && value >= 1 && value <= 4) return value;
    const text = String(value).toLowerCase();
    if (/^[1-4]$/.test(text)) return Number(text);
    if (!Object.hasOwn(RIX_LINT_LEVELS, text)) {
        throw new Error(`Unknown RiX lint level '${value}'. Use essential, standard, thorough, or pedantic.`);
    }
    return RIX_LINT_LEVELS[text];
}

function normalizeLintProfiles(value = "default") {
    const requested = Array.isArray(value) ? value : String(value).split(",");
    const result = new Set();
    for (const raw of requested) {
        const profile = String(raw).trim().toLowerCase();
        if (!profile) continue;
        const groups = RIX_LINT_PROFILES[profile];
        if (!groups) throw new Error(`Unknown RiX lint profile '${raw}'.`);
        for (const group of groups) result.add(group);
    }
    if (result.size === 0) for (const group of RIX_LINT_PROFILES.default) result.add(group);
    return result;
}

function diagnosticEnabled(code, options) {
    const rule = RIX_LINT_RULES[code] || { level: 1, profiles: ["core"] };
    if (rule.level > options.level) return false;
    return rule.profiles.some((profile) => options.profiles.has(profile));
}

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
    if (["UserIdentifier", "SystemIdentifier", "OuterIdentifier", "ReactiveCellRef", "ReactiveRef"].includes(node.type)) {
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

function inferredValueKind(node, scope) {
    const expression = statementExpression(node);
    if (!expression) return null;
    if (expression.type === "Number") {
        const value = String(expression.value);
        return /[.?]|\//.test(value) ? "exact-number" : "integer";
    }
    if (expression.type === "String") return "string";
    if (KNOWN_MUTABLE_NODE_TYPES.has(expression.type)) return "collection";
    if (["FunctionDefinition", "FunctionVariantDefinition", "FunctionLambda"].includes(expression.type)) return "function";
    if (["ReactiveCellRef", "ReactiveRef"].includes(expression.type)) return "reactive";
    if (expression.type === "UserIdentifier" || expression.type === "SystemIdentifier") {
        return scope?.resolve(expression.name)?.binding?.valueKind || null;
    }
    if (expression.type === "MethodCall") {
        const method = String(expression.method).toUpperCase();
        if (["F", "FRACTION"].includes(method)) return "fraction";
        if (["P", "POLYNOMIAL"].includes(method)) return "polynomial";
        if (["R", "RATIONALFUNCTION"].includes(method)) return "rational-function";
        if (["FLOAT", "NUMBER"].includes(method)) return "float";
    }
    if (expression.type === "SystemCall") {
        const name = String(expression.name).toUpperCase();
        if (["FRACTION", "FRAC"].includes(name)) return "fraction";
        if (["POLY", "POLYNOMIAL", "P"].includes(name)) return "polynomial";
        if (["RATFUN", "RATIONALFUNCTION"].includes(name)) return "rational-function";
        if (name === "FLOAT") return "float";
    }
    return null;
}

function isMutableExpression(node, scope) {
    const expression = statementExpression(node);
    if (!expression) return false;
    if (KNOWN_MUTABLE_NODE_TYPES.has(expression.type)) return true;
    if (expression.type === "UserIdentifier" || expression.type === "SystemIdentifier") {
        return scope?.resolve(expression.name)?.binding?.mutableValue === true;
    }
    return false;
}

function walkAst(node, callback, seen = new Set()) {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    callback(node);
    for (const [key, value] of Object.entries(node)) {
        if (["pos", "original", "systemInfo", "metadata"].includes(key)) continue;
        if (Array.isArray(value)) for (const child of value) walkAst(child, callback, seen);
        else if (value && typeof value === "object") walkAst(value, callback, seen);
    }
}

function identifierNames(node, types = ["UserIdentifier", "SystemIdentifier", "OuterIdentifier"]) {
    const names = new Set();
    walkAst(node, (child) => {
        if (types.includes(child.type) && child.name) names.add(child.name);
    });
    return names;
}

function writtenNames(node) {
    const names = new Set();
    walkAst(node, (child) => {
        const expression = statementExpression(child);
        if (expression?.type !== "BinaryOperation") return;
        if (!ASSIGNMENT_OPERATORS.has(expression.operator) && !UPDATE_OPERATORS.has(expression.operator)) return;
        for (const target of targetNames(expression.left)) names.add(target.name);
    });
    return names;
}

function directBranchDeclarations(node) {
    const expression = statementExpression(node);
    if (!expression) return new Set();
    if (expression.type === "Grouping") return directBranchDeclarations(expression.expression);
    if (expression.type === "BinaryOperation" && ASSIGNMENT_OPERATORS.has(expression.operator) && !UPDATE_OPERATORS.has(expression.operator)) {
        return new Set(targetNames(expression.left).map(({ name }) => name));
    }
    if (expression.type === "SequenceExpression") {
        const names = new Set();
        for (const item of expression.expressions || []) for (const name of directBranchDeclarations(item)) names.add(name);
        return names;
    }
    return new Set();
}

function isZeroLiteral(node) {
    return node?.type === "Number" && /^[-+]?0(?:\.0+)?$/.test(String(node.value));
}

function guardedAgainstZero(node, name) {
    let guarded = false;
    walkAst(node, (child) => {
        if (child.type !== "BinaryOperation" || !["==", "!="].includes(child.operator)) return;
        const leftName = child.left?.name;
        const rightName = child.right?.name;
        if ((leftName === name && isZeroLiteral(child.right)) || (rightName === name && isZeroLiteral(child.left))) guarded = true;
    });
    return guarded;
}

function ternaryDepth(node) {
    const expression = statementExpression(node);
    if (!expression || expression.type !== "TernaryOperation") return 0;
    return 1 + Math.max(
        ternaryDepth(expression.trueExpression),
        ternaryDepth(expression.nullExpression),
        ternaryDepth(expression.undecidedExpression),
    );
}

function callArguments(node) {
    const positional = node?.arguments?.positional || [];
    const keyword = node?.arguments?.keyword || {};
    return { positional, keyword };
}

function explicitFix(node, source, mode) {
    const offset = sourceOffset(node);
    const name = String(node?.name || "");
    const sameIdentifier = (start) => start >= 0
        && source.slice(start, start + name.length).toLowerCase() === name.toLowerCase();
    const identifierStart = [offset, offset - name.length, offset + 1, offset - name.length - 1]
        .find(sameIdentifier) ?? offset;
    if (mode === "insert-outer") {
        return { start: identifierStart, end: identifierStart, replacement: "@", safe: true, description: `Capture '${node.name}' from the enclosing scope` };
    }
    if (mode === "remove-outer" && source[identifierStart - 1] === "@") {
        return { start: identifierStart - 1, end: identifierStart, replacement: "", safe: true, description: `Use current-scope '${node.name}'` };
    }
    return null;
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
        if (assignment && !UPDATE_OPERATORS.has(assignment.operator) && assignment.left?.type !== "ReactiveRef") {
            for (const target of targetNames(assignment.left).filter(({ node: targetNode }) => targetNode?.type !== "OuterIdentifier")) {
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

function parseLintSuppressions(source) {
    const lines = String(source).split(/\r?\n/);
    const disabled = new Set();
    const suppressedByLine = new Map();
    const malformed = [];
    const directive = /(?:##|\/\*)\s*rix-lint-(disable-next-line|disable-line|disable|enable)\s+([^\n*]+?)(?:\*\/)?\s*$/i;
    const parseCodes = (raw) => raw.split(/\s+--\s+/, 2)[0].split(/[\s,]+/).filter(Boolean).map((code) => code.toUpperCase());
    const hasReason = (raw) => /\s+--\s+\S/.test(raw);
    const addLine = (line, codes) => {
        let set = suppressedByLine.get(line);
        if (!set) {
            set = new Set();
            suppressedByLine.set(line, set);
        }
        for (const code of codes) set.add(code);
    };
    for (let index = 0; index < lines.length; index += 1) {
        const lineNumber = index + 1;
        addLine(lineNumber, disabled);
        const match = lines[index].match(directive);
        if (!match) continue;
        const [, action, body] = match;
        const codes = parseCodes(body);
        if (!hasReason(body) && action !== "enable") malformed.push({ line: lineNumber, body: lines[index] });
        if (action === "disable-next-line") addLine(lineNumber + 1, codes);
        else if (action === "disable-line") addLine(lineNumber, codes);
        else if (action === "disable") for (const code of codes) disabled.add(code);
        else for (const code of codes) disabled.delete(code);
    }
    return { suppressedByLine, malformed };
}

function suppressionMatches(suppressions, diagnostic) {
    const codes = suppressions.suppressedByLine.get(diagnostic.line);
    return codes?.has("ALL") || codes?.has(diagnostic.code);
}

function lintOptionState(options) {
    return {
        level: normalizeLintLevel(options.level ?? "standard"),
        profiles: normalizeLintProfiles(options.profiles ?? options.profile ?? "default"),
    };
}

export function analyzeRix(source, options = {}) {
    const lintOptions = lintOptionState(options);
    const file = options.file || "<input>";
    const ast = options.ast || parse(source, options.systemLookup, {
        operatorDefinitions: options.operatorDefinitions,
        operatorOwner: options.operatorOwner || null,
        file,
    });
    const diagnostics = [];
    const suppressedDiagnostics = [];
    const scopes = [];
    const emitted = new Set();
    const suppressions = parseLintSuppressions(source);
    const publishedReactiveMutations = new Set();
    walkAst(ast, (node) => {
        if (node.type === "MethodCall" && String(node.method).toUpperCase() === "TOUCH" && node.object?.type === "ReactiveCellRef") {
            publishedReactiveMutations.add(node.object.name);
        }
    });

    const emit = (code, severity, node, message, hint = null, extra = {}) => {
        if (!diagnosticEnabled(code, lintOptions)) return;
        const offset = sourceOffset(node);
        const key = `${code}:${offset}:${message}`;
        if (emitted.has(key)) return;
        emitted.add(key);
        const { line, col } = posToLineCol(source, offset);
        const diagnostic = {
            code,
            severity,
            message,
            hint,
            file,
            line,
            column: col,
            offset,
            level: RIX_LINT_RULES[code]?.level || 1,
            title: RIX_LINT_RULES[code]?.title || null,
            ...extra,
        };
        if (suppressionMatches(suppressions, diagnostic)) suppressedDiagnostics.push(diagnostic);
        else diagnostics.push(diagnostic);
    };

    for (const malformed of suppressions.malformed) {
        const offset = source.split(/\r?\n/).slice(0, malformed.line - 1).reduce((sum, line) => sum + line.length + 1, 0);
        emit(
            "RX2002",
            "info",
            { pos: [offset] },
            "Lint suppression has no explanatory reason.",
            "Use '## rix-lint-disable-next-line RX1234 -- reason'.",
        );
    }

    if (options.pluginMetadata) {
        const metadata = options.pluginMetadata;
        // Header declarations are contracts, not implementations. Searching the
        // complete file would make every declared export appear implemented
        // merely because its name occurs in the YAML header.
        const pluginBody = source.replace(/^\s*\/\*{2,}[\s\S]*?\*{2,}\//, "");
        const at = (offset = 0) => ({ pos: [Math.max(0, offset)] });
        const registerPattern = /\.Host\.Register(?:Callable)?Value\s*\(\s*["']([^"']+)["']/g;
        const registeredMounts = [];
        for (const match of source.matchAll(registerPattern)) registeredMounts.push({ name: match[1], offset: match.index });
        if (metadata.kind === "rix" && metadata.mount && registeredMounts.length === 0) {
            emit(
                "RX1903",
                "error",
                at(0),
                `RiX plugin mount '${metadata.mount}' has no visible .Host.RegisterValue or .Host.RegisterCallableValue call.`,
                "Register the mounted namespace during plugin evaluation.",
            );
        } else if (metadata.mount && registeredMounts.length > 0 && !registeredMounts.some(({ name }) => name === metadata.mount)) {
            emit(
                "RX1903",
                "error",
                at(registeredMounts[0].offset),
                `Plugin header mount '${metadata.mount}' does not match registered mount${registeredMounts.length === 1 ? "" : "s"} ${registeredMounts.map(({ name }) => `'${name}'`).join(", ")}.`,
                "Use the same canonical mount in the header and .Host registration.",
            );
        }
        for (const exported of metadata.exports || []) {
            if (!new RegExp(`\\b${String(exported).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(pluginBody)) {
                emit(
                    "RX1902",
                    "warning",
                    at(0),
                    `Declared plugin export '${exported}' is not referenced by the plugin source.`,
                    "Expose the export on the mounted namespace or remove it from the header.",
                    { export: exported },
                );
            }
        }
        if ((metadata.provides || []).length === 0 && (metadata.schemas || []).length === 0) {
            emit(
                "RX1907",
                "info",
                at(0),
                "Plugin declares neither a provided capability contract nor a portable schema.",
                "Add 'provides' and/or 'schemas' when other plugins or hosts consume its values.",
            );
        }
        if (metadata.kind === "rix" && (metadata.permissions || []).length > 0) {
            emit(
                "RX1906",
                "warning",
                at(0),
                `RiX plugin declares host permissions: ${(metadata.permissions || []).join(", ")}.`,
                "Move host-dependent behavior behind a host plugin/capability, leaving the RiX plugin portable.",
            );
        }
        const methods = new Map();
        const methodPattern = /\.Host\.RegisterMethod\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/g;
        for (const match of source.matchAll(methodPattern)) {
            const key = `${match[1].toUpperCase()}:${match[2].toUpperCase()}`;
            if (methods.has(key)) {
                emit(
                    "RX1905",
                    "error",
                    at(match.index),
                    `Receiver method '${match[1]}.${match[2]}' is registered more than once in this plugin.`,
                    "Keep one registration or use distinct method names/preparation variants through the type system.",
                );
            } else methods.set(key, match.index);
            if (!match[2].endsWith("!") && /(?:MUTATE|UPDATE|INPLACE|SETINPLACE)/i.test(source.slice(match.index, match.index + 220))) {
                emit(
                    "RX1908",
                    "warning",
                    at(match.index),
                    `Receiver method '${match[1]}.${match[2]}' appears mutating but its name does not end in '!'.`,
                    "Use a bang method name for in-place mutation, or return a replacement value without mutating the receiver.",
                );
            }
        }
        const unguardedTypeRegister = /\.TypeRegister\s*\(/g;
        for (const match of source.matchAll(unguardedTypeRegister)) {
            const prefix = source.slice(Math.max(0, match.index - 100), match.index);
            if (!/\.TypeKnown\s*\([^)]*\)\s*\?:/.test(prefix)) {
                emit(
                    "RX1909",
                    "info",
                    at(match.index),
                    "Type registration is not visibly guarded by '.TypeKnown(...)'.",
                    "Guard initialization when the plugin may be evaluated more than once.",
                );
            }
        }
        const headerGroups = new Set((metadata.groups || []).map((group) => String(group).toLowerCase()));
        const groupRegistration = source.match(/\.Host\.Register(?:Callable)?Value\s*\([\s\S]*?\[([^\]]*)\]\s*\)/);
        if (groupRegistration) {
            const registeredGroups = [...groupRegistration[1].matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
            const mismatch = registeredGroups.filter((group) => !headerGroups.has(group.toLowerCase()));
            if (mismatch.length > 0) {
                emit(
                    "RX1910",
                    "warning",
                    at(groupRegistration.index),
                    `Registered capability group${mismatch.length === 1 ? "" : "s"} ${mismatch.map((group) => `'${group}'`).join(", ")} ${mismatch.length === 1 ? "is" : "are"} absent from the plugin header.`,
                    "Keep header groups and runtime registration groups aligned for sandbox discovery.",
                );
            }
        }
    }

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
        } else if (!outerAccess && scope.kind !== "function" && !scope.current(node.name) && scope.outer(node.name) && role !== "callee") {
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
                mutableValue: isMutableExpression(declaration.initializer, scope),
                valueKind: inferredValueKind(declaration.initializer, scope),
                reactive: declaration.node?.type === "ReactiveCellRef",
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

    const warnCollectionDecision = (node, scope, construct) => {
        const kind = inferredValueKind(node, scope);
        if (!["string", "collection"].includes(kind)) return;
        emit(
            "RX1703",
            "warning",
            node,
            `${kind === "string" ? "String" : "Collection"} value is used directly as ${construct}; RiX does not use JavaScript emptiness rules.`,
            "Compare length/content explicitly so the intended decision is visible.",
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
                valueKind: inferredValueKind(fallback, outerScope),
                uncertainValue: containsUncertainValue(fallback, outerScope),
            });
            if (fallback) visit(fallback, outerScope, { role: "value" });
        }
    };

    const visitFunction = (node, parentScope, visit, functionName = null, state = {}) => {
        const functionScope = new LintScope(parentScope, "function");
        visitParameters(node.parameters, functionScope, parentScope, visit);
        const body = node.body;
        if (state.loopScope) {
            const parameters = new Set(parameterEntries(node.parameters).map(({ name }) => name));
            const captures = [...identifierNames(body)].filter((name) => state.loopScope.current(name) && !parameters.has(name));
            if (captures.length > 0) {
                emit(
                    "RX1403",
                    "warning",
                    node,
                    `Closure created in a loop refers to loop-local binding${captures.length === 1 ? "" : "s"} ${captures.map((name) => `'${name}'`).join(", ")}.`,
                    "Pass loop values as explicit parameters or make a per-iteration copy before retaining the closure.",
                    { captures: [...new Set(captures)].sort() },
                );
            }
        }
        const functionState = { functionName, functionBody: body, tail: true, loopScope: null };
        if (body?.type === "BlockContainer") {
            declareImports(functionScope, body);
            declareAll(functionScope, body.elements, { shareBlocks: false });
            const elements = body.elements || [];
            for (let index = 0; index < elements.length; index += 1) {
                visit(elements[index], functionScope, {
                    ...functionState,
                    role: "value",
                    tail: index === elements.length - 1,
                    discarded: index < elements.length - 1,
                });
            }
        } else {
            visit(body, functionScope, { ...functionState, role: "value" });
        }
    };

    const visit = (rawNode, scope, state = {}) => {
        const node = statementExpression(rawNode);
        if (!node || typeof node !== "object") return;

        if (node.type === "UserIdentifier") {
            recordScope(node, scope, state.role || "value");
            if (state.role === "declaration" || state.role === "mapKey" || state.role === "callee") return;
            const resolved = scope.resolve(node.name);
            if (state.reactiveDefinition && resolved?.binding?.reactive) {
                emit(
                    "RX1601",
                    "warning",
                    node,
                    `Reactive definition reads '${node.name}' as an untracked snapshot.`,
                    `Use '$${node.name}' when changes should recompute this definition; keep the bare name only for an intentional snapshot.`,
                );
            }
            if (scope.kind !== "function" && !scope.current(node.name) && scope.outer(node.name)) {
                emit(
                    "RX1001",
                    "warning",
                    node,
                    `'${node.name}' belongs to an enclosing scope and is not captured here.`,
                    `Use '@${node.name}', or import it explicitly in the block header.`,
                    { fix: explicitFix(node, source, "insert-outer") },
                );
            }
            return;
        }

        if (node.type === "ReactiveRef") {
            if (state.role !== "declaration" && !scope.resolve(node.name)?.binding?.reactive) {
                emit(
                    "RX1601",
                    "warning",
                    node,
                    `Tracked read '$${node.name}' does not name a statically visible reactive binding.`,
                    "Declare the cell with '$$name :=' or import its reactive identity.",
                );
            }
            return;
        }

        if (node.type === "ReactiveCellRef") {
            if (!["declaration", "reactive-alias", "identity-receiver", "identity-argument"].includes(state.role)) {
                emit(
                    "RX1602",
                    "info",
                    node,
                    `Reactive identity '$$${node.name}' is used where a current value is usually expected.`,
                    `Use '$${node.name}' for a tracked value or '${node.name}' for an untracked snapshot; keep '$$' for identity APIs and aliases.`,
                );
            }
            return;
        }

        if (node.type === "SystemIdentifier") {
            recordScope(node, scope, state.role || "value");
            if (state.role !== "callee" && state.role !== "declaration" && scope.resolve(node.name)?.binding?.valueKind === "function") {
                emit(
                    "RX1706",
                    "info",
                    node,
                    `Function '${node.name}' is referenced as a value rather than called.`,
                    "This is valid; when translating JavaScript, confirm that passing the callable itself was intended.",
                );
            }
            if (
                state.role !== "declaration"
                && state.role !== "mapKey"
                && state.role !== "callee"
                && scope.kind !== "function"
                && !scope.current(node.name)
                && scope.outer(node.name)
            ) {
                emit(
                    "RX1001",
                    "warning",
                    node,
                    `'${node.name}' belongs to an enclosing scope and is not captured here.`,
                    `Use '@${node.name}' for a value reference. Direct calls may keep the bare callable name.`,
                    { fix: explicitFix(node, source, "insert-outer") },
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
                    explicitFix(node, source, "remove-outer") ? { fix: explicitFix(node, source, "remove-outer") } : {},
                );
            } else if (!scope.outer(node.name)) {
                emit(
                    "RX1003",
                    "warning",
                    node,
                    `'@${node.name}' explicitly requests an enclosing binding, but none is visible.`,
                    `Declare or import '${node.name}' in an enclosing scope, or remove the reference.`,
                );
            }
            return;
        }

        if (node.type === "FunctionDefinition" || node.type === "FunctionVariantDefinition" || node.type === "FunctionLambda") {
            const ownName = node.name?.name || node.name?.value || node.name || state.functionName || null;
            visitFunction(node, scope, visit, ownName, state);
            return;
        }

        if (node.type === "BlockContainer" || node.type === "SystemContainer" || node.type === "AsyncContainer") {
            if (state.sharedScope) {
                declareImports(scope, node);
                declareAll(scope, node.elements, { shareBlocks: false });
                const elements = node.elements || [];
                for (let index = 0; index < elements.length; index += 1) {
                    visit(elements[index], scope, {
                        ...state,
                        role: "value",
                        tail: state.tail && index === elements.length - 1,
                        discarded: index < elements.length - 1,
                    });
                }
                return;
            }
            const kind = node.type === "BlockContainer" ? "block" : node.type === "SystemContainer" ? "system" : "async";
            const child = new LintScope(scope, kind);
            declareImports(child, node);
            declareAll(child, node.elements, { shareBlocks: false });
            const elements = node.elements || [];
            if (node.type === "BlockContainer" && elements.length === 1 && countOuterIdentifiers(node).count > 0) {
                emit(
                    "RX1705",
                    "info",
                    node,
                    "A single-expression block creates a new capture boundary.",
                    "Use parentheses for grouping, or keep the block and its explicit captures when laziness/scope is intentional.",
                );
            }
            for (let index = 0; index < elements.length; index += 1) {
                visit(elements[index], child, {
                    ...state,
                    role: "value",
                    tail: state.tail && index === elements.length - 1,
                    discarded: index < elements.length - 1,
                });
            }
            return;
        }

        if (node.type === "LoopContainer") {
            const loopScope = new LintScope(scope, "loop");
            declareImports(loopScope, node);
            declareAll(loopScope, node.elements, { shareBlocks: true });
            const condition = node.elements?.[1];
            if (condition) {
                warnNumericDecision(condition, loopScope, "a loop condition");
                warnCollectionDecision(condition, loopScope, "a loop condition");
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
            const conditionNames = identifierNames(condition);
            const bodyWrites = writtenNames(node.elements?.[2]);
            const updateWrites = writtenNames(node.elements?.[3]);
            const progressNames = new Set([...bodyWrites, ...updateWrites]);
            const relevantConditionNames = [...conditionNames].filter((name) => loopScope.resolve(name));
            if (relevantConditionNames.length > 0 && !relevantConditionNames.some((name) => progressNames.has(name))) {
                emit(
                    "RX1401",
                    "warning",
                    condition,
                    `Loop condition depends on ${relevantConditionNames.map((name) => `'${name}'`).join(", ")}, but the loop body/update does not write any of them.`,
                    "Confirm that another called operation changes the condition, or update the controlling binding explicitly.",
                    { bindings: relevantConditionNames.sort() },
                );
            }
            const duplicateProgress = [...bodyWrites].filter((name) => updateWrites.has(name));
            if (duplicateProgress.length > 0) {
                emit(
                    "RX1402",
                    "warning",
                    node.elements?.[3] || node,
                    `Loop progress binding${duplicateProgress.length === 1 ? "" : "s"} ${duplicateProgress.map((name) => `'${name}'`).join(", ")} ${duplicateProgress.length === 1 ? "is" : "are"} updated in both the body and update slot.`,
                    "Keep each loop-control update in one place to avoid skipped states or double progress.",
                    { bindings: duplicateProgress.sort() },
                );
            }
            for (const element of node.elements || []) {
                visit(element, loopScope, {
                    ...state,
                    role: "value",
                    loopScope,
                    sharedScope: element?.type === "BlockContainer",
                    tail: false,
                });
            }
            return;
        }

        if (node.type === "TernaryOperation") {
            warnNumericDecision(node.condition, scope, "a conditional decision");
            warnCollectionDecision(node.condition, scope, "a conditional decision");
            if (ternaryDepth(node) >= 3) {
                emit(
                    "RX1704",
                    "info",
                    node,
                    `Conditional nesting depth is ${ternaryDepth(node)}.`,
                    "Consider a case container or named helper so undecided and negative branches stay visible.",
                );
            }
            if (!node.undecidedExpression && expressionMayBeUndecided(node.condition, scope)) {
                emit(
                    "RX1102",
                    "warning",
                    node.condition,
                    "Conditional decision may be undecided, but the expression has no '??' branch.",
                    "Add '?? fallback' or deliberately propagate the undecided result.",
                );
            }
            const branchSets = [node.trueExpression, node.nullExpression, node.undecidedExpression]
                .filter(Boolean)
                .map(directBranchDeclarations);
            const branchNames = new Set(branchSets.flatMap((set) => [...set]));
            for (const name of branchNames) {
                if (branchSets.some((set) => !set.has(name))) {
                    emit(
                        "RX1303",
                        "warning",
                        node,
                        `Binding '${name}' is initialized in only some conditional paths.`,
                        "Initialize it before the conditional, or assign it in every branch.",
                        { binding: name },
                    );
                }
            }
            visit(node.condition, scope, { ...state, role: "value", tail: false, discarded: false });
            for (const branch of [node.trueExpression, node.nullExpression, node.undecidedExpression]) {
                warnCaptureDensity(branch);
                visit(branch, scope, {
                    ...state,
                    role: "value",
                    sharedScope: false,
                    tail: state.tail,
                    discarded: state.discarded,
                });
            }
            return;
        }

        if (node.type === "CaseContainer") {
            for (const element of node.elements || []) {
                if (element?.type === "BinaryOperation" && element.operator === "?") {
                    warnNumericDecision(element.left, scope, "a case decision");
                    warnCollectionDecision(element.left, scope, "a case decision");
                    visit(element.left, scope, { ...state, role: "value", tail: false });
                    visit(element.right, scope, { ...state, role: "value", tail: state.tail });
                } else {
                    visit(element, scope, { ...state, role: "value", tail: state.tail });
                }
            }
            return;
        }

        if (node.type === "ImplicitMultiplication") {
            if (node.left?.type === "UserIdentifier" && node.right?.type === "Grouping") {
                emit(
                    "RX1701",
                    "warning",
                    node,
                    `'${node.left.name}(...)' parses as implicit multiplication because lowercase names are not direct callable syntax.`,
                    "Use an uppercase callable, a pipeline/call operator, or the language's explicit callable-value form.",
                );
            }
            visit(node.left, scope, { ...state, role: "value", tail: false, discarded: false });
            visit(node.right, scope, { ...state, role: "value", tail: false, discarded: false });
            return;
        }

        if (node.type === "PropertyAccess" || node.type === "BracketIndex") {
            const selectors = node.type === "PropertyAccess" ? [node.property] : (node.specs || node.indices || [node.index]);
            for (const selector of selectors.filter(Boolean)) {
                if (isZeroLiteral(selector)) {
                    emit(
                        "RX1702",
                        "warning",
                        selector,
                        "Literal index 0 is used on a one-based RiX collection.",
                        "Use index 1 for the first item; keep 0 only for a type whose contract explicitly defines it.",
                    );
                }
            }
            visit(node.object, scope, { ...state, role: "value", tail: false, discarded: false });
            for (const selector of selectors.filter(Boolean)) visit(selector, scope, { ...state, role: "value", tail: false, discarded: false });
            return;
        }

        if (node.type === "MethodCall") {
            const method = String(node.method).toUpperCase();
            const { positional, keyword } = callArguments(node);
            if (state.discarded && KNOWN_PURE_COLLECTION_METHODS.has(method)) {
                emit(
                    "RX1203",
                    "warning",
                    node,
                    `Result of non-mutating method '.${node.method}()' is ignored.`,
                    "Assign or return the new value. Use the documented '!' method only when in-place mutation is intentional.",
                );
            }
            if (method.endsWith("!") && node.object?.type === "ReactiveRef" && !publishedReactiveMutations.has(node.object.name)) {
                emit(
                    "RX1603",
                    "warning",
                    node,
                    `In-place mutation of '$${node.object.name}' does not publish a reactive epoch.`,
                    `Prefer '$${node.object.name} := updatedValue', or call '$$${node.object.name}.Touch()' after an intentional deep mutation.`,
                );
            }
            if (method === "REFINE" && positional.length < 1 && !Object.keys(keyword).some((key) => /budget|max|limit|steps|work/i.test(key))) {
                emit(
                    "RX1806",
                    "warning",
                    node,
                    "Refinement call has no visible work or precision budget.",
                    "Pass an explicit request/policy with a finite precision target and work limit.",
                );
            }
            if (method === "FLOAT" && ["integer", "exact-number", "fraction", "polynomial"].includes(inferredValueKind(node.object, scope))) {
                emit(
                    "RX1803",
                    "info",
                    node,
                    "An exact value is converted to Float, discarding exactness.",
                    "Keep the exact value alongside the approximation when later equality, certification, or reproducibility matters.",
                );
            }
            visit(node.object, scope, {
                ...state,
                role: method === "TOUCH" ? "identity-receiver" : "value",
                tail: false,
                discarded: false,
            });
            for (const argument of positional) visit(argument, scope, { ...state, role: "value", tail: false, discarded: false });
            for (const argument of Object.values(keyword)) visit(argument, scope, { ...state, role: "value", tail: false, discarded: false });
            return;
        }

        if (node.type === "SystemCall") {
            const name = String(node.name).toUpperCase();
            const { positional, keyword } = callArguments(node);
            if (name === "REFINE" && positional.length < 2 && !Object.keys(keyword).some((key) => /budget|max|limit|steps|work/i.test(key))) {
                emit(
                    "RX1806",
                    "warning",
                    node,
                    "Refinement call has no visible work or precision budget.",
                    "Pass an explicit request/policy with a finite precision target and work limit.",
                );
            }
            if (name === "FLOAT" && ["integer", "exact-number", "fraction", "polynomial"].includes(inferredValueKind(positional[0], scope))) {
                emit(
                    "RX1803",
                    "info",
                    node,
                    "An exact value is converted to Float, discarding exactness.",
                    "Keep the exact source when certification or exact comparison may still be needed.",
                );
            }
            for (const argument of positional) visit(argument, scope, { ...state, role: "value", tail: false, discarded: false });
            for (const argument of Object.values(keyword)) visit(argument, scope, { ...state, role: "value", tail: false, discarded: false });
            return;
        }

        if (node.type === "FunctionCall") {
            if (state.functionName && node.function?.name === state.functionName && !state.tail) {
                emit(
                    "RX1501",
                    "warning",
                    node,
                    `Self-call to '${state.functionName}' is not in tail position.`,
                    "Use an explicit loop for unbounded depth, or keep recursion only when the expected depth is safely bounded.",
                );
            }
            visit(node.function, scope, { ...state, role: "callee", tail: false, discarded: false });
            for (const value of Object.values(node.arguments || {})) {
                if (Array.isArray(value)) for (const argument of value) visit(argument, scope, { ...state, role: "value", tail: false, discarded: false });
                else if (value && typeof value === "object") {
                    for (const argument of Object.values(value)) visit(argument, scope, { ...state, role: "value", tail: false, discarded: false });
                }
            }
            return;
        }

        if (node.type === "MapEntry") {
            visit(node.key, scope, { ...state, role: "mapKey", tail: false });
            visit(node.value, scope, { ...state, role: "value", tail: false });
            return;
        }

        if (node.type === "BinaryOperation") {
            const assignment = ASSIGNMENT_OPERATORS.has(node.operator) || UPDATE_OPERATORS.has(node.operator);
            if (assignment) {
                if (
                    node.operator === "="
                    && ["UserIdentifier", "SystemIdentifier"].includes(node.left?.type)
                    && ["UserIdentifier", "SystemIdentifier", "OuterIdentifier"].includes(node.right?.type)
                    && isMutableExpression(node.right, scope)
                ) {
                    emit(
                        "RX1202",
                        "warning",
                        node,
                        `Alias assignment shares mutable cell '${node.right.name}' with '${node.left.name}'.`,
                        "Use ':=' for an independent shallow copy or '::=' for a deep copy when shared mutation is not intended.",
                    );
                }
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
                    visit(node.left, scope, { ...state, role: "value", tail: false, discarded: false });
                } else {
                    const leftRole = node.left?.type === "ReactiveRef" ? "value" : "declaration";
                    visit(node.left, scope, { ...state, role: leftRole, tail: false, discarded: false });
                }
                const reactiveDeclaration = node.left?.type === "ReactiveCellRef";
                const reactiveAlias = reactiveDeclaration && node.right?.type === "ReactiveCellRef";
                const functionName = ["FunctionLambda", "FunctionDefinition", "FunctionVariantDefinition"].includes(node.right?.type)
                    ? node.left?.name || state.functionName
                    : state.functionName;
                visit(node.right, scope, {
                    ...state,
                    functionName,
                    reactiveDefinition: reactiveDeclaration && !reactiveAlias,
                    role: reactiveAlias ? "reactive-alias" : "value",
                    tail: false,
                    discarded: false,
                });
                return;
            }
            if (LOGICAL_OPERATORS.has(node.operator)) {
                warnNumericDecision(node.left, scope, "a logical operand");
                warnNumericDecision(node.right, scope, "a logical operand");
                warnCollectionDecision(node.left, scope, "a logical operand");
                warnCollectionDecision(node.right, scope, "a logical operand");
            }
            if (DIVISION_OPERATORS.has(node.operator)) {
                const denominatorName = node.right?.name || null;
                const denominatorBinding = denominatorName ? scope.resolve(denominatorName)?.binding : null;
                if (isZeroLiteral(node.right)) {
                    emit(
                        "RX1804",
                        "error",
                        node.right,
                        `Operator '${node.operator}' has a literal zero divisor.`,
                        "Use a nonzero divisor or handle the zero case before the operation.",
                    );
                } else if (denominatorBinding?.parameter && state.functionBody && !guardedAgainstZero(state.functionBody, denominatorName)) {
                    emit(
                        "RX1804",
                        "warning",
                        node.right,
                        `Parameter '${denominatorName}' is used as a divisor without a visible zero guard.`,
                        `Check '${denominatorName} == 0' or '${denominatorName} != 0' before division.`,
                    );
                }
                const leftKind = inferredValueKind(node.left, scope);
                const rightKind = inferredValueKind(node.right, scope);
                if (node.operator === "/" && leftKind === "integer" && rightKind === "integer") {
                    emit(
                        "RX1801",
                        "info",
                        node,
                        "'/' performs exact rational division for integer operands; it does not truncate like JavaScript numeric coercion or some integer APIs.",
                        "Use '//' only when truncating integer division is intended.",
                    );
                }
                if (node.operator === "/" && (leftKind === "polynomial" || rightKind === "polynomial")) {
                    const requirements = new Set(options.pluginMetadata?.requires || []);
                    if (![...requirements].some((requirement) => String(requirement).startsWith("rix.rational-function@"))) {
                        emit(
                            "RX1805",
                            "warning",
                            node,
                            "Polynomial '/' produces a RationalFunction, but no rational-function capability dependency is declared.",
                            "Load .ratfun, or add an appropriate 'rix.rational-function@…' plugin requirement; use '//', '%', or '/%' for polynomial division results.",
                        );
                    }
                }
            }
            if (["==", "!="].includes(node.operator)) {
                const leftKind = inferredValueKind(node.left, scope);
                const rightKind = inferredValueKind(node.right, scope);
                if (leftKind === "fraction" || rightKind === "fraction") {
                    emit(
                        "RX1802",
                        "info",
                        node,
                        "Fraction equality is representation-sensitive in RiX.",
                        "Use '.SamePair()' for explicit structural equality or '.Equivalent()' for equal rational values.",
                    );
                }
            }
            visit(node.left, scope, { ...state, role: "value", tail: false, discarded: false });
            visit(node.right, scope, { ...state, role: "value", tail: false, discarded: false });
            return;
        }

        if (node.type === "UnaryOperation") {
            if (node.operator === "!" || node.operator === "NOT") {
                warnNumericDecision(node.operand, scope, "a logical operand");
                warnCollectionDecision(node.operand, scope, "a logical operand");
            }
            visit(node.operand, scope, { ...state, role: "value", tail: false, discarded: false });
            return;
        }

        for (const [key, value] of Object.entries(node)) {
            if (["pos", "original", "systemInfo", "metadata"].includes(key)) continue;
            if (Array.isArray(value)) {
                for (const child of value) visit(child, scope, { ...state, role: "value", tail: false, discarded: false });
            } else if (value && typeof value === "object") {
                visit(value, scope, { ...state, role: "value", tail: false, discarded: false });
            }
        }
    };

    const root = new LintScope(null, "root");
    declareAll(root, ast, { shareBlocks: false });
    for (let index = 0; index < ast.length; index += 1) {
        visit(ast[index], root, {
            role: "value",
            tail: index === ast.length - 1,
            discarded: index < ast.length - 1,
        });
    }

    const reactiveDependencies = new Map();
    for (const [name, binding] of root.bindings) {
        if (!binding.reactive) continue;
        reactiveDependencies.set(name, identifierNames(binding.initializer, ["ReactiveRef"]));
    }
    const visiting = new Set();
    const visited = new Set();
    const reportedCycles = new Set();
    const visitReactive = (name, path = []) => {
        if (visiting.has(name)) {
            const start = path.indexOf(name);
            const cycle = [...path.slice(start), name];
            const fingerprint = [...new Set(cycle)].sort().join(":");
            if (!reportedCycles.has(fingerprint)) {
                reportedCycles.add(fingerprint);
                const binding = root.current(name);
                emit(
                    "RX1604",
                    "error",
                    binding?.node || { pos: [0] },
                    `Reactive dependency cycle detected: ${cycle.join(" -> ")}.`,
                    "Break the cycle by introducing an ordinary snapshot/input or by restructuring the derived definitions.",
                    { cycle },
                );
            }
            return;
        }
        if (visited.has(name)) return;
        visiting.add(name);
        for (const dependency of reactiveDependencies.get(name) || []) {
            if (reactiveDependencies.has(dependency)) visitReactive(dependency, [...path, name]);
        }
        visiting.delete(name);
        visited.add(name);
    };
    for (const name of reactiveDependencies.keys()) visitReactive(name);

    diagnostics.sort((left, right) => left.offset - right.offset || left.code.localeCompare(right.code));
    suppressedDiagnostics.sort((left, right) => left.offset - right.offset || left.code.localeCompare(right.code));
    scopes.sort((left, right) => left.offset - right.offset || left.name.localeCompare(right.name));
    return { diagnostics, suppressedDiagnostics, scopes, level: lintOptions.level, profiles: [...lintOptions.profiles].sort() };
}

export function lintRix(source, options = {}) {
    return analyzeRix(source, options).diagnostics;
}

export function explainRixScopes(source, options = {}) {
    return analyzeRix(source, options).scopes;
}

export function formatLintDiagnostic(diagnostic) {
    const location = `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}`;
    const coverage = diagnostic.coverage ? ` [coverage:${diagnostic.coverage}]` : "";
    const first = `${location} ${diagnostic.severity} ${diagnostic.code}${coverage}: ${diagnostic.message}`;
    return diagnostic.hint ? `${first}\n  hint: ${diagnostic.hint}` : first;
}

export function applyRixLintFixes(source, diagnostics, options = {}) {
    if (options.edit !== true) {
        throw new Error("Applying RiX lint fixes requires the explicit option { edit: true }.");
    }
    const fixes = diagnostics
        .map(({ fix }) => fix)
        .filter((fix) => fix?.safe === true)
        .sort((left, right) => right.start - left.start || right.end - left.end);
    let result = String(source);
    let lastStart = Infinity;
    let applied = 0;
    for (const fix of fixes) {
        if (!Number.isInteger(fix.start) || !Number.isInteger(fix.end) || fix.start < 0 || fix.end < fix.start) continue;
        if (fix.end > lastStart || fix.end > result.length) continue;
        result = result.slice(0, fix.start) + fix.replacement + result.slice(fix.end);
        lastStart = fix.start;
        applied += 1;
    }
    return { source: result, applied };
}

export function lintDiagnosticsToSarif(diagnostics, options = {}) {
    const rules = [...new Set(diagnostics.map(({ code }) => code))].map((code) => ({
        id: code,
        shortDescription: { text: RIX_LINT_RULES[code]?.title || code },
        properties: { level: RIX_LINT_RULES[code]?.level || 1 },
    }));
    return {
        version: "2.1.0",
        $schema: "https://json.schemastore.org/sarif-2.1.0.json",
        runs: [{
            tool: { driver: { name: "RiX lint", informationUri: options.informationUri || "https://rix.ratmath.com/", rules } },
            results: diagnostics.map((diagnostic) => ({
                ruleId: diagnostic.code,
                level: diagnostic.severity === "warning" ? "warning" : diagnostic.severity === "error" ? "error" : "note",
                message: { text: diagnostic.hint ? `${diagnostic.message} ${diagnostic.hint}` : diagnostic.message },
                locations: [{
                    physicalLocation: {
                        artifactLocation: { uri: diagnostic.file },
                        region: { startLine: diagnostic.line, startColumn: diagnostic.column },
                    },
                }],
                ...(diagnostic.fix ? {
                    fixes: [{
                        description: { text: diagnostic.fix.description },
                        artifactChanges: [{
                            artifactLocation: { uri: diagnostic.file },
                            replacements: [{
                                deletedRegion: { charOffset: diagnostic.fix.start, charLength: diagnostic.fix.end - diagnostic.fix.start },
                                insertedContent: { text: diagnostic.fix.replacement },
                            }],
                        }],
                    }],
                } : {}),
            })),
        }],
    };
}
