import {
    createReactiveGraph,
    isReactiveNode,
    REACTIVE_READ_ENV,
} from "../../runtime/reactive-graph.js";
import { createEvent, getCurrentFilePath, getDiagnostics } from "../../runtime/diagnostics.js";
import { runtimeDefaults } from "../../runtime/runtime-config.js";

export const REACTIVE_BINDING_GRAPH_ENV = "__reactive_binding_graph__";
export const REACTIVE_ACTIVE_GRAPH_ENV = "__reactive_active_graph__";
export const REACTIVE_TRANSACTION_ENV = "__reactive_transaction__";

function requireDeferred(value, label) {
    if (!value || value.fn !== "DEFER") {
        throw new Error(`${label} requires a deferred RiX definition`);
    }
    return value;
}

function rawReactiveNode(name, context, label) {
    const value = context.get(name);
    if (!isReactiveNode(value)) {
        throw new Error(`${label} requires '${name}' to name a reactive cell`);
    }
    return value;
}

function restoreEnv(context, key, snapshot) {
    if (snapshot.has) context.setEnv(key, snapshot.value);
    else context.env?.delete(key);
}

function capturedFormulaEvaluator(context, evaluate, closureScopes) {
    return (formula, graph) => {
        let pushed = 0;
        const previousRead = {
            has: context.env?.has(REACTIVE_READ_ENV) === true,
            value: context.getEnv(REACTIVE_READ_ENV, undefined),
        };
        const previousGraph = {
            has: context.env?.has(REACTIVE_ACTIVE_GRAPH_ENV) === true,
            value: context.getEnv(REACTIVE_ACTIVE_GRAPH_ENV, undefined),
        };

        for (const closureScope of closureScopes) {
            context.push(closureScope.bindings, {
                isolated: closureScope.isolated === true,
                readThrough: closureScope.readThrough === true,
                callableBoundary: closureScope.callableBoundary === true,
            });
            pushed += 1;
        }
        context.push(graph.bindings());
        pushed += 1;
        context.setEnv(REACTIVE_ACTIVE_GRAPH_ENV, graph);
        context.setEnv(REACTIVE_READ_ENV, (value, name) => {
            if (isReactiveNode(value)) return value.peek();
            return typeof previousRead.value === "function"
                ? previousRead.value(value, name)
                : value;
        });

        try {
            return context.withSharedBody(formula.args[0], () => evaluate(formula.args[0]));
        } finally {
            restoreEnv(context, REACTIVE_READ_ENV, previousRead);
            restoreEnv(context, REACTIVE_ACTIVE_GRAPH_ENV, previousGraph);
            while (pushed > 0) {
                context.pop();
                pushed -= 1;
            }
        }
    };
}

function getBindingGraph(context) {
    let graph = context.getEnv(REACTIVE_BINDING_GRAPH_ENV, null);
    if (graph) return graph;
    graph = createReactiveGraph({
        evaluateFormula() {
            throw new Error("Reactive binding definitions require their captured evaluator");
        },
    });
    context.setEnv(REACTIVE_BINDING_GRAPH_ENV, graph);
    return graph;
}

function currentCollector(context) {
    return context.getEnv(REACTIVE_TRANSACTION_ENV, null);
}

function useCollectorGraph(collector, graph) {
    if (!collector) return graph;
    if (collector.graph && collector.graph !== graph) {
        throw new Error("A reactive transaction cannot span different ReactiveGraphs");
    }
    collector.graph = graph;
    return graph;
}

function ensureNewBinding(name, context, collector = null) {
    if (context.has(name) || collector?.pendingNames.has(name)) {
        throw new Error(`Reactive declaration requires a new name: ${name}`);
    }
}

function makeDefinition(name, formula, context, evaluate) {
    return {
        kind: "computed",
        name,
        formula: requireDeferred(formula, `Reactive declaration ${name}`),
        evaluator: capturedFormulaEvaluator(context, evaluate, context.captureClosureScopes()),
    };
}

