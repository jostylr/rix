import { parse } from "../../parser/parser.js";
import { tokenize } from "../../parser/tokenizer.js";
import { isReactiveGraph } from "../../runtime/reactive-graph.js";
import { lower } from "../lower.js";
import { irToText } from "../ir-to-text.js";
import { createEvaluatedReactiveGraph } from "./reactive-graph.js";

export const RG_DEFAULT_GRAPH_ENV = "__rg_default_graph__";

const CONTAINER_OPENERS = new Set([
    "(", "[", "{", "{|", "{=", "{;", "{@", "{!", "{:", "{?", "{#", "{..", "{>", "{^", "{$",
]);
const CONTAINER_CLOSERS = new Set([")", "]", "}", "|}", ";}", "@}", "!}", ":}"]);
const STATEMENT_CLOSERS = new Set([")", "]", "}", "|}", ";}", "@}", "!}", ":}"]);

function method(name, impl) {
    return { type: "method_builtin", name, impl };
}

function stringValue(value) {
    return { type: "string", value: String(value) };
}

function stringFromValue(value, label) {
    if (value?.type === "string") return value.value;
    if (typeof value === "string") return value;
    throw new Error(`${label} must be a string`);
}

function isComment(token) {
    return token?.type === "String" && token.kind === "comment";
}

function canEndStatement(token) {
    if (!token || isComment(token)) return false;
    if (token.type !== "Symbol") return token.type !== "End";
    return STATEMENT_CLOSERS.has(token.value) || token.value === "^^" || token.value === "_";
}

function canStartStatement(token) {
    if (!token || isComment(token) || token.type === "End") return false;
    if (token.type !== "Symbol") return true;
    return ["(", "[", "{", "-", "+", "!", "_", "@", "@_", ".", "$"].includes(token.value)
        || String(token.value).startsWith("{");
}

function normalizeRgNewlines(source) {
    const tokens = tokenize(source);
    const insertions = [];
    let depth = 0;
    let previous = null;

    for (const token of tokens) {
        if (token.type === "End") break;
        if (!isComment(token) && previous) {
            const whitespace = source.slice(previous.pos[2], token.pos[1]);
            if (
                depth === 0
                && whitespace.includes("\n")
                && canEndStatement(previous)
                && canStartStatement(token)
            ) {
                insertions.push(previous.pos[2]);
            }
        }
        if (!isComment(token)) {
            if (CONTAINER_OPENERS.has(token.value)) depth += 1;
            if (CONTAINER_CLOSERS.has(token.value)) depth = Math.max(0, depth - 1);
            previous = token;
        }
    }

    return insertions
        .sort((left, right) => right - left)
        .reduce((result, position) => `${result.slice(0, position)};${result.slice(position)}`, source);
}

function splitRgStatements(source) {
    const normalized = normalizeRgNewlines(source);
    const tokens = tokenize(normalized);
    const statements = [];
    let depth = 0;
    let start = 0;

    for (const token of tokens) {
        if (token.type === "End") break;
        if (CONTAINER_OPENERS.has(token.value)) depth += 1;
        if (CONTAINER_CLOSERS.has(token.value)) depth = Math.max(0, depth - 1);
        if (token.value !== ";" || depth !== 0) continue;
        const statement = normalized.slice(start, token.pos[1]).trim();
        if (statement) statements.push(statement);
        start = token.pos[2];
    }
    const tail = normalized.slice(start).trim();
    if (tail) statements.push(tail);
    return statements;
}

