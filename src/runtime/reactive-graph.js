/**
 * Transactional dependency graph for live RiX values.
 *
 * Nodes are either externally-set sources or deferred computations. Reads
 * during an evaluation epoch record dependency edges. Source changes mark
 * transitive dependents dirty, recompute them once, and commit atomically.
 */

import { Integer } from "@ratmath/core";

let nextGraphId = 1;
export const REACTIVE_READ_ENV = "__reactive_read__";

function method(name, impl) {
    return { type: "method_builtin", name, impl };
}

function text(value) {
    return value?.type === "string" ? value.value : typeof value === "string" ? value : null;
}

function nodeName(value, label = "Reactive node name") {
    const requested = text(value);
    const name = requested?.toLowerCase();
    if (!name || !/^[a-z_][a-z0-9_]*$/u.test(name)) {
        throw new Error(`${label} must be a RiX user-identifier string`);
    }
    return name;
}

function graphMethods() {
    return new Map([
        ["SOURCE", method("Source", ([target, name, value]) => target.addSource(nodeName(name), value))],
        ["DERIVE", method("Derive", ([target, name, formula]) => target.addComputed(nodeName(name), formula))],
        ["GET", method("Get", ([target, name]) => target.get(nodeName(name)))],
        ["NODE", method("Node", ([target, name]) => target.node(nodeName(name)))],
        ["RECALCULATE", method("Recalculate", ([target]) => target.recalculate())],
        ["_mutable", new Integer(1n)],
    ]);
}

function nodeMethods() {
    return new Map([
        ["GET", method("Get", ([target]) => target.get())],
        ["SET", method("Set", ([target, value]) => target.set(value))],
        ["GETFORMULA", method("GetFormula", ([target]) => target.formula)],
        ["SETFORMULA", method("SetFormula", ([target, formula]) => target.setFormula(formula))],
        ["LIVE", method("Live", ([target]) => target.live())],
        ["_mutable", new Integer(1n)],
    ]);
}

function publicLive(node) {
    return Object.freeze({
        kind: node.kind,
        name: node.name,
        state: node.state,
        dependencies: Object.freeze([...node.dependencies]),
        dependents: Object.freeze([...node.dependents]),
        epoch: node.graph.epoch,
    });
}

export function isReactiveGraph(value) {
    return Boolean(value && value.type === "reactive_graph" && typeof value.get === "function");
}

export function isReactiveNode(value) {
    return Boolean(value && value.type === "reactive_node" && isReactiveGraph(value.graph));
}