function makeUpdate(node, formula, context, evaluate) {
    return {
        kind: "update",
        name: node.name,
        formula: requireDeferred(formula, `Reactive update ${node.name}`),
        evaluator: capturedFormulaEvaluator(context, evaluate, context.captureClosureScopes()),
    };
}

function aliasTarget(formula) {
    const body = formula?.fn === "DEFER" ? formula.args[0] : null;
    return body?.fn === "REACTIVE_NODE" && typeof body.args?.[0] === "string"
        ? body.args[0]
        : null;
}

function collectPlainReads(node, names = new Set()) {
    if (!node || typeof node !== "object") return names;
    if (Array.isArray(node)) {
        for (const item of node) collectPlainReads(item, names);
        return names;
    }
    if (node.fn === "RETRIEVE" && typeof node.args?.[0] === "string") {
        names.add(node.args[0]);
        return names;
    }
    if (node.fn === "REACTIVE_READ" || node.fn === "REACTIVE_NODE") return names;
    for (const arg of node.args || []) collectPlainReads(arg, names);
    return names;
}

function collectReactiveNames(node, names = new Set()) {
    if (!node || typeof node !== "object") return names;
    if (Array.isArray(node)) {
        for (const item of node) collectReactiveNames(item, names);
        return names;
    }
    if (
        (node.fn === "REACTIVE_READ" || node.fn === "REACTIVE_NODE")
        && typeof node.args?.[0] === "string"
    ) {
        names.add(node.args[0]);
        return names;
    }
    for (const arg of node.args || []) collectReactiveNames(arg, names);
    return names;
}

function graphForFormula(formula, context, fallback = null) {
    const graphs = new Set();
    for (const name of collectReactiveNames(formula?.args?.[0])) {
        const value = context.get(name);
        if (isReactiveNode(value)) graphs.add(value.graph);
    }
    if (graphs.size > 1) {
        throw new Error("One reactive definition cannot currently track cells from different ReactiveGraphs");
    }
    return graphs.values().next().value ?? fallback ?? getBindingGraph(context);
}

function warnUntrackedReads(formula, context, graph, pendingNames = new Set()) {
    const warnings = context.getEnv("warnings", runtimeDefaults.warnings);
    if (warnings?.reactiveUntrackedRead !== true) return;
    const graphNames = new Set(graph.bindings().keys());
    for (const name of collectPlainReads(formula?.args?.[0])) {
        if (!graphNames.has(name) && !pendingNames.has(name) && !isReactiveNode(context.get(name))) continue;
        getDiagnostics(context).addEvent(createEvent({
            kind: "warning",
            label: `Untracked reactive read '${name}' in reactive definition`,
            file: getCurrentFilePath(context),
            data: {
                type: "map",
                entries: new Map([
                    ["name", { type: "string", value: name }],
                    ["trackedForm", { type: "string", value: `$${name}` }],
                ]),
            },
        }));
    }
}

function bindCommittedNames(collector, context) {
    for (const binding of collector.bindings) {
        const node = collector.graph.node(binding.target ?? binding.name);
        context.setFresh(binding.name, node);
    }
}

function declareReactive(args, context, evaluate) {
    const [name, formula] = args;
    const collector = currentCollector(context);
    ensureNewBinding(name, context, collector);
    const target = aliasTarget(formula);

    if (target !== null) {
        const targetValue = context.get(target);
        const targetNode = isReactiveNode(targetValue) ? targetValue : null;
        const graph = collector
            ? (targetNode ? useCollectorGraph(collector, targetNode.graph) : collector.graph)
            : rawReactiveNode(target, context, "Reactive alias declaration").graph;
        if (collector) {
            if (!graph && !collector.pendingNames.has(target)) {
                throw new Error(`Reactive alias declaration requires '${target}' to name a reactive cell`);
            }
            collector.changes.push({ kind: "alias", name, target });
            collector.bindings.push({ name, target });
            collector.pendingNames.add(name);
            collector.lastReactiveName = name;
            return null;
        }
        const node = rawReactiveNode(target, context, "Reactive alias declaration");
        graph.addAlias(name, node);
        context.setFresh(name, node);
        return node.peek();
    }

    const graph = graphForFormula(formula, context, collector?.graph);
    useCollectorGraph(collector, graph);
    const definition = makeDefinition(name, formula, context, evaluate);
    if (collector) {
        collector.changes.push(definition);
        collector.bindings.push({ name });
        collector.pendingNames.add(name);
        collector.lastReactiveName = name;
        return null;
    }

    warnUntrackedReads(formula, context, graph);
    graph.applyBatch([definition], { type: "reactive:declare", name });
    const node = graph.node(name);
    context.setFresh(name, node);
    return node.peek();
}