function withoutLeadingRgComments(statement) {
    let result = statement.trim();
    while (result) {
        const line = result.match(/^##[^\n]*(?:\n|$)/u);
        if (line) {
            result = result.slice(line[0].length).trimStart();
            continue;
        }
        const block = result.match(/^\/\*+[\s\S]*?\*+\/\s*/u);
        if (block) {
            result = result.slice(block[0].length).trimStart();
            continue;
        }
        break;
    }
    return result;
}

function expressionIr(source, context, label) {
    const runtime = context.getEnv("__script_runtime__", null);
    let nodes;
    try {
        nodes = lower(parse(source, runtime?.systemLookup));
    } catch (error) {
        throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (nodes.length !== 1) throw new Error(`${label} must contain exactly one RiX expression`);
    return nodes[0];
}

function deferredFormula(expression, source = null) {
    return {
        fn: "DEFER",
        args: [expression],
        ...(expression?.pos ? { pos: expression.pos } : {}),
        ...(typeof source === "string" ? { __rgSource: source } : {}),
    };
}

function declaration(name, kind, expression, source = null) {
    return Object.freeze({
        name: String(name).toLowerCase(),
        kind,
        ...(kind === "source"
            ? { expression }
            : { formula: deferredFormula(expression, source) }),
        source,
    });
}

export function createReactiveGraphPlan(declarations, options = {}) {
    return Object.freeze({
        type: "reactive_graph_plan",
        declarations: Object.freeze([...declarations]),
        source: options.source ?? null,
        toString() {
            return `[RG Plan · ${declarations.length} declarations]`;
        },
    });
}

export function isReactiveGraphPlan(value) {
    return Boolean(value && value.type === "reactive_graph_plan" && Array.isArray(value.declarations));
}

export function parseReactiveGraphSource(body, context) {
    const statements = splitRgStatements(body)
        .map(withoutLeadingRgComments)
        .filter(Boolean);
    const declarations = statements.map((statement, index) => {
        const match = statement.match(
            /^\s*(?:(\$\s*)|(source\s+))?([a-z_][a-z0-9_]*)\s*:=\s*([\s\S]+?)\s*$/iu,
        );
        if (!match) {
            throw new Error(
                `.RG declaration ${index + 1} must be '$name := expression', `
                + "'source name := expression', or 'name := expression'",
            );
        }
        const [, dollarMarker, sourceMarker, name, rhs] = match;
        const kind = dollarMarker || sourceMarker ? "source" : "computed";
        return declaration(
            name,
            kind,
            expressionIr(rhs, context, `.RG declaration ${name}`),
            rhs.trim(),
        );
    });
    return createReactiveGraphPlan(declarations, { source: body });
}

function deferredStatements(deferred) {
    if (!deferred || deferred.fn !== "DEFER") {
        throw new Error(".RG.Analyze requires deferred syntax @{ ... }, an RG source string, or an RG plan");
    }
    const body = deferred.args[0];
    return body?.fn === "BLOCK" || body?.fn === "SEQ" ? body.args : [body];
}

function sourceMarkerExpression(value) {
    if (
        value?.fn !== "CALL_METHOD"
        || value.args?.[0]?.fn !== "SYS_GET"
        || String(value.args[0].args?.[0]).toUpperCase() !== "RG"
        || String(value.args?.[1]).toUpperCase() !== "SOURCE"
        || value.args.length !== 3
    ) {
        return null;
    }
    return value.args[2];
}

export function analyzeReactiveGraphDeferred(deferred) {
    const declarations = deferredStatements(deferred).map((statement, index) => {
        if (statement?.fn !== "ASSIGN_COPY" || typeof statement.args?.[0] !== "string") {
            throw new Error(
                `.RG.Analyze statement ${index + 1} must use 'name := expression'; `
                + "wrap sources as 'name := .RG.Source(expression)'",
            );
        }
        const [name, rhs] = statement.args;
        const sourceExpression = sourceMarkerExpression(rhs);
        return sourceExpression
            ? declaration(name, "source", sourceExpression, irToText(sourceExpression))
            : declaration(name, "computed", rhs, irToText(rhs));
    });
    return createReactiveGraphPlan(declarations);
}

function planFromValue(value, context) {
    if (isReactiveGraphPlan(value)) return value;
    if (value?.fn === "DEFER") return analyzeReactiveGraphDeferred(value);
    if (value?.type === "string" || typeof value === "string") {
        return parseReactiveGraphSource(stringFromValue(value, ".RG source"), context);
    }
    throw new Error("Expected an RG plan, deferred RG declarations, or RG source string");
}

export function applyReactiveGraphPlan(graph, planValue, context, evaluate) {
    if (!isReactiveGraph(graph)) throw new Error(".RG can only apply declarations to a ReactiveGraph");
    const plan = planFromValue(planValue, context);
    const definitions = plan.declarations.map((item) => item.kind === "source"
        ? {
            kind: "source",
            name: item.name,
            value: evaluate(item.expression),
        }
        : {
            kind: "computed",
            name: item.name,
            formula: item.formula,
            source: item.source,
        });
    graph.define(definitions, {
        type: "rg:apply",
        source: plan.source,
        names: Object.freeze(definitions.map(({ name }) => name)),
    });
    return graph;
}

function graphFromContextName(name, context, label) {
    const graph = context.get(String(name).toLowerCase()) ?? context.get(String(name));
    if (!isReactiveGraph(graph)) throw new Error(`${label} requires '${name}' to name a ReactiveGraph`);
    return graph;
}

function defaultGraph(context) {
    const graph = context.getEnv(RG_DEFAULT_GRAPH_ENV, null);
    if (!isReactiveGraph(graph)) {
        throw new Error(".RG has no default graph; use .RG.Init.Set:, .RG.Set(graph), or .RG.Use(graph):");
    }
    return graph;
}

function setDefaultGraph(graph, context) {
    if (!isReactiveGraph(graph)) throw new Error(".RG.Set expects a ReactiveGraph");
    context.setEnv(RG_DEFAULT_GRAPH_ENV, graph);
    return graph;
}

function modifierSpecs(value) {
    if (!value?.values) return [];
    return value.values.map((item) => {
        const text = stringFromValue(item, ".RG modifier");
        const match = text.match(/^([a-z_][a-z0-9_]*)(?:\(([^()]*)\))?$/iu);
        if (!match) throw new Error(`Invalid .RG modifier: ${text}`);
        return {
            name: match[1].toUpperCase(),
            args: match[2] === undefined
                ? []
                : match[2].split(",").map((argument) => argument.trim()).filter(Boolean),
        };
    });
}

function rgParse(args, context, evaluate) {
    const body = stringFromValue(args[1], ".RG.Parse body");
    const plan = parseReactiveGraphSource(body, context);
    const modifiers = modifierSpecs(args[2]);
    const supported = new Set(["INIT", "SET", "USE"]);
    const unsupported = modifiers.filter(({ name }) => !supported.has(name));
    if (unsupported.length > 0) {
        throw new Error(`Unknown .RG modifier${unsupported.length === 1 ? "" : "s"}: ${unsupported.map(({ name }) => name).join(", ")}`);
    }
    const init = modifiers.find(({ name }) => name === "INIT") || null;
    const set = modifiers.find(({ name }) => name === "SET") || null;
    const use = modifiers.find(({ name }) => name === "USE") || null;
    if (modifiers.filter(({ name }) => name === "INIT").length > 1
        || modifiers.filter(({ name }) => name === "SET").length > 1
        || modifiers.filter(({ name }) => name === "USE").length > 1) {
        throw new Error(".RG accepts each of Init, Set, and Use at most once");
    }
    if (use && (init || set)) throw new Error(".RG.Use(graph) cannot be combined with Init or Set");
    if (init?.args.length > 1) throw new Error(".RG.Init accepts at most one graph identifier");
    if ((set && set.args.length > 1) || (use && use.args.length !== 1)) {
        throw new Error(".RG.Set accepts zero or one graph name; .RG.Use requires exactly one");
    }

    let graph;
    if (use) {
        graph = graphFromContextName(use.args[0], context, ".RG.Use");
    } else if (init) {
        graph = createEvaluatedReactiveGraph(context, evaluate, init.args[0] || null);
        if (set?.args.length) throw new Error(".RG.Init.Set cannot name a separate graph");
    } else if (set?.args.length) {
        graph = graphFromContextName(set.args[0], context, ".RG.Set");
    } else {
        graph = defaultGraph(context);
        if (set) throw new Error(".RG.Set without a graph name must be combined with .RG.Init");
    }

    applyReactiveGraphPlan(graph, plan, context, evaluate);
    if (set) setDefaultGraph(graph, context);
    return graph;
}

function rgAnalyze(args, context) {
    if (args.length !== 2) throw new Error(".RG.Analyze expects one deferred block, RG source string, or RG plan");
    return planFromValue(args[1], context);
}

function rgInit(args, context, evaluate) {
    if (args.length > 3) throw new Error(".RG.Init accepts an optional identifier string and plan");
    let id = null;
    let plan = null;
    for (const value of args.slice(1)) {
        if (value?.type === "string" || typeof value === "string") {
            if (id !== null) throw new Error(".RG.Init accepts only one identifier string");
            id = stringFromValue(value, ".RG.Init identifier");
        } else {
            if (plan !== null) throw new Error(".RG.Init accepts only one plan");
            plan = value;
        }
    }
    const graph = createEvaluatedReactiveGraph(context, evaluate, id);
    if (plan !== null) applyReactiveGraphPlan(graph, plan, context, evaluate);
    return graph;
}

function rgApply(args, context, evaluate) {
    if (args.length !== 3) throw new Error(".RG.Apply and .RG.Use expect a graph and one plan");
    return applyReactiveGraphPlan(args[1], args[2], context, evaluate);
}

function rgSource(args) {
    if (args.length !== 2) throw new Error(".RG.Source expects one initial-value expression");
    return Object.freeze({ type: "rg_source_marker", value: args[1] });
}

export function createReactiveGraphNotationValue() {
    const parseMethod = method("Parse", rgParse);
    return {
        type: "reactive_graph_notation",
        name: "RG",
        _ext: new Map([
            ["Parse", parseMethod],
            ["PARSE", parseMethod],
            ["ANALYZE", method("Analyze", rgAnalyze)],
            ["INIT", method("Init", rgInit)],
            ["SET", method("Set", ([, graph], context) => setDefaultGraph(graph, context))],
            ["DEFAULT", method("Default", ([,], context) => defaultGraph(context))],
            ["APPLY", method("Apply", rgApply)],
            ["USE", method("Use", rgApply)],
            ["SOURCE", method("Source", rgSource)],
        ]),
        toString() {
            return "[RG notation]";
        },
    };
}