export function createReactiveGraph(options = {}) {
    if (typeof options.evaluateFormula !== "function") {
        throw new Error("ReactiveGraph requires a deferred formula evaluator");
    }

    const id = options.id || `reactive-graph-${nextGraphId++}`;
    const nodes = new Map();
    const channel = new Set();
    const reservedNames = new Set((options.reservedNames || []).map((name) => nodeName(name)));
    let activeEpoch = null;
    let graph = null;

    function requireAvailableName(name) {
        if (reservedNames.has(name)) {
            throw new Error(`${options.reservedNameLabel || "Reactive node name is reserved"}: ${name}`);
        }
        if (nodes.has(name)) throw new Error(`Reactive node already exists: ${name}`);
    }

    function requireNode(name) {
        const node = nodes.get(name);
        if (!node) throw new Error(`Unknown reactive node: ${name}`);
        return node;
    }

    function rebuildDependents() {
        for (const node of nodes.values()) node.dependents = new Set();
        for (const node of nodes.values()) {
            for (const dependency of node.dependencies) {
                nodes.get(dependency)?.dependents.add(node.name);
            }
        }
    }

    function dirtyClosure(startNames) {
        const dirty = new Set(startNames);
        const queue = [...startNames];
        while (queue.length) {
            const name = queue.shift();
            for (const dependent of requireNode(name).dependents) {
                if (dirty.has(dependent)) continue;
                dirty.add(dependent);
                queue.push(dependent);
            }
        }
        return dirty;
    }

    function makeNode(name, kind, fields) {
        const nodeChannel = new Set();
        const node = {
            type: "reactive_node",
            graph,
            graphId: id,
            name,
            id: `${id}:${name}`,
            kind,
            formula: fields.formula ?? null,
            source: fields.source ?? null,
            value: fields.value ?? null,
            lastGoodValue: fields.value ?? null,
            state: kind === "source" ? "clean" : "dirty",
            dependencies: new Set(),
            dependents: new Set(),
            diagnostics: [],
            evaluator: fields.evaluator ?? null,
            get() {
                return graph.get(name);
            },
            set(value, metadata = null) {
                if (kind !== "source") throw new Error(`Reactive computed node ${name} cannot be set directly`);
                return graph.setSource(name, value, metadata);
            },
            setFormula(formula, metadata = null) {
                if (kind !== "computed") throw new Error(`Reactive source node ${name} has no formula`);
                return graph.setFormula(name, formula, metadata);
            },
            live() {
                return publicLive(node);
            },
            subscribe(listener) {
                if (typeof listener !== "function") throw new Error("Reactive node subscriber must be a function");
                nodeChannel.add(listener);
                return () => nodeChannel.delete(listener);
            },
            _publish(event) {
                for (const listener of [...nodeChannel]) listener(event);
            },
            _ext: nodeMethods(),
            toString() {
                return `[Reactive ${kind} ${name}]`;
            },
        };
        return node;
    }

    function runEpoch({ dirty, sourceOverrides = new Map(), cause = null, evaluateAll = false } = {}) {
        if (activeEpoch) {
            throw new Error(options.nestedEpochError || "Reactive computations cannot start a nested graph epoch");
        }
        const requested = evaluateAll
            ? new Set(nodes.keys())
            : dirtyClosure(new Set([...(dirty || []), ...sourceOverrides.keys()]));
        const previousEpoch = graph.epoch;
        const stagedValues = new Map([...nodes].map(([name, node]) => [name, node.value]));
        for (const [name, value] of sourceOverrides) stagedValues.set(name, value);
        const states = new Map([...nodes].map(([name, node]) => [
            name,
            requested.has(name) && node.kind === "computed" ? "dirty" : "clean",
        ]));
        const dependencies = new Map([...nodes].map(([name, node]) => [
            name,
            requested.has(name) && node.kind === "computed"
                ? new Set()
                : new Set(node.dependencies),
        ]));
        const stack = [];
        let currentName = null;

        const epoch = {
            read(name) {
                const node = requireNode(name);
                if (currentName && currentName !== name) dependencies.get(currentName).add(name);
                if (node.kind === "source") return stagedValues.get(name);
                if (states.get(name) === "clean") return stagedValues.get(name);
                if (states.get(name) === "evaluating") {
                    const cycleStart = stack.indexOf(name);
                    const cycle = [...stack.slice(cycleStart), name]
                        .map((item) => options.labelForNode?.(item) ?? item);
                    throw new Error(`${options.cycleLabel || "Reactive cycle"}: ${cycle.join(" -> ")}`);
                }

                states.set(name, "evaluating");
                stack.push(name);
                const previousName = currentName;
                currentName = name;
                try {
                    const value = node.evaluator
                        ? node.evaluator(node.formula, graph)
                        : options.evaluateFormula(node.formula, graph);
                    stagedValues.set(name, value);
                    states.set(name, "clean");
                    return value;
                } finally {
                    currentName = previousName;
                    stack.pop();
                }
            },
        };

        activeEpoch = epoch;
        try {
            for (const name of requested) epoch.read(name);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            for (const [name, state] of states) {
                if (state !== "evaluating") continue;
                const node = nodes.get(name);
                node.state = "error";
                node.diagnostics = [message];
            }
            const event = Object.freeze({
                type: "reactive:error",
                graph,
                epoch: graph.epoch,
                cause,
                error,
            });
            for (const listener of [...channel]) listener(event);
            throw error;
        } finally {
            activeEpoch = null;
        }

        graph.epoch += 1;
        const changed = [];
        for (const name of requested) {
            const node = nodes.get(name);
            const previous = node.value;
            node.value = stagedValues.get(name);
            node.lastGoodValue = node.value;
            node.state = "clean";
            node.dependencies = node.kind === "computed" ? dependencies.get(name) : new Set();
            node.diagnostics = [];
            if (previous !== node.value) changed.push(name);
        }
        rebuildDependents();
        const event = Object.freeze({
            type: "reactive:commit",
            graph,
            previousEpoch,
            epoch: graph.epoch,
            changed: Object.freeze(changed),
            cause,
        });
        for (const name of changed) nodes.get(name)._publish(event);
        for (const listener of [...channel]) listener(event);
        return graph;
    }

    graph = {
        type: "reactive_graph",
        id,
        epoch: 0,
        _ext: graphMethods(),
        addSource(name, value) {
            name = nodeName(name);
            requireAvailableName(name);
            const node = makeNode(name, "source", { value });
            nodes.set(name, node);
            return node;
        },
        addComputed(name, formula, metadata = null) {
            name = nodeName(name);
            requireAvailableName(name);
            if (!formula || formula.fn !== "DEFER") {
                throw new Error("ReactiveGraph.Derive requires deferred syntax @{ ... }");
            }
            const node = makeNode(name, "computed", {
                formula,
                source: metadata?.source ?? options.formulaSource?.(formula) ?? null,
                evaluator: metadata?.evaluator ?? null,
            });
            nodes.set(name, node);
            if (metadata?.initialize === false) return node;
            try {
                runEpoch({ dirty: new Set([name]), cause: { type: "reactive:add", name } });
            } catch (error) {
                nodes.delete(name);
                rebuildDependents();
                throw error;
            }
            return node;
        },
        get(name) {
            name = nodeName(name);
            if (activeEpoch) return activeEpoch.read(name);
            const node = requireNode(name);
            if (node.state === "error") {
                throw new Error(node.diagnostics[0] || `Reactive node ${name} has an error`);
            }
            return node.value;
        },
        node(name) {
            return requireNode(nodeName(name));
        },
        bindings() {
            return new Map(nodes);
        },
        setSource(name, value, metadata = null) {
            name = nodeName(name);
            const node = requireNode(name);
            if (node.kind !== "source") throw new Error(`Reactive node ${name} is not a source`);
            runEpoch({
                dirty: new Set([name]),
                sourceOverrides: new Map([[name, value]]),
                cause: { type: "reactive:set", name, metadata },
            });
            return value;
        },
        setFormula(name, formula, metadata = null) {
            name = nodeName(name);
            const node = requireNode(name);
            if (node.kind !== "computed") throw new Error(`Reactive node ${name} is not computed`);
            if (activeEpoch) {
                throw new Error(options.formulaMutationError || "Reactive computations cannot change formulas during an epoch");
            }
            if (!formula || formula.fn !== "DEFER") {
                throw new Error("Reactive computed formulas require deferred syntax @{ ... }");
            }
            const previousFormula = node.formula;
            const previousSource = node.source;
            node.formula = formula;
            node.source = metadata?.source ?? options.formulaSource?.(formula) ?? null;
            try {
                runEpoch({
                    dirty: new Set([name]),
                    cause: {
                        type: "reactive:formula",
                        name,
                        formula,
                        source: node.source,
                        previousFormula,
                        previousSource,
                        metadata,
                    },
                });
            } catch (error) {
                node.state = "error";
                throw error;
            }
            return node;
        },
        recalculate(cause = null) {
            return runEpoch({ evaluateAll: true, cause: cause || { type: "reactive:recalculate" } });
        },
        subscribe(listener) {
            if (typeof listener !== "function") throw new Error("ReactiveGraph subscriber must be a function");
            channel.add(listener);
            return () => channel.delete(listener);
        },
        toString() {
            return `[ReactiveGraph ${id} · ${nodes.size} nodes · epoch ${graph.epoch}]`;
        },
    };
    return graph;
}