function updateReactive(args, context, evaluate) {
    const [name, formula] = args;
    const node = rawReactiveNode(name, context, "Reactive update");
    const collector = currentCollector(context);
    const update = makeUpdate(node, formula, context, evaluate);

    if (collector) {
        useCollectorGraph(collector, node.graph);
        collector.changes.push(update);
        collector.lastReactiveName = name;
        return node.peek();
    }

    warnUntrackedReads(formula, context, node.graph);
    node.graph.applyBatch([update], { type: "reactive:update", name: node.name });
    return node.peek();
}

function readReactive(args, context) {
    const name = args[0];
    const node = rawReactiveNode(name, context, "Tracked reactive read");
    const activeGraph = context.getEnv(REACTIVE_ACTIVE_GRAPH_ENV, null);
    if (activeGraph && node.graph !== activeGraph) {
        throw new Error(
            `Tracked reactive read '$${name}' crosses ReactiveGraphs; alias or import it into one graph first`,
        );
    }
    return node.get();
}

function retrieveReactiveNode(args, context) {
    return rawReactiveNode(args[0], context, "Reactive cell reference");
}

function reactiveTransaction(args, context, evaluate) {
    const parent = currentCollector(context);
    if (parent) {
        let nestedResult = null;
        for (const statement of args) nestedResult = evaluate(statement);
        return nestedResult;
    }

    const collector = {
        graph: null,
        changes: [],
        bindings: [],
        pendingNames: new Set(),
        lastReactiveName: null,
    };
    const previous = {
        has: context.env?.has(REACTIVE_TRANSACTION_ENV) === true,
        value: context.getEnv(REACTIVE_TRANSACTION_ENV, undefined),
    };
    context.setEnv(REACTIVE_TRANSACTION_ENV, collector);

    let result = null;
    try {
        for (const statement of args) result = evaluate(statement);
    } finally {
        restoreEnv(context, REACTIVE_TRANSACTION_ENV, previous);
    }

    collector.graph ??= getBindingGraph(context);
    for (const change of collector.changes) {
        if (change.formula) {
            warnUntrackedReads(change.formula, context, collector.graph, collector.pendingNames);
        }
    }
    collector.graph.applyBatch(collector.changes, {
        type: "reactive:transaction",
        names: Object.freeze(collector.changes.map(({ name }) => name)),
    });
    bindCommittedNames(collector, context);
    return collector.lastReactiveName
        ? rawReactiveNode(collector.lastReactiveName, context, "Reactive transaction result").peek()
        : result;
}

export const reactiveBindingFunctions = {
    REACTIVE_READ: {
        impl: readReactive,
        doc: "Read a reactive cell value and record a dependency",
    },
    REACTIVE_NODE: {
        impl: retrieveReactiveNode,
        doc: "Retrieve a reactive cell identity without dereferencing it",
    },
    REACTIVE_DECLARE: {
        lazy: true,
        impl: declareReactive,
        doc: "Declare a new reactive cell from a deferred definition",
    },
    REACTIVE_UPDATE: {
        lazy: true,
        impl: updateReactive,
        doc: "Replace a reactive cell definition while preserving its identity",
    },
    REACTIVE_TRANSACTION: {
        lazy: true,
        impl: reactiveTransaction,
        doc: "Stage reactive declarations and updates and commit one atomic graph epoch",
    },
};
